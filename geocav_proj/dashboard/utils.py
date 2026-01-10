import os
import json
from django.conf import settings
from django.http import JsonResponse
from django.db.models import Max
from .models import CancerType, Gender, Race, Factor, CancerIncidence, FactorMeasurement
import traceback

COUNTY_COLUMN = 'NAME'  # Column name in GeoJSON for county names
STATE_COLUMN = 'name'   # Column name in GeoJSON for state names

def get_query_params(request, required_params=None, optional_params=None):
    """Extract and validate query parameters."""
    defaults = {
        'level': 'county',
        'cancer_type': 'Lung',
        'gender': 'All',
        'race': 'ALL',
        'year': None,
        'factor': 'Air_Quality'
    }
    params = {}
    
    # Handle required parameters
    if required_params:
        for param in required_params:
            value = request.GET.get(param)
            if value is None:
                raise ValueError(f"Missing required parameter: {param}")
            params[param] = value
    
    # Handle optional parameters
    if optional_params:
        for param in optional_params:
            if param not in params:  # Don't overwrite if already handled? Though this shouldn't happen with current logic
                 params[param] = request.GET.get(param, defaults.get(param))
    
    return params

def get_model_instance(model, field_name, value, case_insensitive=True):
    """Fetch a model instance by name."""
    try:
        if case_insensitive:
            return model.objects.get(**{f"{field_name}__iexact": value})
        return model.objects.get(**{field_name: value})
    except model.DoesNotExist:
        raise ValueError(f"{model.__name__} not found: {value}")

def apply_geographic_filter(queryset, level, county_field='county'):
    """Apply geographic level filter to queryset."""
    if level == 'state':
        return queryset.filter(**{county_field: 'All'})
    return queryset.exclude(**{county_field: 'All'})

def apply_year_filter(queryset, year, start_year_field='start_year', end_year_field='end_year'):
    """Apply year filter to queryset, defaulting to latest year if none provided."""
    if year:
        year_int = int(year)
        return queryset.filter(**{f"{start_year_field}__lte": year_int, f"{end_year_field}__gte": year_int})
    latest_year = queryset.aggregate(Max(start_year_field))[f'{start_year_field}__max']
    if latest_year:
        return queryset.filter(**{start_year_field: latest_year})
    return queryset

def load_geojson(level):
    """Load GeoJSON file based on geographic level."""
    if level == 'county':
        geojson_path = os.path.join(settings.BASE_DIR, 'dashboard', 'static', 'data', 'counties.geojson')
    else:
        geojson_path = os.path.join(settings.BASE_DIR, 'dashboard', 'static', 'data', 'us-states.json')
    
    if not os.path.exists(geojson_path):
        raise FileNotFoundError(f'GeoJSON file not found: {geojson_path}')
    
    with open(geojson_path, 'r', encoding='utf-8') as f:
        return json.load(f)

def generate_key(record, level, statefp_field='statefp', countyfp_field='countyfp'):
    """Generate key for data aggregation based on geographic level."""
    if isinstance(record, dict):
        if level == 'county':
            return str(int(record[countyfp_field])).zfill(5)
        return str(int(record[statefp_field])).zfill(2)
    else:
        if level == 'county':
            return str(int(getattr(record, countyfp_field))).zfill(5)
        return str(int(getattr(record, statefp_field))).zfill(2)

def handle_errors(view_func):
    """Decorator for consistent error handling."""
    def wrapper(request, *args, **kwargs):
        try:
            return view_func(request, *args, **kwargs)
        except Exception as e:
            return JsonResponse({
                'error': str(e),
                'traceback': traceback.format_exc()
            }, status=500)
    return wrapper