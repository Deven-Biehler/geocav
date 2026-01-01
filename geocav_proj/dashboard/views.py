from django.shortcuts import render
from django.http import JsonResponse, Http404
from collections import Counter
import numpy as np
import os
import ast
from pathlib import Path
import math
import networkx as nx
from django.views.decorators.http import require_http_methods, require_GET
from .utils import (
    get_query_params, get_model_instance, apply_geographic_filter,
    apply_year_filter, load_geojson, generate_key, handle_errors
)
from .models import CancerIncidence, CancerType, Factor, Gender, Race, FactorMeasurement, TotalRecordAgg

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
        
        if race_name.lower() != 'all':
            race = get_model_instance(Race, 'name', race_name)
            cancer_queryset = cancer_queryset.filter(race=race)
        
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


def get_pie_data(request):
    '''Fetch data for pie chart visualization. Data includes multiple cancer types.'''
    params = get_query_params(request, optional_params=['level', 'cancer_year', 'gender', 'race'])
    level, cancer_year, gender_name, race_name = (
        params['level'], params['cancer_year'], params['gender'], params['race']
    )

    cancer_queryset = CancerIncidence.objects.select_related('cancer_type').all()
    cancer_queryset = apply_geographic_filter(cancer_queryset, level)
    cancer_queryset = apply_year_filter(cancer_queryset, cancer_year)
    
    if gender_name.lower() != 'all':
        gender = get_model_instance(Gender, 'name', gender_name)
        cancer_queryset = cancer_queryset.filter(gender=gender)
    
    if race_name.lower() != 'all':
        race = get_model_instance(Race, 'name', race_name)
        cancer_queryset = cancer_queryset.filter(race=race)

    cancer_queryset = cancer_queryset.values('statefp', 'countyfp', 'state', 'county', 'cancer_type__name', 'gender__name', 'incidence_rate')

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

    for rec in qs:
        genes = clean_tokens(rec.Hugo_Symbol)
        hgvs  = clean_tokens(rec.HGVSc)
        vcls  = clean_tokens(rec.Variant_Classification)

        gset = set(genes)
        # print('gset:', len(gset))

        # total mutations per sample = number of HGVSc entries (mutation events)
        # No fallback to gene count (that was making both plots look the same).
        mut_count = len(hgvs)
        #print('mut_count:', mut_count)

        # number of unique mutated genes per sample
        gene_count = len(gset)

        # counters for other plots
        gene_counter.update(gset)
        variant_counter.update(vcls)

        # grouped boxplot data
        label = get_group_label(rec)
        grouped_mutations.setdefault(label, []).append(mut_count)
        grouped_genes.setdefault(label, []).append(gene_count)

    # variant type distribution (descending)
    if variant_counter:
        variant_labels, variant_counts = zip(*variant_counter.most_common())
    else:
        variant_labels, variant_counts = ([], [])

    # top genes (descending)
    top_n = int(request.GET.get("top_genes", 10) or 10)
    top_n = max(1, min(top_n, 50))
    top = gene_counter.most_common(top_n)
    top_genes = [g for g, _ in top]
    top_gene_counts = [c for _, c in top]

    # stable group order (optional: push Unknown last)
    def group_sort_key(k):
        return (k == "Unknown", k)

    groups_sorted = sorted(grouped_mutations.keys(), key=group_sort_key)

    payload = {
        "meta": {
            "cancer": cancer_name,
            "n_samples": qs.count(),
            "group_by": group_by,
            "groups": groups_sorted,
        },
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
    Returns BOTH raw + fisher matrices plus top-50 genes for picker.
    """
    try:
        ct = CancerType.objects.get(name=cancer_name)
    except CancerType.DoesNotExist:
        raise Http404(f"Cancer '{cancer_name}' not found")

    qs = TotalRecordAgg.objects.filter(cancer=ct)

    # Per-sample unique gene sets + frequency counter
    sample_sets = []
    gene_counter = Counter()

    for rec in qs:
        genes = parse_listish(rec.Hugo_Symbol)
        gset = set([g for g in genes if g])
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
            "n_samples": 0,
        })

    # Top 50 genes only for picker
    available_genes = [g for g, _ in gene_counter.most_common(50)]

    # Determine gene list for heatmap
    genes_param = request.GET.get("genes", "").strip()
    if genes_param:
        selected = [g.strip() for g in genes_param.split(",") if g.strip()]
        selected = selected[:20]
        genes = [g for g in selected if g in gene_counter]
        if not genes:
            genes = [g for g, _ in gene_counter.most_common(10)]
    else:
        top_n = int(request.GET.get("top", 10))
        top_n = max(2, min(top_n, 20))
        genes = [g for g, _ in gene_counter.most_common(top_n)]

    n = len(genes)

    # Precompute mutation flags per gene (list of 0/1 across samples)
    flags = {}
    for g in genes:
        flags[g] = [1 if g in s else 0 for s in sample_sets]

    raw = [[0.0]*n for _ in range(n)]
    fisher_or = [[None]*n for _ in range(n)]
    fisher_pneglog = [[None]*n for _ in range(n)]

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
                days = float(rec.age_at_diagnosis)
                years = round(days / 365.25, 1)   # one decimal precision
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
    return s  # keep as-is for now, just strip; you can map further later


def normalize_ethnicity(raw):
    if not raw:
        return "Unknown"
    s = str(raw).strip()
    return s

def _clean_str(x):
    return str(x).strip() if x is not None else ""

def compute_gene_group_matrix(qs, genes_used, group_getter, variant_classes=None):
    """
    Returns:
      groups: list[str]
      genes: list[str]
      fractions: list[list[float]]  genes x groups
      counts: list[list[int]]       genes x groups (# mutated samples)
      group_sizes: list[int]        groups
    """
    variant_classes = set(vc.strip() for vc in (variant_classes or []) if vc and vc.strip())

    # group -> total samples
    group_sizes = Counter()
    # group -> gene -> mutated sample count
    mutated = {}  # dict[group][gene] = count

    # Pre-init
    for g in genes_used:
        g = _clean_str(g)

    for rec in qs:
        grp = group_getter(rec)
        if not grp:
            grp = "Unknown"
        group_sizes[grp] += 1

        genes = parse_listish(rec.Hugo_Symbol)
        vcls  = parse_listish(rec.Variant_Classification)

        # Build per-sample mutated gene set under selected variant classes
        if variant_classes:
            # try to zip genes and variant classes (aligned per MAF row in your aggregation)
            pairs = zip(genes, vcls) if (genes and vcls and len(genes) == len(vcls)) else []
            gset = set()
            if pairs:
                for g, vc in pairs:
                    g = _clean_str(g)
                    vc = _clean_str(vc)
                    if g and vc in variant_classes:
                        gset.add(g)
            else:
                # fallback if lengths don't match: if any selected class exists, include all genes (conservative)
                if any(_clean_str(vc) in variant_classes for vc in vcls):
                    gset = set(_clean_str(g) for g in genes if _clean_str(g))
                else:
                    gset = set()
        else:
            # no filter → all mutated genes
            gset = set(_clean_str(g) for g in genes if _clean_str(g))

        if not gset:
            continue

        if grp not in mutated:
            mutated[grp] = Counter()

        # count mutated samples per gene (binary per sample)
        for g in gset:
            if g in genes_used:
                mutated[grp][g] += 1

    groups = sorted(group_sizes.keys())
    group_sizes_list = [group_sizes[g] for g in groups]

    # Build matrices in gene order
    fractions = []
    counts = []
    for gene in genes_used:
        row_counts = []
        row_fracs = []
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
    """
    Demographic associations for a given cancer:
      - Age vs total mutation count
      - Mutation burden by gender
      - Gene prevalence across race / ethnicity / gender / age groups

    Query params:
      - genes: comma-separated list of genes (max 20)
      - top: fallback when genes not provided (default 10)
    """
    # --- cancer look-up ---
    try:
        ct = CancerType.objects.get(name__iexact=cancer_name)
    except CancerType.DoesNotExist:
        raise Http404(f"Cancer '{cancer_name}' not found in CancerType.name")

    qs = TotalRecordAgg.objects.filter(cancer=ct)

    # ---- build sample-level data ----
    samples = []
    gene_counter = Counter()

    for rec in qs:
        genes = parse_listish(rec.Hugo_Symbol)
        hgvs  = parse_listish(rec.HGVSc)

        gset = set(g for g in genes if g)

        if hgvs:
            mut_count = len([m for m in hgvs if m])
        else:
            mut_count = len(gset)

        age_years = age_days_to_years(rec.age_at_diagnosis)
        gender = normalize_gender(rec.gender)
        race = normalize_race(rec.race)
        ethnicity = normalize_ethnicity(rec.ethnicity)

        samples.append({
            "genes": gset,
            "mut_count": mut_count,
            "age_years": age_years,
            "gender": gender,
            "race": race,
            "ethnicity": ethnicity,
        })
        gene_counter.update(gset)


    n_samples = len(samples)
    if n_samples == 0:
        return JsonResponse({
            "meta": {
                "cancer": cancer_name,
                "n_samples": 0,
            },
            "available_genes": [],
            "genes_used": [],
            "age_vs_mut": {"age": [], "mut_count": []},
            "gender_burden": {"genders": [], "counts": []},
            "gene_by_race": {},
            "gene_by_ethnicity": {},
            "gene_by_gender": {},
            "gene_by_agebin": {},
        })

    # ---- gene selection ----
    available_genes = [g for g, _ in gene_counter.most_common(50)]

    genes_param = request.GET.get("genes", "").strip()
    if genes_param:
        selected = [g.strip() for g in genes_param.split(",") if g.strip()]
        selected = selected[:20]
        genes_used = [g for g in selected if g in gene_counter]
        if not genes_used:
            genes_used = [g for g, _ in gene_counter.most_common(10)]
    else:
        top_n = int(request.GET.get("top", 10))
        top_n = max(2, min(top_n, 20))
        genes_used = [g for g, _ in gene_counter.most_common(top_n)]

    # ---- variant class selection ----
    variant_classes_param = (request.GET.get("variant_classes") or "").strip()
    variant_classes = [v.strip() for v in variant_classes_param.split(",") if v.strip()]

    vc_counter = Counter()
    for rec in qs:
        for vc in parse_listish(rec.Variant_Classification):
            vc = _clean_str(vc)
            if vc:
                vc_counter[vc] += 1
    available_variant_classes = [vc for vc, _ in vc_counter.most_common(20)]

    # ---- age vs mutation count ----
    age_vals = []
    mut_vals = []
    for s in samples:
        if s["age_years"] is not None:
            age_vals.append(s["age_years"])
            mut_vals.append(s["mut_count"])

    # ---- mutation burden by gender ----
    gender_map = {}
    for s in samples:
        g = s["gender"]
        gender_map.setdefault(g, []).append(s["mut_count"])

    gender_labels = []
    gender_counts = []
    for g, vals in gender_map.items():
        gender_labels.append(g)
        gender_counts.append(vals)  # list of mut counts for boxplot

    # ---- group helpers for gene prevalence ----

    def age_bin(age):
        if age is None:
            return "Unknown"
        if age < 50:
            return "< 50"
        if age < 65:
            return "50–64"
        if age < 80:
            return "65–79"
        return "≥ 80"

    # group counters: group -> count, gene_group_counts: gene -> group -> count
    def build_gene_group_matrix(group_key_func, group_order=None):
        group_counter = Counter()
        gene_group_counts = {g: Counter() for g in genes_used}

        for s in samples:
            grp = group_key_func(s)
            group_counter[grp] += 1
            gset = s["genes"]
            for g in genes_used:
                if g in gset:
                    gene_group_counts[g][grp] += 1

        # group labels in nice order
        if group_order:
            labels = [g for g in group_order if g in group_counter]
            # add any extra leftover
            for g in group_counter:
                if g not in labels:
                    labels.append(g)
        else:
            labels = list(group_counter.keys())

        # build matrix: rows = genes_used, cols = labels
        matrix = []
        for g in genes_used:
            row = []
            for grp in labels:
                denom = group_counter[grp]
                if denom > 0:
                    freq = gene_group_counts[g][grp] / denom
                    row.append(round(freq, 3))
                else:
                    row.append(None)
            matrix.append(row)

        return {
            "genes": genes_used,
            "groups": labels,
            "matrix": matrix
        }

    gene_by_race = compute_gene_group_matrix(
        qs, genes_used,
        group_getter=lambda r: _clean_str(r.race) or "Unknown",
        variant_classes=variant_classes
    )

    gene_by_ethnicity = compute_gene_group_matrix(
        qs, genes_used,
        group_getter=lambda r: _clean_str(r.ethnicity) or "Unknown",
        variant_classes=variant_classes
    )

    gene_by_gender = compute_gene_group_matrix(
        qs, genes_used,
        group_getter=lambda r: normalize_gender(r.gender) or "Unknown",
        variant_classes=variant_classes
    )

    # age bins (example: 0-39, 40-49, ... or 10-year bins)
    def age_bin_years(rec):
        a = rec.age_at_diagnosis  # stored as days in DB
        if a is None:
            return "Unknown"
        try:
            years = float(a) / 365.25
        except Exception:
            return "Unknown"

        if years < 0:
            return "Unknown"

        b = int(years // 10) * 10
        return f"{b}-{b+9}"

    gene_by_agebin = compute_gene_group_matrix(
        qs, genes_used,
        group_getter=age_bin_years,
        variant_classes=variant_classes
    )

    payload = {
        "meta": {
            "cancer": cancer_name,
            "n_samples": n_samples,
        },
        "available_genes": available_genes,
        "genes_used": genes_used,
        "age_vs_mut": {
            "age": age_vals,
            "mut_count": mut_vals,
        },
        "gender_burden": {
            "genders": gender_labels,
            "counts": gender_counts,
        },
        "gene_by_race": gene_by_race,
        "gene_by_ethnicity": gene_by_ethnicity,
        "gene_by_gender": gene_by_gender,
        "gene_by_agebin": gene_by_agebin,
        "available_variant_classes": available_variant_classes,
        "variant_classes_used": variant_classes,
    }
    return JsonResponse(payload)
