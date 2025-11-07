from django.shortcuts import render
from django.http import JsonResponse, Http404
import os
from pathlib import Path
import networkx as nx
from django.views.decorators.http import require_http_methods
from .utils import (
    get_query_params, get_model_instance, apply_geographic_filter,
    apply_year_filter, load_geojson, generate_key, handle_errors
)
from .models import CancerIncidence, CancerType, Factor, Gender, Race, FactorMeasurement

# Path to the app's static networks directory
APP_DIR = Path(__file__).resolve().parent
NETWORKS_DIR = APP_DIR / "static" / "data" / "networks"

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

def home(request):
    return render(request, 'home.html')

def _available_networks():
    nets = []
    if NETWORKS_DIR.exists():
        for p in sorted(NETWORKS_DIR.glob("*.gml")):
            slug = p.stem.lower()
            label = slug.capitalize()
            nets.append({"slug": slug, "label": label, "path": str(p)})
    return nets

def network_analysis(request):
    nets = _available_networks()
    default_slug = nets[0]["slug"] if nets else None
    return render(request, "network_analysis.html", {
        "networks": nets,
        "default_slug": default_slug,
        "net_dir": str(NETWORKS_DIR),
    })

def _read_graph_any(path: str):
    # Detect GraphML mislabeled as GML
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        header = f.read(200).lstrip()
    if header.startswith("<?xml") or "<graphml" in header.lower():
        return nx.read_graphml(path)

    # GML fallbacks
    try:
        return nx.read_gml(path, label='id', destringizer=int)
    except Exception:
        try:
            return nx.read_gml(path, label=None, destringizer=int)
        except Exception:
            return nx.read_gml(path, label=None)

def network_json_by_slug(request, cancer: str):
    nets = _available_networks()
    entry = next((n for n in nets if n["slug"] == cancer.lower()), None)
    if not entry:
        return JsonResponse({"error": f"Network '{cancer}' not found in {NETWORKS_DIR}."}, status=404)

    gml_path = entry["path"]
    if not os.path.exists(gml_path):
        return JsonResponse({"error": f"GML file missing: {gml_path}"}, status=404)

    try:
        G = _read_graph_any(gml_path)
    except Exception as e:
        return JsonResponse({"error": f"Failed to parse graph file: {e}"}, status=400)

    n_nodes, n_edges = G.number_of_nodes(), G.number_of_edges()
    if n_nodes == 0:
        return JsonResponse({"error": "Parsed graph has 0 nodes. Check file format."}, status=400)

    # Optional guardrail for huge graphs:
    MAX_ELEMENTS = 60000  # nodes + edges
    if n_nodes + n_edges > MAX_ELEMENTS:
        return JsonResponse(
            {"error": f"Graph too large to render in browser ({n_nodes} nodes, {n_edges} edges). "
                      f"Consider precomputing a layout & JSON."},
            status=400
        )

    def label_for(node, attrs):
        return str(attrs.get("label") or attrs.get("name") or attrs.get("id") or node)

    elements = []
    for n, attrs in G.nodes(data=True):
        nid = str(n)
        elements.append({"data": {"id": nid, "label": label_for(n, attrs)}})

    for u, v, attrs in G.edges(data=True):
        elements.append({
            "data": {
                "id": f"{u}_{v}",
                "source": str(u),
                "target": str(v),
                "weight": float(attrs.get("weight", 1.0)),
            }
        })

    return JsonResponse({"elements": elements, "meta": {"nodes": n_nodes, "edges": n_edges}})

def molecular_analysis(request):
    return render(request, 'molecular_analysis.html')