from django.shortcuts import render
from django.http import JsonResponse, Http404
from collections import Counter
from itertools import zip_longest
import numpy as np
import os
import ast
from pathlib import Path
import math
import networkx as nx
import igraph as ig
import leidenalg as la
from django.views.decorators.http import require_http_methods, require_GET
from .utils import (
    get_query_params, get_model_instance, apply_geographic_filter,
    apply_year_filter, load_geojson, generate_key, handle_errors
)
from .models import CancerIncidence, CancerType, Factor, Gender, Race, FactorMeasurement, TotalRecordAgg, NetworkNodeMeta

# Path to the app's static networks directory
APP_DIR = Path(__file__).resolve().parent
NETWORKS_DIR = APP_DIR / "static" / "data" / "networks"

def dashboard_view(request):
    """View function for the dashboard homepage."""
    return render(request, 'geospatial_dashboard.html')

def organize_data(cancer_queryset, factor_queryset, level):
    '''Organize cancer and factor data into dictionaries by geographic identifiers.'''
    cancer_data = {}
    factor_data = {}
    for record in cancer_queryset:
        key = generate_key(record, level)
        if record.incidence_rate is not None:
            cancer_data[key] = {'state': record.state, 'county': record.county if level == 'county' else None, 'rate': record.incidence_rate}
    for record in factor_queryset:
        key = generate_key(record, level)
        if record.factor_value is not None:
            # Store all factors
            if key not in factor_data:
                factor_data[key] = {'state': record.state, 'county': record.county if level == 'county' else None}
            factor_data[key][record.factor.name] = record.factor_value
            factor_data[key]['rate'] = record.factor_value

    return cancer_data, factor_data


@require_http_methods(["GET"])
def get_geojson(request):
    params = get_query_params(request, optional_params=['level'])
    level = params['level']
    geojson = load_geojson(level)
    return JsonResponse(geojson)

@require_http_methods(["GET"])
@handle_errors
def get_static_info(request):
    '''For each cancer type and factor, return available years for dropdowns.'''
    
    # 1. Build Cancer Dictionary: { 'level': { 'CancerName': [years] } }
    cancer_dict = {
        'state': {},
        'county': {}
    }
    
    # Get all cancer types
    all_cancers = list(CancerIncidence.objects.values_list('cancer_type__name', flat=True).distinct().order_by('cancer_type__name'))
    
    for ct in all_cancers:
        # State years
        state_years = sorted(list(CancerIncidence.objects.filter(
            cancer_type__name=ct, 
            geographic_level__iexact='State'
        ).values_list('start_year', flat=True).distinct()))
        if state_years:
            cancer_dict['state'][ct] = state_years
            
        # County years
        county_years = sorted(list(CancerIncidence.objects.filter(
            cancer_type__name=ct, 
            geographic_level__iexact='County'
        ).values_list('start_year', flat=True).distinct()))
        if county_years:
            cancer_dict['county'][ct] = county_years

    # 2. Build Factor Dictionary: { 'level': { 'FactorName': [years] } }
    factor_dict = {
        'state': {},
        'county': {}
    }
    
    all_factors = list(FactorMeasurement.objects.values_list('factor__name', flat=True).distinct().order_by('factor__name'))
    
    for ft in all_factors:
        # State years
        state_years = sorted(list(FactorMeasurement.objects.filter(
            factor__name=ft, 
            geographic_level__iexact='State'
        ).values_list('start_year', flat=True).distinct()))
        if state_years:
            factor_dict['state'][ft] = state_years
            
        # County years
        county_years = sorted(list(FactorMeasurement.objects.filter(
            factor__name=ft, 
            geographic_level__iexact='County'
        ).values_list('start_year', flat=True).distinct()))
        if county_years:
            factor_dict['county'][ft] = county_years

    # 3. Get list of all states
    states = list(CancerIncidence.objects.values_list('state', flat=True).distinct().order_by('state'))

    # 4. Get counties mapping: { 'StateName': ['County1', 'County2', ...] }
    counties_qs = CancerIncidence.objects.filter(geographic_level='County').values('state', 'county').distinct().order_by('state', 'county')
    counties_dict = {}
    for item in counties_qs:
        s = item['state']
        c = item['county']
        if s not in counties_dict:
            counties_dict[s] = []
        counties_dict[s].append(c)

    return JsonResponse({
        'cancer_types': cancer_dict, 
        'factor_types': factor_dict,
        'states': states,
        'counties': counties_dict
    })


def get_cancer_types(geographic_level):
    if geographic_level:
        qs = CancerIncidence.objects.filter(geographic_level__iexact=geographic_level)
        return list(qs.values_list('cancer_type__name', flat=True).distinct().order_by('cancer_type__name'))
    return list(CancerType.objects.values_list('name', flat=True).order_by('name'))


def get_factors(geographic_level):
    if geographic_level:
        qs = FactorMeasurement.objects.filter(geographic_level__iexact=geographic_level)
        return list(qs.values_list('factor__name', flat=True).distinct().order_by('factor__name'))
    return list(Factor.objects.values_list('name', flat=True).order_by('name'))


@require_http_methods(["GET"])
def get_data(request):
    params = get_query_params(request, optional_params=['level', 'cancer_type', 'gender', 'race', 'cancer_year', 'factor_year'])
    level, cancer_type_name, gender_name, race_name, cancer_year, factor_year = (
        params['level'], params['cancer_type'], params['gender'], params['race'], params['cancer_year'], params['factor_year']
    )
    
    # Handle multiple factors
    factor_names = request.GET.getlist('factor')

    cancer_queryset = CancerIncidence.objects.none()
    factor_queryset = FactorMeasurement.objects.none()
    
    if cancer_type_name and cancer_type_name.lower() != 'none':
        cancer_type = get_model_instance(CancerType, 'name', cancer_type_name)
        cancer_queryset = CancerIncidence.objects.filter(cancer_type=cancer_type)
        
        if gender_name.lower() != 'all':
            gender = get_model_instance(Gender, 'name', gender_name)
            cancer_queryset = cancer_queryset.filter(gender=gender)
        else:
            # Filter for aggregated data when 'All' genders are selected
            cancer_queryset = cancer_queryset.filter(gender__name='All')
        
        if race_name.lower() != 'all':
            race = get_model_instance(Race, 'name', race_name)
            cancer_queryset = cancer_queryset.filter(race=race)
        else:
            # Filter for aggregated data when 'All' races are selected
            cancer_queryset = cancer_queryset.filter(race__name='All')
        
        cancer_queryset = apply_geographic_filter(cancer_queryset, level)
        cancer_queryset = apply_year_filter(cancer_queryset, cancer_year)
    
    if factor_names:
        valid_factors = [f for f in factor_names if f.lower() != 'none']
        if valid_factors:
            factors = Factor.objects.filter(name__in=valid_factors)
            factor_queryset = FactorMeasurement.objects.filter(factor__in=factors)
            factor_queryset = apply_geographic_filter(factor_queryset, level)
            factor_queryset = apply_year_filter(factor_queryset, factor_year)

    cancer_data, factor_data = organize_data(cancer_queryset, factor_queryset, level)
    return JsonResponse({'cancer_data': cancer_data, 'factor_data': factor_data})

