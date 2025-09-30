from django.shortcuts import render
import os
import json
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from .models import CancerIncidence, CancerType, Factor, Gender, Race, GeographicLevel
from django.db.models import Min


COUNTY_COLUMN = 'NAME'  # Column name in GeoJSON for county names
STATE_COLUMN = 'name'  # Column name in GeoJSON for state names

def dashboard_view(request):
    """View function for the dashboard homepage."""
    return render(request, 'geospatial_dashboard.html')



import os
import json
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from .models import CancerIncidence, CancerType, Gender, Race


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
        queryset = CancerIncidence.objects.filter(cancer_type=cancer_type)
       
        # Filter by geographic level
        if level == 'state':
            queryset = queryset.filter(county='All')
        else:
            queryset = queryset.exclude(county='All')
       
        # Apply demographic filters
        if gender_name:
            gender = Gender.objects.get(name__iexact=gender_name)
            queryset = queryset.filter(gender=gender)
       
        if race_name:
            race = Race.objects.get(name__iexact=race_name)
            queryset = queryset.filter(race=race)
       
        # Filter by year
        if year:
            queryset = queryset.filter(start_year__lte=int(year), end_year__gte=int(year))
        else:
            # Get most recent year if not specified
            from django.db.models import Max
            latest_year = queryset.aggregate(Max('start_year'))['start_year__max']
            if latest_year:
                queryset = queryset.filter(start_year=latest_year)
       
        # Aggregate data by location
        cancer_data = {}
        debug_records = []
        for record in queryset:
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
            'query_count': queryset.count(),
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


# def pie(request):
#     """Django view to get geospatial data with all cancer rates for pie charts."""
#     level = request.GET.get('level', 'county')
    
#     # Get absolute paths for GeoJSON files
#     if level == 'county':
#         geojson_path = os.path.join(settings.BASE_DIR, 'dashboard', 'static', 'data', 'counties.geojson')
#     else:
#         geojson_path = os.path.join(settings.BASE_DIR, 'dashboard', 'static', 'data', 'us-states.json')
    
#     # Check if file exists
#     if not os.path.exists(geojson_path):
#         return JsonResponse({"error": f"GeoJSON file not found: {geojson_path}"}, status=404)
    
#     try:
#         # Load shape data
#         with open(geojson_path, 'r') as f:
#             geojson = json.load(f)
        
#         # Query database for state or county values
#         if level == 'county':
#             data = CountyData.objects.all()
#         else:
#             data = StateData.objects.all()
        
#         # Create mapping dictionaries for faster lookups
#         if level == 'county':
#             # Create county mapping with multiple variations for faster lookups
#             county_name_mapping = {}
#             for county_data in data:
#                 # Original county name
#                 county_name_mapping[county_data.county] = county_data
#                 # Lowercase version
#                 county_name_mapping[county_data.county.lower()] = county_data
#                 # Version without "County" suffix if present
#                 clean_name = county_data.county.replace(" County", "")
#                 if clean_name != county_data.county:
#                     county_name_mapping[clean_name] = county_data
#                     county_name_mapping[clean_name.lower()] = county_data
#         else:
#             # Create a dictionary of state names
#             state_name_mapping = {}
#             for state_data in data:
#                 # Add both lowercase and regular versions
#                 state_name_mapping[state_data.state.lower()] = state_data
#                 state_name_mapping[state_data.state] = state_data
    
#         # Define cancer types
#         cancer_types = ['eso', 'kidney', 'liver', 'lung', 'pancreatic', 'prostate', 'skin']
    
#         # Merge shape with values
#         for feature in geojson['features']:
#             # Extract name using optimized property lookup
#             props = feature['properties']
            
#             # Use global constants for property names based on level
#             primary_column = COUNTY_COLUMN if level == 'county' else STATE_COLUMN
#             name = props.get(primary_column) or props.get('STATE_NAME') or props.get('COUNTY')
            
#             if not name:
#                 continue

#             props['county_name'] = name
                
#             # Try to find a match in database using fast dictionary lookups
#             db_record = None
#             if level == 'state':
#                 # State level - use existing state mapping
#                 db_record = state_name_mapping.get(name) or state_name_mapping.get(name.lower())
#             else:
#                 # County level - use optimized county mapping
#                 db_record = (county_name_mapping.get(name) or 
#                            county_name_mapping.get(name.lower()) or
#                            county_name_mapping.get(name.replace(" County", "")) or
#                            county_name_mapping.get(name.replace(" County", "").lower()))
            
