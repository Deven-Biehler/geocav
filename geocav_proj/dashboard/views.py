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

@require_http_methods(["GET"])
@handle_errors
def choropleth(request):
    """Django view to get geospatial data with cancer rates."""
    params = get_query_params(request, optional_params=['level', 'cancer_type', 'gender', 'race', 'cancer_year', 'factor_year'])
    level, cancer_type_name, gender_name, race_name, cancer_year, factor_year = (
        params['level'], params['cancer_type'], params['gender'], params['race'], params['cancer_year'], params['factor_year']
    )

    # Get model instances
    cancer_type = get_model_instance(CancerType, 'name', cancer_type_name)
    gender = get_model_instance(Gender, 'name', gender_name)
    race = get_model_instance(Race, 'name', race_name)

    # Build query
    cancer_queryset = CancerIncidence.objects.filter(cancer_type=cancer_type)
    cancer_queryset = apply_geographic_filter(cancer_queryset, level)
    cancer_queryset = apply_year_filter(cancer_queryset, cancer_year)
    cancer_queryset = cancer_queryset.filter(gender=gender, race=race)

    # Aggregate data
    cancer_data = {}
    for record in cancer_queryset:
        key = generate_key(record, level)
        cancer_data[key] = record.incidence_rate

    # Load and merge GeoJSON
    geojson = load_geojson(level)
    for feature in geojson['features']:
        props = feature['properties']
        key = props.get('GEOID', '').zfill(5) if level == 'county' else feature.get('id', '').zfill(2)
        props['incidence_rate'] = cancer_data.get(key)

    return JsonResponse({
        'type': 'FeatureCollection',
        'features': geojson['features']
    })

@require_http_methods(["GET"])
@handle_errors
def dotDensity(request):
    """Django view to get geospatial data for dot density map."""
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
    factor_queryset = FactorMeasurement.objects.filter(factor=factor, gender=gender, race=race)
    cancer_queryset = apply_geographic_filter(cancer_queryset, level)
    factor_queryset = apply_geographic_filter(factor_queryset, level)
    cancer_queryset = apply_year_filter(cancer_queryset, cancer_year)
    factor_queryset = apply_year_filter(factor_queryset, factor_year)

    # Aggregate data
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

    # Load and merge GeoJSON
    geojson = load_geojson(level)
    for i, feature in enumerate(geojson['features']):
        statefp = feature['properties']['STATEFP'] if level == 'county' else feature['id']
        countyfp = feature['properties']['COUNTYFP'][3:] if level == 'county' else 'All'
        key = statefp if level == 'state' else statefp + countyfp
        geojson['features'][i]['cancer_rate'] = cancer_data.get(key, {}).get('rate')
        geojson['features'][i]['factor_value'] = factor_data.get(key, {}).get('rate')

    return JsonResponse(geojson)

@require_http_methods(["GET"])
@handle_errors
def regression_data(request):
    """View to return data for the regression plot."""
    params = get_query_params(request, optional_params=['level', 'cancer_type', 'factor', 'gender', 'race', 'cancer_year', 'factor_year'])
    level, cancer_type_name, factor_name, gender_name, race_name, cancer_year, factor_year = (
        params['level'], params['cancer_type'], params['factor'], params['gender'], params['race'], params['cancer_year'], params['factor_year']
    )

    debug_info = {
        'output': [],
        'level': level,
        'cancer_type': cancer_type_name,
        'factor': factor_name,
        'gender': gender_name,
        'race': race_name,
        'cancer_year': cancer_year,
        'factor_year': factor_year
    }

    # Get model instances
    cancer_type = get_model_instance(CancerType, 'name', cancer_type_name)
    factor = get_model_instance(Factor, 'name', factor_name)
    gender = get_model_instance(Gender, 'name', gender_name)
    race = get_model_instance(Race, 'name', race_name)

    # Build queries
    try:
        cancer_queryset = CancerIncidence.objects.filter(cancer_type=cancer_type, gender=gender, race=race)
        debug_info['output'] += [f" CancerIncidence records: {cancer_queryset.count()};"]   
        factor_queryset = FactorMeasurement.objects.filter(factor=factor)
        debug_info['output'] += [f" FactorMeasurement records: {factor_queryset.count()};"]
        cancer_queryset = apply_geographic_filter(cancer_queryset, level)
        debug_info['output'] += [f" CancerIncidence After geographic filter: {cancer_queryset.count()};"]
        factor_queryset = apply_geographic_filter(factor_queryset, level)
        debug_info['output'] += [f" FactorMeasurement After geographic filter: {factor_queryset.count()};"]
        cancer_queryset = apply_year_filter(cancer_queryset, cancer_year)
        debug_info['output'] += [f" CancerIncidence After year filter: {cancer_queryset.count()};"]
        factor_queryset = apply_year_filter(factor_queryset, factor_year)
        debug_info['output'] += [f" FactorMeasurement After year filter: {factor_queryset.count()};"]
    except Exception as e:
        return JsonResponse({"error": f"Database query error: {str(e)}"}, status=500)

    # Aggregate data
    try:
        cancer_data = {}
        for record in cancer_queryset:
            key = generate_key(record, level)
            if record.incidence_rate is not None:
                cancer_data[key] = {
                    'state': record.state,
                    'county': record.county if level == 'county' else None,
                    'rate': record.incidence_rate
                }
        factor_data = {}
        for record in factor_queryset:
            key = generate_key(record, level)
            if record.factor_value is not None:
                factor_data[key] = {
                    'state': record.state,
                    'county': record.county if level == 'county' else None,
                    'rate': record.factor_value
                }
    except Exception as e:
        return JsonResponse({"error": f"Data aggregation error: {str(e)}"}, status=500)
    debug_info['output'] += [f" keys sample cancer_data: {list(cancer_data.keys())[:5]};"]
    debug_info['output'] += [f" keys sample factor_data: {list(factor_data.keys())[:5]};"]

    # Merge data
    result = [
        {
            'state': cancer_data[key]['state'],
            'county': cancer_data[key]['county'],
            'cancer_rate': cancer_data[key]['rate'],
            'factor_value': factor_data[key]['rate']
        }
        for key in cancer_data if key in factor_data
    ]

    if result == []:
        return JsonResponse({"error": "No data available for the selected parameters.", "debug": debug_info}, status=404)
    return JsonResponse({"data": result, "debug": debug_info})