from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
import pandas as pd
from scipy.sparse import csr_matrix  # Optional for sparse efficiency if many NaNs


@require_http_methods(["GET"])
@handle_errors
def get_pca_view(request):
    """
    View to compute PCA on selected factors across geographic units.
    Query params:
    - level: 'state' or 'county' (required)
    - factor: list of factor names (e.g., ?factor=poverty&factor=obesity) (required, min 2)
    - cancer_type, gender, race, cancer_year: Optional for aligning cancer rates
    - factor_year: Year filter for factors
    - n_components: Max PCs to compute (optional; default=Kaiser rule)
    Returns: JSON with PCA results and optional cancer rates for coloring.
    """
    params = get_query_params(
        request, optional_params=['level', 'cancer_type', 'gender', 'race', 'cancer_year', 'factor_year', 'n_components']
    )
    level = params['level']
    factor_names = request.GET.getlist('factor') # multiple factors
    n_components_val = params.get('n_components')
    n_components = int(n_components_val) if n_components_val is not None else None # optional int
    
    if len(factor_names) < 2:
        return JsonResponse({'error': "At least 2 factors required for PCA."}, status=400)
    
    valid_factors = [f for f in factor_names if f.lower() != 'none'] # filter out 'none'
    
    # Fetch factor data
    factors = Factor.objects.filter(name__in=valid_factors)
    factor_queryset = FactorMeasurement.objects.filter(factor__in=factors)
    factor_queryset = apply_geographic_filter(factor_queryset, level)
    factor_queryset = apply_year_filter(factor_queryset, params['factor_year'])
    
    # Fetch optional cancer data for coloring
    cancer_data = {}
    if params['cancer_type'] and params['cancer_type'].lower() != 'none':
        cancer_type = get_model_instance(CancerType, 'name', params['cancer_type'])
        cancer_queryset = CancerIncidence.objects.filter(cancer_type=cancer_type)
        if params['gender'].lower() != 'all':
            gender = get_model_instance(Gender, 'name', params['gender'])
            cancer_queryset = cancer_queryset.filter(gender=gender)
        if params['race'].lower() != 'all':
            race = get_model_instance(Race, 'name', params['race'])
            cancer_queryset = cancer_queryset.filter(race=race)
        cancer_queryset = apply_geographic_filter(cancer_queryset, level)
        cancer_queryset = apply_year_filter(cancer_queryset, params['cancer_year'])
        
        # Simple dict for lookup
        for record in cancer_queryset:
            if record.incidence_rate is not None:
                key = generate_key(record, level)
                cancer_data[key] = record.incidence_rate
    
    # Organize factors into DataFrame (pivot: rows=geo units, cols=factors)
    factor_df_dict = {}
    factor_metadata = {}  # {key: {'state', 'county'}}
    
    for record in factor_queryset:
        key = generate_key(record, level)
        if record.factor_value is not None:
            if key not in factor_metadata:
                factor_metadata[key] = {
                    'state': record.state,
                    'county': record.county if level == 'county' else None
                }
            factor_df_dict.setdefault(key, {})[record.factor.name] = record.factor_value
    
    # Build DataFrame: Drop units with any missing factor (complete cases only)
    factor_df = pd.DataFrame.from_dict(factor_df_dict, orient='index')
    factor_df = factor_df.dropna()  # Rows with NaN in any factor -> drop
    if factor_df.shape[0] < 2 or factor_df.shape[1] < 2:
        return JsonResponse({'error': "Insufficient complete data."}, status=400)
    
    # Standardize (zero mean, unit variance)
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(factor_df)
    
    # Fit PCA
    # If n_components was not set by user, we fit all initially to apply Kaiser rule
    pca_fit_components = n_components if n_components is not None else min(X_scaled.shape)
    pca = PCA(n_components=pca_fit_components)
    pc_scores_all = pca.fit_transform(X_scaled)  # Shape: (n_samples, n_components)
    
    # Apply Kaiser Rule if n_components was not manually specified
    if n_components is None:
        # Keep components with eigenvalue (explained variance) > 1.0
        # If no component > 1.0, keep at least the top one.
        eigenvalues = pca.explained_variance_
        k = 0
        for ev in eigenvalues:
            if ev > 1.0: # Kaiser criterion
                k += 1
        k = max(k, 1) # Fallback to 1 component if none qualify
        
        # Slice results
        pc_scores = pc_scores_all[:, :k]
        loadings = pca.components_[:k]
        explained_variance_ratio = pca.explained_variance_ratio_[:k]
        explained_variance = pca.explained_variance_[:k]
        singular_values = pca.singular_values_[:k] if hasattr(pca, 'singular_values_') else None
    else:
        pc_scores = pc_scores_all
        loadings = pca.components_
        explained_variance_ratio = pca.explained_variance_ratio_
        explained_variance = pca.explained_variance_
        singular_values = pca.singular_values_ if hasattr(pca, 'singular_values_') else None

    # Results dict
    results = {
        'geo_keys': list(factor_df.index),  # e.g., ['state:WA', 'county:WA,001']
        'pc_scores': pc_scores.tolist(),     # [[PC1, PC2, ...], ...]
        'loadings': loadings.tolist(), # [[factor1_load_PC1, factor2_load_PC1, ...], ...]
        'explained_variance_ratio': explained_variance_ratio.tolist(),
        'explained_variance': explained_variance.tolist(),
        'factor_names': list(factor_df.columns),
        'n_samples': factor_df.shape[0],
        'singular_values': singular_values.tolist() if singular_values is not None else None,
        'metadata': {key: factor_metadata[key] for key in factor_df.index},
        'cancer_rates': {key: cancer_data.get(key, None) for key in factor_df.index},  # Optional for coloring
        'level': level
    }
    
    return JsonResponse(results)