#             # Add all cancer rates to the feature properties
#             if db_record:
#                 for cancer_type in cancer_types:
#                     rate_field = f'{cancer_type}_rate'
#                     if hasattr(db_record, rate_field):
#                         value = getattr(db_record, rate_field)
#                         feature['properties'][cancer_type] = value if value is not None else 0
#                     else:
#                         feature['properties'][cancer_type] = 0
#             else:
#                 # No matching record, set default values for all cancer types
#                 for cancer_type in cancer_types:
#                     feature['properties'][cancer_type] = 0
        
#         return JsonResponse(geojson)
#     except Exception as e:
#         return JsonResponse({"error": str(e)}, status=500)

# def dotDensity(request):
#     """Django view to get geospatial data with cancer rates."""
#     start_time = time.time()
    
#     level = request.GET.get('level', 'county')
#     cancer_type = request.GET.get('cancer_type', 'lung')
#     factor = request.GET.get('factor', 'smoking') 
    
#     # Get absolute paths for GeoJSON files
#     file_setup_start = time.time()
#     if level == 'county':
#         geojson_path = os.path.join(settings.BASE_DIR, 'dashboard', 'static', 'data', 'counties.geojson')
#     else:
#         geojson_path = os.path.join(settings.BASE_DIR, 'dashboard', 'static', 'data', 'us-states.json')
    
#     file_setup_time = time.time() - file_setup_start
    
#     # Load shape data
#     file_load_start = time.time()
#     with open(geojson_path, 'r') as f:
#         geojson = json.load(f)
#     file_load_time = time.time() - file_load_start
    
#     # Query database for state or county values
#     db_query_start = time.time()
#     if level == 'county':
#         data = CountyData.objects.all()
#         # Create simple mapping dictionary assuming clean data
#         county_name_mapping = {county_data.county: county_data for county_data in data}
#     else:
#         data = StateData.objects.all()
#         # Create simple mapping dictionary assuming clean data
#         state_name_mapping = {state_data.state: state_data for state_data in data}
#     db_query_time = time.time() - db_query_start

#     # Merge shape with values
#     merge_start = time.time()
#     for feature in geojson['features']:
#         # Direct property access assuming clean data
#         props = feature['properties']
#         primary_column = COUNTY_COLUMN if level == 'county' else STATE_COLUMN
#         name = props.get(primary_column)
#         if not name:
#             continue
            
#         props['county_name'] = name
            
#         # Direct dictionary lookup with minimal fallback
#         mapping = state_name_mapping if level == 'state' else county_name_mapping
#         db_record = mapping.get(name)
#         if db_record:
#             props['cancer_rate'] = getattr(db_record, f'{cancer_type}_rate')
#             props['factor_value'] = getattr(db_record, factor)
#         else:
#             props['cancer_rate'] = 0
#             props['factor_value'] = 0
#     merge_time = time.time() - merge_start
    
#     total_time = time.time() - start_time
    
#     # Log timing information
#     print(f"dotDensity timing - File setup: {file_setup_time:.4f}s, File load: {file_load_time:.4f}s, DB query: {db_query_time:.4f}s, Merge: {merge_time:.4f}s, Total: {total_time:.4f}s")
    
#     return JsonResponse(geojson)

# def regression_data(request):
#     """View to return data for the regression plot."""
#     cancer_type = request.GET.get('cancer_type', 'kidney')
#     factor = request.GET.get('factor', 'smoking')  # Default to smoking
#     level = request.GET.get('level', 'county')  # Match the same level parameter as map
    
#     # Get data for regression analysis based on the same level as the map
#     if level == 'county':
#         regions = CountyData.objects.all()
#     else:
#         regions = StateData.objects.all()
    
#     # Create a list of data points for the regression plot
#     data = []
#     for region in regions:
#         cancer_field = f'{cancer_type}_rate'
#         if hasattr(region, cancer_field):
#             cancer_value = getattr(region, cancer_field)
#             factor_value = getattr(region, factor, None)
            
#             if cancer_value is not None and factor_value is not None:
#                 # Initialize with basic data
#                 region_data = {
#                     'state': region.state,
#                     cancer_type: cancer_value,
#                     factor: factor_value
#                 }
                
#                 # Add county name if it's county level data
#                 if level == 'county':
#                     region_data['county'] = region.county
                
#                 data.append(region_data)
    
#     return JsonResponse(data, safe=False)