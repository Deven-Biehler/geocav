from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from .utils import (
    get_query_params, get_model_instance, apply_geographic_filter,
    apply_year_filter, load_geojson, generate_key, handle_errors
)
from .models import CancerIncidence, CancerType, Factor, Gender, Race, FactorMeasurement

def dashboard_view(request):
    """View function for the dashboard homepage."""
    return render(request, 'geospatial_dashboard.html')

def organize_data(cancer_queryset, factor_queryset, level):
    '''Organize cancer and factor data into dictionaries keyed by geographic identifiers.'''
    cancer_data = {}
    factor_data = {}
    for record in cancer_queryset:
        key = generate_key(record, level)
        if record.incidence_rate is not None:
            cancer_data[key] = {'state': record.state, 'county': record.county if level == 'county' else None, 'rate': record.incidence_rate}
    for record in factor_queryset:
        key = generate_key(record, level)
        if record.factor_value is not None:
            factor_data[key] = {'state': record.state, 'county': record.county if level == 'county' else None, 'rate': record.factor_value}

    return cancer_data, factor_data

def add_geojson_properties(geojson, level, cancer_data, factor_data):
    # Load and merge GeoJSON
    geojson = load_geojson(level)
    for i, feature in enumerate(geojson['features']):
        statefp = feature['properties']['STATEFP'] if level == 'county' else feature['id']
        countyfp = feature['properties']['COUNTYFP'][3:] if level == 'county' else 'All'
        key = statefp if level == 'state' else statefp + countyfp
        geojson['features'][i]['cancer_rate'] = cancer_data.get(key, {}).get('rate')
        geojson['features'][i]['factor_value'] = factor_data.get(key, {}).get('rate')

    return geojson


@require_http_methods(["GET"])
def get_geojson(request):
    params = get_query_params(request, optional_params=['level'])
    level = params['level']
    geojson = load_geojson(level)
    return JsonResponse(geojson)


@require_http_methods(["GET"])
def get_data(request):
    params = get_query_params(request, optional_params=['level', 'cancer_type', 'factor', 'gender', 'race', 'cancer_year', 'factor_year'])
    level, cancer_type_name, factor_name, gender_name, race_name, cancer_year, factor_year = (
        params['level'], params['cancer_type'], params['factor'], params['gender'], params['race'], params['cancer_year'], params['factor_year']
    )

    # Get model instances
    cancer_type = get_model_instance(CancerType, 'name', cancer_type_name)
    factor = get_model_instance(Factor, 'name', factor_name)
    gender = get_model_instance(Gender, 'name', gender_name)
    race = get_model_instance(Race, 'name', race_name)

    # Build queries
    cancer_queryset = CancerIncidence.objects.filter(cancer_type=cancer_type, gender=gender, race=race)
    factor_queryset = FactorMeasurement.objects.filter(factor=factor)
    cancer_queryset = apply_geographic_filter(cancer_queryset, level)
    factor_queryset = apply_geographic_filter(factor_queryset, level)
    cancer_queryset = apply_year_filter(cancer_queryset, cancer_year)
    factor_queryset = apply_year_filter(factor_queryset, factor_year)

    cancer_data, factor_data = organize_data(cancer_queryset, factor_queryset, level)
    return JsonResponse({
        'cancer_data': cancer_data,
        'factor_data': factor_data
    })


def add_geojson_properties(geojson, level, cancer_data, factor_data):
    for i, feature in enumerate(geojson['features']):
        statefp = feature['properties']['STATEFP'] if level == 'county' else feature['id']
        countyfp = feature['properties']['COUNTYFP'][3:] if level == 'county' else 'All'
        key = statefp if level == 'state' else statefp + countyfp
        geojson['features'][i]['cancer_rate'] = cancer_data.get(key, {}).get('rate')
        geojson['features'][i]['factor_value'] = factor_data.get(key, {}).get('rate')
    return geojson


def get_pie_data(request):
    '''Fetch data for pie chart visualization. Data includes multiple cancer types.'''
    params = get_query_params(request, optional_params=['level', 'cancer_year', 'gender', 'race'])
    level, cancer_year, gender_name, race_name = (
        params['level'], params['cancer_year'], params['gender'], params['race']
    )
    gender = get_model_instance(Gender, 'name', gender_name)

    race = get_model_instance(Race, 'name', race_name)

    cancer_queryset = CancerIncidence.objects.all()
    cancer_queryset = apply_geographic_filter(cancer_queryset, level)
    cancer_queryset = apply_year_filter(cancer_queryset, cancer_year)
    cancer_queryset = cancer_queryset.filter(gender=gender, race=race)

    # Custom organization for pie chart data
    cancer_data = {}
    for record in cancer_queryset:
        key = generate_key(record, level)
        if key not in cancer_data:
            cancer_data[key] = {'state': record.state, 'county': record.county if level == 'county' else None, 'rate': {}}
        if record.incidence_rate is not None:
            cancer_data[key]['rate'][record.cancer_type.name] = record.incidence_rate
    return JsonResponse({'cancer_data': cancer_data})