def get_pie_data(request):
    '''Fetch data for pie chart visualization. Data includes multiple cancer types.'''
    params = get_query_params(request, optional_params=['level', 'cancer_year', 'gender', 'race'])
    level, cancer_year, gender_name, race_name = (
        params['level'], params['cancer_year'], params['gender'], params['race']
    )

    cancer_queryset = CancerIncidence.objects.select_related('cancer_type').all() # Start with all records
    cancer_queryset = apply_geographic_filter(cancer_queryset, level) # Filter by level
    cancer_queryset = apply_year_filter(cancer_queryset, cancer_year) # Filter by year
    
    if gender_name.lower() != 'all': # If specified, filter by gender, otherwise keep all entries
        gender = get_model_instance(Gender, 'name', gender_name)
        cancer_queryset = cancer_queryset.filter(gender=gender)
    
    race = get_model_instance(Race, 'name', race_name)
    cancer_queryset = cancer_queryset.filter(race=race) # Fitler by race ex: (all, white, hispanic, etc)

    cancer_queryset = cancer_queryset.values('statefp', 'countyfp', 'state', 'county', 'cancer_type__name', 'gender__name', 'incidence_rate') # Only select needed fields

    # Organize data into nested dict: {geo_key: {cancer_type: {gender: rate}}}
    cancer_data = {}
    for record in cancer_queryset:
        key = generate_key(record, level)
        if key not in cancer_data:
            cancer_data[key] = {'state': record['state'], 'county': record['county'] if level == 'county' else None, 'rate': {}}
        
        if record['incidence_rate'] is not None:
            c_type = record['cancer_type__name']
            gender = record['gender__name']
            if c_type not in cancer_data[key]['rate']:
                cancer_data[key]['rate'][c_type] = {}
            cancer_data[key]['rate'][c_type][gender] = record['incidence_rate']
    return JsonResponse({'cancer_data': cancer_data})

def home(request):
    return render(request, 'home.html')

# Network Analysis
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

# ------------------------------------------------------------
# NEW: igraph loader for clustering (matches your local method)
# ------------------------------------------------------------

def _igraph_from_gml(path: str) -> ig.Graph:
    """
    Read GML directly with igraph for clustering/layout.
    This avoids NX->IG mapping bugs and matches local behavior.
    """
    g = ig.Graph.Read_GML(path)

    # community detection: undirected is standard
    if g.is_directed():
        g = g.as_undirected(combine_edges="min")

    # simplify multiedges/self-loops
    g.simplify(combine_edges="min", loops=True)

    # Ensure we have a stable "name" attribute if missing
    if "name" not in g.vs.attributes():
        g.vs["name"] = [str(i) for i in range(g.vcount())]

    return g

def _leiden_membership_leidenalg(g: ig.Graph):
    """
    EXACTLY like your local code:
      la.find_partition(graph, la.ModularityVertexPartition)
    """
    part = la.find_partition(g, la.ModularityVertexPartition)
    return list(part.membership)

def _cluster_positions_simple(g: ig.Graph):
    """
    Simple natural layout for clustered response.
    No seed= (igraph expects a matrix for 'seed').
    """
    lay = g.layout_fruchterman_reingold()
    return {str(i): (float(lay[i][0]), float(lay[i][1])) for i in range(g.vcount())}

# ------------------------------------------------------------
# Updated network_json_by_slug (minimal changes, correct meta)
# ------------------------------------------------------------

def network_json_by_slug(request, cancer: str):
    nets = _available_networks()
    entry = next((n for n in nets if n["slug"] == cancer.lower()), None)
    if not entry:
        return JsonResponse({"error": f"Network '{cancer}' not found in {NETWORKS_DIR}."}, status=404)

    gml_path = entry["path"]
    if not os.path.exists(gml_path):
        return JsonResponse({"error": f"GML file missing: {gml_path}"}, status=404)

    # Read NX graph for elements (your current rendering path)
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

    # Cluster request flags
    do_cluster = request.GET.get("cluster", "0") in ("1", "true", "yes")
    # Keep method param for future, but for now we implement the "simple local" Leidenalg method
    method = request.GET.get("method", "leiden").lower()

    cluster_by_id = {}
    pos = {}

    if do_cluster:
        # Read with igraph for clustering to match local behavior
        g_ig = _igraph_from_gml(gml_path)

        # Run leidenalg exactly like local
        membership = _leiden_membership_leidenalg(g_ig)

        # Map membership by vertex index -> node id "0..N-1"
        # Assumes your webtool node ids are the index strings (as you've been using)
        cluster_by_id = {str(i): int(membership[i]) for i in range(len(membership))}

        # Natural layout positions from igraph
        pos = _cluster_positions_simple(g_ig)

    def label_for(node, attrs):
        """
        Node label shown in Cytoscape (NOT hover content).
        """
        return str(attrs.get("label") or attrs.get("id") or node)

    elements = []

    # Nodes
    for n, attrs in G.nodes(data=True):
        nid = str(n)
        node_data = {"id": nid, "label": label_for(n, attrs)}
        node_el = {"data": node_data}

        if do_cluster:
            node_el["data"]["cluster"] = cluster_by_id.get(nid, -1)
            xy = pos.get(nid)
            if xy:
                node_el["position"] = {"x": float(xy[0]), "y": float(xy[1])}

        elements.append(node_el)

    # Edges
    for u, v, attrs in G.edges(data=True):
        elements.append({
            "data": {
                "id": f"{u}_{v}",
                "source": str(u),
                "target": str(v),
                "weight": float(attrs.get("weight", 1.0)),
            }
        })

    meta = {"nodes": n_nodes, "edges": n_edges}
    if do_cluster:
        meta.update({
            "clustered": True,
            "cluster_method": "leidenalg.ModularityVertexPartition",
            "n_clusters": int(len(set(cluster_by_id.values()))) if cluster_by_id else 0
        })
    else:
        meta.update({"clustered": False})

    # IMPORTANT: return meta (your code previously computed meta but returned a different dict)
    return JsonResponse({"elements": elements, "meta": meta})


def network_node_meta(request, cancer: str, node_id: str):
    try:
        node_index = int(node_id)
    except ValueError:
        return JsonResponse({"error": "node_id must be an integer"}, status=400)

    # Accept folder slug OR display name
    key = (cancer or "").strip()

    candidates = [
        key,                   
        key.title(),             
        f"{key} Cancer",          
        f"{key.title()} Cancer",   
    ]

    cancer_obj = None
    for nm in candidates:
        cancer_obj = CancerType.objects.filter(name__iexact=nm).first()
        if cancer_obj:
            break

    if cancer_obj is None:
        return JsonResponse(
            {"error": f"Unknown cancer type: {key}. Tried: {candidates}"},
            status=404
        )

    rec = NetworkNodeMeta.objects.filter(cancer=cancer_obj, node_index=node_index).first()
    if not rec:
        return JsonResponse({"error": f"No metadata for node {node_index} ({cancer})"}, status=404)

    return JsonResponse({
        "node_index": rec.node_index,
        #"Tumor_Sample_Barcode": rec.Tumor_Sample_Barcode,

        # list fields
        "event_ids": rec.event_ids or [],
        "genes": rec.genes or [],

        # clinical
        "age_at_initial_pathologic_diagnosis": rec.age_at_initial_pathologic_diagnosis,
        "gender": rec.gender,
        "vital_status": rec.vital_status,
        "race_list": rec.race_list,
        "ethnicity": rec.ethnicity,

        # optional counts
        "n_events": rec.n_events,
        "n_genes": rec.n_genes,
    })

