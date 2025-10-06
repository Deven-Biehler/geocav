from django.shortcuts import render
import os
import json
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from .models import CancerIncidence, CancerType, Factor, Gender, Race, GeographicLevel, FactorMeasurement
from django.db.models import Min


COUNTY_COLUMN = 'NAME'  # Column name in GeoJSON for county names
STATE_COLUMN = 'name'  # Column name in GeoJSON for state names

def dashboard_view(request):
    """View function for the dashboard homepage."""
    return render(request, 'geospatial_dashboard.html')


@require_http_methods(["GET"])
def choropleth(request):
    """Django view to get geospatial data with cancer rates."""
   
    # Get query parameters
    level = request.GET.get('level', 'county')
    cancer_type_name = request.GET.get('cancer_type', 'Lung')
    gender_name = request.GET.get('gender', 'All')
    race_name = request.GET.get('race', 'ALL')
    year = request.GET.get('year')
   
    try:
        # Get cancer type
        cancer_type = CancerType.objects.get(name__iexact=cancer_type_name)
       
        # Build query
        cancer_queryset = CancerIncidence.objects.filter(cancer_type=cancer_type)
       
        # Filter by geographic level
        if level == 'state':
            cancer_queryset = cancer_queryset.filter(county='All')
        else:
            cancer_queryset = cancer_queryset.exclude(county='All')
       
        # Apply demographic filters
        if gender_name:
            gender = Gender.objects.get(name__iexact=gender_name)
            cancer_queryset = cancer_queryset.filter(gender=gender)
       
        if race_name:
            race = Race.objects.get(name__iexact=race_name)
            cancer_queryset = cancer_queryset.filter(race=race)
        # Filter by year
        if year:
            cancer_queryset = cancer_queryset.filter(start_year__lte=int(year), end_year__gte=int(year))
        else:
            # Get most recent year if not specified
            from django.db.models import Max
            latest_year = cancer_queryset.aggregate(Max('start_year'))['start_year__max']
            if latest_year:
                cancer_queryset = cancer_queryset.filter(start_year=latest_year)
       
        # Aggregate data by location
        cancer_data = {}
        debug_records = []
        for record in cancer_queryset:
            # Collect debug info for first 5 records
            if len(debug_records) < 5:
                debug_records.append({
                    'statefp': record.statefp,
                    'countyfp': record.countyfp,
                    'rate': record.incidence_rate
                })
            
            if level == 'county':
                key = str(record.countyfp).zfill(5)
            else:
                key = str(record.statefp).zfill(2)
            
            cancer_data[key] = record.incidence_rate
       
        # Load GeoJSON file
        if level == 'county':
            geojson_path = os.path.join(settings.BASE_DIR, 'dashboard', 'static', 'data', 'counties.geojson')
        else:
            geojson_path = os.path.join(settings.BASE_DIR, 'dashboard', 'static', 'data', 'us-states.json')
       
        if not os.path.exists(geojson_path):
            return JsonResponse({'error': f'GeoJSON file not found: {geojson_path}'}, status=404)
       
        with open(geojson_path, 'r', encoding='utf-8') as f:
            geojson = json.load(f)
       
        # Merge cancer data with GeoJSON features
        for feature in geojson['features']:
            props = feature['properties']
           
            if level == 'county':
                key = props.get('GEOID').zfill(5)
            else:
                # For state level
                key = feature.get('id', '').zfill(2)
           
            if key in cancer_data:
                props['incidence_rate'] = cancer_data[key]
            else:
                props['incidence_rate'] = None
       
        # Build debug info based on level
        if level == 'county':
            sample_geoids = [f['properties'].get('GEOID', 'N/A') for f in geojson['features'][:5]]
        else:
            sample_geoids = [f.get('id', 'N/A') for f in geojson['features'][:5]]
        
        debug_info = {
            'level': level,
            'query_count': cancer_queryset.count(),
            'sample_db_keys': list(cancer_data.keys())[:5],
            'sample_geojson_ids': sample_geoids,
            'sample_records': debug_records  # Add this line
        }
        
        # Return the complete response
        return JsonResponse({
            'type': 'FeatureCollection',
            'features': geojson['features'],
            'debug': debug_info
        })
   
    except Exception as e:
        import traceback
        return JsonResponse({'error': str(e), 'traceback': traceback.format_exc()}, status=500)