def _flatten_to_list(obj):
    """
    Helper: flatten nested structures into a flat Python list.
    """
    if obj is None:
        return []
    if isinstance(obj, (list, tuple, set)):
        out = []
        for x in obj:
            out.extend(_flatten_to_list(x))
        return out
    return [obj]


def parse_listish(raw):
    """
    Convert whatever is stored in Hugo_Symbol / HGVSc / Variant_Classification
    into a clean list[str].

    Handles:
      - Real Python lists: ["TP53", "KRAS"]
      - Nested lists: [["TP53", "KRAS"], ["EGFR"]]
      - Stringified lists: "['TP53', 'KRAS']" or '["TP53", "KRAS"]'
      - Comma/semicolon strings: "TP53, KRAS; EGFR"
      - None / NaN / empty
    """
    # None / empty
    if raw is None:
        return []

    # Already a list/tuple/set → flatten + stringify
    if isinstance(raw, (list, tuple, set)):
        vals = _flatten_to_list(raw)
        out = []
        for v in vals:
            s = str(v).strip()
            if s and s.lower() not in {"nan", "none", "null"}:
                out.append(s)
        return out

    # String case
    if isinstance(raw, str):
        s = raw.strip()
        if not s:
            return []

        # Try to parse as Python literal (handles "['TP53','KRAS']")
        if (s.startswith("[") and s.endswith("]")) or (s.startswith("(") and s.endswith(")")):
            try:
                obj = ast.literal_eval(s)
                return parse_listish(obj)
            except Exception:
                # fall back to simple splitting
                pass

        # Fallback: split on comma/semicolon
        parts = [p.strip() for p in s.replace(";", ",").split(",")]
        return [p for p in parts if p and p.lower() not in {"nan", "none", "null"}]

    # Anything else → single string
    s = str(raw).strip()
    return [s] if s else []



def molecular_analysis(request):
    return render(request, 'molecular_analysis.html')

def _available_molecular_cancers():
    # Only show cancers that actually have molecular rows
    return (TotalRecordAgg.objects
            .values_list("cancer__name", flat=True)
            .distinct()
            .order_by("cancer__name"))

def molecular_cooccurrence(request):
    cancers = list(_available_molecular_cancers())
    selected = request.GET.get("cancer") or (cancers[0] if cancers else None)

    return render(request, "molecular_cooccurrence.html", {
        "title": "Gene Co-occurrence Heatmap",
        "cancers": cancers,
        "selected_cancer": selected,
    })

def molecular_clinical(request):
    cancers = list(
        TotalRecordAgg.objects
        .values_list("cancer__name", flat=True)
        .distinct()
        .order_by("cancer__name")
    )
    selected = request.GET.get("cancer") or (cancers[0] if cancers else None)

    return render(request, "molecular_clinical.html", {
        "cancers": cancers,
        "selected_cancer": selected,
        "title": "Clinical Distributions",
    })


def molecular_demographics(request):
    cancers = list(
        TotalRecordAgg.objects
        .values_list("cancer__name", flat=True)
        .distinct()
        .order_by("cancer__name")
    )
    selected = request.GET.get("cancer") or (cancers[0] if cancers else None)

    return render(request, "molecular_demographics.html", {
        "cancers": cancers,
        "selected_cancer": selected,
        "title": "Demographic Associations",
    })


    # dashboard/views.py
import json
from collections import Counter

from django.http import JsonResponse, Http404
from django.shortcuts import render
from django.views.decorators.http import require_GET

from .models import CancerType, TotalRecordAgg


def _available_molecular_cancers():
    # Only cancers that have molecular rows loaded
    return (TotalRecordAgg.objects
            .values_list("cancer__name", flat=True)
            .distinct()
            .order_by("cancer__name"))


def molecular_landscape(request):
    cancers = list(_available_molecular_cancers())
    selected = request.GET.get("cancer") or (cancers[0] if cancers else None)

    return render(request, "molecular_mutational_landscape.html", {
        "title": "Mutational Landscape",
        "cancers": cancers,
        "selected_cancer": selected,
    })

def yn_unknown(val):
    if not val:
        return "Unknown"
    s = str(val).strip().lower()
    if s in {"yes", "y", "true", "1"}:
        return "Yes"
    if s in {"no", "n", "false", "0"}:
        return "No"
    # TCGA fields sometimes contain longer strings
    if "yes" in s:
        return "Yes"
    if "no" in s:
        return "No"
    return "Unknown"

def normalize_stage(stage):
    if not stage:
        return "Unknown"
    s = str(stage).strip().upper()
    # common patterns: "STAGE II", "Stage IIA", etc.
    if "I" in s and "II" not in s and "III" not in s and "IV" not in s:
        return "Stage I"
    if "II" in s and "III" not in s and "IV" not in s:
        return "Stage II"
    if "III" in s and "IV" not in s:
        return "Stage III"
    if "IV" in s:
        return "Stage IV"
    return "Unknown"


@require_GET
def molecular_landscape_json(request, cancer_name):
    try:
        ct = CancerType.objects.get(name__iexact=cancer_name)
    except CancerType.DoesNotExist:
        raise Http404(f"Cancer '{cancer_name}' not found in CancerType.name")

    qs = TotalRecordAgg.objects.filter(cancer=ct)

    # -------------------------
    # IMPACT filter (same approach as demographics)
    # -------------------------
    impacts_param = (request.GET.get("impacts") or "").strip()
    impacts = [v.strip().upper() for v in impacts_param.split(",") if v.strip()]
    iset = set(impacts)

    # -------------------------
    # group_by (unchanged)
    # -------------------------
    group_by = (request.GET.get("group_by") or "none").strip().lower()
    allowed = {"none", "gender", "stage", "vital_status", "pharma_treatment", "radiation_treatment"}
    if group_by not in allowed:
        group_by = "none"

    variant_counter = Counter()
    gene_counter = Counter()

    grouped_mutations = {}   # group -> [total_mutations_per_sample,...]
    grouped_genes     = {}   # group -> [unique_gene_count_per_sample,...]

    def clean_tokens(raw):
        vals = []
        for x in parse_listish(raw):
            s = str(x).strip()
            if not s:
                continue
            if s.lower() in {"nan", "none", "null"}:
                continue
            vals.append(s)
        return vals

    def get_group_label(rec):
        if group_by == "gender":
            return normalize_gender(rec.gender)
        if group_by == "stage":
            return normalize_stage(rec.ajcc_pathologic_stage)
        if group_by == "vital_status":
            return (str(rec.vital_status).strip() if rec.vital_status else "Unknown")
        if group_by == "pharma_treatment":
            return yn_unknown(rec.treatments_pharmaceutical_treatment_or_therapy)
        if group_by == "radiation_treatment":
            return yn_unknown(rec.treatments_radiation_treatment_or_therapy)
        return "All Samples"

    # -------------------------
    # Available impacts (unchanged idea; keep top 10)
    # -------------------------
    impact_counter = Counter()
    for rec in qs:
        for imp in parse_listish(getattr(rec, "IMPACT", None)):
            imp = _clean_str(imp).upper()
            if imp:
                impact_counter[imp] += 1
    available_impacts = [im for im, _ in impact_counter.most_common(10)]

    # -------------------------
    # Main aggregation loop (UPDATED to respect IMPACT filter)
    # -------------------------
    for rec in qs:
        genes_all = clean_tokens(rec.Hugo_Symbol)
        hgvs_all  = clean_tokens(rec.HGVSc)
        vcls_all  = clean_tokens(rec.Variant_Classification)
        imps_all  = [(_clean_str(x).upper()) for x in parse_listish(getattr(rec, "IMPACT", None)) if _clean_str(x)]

        # If no impacts filter selected -> use all tokens as before
        if not iset:
            genes = genes_all
            hgvs  = hgvs_all
            vcls  = vcls_all
        else:
            # Apply IMPACT filter with best-effort alignment across mutation-level lists
            genes_f, hgvs_f, vcls_f = [], [], []

            # zip_longest ensures we don't crash if list lengths differ
            for g, h, vc, imp in zip_longest(genes_all, hgvs_all, vcls_all, imps_all, fillvalue=None):
                imp_u = (_clean_str(imp).upper() if imp is not None else "")

                # If IMPACT list is missing or shorter, imp_u becomes "" and will be excluded (strict behavior)
                if imp_u not in iset:
                    continue

                if g:
                    genes_f.append(g)
                if h:
                    hgvs_f.append(h)
                if vc:
                    vcls_f.append(vc)

            genes = genes_f
            hgvs  = hgvs_f
            vcls  = vcls_f

        # Unique mutated genes per sample
        gset = set(genes)

        # Total mutations per sample = number of HGVSc entries (mutation events)
        mut_count = len(hgvs)

        # Number of unique mutated genes per sample
        gene_count = len(gset)

        # Counters for other plots (respect filters)
        gene_counter.update(gset)
        variant_counter.update(vcls)

        # Grouped boxplot data (respect filters)
        label = get_group_label(rec)
        grouped_mutations.setdefault(label, []).append(mut_count)
        grouped_genes.setdefault(label, []).append(gene_count)

    # Variant type distribution (descending)
    if variant_counter:
        variant_labels, variant_counts = zip(*variant_counter.most_common())
    else:
        variant_labels, variant_counts = ([], [])

    # Top genes (descending)
    top_n = int(request.GET.get("top_genes", 10) or 10)
    top_n = max(1, min(top_n, 50))
    top = gene_counter.most_common(top_n)
    top_genes = [g for g, _ in top]
    top_gene_counts = [c for _, c in top]

    # Stable group order (push Unknown last)
    def group_sort_key(k):
        return (k == "Unknown", k)

    groups_sorted = sorted(grouped_mutations.keys(), key=group_sort_key)

    payload = {
        "meta": {
            "cancer": cancer_name,
            "n_samples": qs.count(),
            "group_by": group_by,
            "groups": groups_sorted,
            "impacts_used": impacts,  # helpful for UI + debugging
        },
        "available_impacts": available_impacts,
        "impacts_used": impacts,

        "variant_distribution": {
            "labels": list(variant_labels),
            "counts": list(variant_counts),
        },
        "top_genes": {
            "genes": top_genes,
            "counts": top_gene_counts,
        },
        "burden_box": {
            "groups": groups_sorted,
            "mutations": [grouped_mutations[g] for g in groups_sorted],
            "genes": [grouped_genes[g] for g in groups_sorted],
        }
    }
    return JsonResponse(payload)




def fisher_exact_two_sided(a, b, c, d):
    """
    Two-sided Fisher exact p-value + odds ratio for 2x2 table:
        [[a, b],
         [c, d]]
    Pure python exact test via hypergeometric tail.
    """
    or_val = (a * d) / (b * c) if b * c != 0 else (float("inf") if a * d > 0 else 0.0)

    row1 = a + b
    row2 = c + d
    col1 = a + c
    n = row1 + row2

    def log_choose(n, k):
        if k < 0 or k > n:
            return float("-inf")
        return math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1)

    def log_hypergeom(x):
        return (log_choose(col1, x) +
                log_choose(n - col1, row1 - x) -
                log_choose(n, row1))

    lo = max(0, row1 - (n - col1))
    hi = min(row1, col1)

    log_p_obs = log_hypergeom(a)

    p = 0.0
    for x in range(lo, hi + 1):
        lp = log_hypergeom(x)
        if lp <= log_p_obs + 1e-12:
            p += math.exp(lp)

    return or_val, min(p, 1.0)