@require_http_methods(["GET"])
def regression_data(request):
    """View to return data for the regression plot."""
    
    cancer_type_name = request.GET.get('cancer_type', 'Kidney')
    factor_name = request.GET.get('factor', 'Air_Quality')
    level = request.GET.get('level', 'state')
    gender_name = request.GET.get('gender', 'All')
    race_name = request.GET.get('race', 'ALL')
    year = request.GET.get('year')
    
    try:
        # Get related objects with better error handling
        cancer_type = CancerType.objects.get(name__iexact=cancer_type_name)
        
        # Try to get factor - check what the actual name format is
        try:
            factor = Factor.objects.get(name__iexact=factor_name)
        except Factor.DoesNotExist:
            # Try with underscores replaced by spaces
            factor_name_alt = factor_name.replace('_', ' ')
            try:
                factor = Factor.objects.get(name__iexact=factor_name_alt)
            except Factor.DoesNotExist:
                available_factors = list(Factor.objects.values_list('name', flat=True))
                return JsonResponse({
                    'data': [],
                    'debug': {
                        'error': f'Factor "{factor_name}" not found',
                        'tried': [factor_name, factor_name_alt],
                        'available_factors': available_factors
                    }
                })
        
        gender = Gender.objects.get(name__iexact=gender_name)
        race = Race.objects.get(name__iexact=race_name)
        
        # Build queries
        cancer_queryset = CancerIncidence.objects.filter(
            cancer_type=cancer_type,
            gender=gender,
            race=race,
            geographic_level=level
        )
        
        factor_queryset = FactorMeasurement.objects.filter(
            factor=factor,
            gender=gender,
            race=race,
            geographic_level=level
        )
        
        # Apply year filtering
        if year:
            year_int = int(year)
            cancer_queryset = cancer_queryset.filter(start_year__lte=year_int, end_year__gte=year_int)
            factor_queryset = factor_queryset.filter(start_year__lte=year_int, end_year__gte=year_int)
        else:
            from django.db.models import Max
            latest_cancer_year = cancer_queryset.aggregate(Max('start_year'))['start_year__max']
            latest_factor_year = factor_queryset.aggregate(Max('start_year'))['start_year__max']
            
            if latest_cancer_year and latest_factor_year:
                latest_year = min(latest_cancer_year, latest_factor_year)
                cancer_queryset = cancer_queryset.filter(start_year=latest_year)
                factor_queryset = factor_queryset.filter(start_year=latest_year)
        
        # Build dictionaries
        cancer_data = {}
        for record in cancer_queryset:
            key = str(record.statefp).zfill(2) if record.statefp else None
            if level == 'county':
                key = str(record.countyfp).zfill(5) if record.countyfp else None
            
            if key and record.incidence_rate is not None:
                cancer_data[key] = {
                    'state': record.state,
                    'rate': record.incidence_rate
                }
                if level == 'county' and record.county:
                    cancer_data[key]['county'] = record.county
        
        factor_data = {}
        for record in factor_queryset:
            key = str(record.statefp).zfill(2) if record.statefp else None
            if level == 'county':
                key = str(record.countyfp).zfill(5) if record.countyfp else None
            
            if key and record.factor_value is not None:
                factor_data[key] = record.factor_value
        
        # Merge data
        result = []
        for key, cancer_info in cancer_data.items():
            if key in factor_data:
                data_point = {
                    'state': cancer_info['state'],
                    cancer_type_name.lower(): cancer_info['rate'],
                    factor_name.lower().replace(' ', '_'): factor_data[key]
                }
                
                if level == 'county' and 'county' in cancer_info:
                    data_point['county'] = cancer_info['county']
                
                result.append(data_point)
        
        return JsonResponse({
            'data': result,
            'debug': {
                'level': level,
                'cancer_count': len(cancer_data),
                'factor_count': len(factor_data),
                'matched_count': len(result),
                'sample_cancer_keys': list(cancer_data.keys())[:5],
                'sample_factor_keys': list(factor_data.keys())[:5]
            }
        })
        
    except Exception as e:
        import traceback
        return JsonResponse({
            'data': [],
            'debug': {
                'error': str(e),
                'traceback': traceback.format_exc()
            }
        }, status=500)