@require_GET
def molecular_cooccurrence_json(request, cancer_name):
    """
    Query params:
      - genes=TP53,KRAS,...  (comma-separated, max 20)
      - top=10               (default top genes if genes not provided)
      - impacts=HIGH,MODERATE,... (optional; if provided, filters mutations to these impacts)

    Returns BOTH raw + fisher matrices plus top-50 genes for picker,
    plus available_impacts + impacts_used for UI.
    """
    try:
        ct = CancerType.objects.get(name__iexact=cancer_name)
    except CancerType.DoesNotExist:
        raise Http404(f"Cancer '{cancer_name}' not found")

    qs = TotalRecordAgg.objects.filter(cancer=ct)

    # --- IMPACT filter parsing (consistent approach) ---
    impacts_param = (request.GET.get("impacts") or "").strip()
    impacts_used = [v.strip().upper() for v in impacts_param.split(",") if v.strip()]
    iset = set(impacts_used)

    # --- build available impacts for UI ---
    impact_counter = Counter()
    for rec in qs:
        for imp in parse_listish(getattr(rec, "IMPACT", None)):
            imp = _clean_str(imp).upper()
            if imp:
                impact_counter[imp] += 1
    available_impacts = [im for im, _ in impact_counter.most_common(50)]

    # Per-sample unique gene sets + frequency counter (AFTER applying IMPACT filter)
    sample_sets = []
    gene_counter = Counter()

    for rec in qs:
        genes = parse_listish(rec.Hugo_Symbol)
        imps  = parse_listish(getattr(rec, "IMPACT", None))

        gset = set()

        if iset:
            for g, imp in zip_longest(genes, imps, fillvalue=None):
                g = _clean_str(g)
                if not g:
                    continue
                imp = _clean_str(imp).upper()
                if imp and imp in iset:
                    gset.add(g)

            # optional fallback stays the same
            if not gset:
                if any((_clean_str(x).upper() in iset) for x in imps):
                    gset = set(_clean_str(g) for g in genes if _clean_str(g))
                else:
                    gset = set()

            # skip samples with no passing mutations
            if not gset:
                continue

        else:
            gset = set(_clean_str(g) for g in genes if _clean_str(g))

        sample_sets.append(gset)
        gene_counter.update(gset)


    n_samples = len(sample_sets)
    if n_samples == 0:
        return JsonResponse({
            "genes": [],
            "raw_matrix": [],
            "fisher_or_matrix": [],
            "fisher_p_matrix": [],
            "available_genes": [],
            "available_impacts": available_impacts,
            "impacts_used": impacts_used,
            "n_samples": 0,
        })

    # If IMPACT filter removed everything, gene_counter might be empty
    if not gene_counter:
        return JsonResponse({
            "genes": [],
            "raw_matrix": [],
            "fisher_or_matrix": [],
            "fisher_p_matrix": [],
            "available_genes": [],
            "available_impacts": available_impacts,
            "impacts_used": impacts_used,
            "n_samples": n_samples,
        })

    # Top 100 genes only for picker
    available_genes = [g for g, _ in gene_counter.most_common(100)]

    # Determine gene list for heatmap
    genes_param = (request.GET.get("genes") or "").strip()
    if genes_param:
        selected = [g.strip() for g in genes_param.split(",") if g.strip()]
        selected = selected[:20]
        genes = [g for g in selected if g in gene_counter]
        if not genes:
            genes = [g for g, _ in gene_counter.most_common(10)]
    else:
        top_n = int(request.GET.get("top", 10) or 10)
        top_n = max(2, min(top_n, 20))
        genes = [g for g, _ in gene_counter.most_common(top_n)]

    n = len(genes)

    # Precompute mutation flags per gene (list of 0/1 across samples)
    flags = {g: [1 if g in s else 0 for s in sample_sets] for g in genes}

    raw = [[0.0] * n for _ in range(n)]
    fisher_or = [[None] * n for _ in range(n)]
    fisher_pneglog = [[None] * n for _ in range(n)]

    for i, gi in enumerate(genes):
        fi = flags[gi]
        for j, gj in enumerate(genes):
            fj = flags[gj]

            both = sum(1 for k in range(n_samples) if fi[k] and fj[k])
            raw[i][j] = round(both / n_samples, 2)

            if i == j:
                continue

            a = both
            b = sum(1 for k in range(n_samples) if fi[k] and not fj[k])
            c = sum(1 for k in range(n_samples) if not fi[k] and fj[k])
            d = sum(1 for k in range(n_samples) if not fi[k] and not fj[k])

            or_val, p_val = fisher_exact_two_sided(a, b, c, d)

            fisher_or[i][j] = round(or_val, 2)
            p_val = max(p_val, 1e-300)
            fisher_pneglog[i][j] = round(-math.log10(p_val), 2)

    return JsonResponse({
        "genes": genes,
        "raw_matrix": raw,
        "fisher_or_matrix": fisher_or,
        "fisher_p_matrix": fisher_pneglog,
        "available_genes": available_genes,
        "available_impacts": available_impacts,
        "impacts_used": impacts_used,
        "n_samples": n_samples,
    })


# clinical associations
def normalize_stage(raw):
    """
    Normalize ajcc_pathologic_stage into broad bins:
    I, II, III, IV, Other/Unknown
    """
    if not raw or str(raw).strip().lower() in {"", "na", "nan", "none"}:
        return "Unknown"
    s = str(raw).strip().upper()
    s = s.replace("STAGE", "").strip()

    if s.startswith("I") and not s.startswith("II") and not s.startswith("III") and not s.startswith("IV"):
        return "I"
    if s.startswith("II") and not s.startswith("III") and not s.startswith("IV"):
        return "II"
    if s.startswith("III") and not s.startswith("IV"):
        return "III"
    if s.startswith("IV"):
        return "IV"
    return "Other"


def is_yes(raw):
    if raw is None:
        return False
    s = str(raw).strip().lower()
    return s in {"yes", "y", "true", "t", "1"}


def normalize_vital_status(raw):
    if not raw:
        return "Unknown"
    s = str(raw).strip().lower()
    if "alive" in s:
        return "Alive"
    if "dead" in s or "deceased" in s:
        return "Dead"
    return "Unknown"

@require_GET
def molecular_clinical_json(request, cancer_name):
    """
    Returns clinical distributions for a cancer type:
    - age_at_diagnosis (list of ages)
    - ajcc_pathologic_stage (counts per broad bin)
    - treatment_combo (None / Pharma only / Radiation only / Both)
    - vital_status (Alive / Dead / Unknown)
    """
    try:
        ct = CancerType.objects.get(name__iexact=cancer_name)
    except CancerType.DoesNotExist:
        raise Http404(f"Cancer '{cancer_name}' not found in CancerType.name")

    qs = TotalRecordAgg.objects.filter(cancer=ct)

    # ---- Age ----
    ages = []
    for rec in qs:
        if rec.age_at_diagnosis is not None:
            try:
                years = float(rec.age_at_diagnosis)
                #years = round(days / 365.25, 1)   # one decimal precision
                ages.append(years)
            except Exception:
                continue

    # ---- Stage ----
    stage_counter = Counter()
    for rec in qs:
        stage_counter[normalize_stage(rec.ajcc_pathologic_stage)] += 1

    # enforce display order
    stage_order = ["I", "II", "III", "IV", "Other", "Unknown"]
    stage_labels = []
    stage_counts = []
    for lab in stage_order:
        if lab in stage_counter:
            stage_labels.append(lab)
            stage_counts.append(stage_counter[lab])
    # add any weird leftover labels
    for lab, count in stage_counter.items():
        if lab not in stage_labels:
            stage_labels.append(lab)
            stage_counts.append(count)

    # ---- Treatment combo ----
    treat_counter = Counter()
    for rec in qs:
        pharma = is_yes(rec.treatments_pharmaceutical_treatment_or_therapy)
        radio = is_yes(rec.treatments_radiation_treatment_or_therapy)
        if pharma and radio:
            key = "Pharma + Radiation"
        elif pharma and not radio:
            key = "Pharma only"
        elif not pharma and radio:
            key = "Radiation only"
        else:
            key = "None"
        treat_counter[key] += 1

    treat_order = ["None", "Pharma only", "Radiation only", "Pharma + Radiation"]
    treat_labels = []
    treat_counts = []
    for lab in treat_order:
        if lab in treat_counter:
            treat_labels.append(lab)
            treat_counts.append(treat_counter[lab])

    # ---- Vital status ----
    vital_counter = Counter()
    for rec in qs:
        vital_counter[normalize_vital_status(rec.vital_status)] += 1

    vital_order = ["Alive", "Dead", "Unknown"]
    vital_labels = []
    vital_counts = []
    for lab in vital_order:
        if lab in vital_counter:
            vital_labels.append(lab)
            vital_counts.append(vital_counter[lab])

    payload = {
        "meta": {
            "cancer": cancer_name,
            "n_samples": qs.count(),
        },
        "age": {
            "values": ages,
        },
        "stage": {
            "labels": stage_labels,
            "counts": stage_counts,
        },
        "treatment": {
            "labels": treat_labels,
            "counts": treat_counts,
        },
        "vital": {
            "labels": vital_labels,
            "counts": vital_counts,
        },
    }
    return JsonResponse(payload)

# demographics associations
def age_days_to_years(raw):
    if raw is None:
        return None
    try:
        days = float(raw)
        return round(days / 365.25, 1)
    except Exception:
        return None


def normalize_gender(raw):
    if not raw:
        return "Unknown"
    s = str(raw).strip().lower()
    if s.startswith("m"):
        return "Male"
    if s.startswith("f"):
        return "Female"
    return "Other/Unknown"


def normalize_race(raw):
    if not raw:
        return "Unknown"
    s = str(raw).strip()
    return s  


def normalize_ethnicity(raw):
    if not raw:
        return "Unknown"
    s = str(raw).strip()
    return s

def _clean_str(x):
    return str(x).strip() if x is not None else ""

from itertools import zip_longest

def yn_norm(x):
    s = (str(x).strip().lower() if x is not None else "")
    if s in ("y", "yes", "true", "1", "hotspot"):
        return "Yes"
    if s in ("n", "no", "false", "0", "non-hotspot", "nonhotspot"):
        return "No"
    return "Unknown"


def compute_gene_group_matrix(
    qs,
    genes_used,
    group_getter,
    variant_classes=None,
    impacts=None,
    hotspot="__all__",
):
    vset = set(_clean_str(vc) for vc in (variant_classes or []) if _clean_str(vc))
    iset = set(_clean_str(im).upper() for im in (impacts or []) if _clean_str(im))

    group_sizes = Counter()
    mutated = {}

    genes_used = [g for g in genes_used if g]  # keep order

    for rec in qs:
        grp = group_getter(rec) or "Unknown"
        group_sizes[grp] += 1

        genes = parse_listish(rec.Hugo_Symbol)
        vcls  = parse_listish(getattr(rec, "Variant_Classification", None))
        imps  = parse_listish(getattr(rec, "IMPACT", None))
        hots  = parse_listish(getattr(rec, "hotspot", None))

        gset = set()

        for g, vc, imp, hs in zip_longest(genes, vcls, imps, hots, fillvalue=None):
            g = _clean_str(g)
            if not g:
                continue

            vc  = _clean_str(vc)
            imp = _clean_str(imp).upper()
            hs  = yn_norm(hs)

            if genes_used and g not in genes_used:
                continue
            if vset and vc not in vset:
                continue
            if iset and imp not in iset:
                continue
            if hotspot != "__all__" and hs != hotspot:
                continue

            gset.add(g)

        if not gset:
            continue

        if grp not in mutated:
            mutated[grp] = Counter()

        for g in gset:
            mutated[grp][g] += 1

    groups = sorted(group_sizes.keys())
    group_sizes_list = [group_sizes[g] for g in groups]

    fractions, counts = [], []
    for gene in genes_used:
        row_counts, row_fracs = [], []
        for gi, grp in enumerate(groups):
            k = mutated.get(grp, {}).get(gene, 0)
            n = group_sizes_list[gi] if group_sizes_list[gi] else 0
            row_counts.append(int(k))
            row_fracs.append((k / n) if n else 0.0)
        counts.append(row_counts)
        fractions.append(row_fracs)

    return {
        "groups": groups,
        "genes": genes_used,
        "fractions": fractions,
        "counts": counts,
        "group_sizes": group_sizes_list,
    }


@require_GET
def molecular_demographics_json(request, cancer_name):
    try:
        ct = CancerType.objects.get(name__iexact=cancer_name)
    except CancerType.DoesNotExist:
        raise Http404(f"Cancer '{cancer_name}' not found in CancerType.name")

    qs = TotalRecordAgg.objects.filter(cancer=ct)

    # ---- parse filters ----
    genes_param = (request.GET.get("genes") or "").strip()
    genes_selected = [g.strip() for g in genes_param.split(",") if g.strip()][:20]

    variant_classes_param = (request.GET.get("variant_classes") or "").strip()
    variant_classes = [v.strip() for v in variant_classes_param.split(",") if v.strip()]
    vset = set(_clean_str(v) for v in variant_classes if _clean_str(v))

    impacts_param = (request.GET.get("impacts") or "").strip()
    impacts = [v.strip().upper() for v in impacts_param.split(",") if v.strip()]
    iset = set(_clean_str(v).upper() for v in impacts if _clean_str(v))

    # ---- compute available VC / impacts for UI (NOT filtered) ----
    vc_counter = Counter()
    impact_counter = Counter()

    for rec in qs:
        for vc in parse_listish(getattr(rec, "Variant_Classification", None)):
            vc = _clean_str(vc)
            if vc:
                vc_counter[vc] += 1

        for imp in parse_listish(getattr(rec, "IMPACT", None)):
            imp = _clean_str(imp).upper()
            if imp:
                impact_counter[imp] += 1

    available_variant_classes = [vc for vc, _ in vc_counter.most_common(50)]
    available_impacts = [im for im, _ in impact_counter.most_common(50)]

    # ---- compute gene_counter_filtered under (vset/iset) ----
    # IMPORTANT: count per-sample presence (binary), not per mutation-row
    gene_counter_filtered = Counter()

    for rec in qs:
        genes = parse_listish(rec.Hugo_Symbol)
        vcls  = parse_listish(getattr(rec, "Variant_Classification", None))
        imps  = parse_listish(getattr(rec, "IMPACT", None))

        gset = set()
        for g, vc, imp in zip_longest(genes, vcls, imps, fillvalue=None):
            g = _clean_str(g)
            if not g:
                continue
            vc  = _clean_str(vc)
            imp = _clean_str(imp).upper()

            if vset and vc not in vset:
                continue
            if iset and imp not in iset:
                continue

            gset.add(g)

        if gset:
            gene_counter_filtered.update(gset)

    # If filters remove everything early:
    if not gene_counter_filtered:
        return JsonResponse({
            "meta": {"cancer": cancer_name, "n_samples": 0, "n_records_in_db": qs.count()},
            "available_genes": [],
            "genes_used": [],
            "available_variant_classes": available_variant_classes,
            "variant_classes_used": variant_classes,
            "available_impacts": available_impacts,
            "impacts_used": impacts,
            "age_vs_mut": {"age": [], "mut_count": []},
            "gender_burden": {"genders": [], "counts": []},
            "gene_by_race": {},
            "gene_by_ethnicity": {},
            "gene_by_gender": {},
            "gene_by_agebin": {},
        })

    # ---- B: build available_genes = pinned selected + topN under filters ----
    # Allow a bigger top list but keep UI manageable.
    TOP_AVAILABLE = 100  # top genes shown under current filters
    MAX_AVAILABLE = 200  # hard cap after pinning

    top_under_filters = [g for g, _ in gene_counter_filtered.most_common(TOP_AVAILABLE)]

    # Pin selected genes at the top if they exist anywhere in filtered universe.
    pinned = []
    for g in genes_selected:
        g_clean = _clean_str(g)
        if not g_clean:
            continue
        if g_clean in gene_counter_filtered and g_clean not in pinned:
            pinned.append(g_clean)

    # Merge pinned + top list with stable order, no duplicates
    available_genes = pinned + [g for g in top_under_filters if g not in pinned]
    available_genes = available_genes[:MAX_AVAILABLE]

    # ---- decide genes_used based on filtered genes (default top 10) ----
    if genes_selected:
        genes_used = [g for g in genes_selected if g in gene_counter_filtered]
        if not genes_used:
            genes_used = [g for g, _ in gene_counter_filtered.most_common(10)]
    else:
        top_n = int(request.GET.get("top", 10) or 10)
        top_n = max(2, min(top_n, 20))
        genes_used = [g for g, _ in gene_counter_filtered.most_common(top_n)]

    # ---- build sample-level data with ALL filters applied ----
    samples = []
    n_qs = qs.count()

    for rec in qs:
        genes = parse_listish(rec.Hugo_Symbol)
        vcls  = parse_listish(getattr(rec, "Variant_Classification", None))
        imps  = parse_listish(getattr(rec, "IMPACT", None))
        hgvs  = parse_listish(getattr(rec, "HGVSc", None))

        gset = set()
        mut_count = 0

        for g, vc, imp, h in zip_longest(genes, vcls, imps, hgvs, fillvalue=None):
            g = _clean_str(g)
            if not g:
                continue
            vc  = _clean_str(vc)
            imp = _clean_str(imp).upper()

            # ALL filters apply to ALL plots now
            if genes_used and g not in genes_used:
                continue
            if vset and vc not in vset:
                continue
            if iset and imp not in iset:
                continue

            gset.add(g)
            mut_count += 1

        age_years = None
        if rec.age_at_diagnosis is not None:
            try:
                age_years = float(rec.age_at_diagnosis)  # already years in your new dataset
            except Exception:
                age_years = None

        samples.append({
            "genes": gset,
            "mut_count": mut_count,
            "age_years": age_years,
            "gender": normalize_gender(rec.gender),
            "race": normalize_race(rec.race),
            "ethnicity": normalize_ethnicity(rec.ethnicity),
        })

    n_samples = len(samples)

    # ---- age vs mut ----
    age_vals, mut_vals = [], []
    for s in samples:
        if s["age_years"] is not None:
            age_vals.append(s["age_years"])
            mut_vals.append(s["mut_count"])

    # ---- gender burden ----
    gender_map = {}
    for s in samples:
        g = s["gender"] or "Unknown"
        gender_map.setdefault(g, []).append(s["mut_count"])

    gender_labels = list(gender_map.keys())
    gender_counts = [gender_map[g] for g in gender_labels]

    def age_bin_years(rec):
        a = rec.age_at_diagnosis
        if a is None:
            return "Unknown"
        try:
            years = float(a)
        except Exception:
            return "Unknown"
        if years < 0:
            return "Unknown"
        b = int(years // 10) * 10
        return f"{b}-{b+9}"

    # gene group plots (keep your existing helper; hotspot left as harmless arg)
    gene_by_race = compute_gene_group_matrix(
        qs, genes_used,
        group_getter=lambda r: normalize_race(r.race) or "Unknown",
        variant_classes=variant_classes,
        impacts=impacts,
        hotspot="__all__",
    )
    gene_by_ethnicity = compute_gene_group_matrix(
        qs, genes_used,
        group_getter=lambda r: normalize_ethnicity(r.ethnicity) or "Unknown",
        variant_classes=variant_classes,
        impacts=impacts,
        hotspot="__all__",
    )
    gene_by_gender = compute_gene_group_matrix(
        qs, genes_used,
        group_getter=lambda r: normalize_gender(r.gender) or "Unknown",
        variant_classes=variant_classes,
        impacts=impacts,
        hotspot="__all__",
    )
    gene_by_agebin = compute_gene_group_matrix(
        qs, genes_used,
        group_getter=age_bin_years,
        variant_classes=variant_classes,
        impacts=impacts,
        hotspot="__all__",
    )

    return JsonResponse({
        "meta": {
            "cancer": cancer_name,
            "n_samples": n_samples,
            "n_records_in_db": n_qs,
            "filters": {
                "genes": genes_used,
                "variant_classes": variant_classes,
                "impacts": impacts,
            }
        },
        "available_genes": available_genes,
        "genes_used": genes_used,
        "available_variant_classes": available_variant_classes,
        "variant_classes_used": variant_classes,
        "available_impacts": available_impacts,
        "impacts_used": impacts,
        "age_vs_mut": {"age": age_vals, "mut_count": mut_vals},
        "gender_burden": {"genders": gender_labels, "counts": gender_counts},
        "gene_by_race": gene_by_race,
        "gene_by_ethnicity": gene_by_ethnicity,
        "gene_by_gender": gene_by_gender,
        "gene_by_agebin": gene_by_agebin,
    })


@require_GET
def molecular_gene_search_json(request, cancer_name):
    """
    Autocomplete gene search under current filters.
    Query params:
      - q=TP5
      - variant_classes=...
      - impacts=...
    """
    try:
        ct = CancerType.objects.get(name__iexact=cancer_name)
    except CancerType.DoesNotExist:
        raise Http404(f"Cancer '{cancer_name}' not found in CancerType.name")

    qs = TotalRecordAgg.objects.filter(cancer=ct)

    q = _clean_str(request.GET.get("q") or "")
    if not q:
        return JsonResponse({"genes": []})

    variant_classes_param = (request.GET.get("variant_classes") or "").strip()
    variant_classes = [v.strip() for v in variant_classes_param.split(",") if v.strip()]
    vset = set(_clean_str(v) for v in variant_classes if _clean_str(v))

    impacts_param = (request.GET.get("impacts") or "").strip()
    impacts = [v.strip().upper() for v in impacts_param.split(",") if v.strip()]
    iset = set(_clean_str(v).upper() for v in impacts if _clean_str(v))

    q_upper = q.upper()

    # Count matches under filters (binary per sample)
    counter = Counter()

    for rec in qs:
        genes = parse_listish(rec.Hugo_Symbol)
        vcls  = parse_listish(getattr(rec, "Variant_Classification", None))
        imps  = parse_listish(getattr(rec, "IMPACT", None))

        gset = set()
        for g, vc, imp in zip_longest(genes, vcls, imps, fillvalue=None):
            g = _clean_str(g)
            if not g:
                continue

            # prefix match
            if g.upper().startswith(q_upper) is False:
                continue

            vc  = _clean_str(vc)
            imp = _clean_str(imp).upper()

            if vset and vc not in vset:
                continue
            if iset and imp not in iset:
                continue

            gset.add(g)

        if gset:
            counter.update(gset)

    # return top matches (most common first)
    genes_out = [g for g, _ in counter.most_common(30)]
    return JsonResponse({"genes": genes_out})
