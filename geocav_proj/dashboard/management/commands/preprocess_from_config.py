# dashboard/management/commands/preprocess_from_config.py

import os
import json
import math
from pathlib import Path
import ast
import re
import numpy as np

import pandas as pd
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from dashboard.models import CancerType, TotalRecordAgg


# ---------- helpers ----------

def safe_int(x):
    if x is None:
        return None

    # list/array should never be cast to int
    if isinstance(x, (list, tuple)):
        return None

    try:
        if pd.isna(x):
            return None
    except ValueError:
        return None

    try:
        return int(x)
    except (TypeError, ValueError):
        return None


def to_list(series):
    # ensure clean list[str] (drop NA/empty)
    vals = []
    for v in series.dropna().astype(str).map(str.strip):
        if v and v.lower() != "nan":
            vals.append(v)
    return vals

def safe_str(x):
    # None
    if x is None:
        return None

    # List / tuple / numpy array / pandas Series
    if isinstance(x, (list, tuple)):
        return x[0] if len(x) > 0 else None

    try:
        # scalar NA check
        if pd.isna(x):
            return None
    except ValueError:
        # array-like that slipped through
        return str(x)

    return str(x)

def parse_listish_value(v):
    """
    Convert various 'list-ish' representations into a clean list[str].
    Handles:
      - list / tuple / set
      - numpy / pyarrow arrays
      - JSON string: ["TP53","KRAS"]
      - Python repr string: ['TP53', 'KRAS']
      - Delimited strings: "TP53,KRAS" / "TP53; KRAS" / "TP53|KRAS"
      - Single gene string
      - NA / None
    """
    # ---- None / NA ----
    if v is None:
        return []

    # ---- numpy / pyarrow array-like ----
    if hasattr(v, "__len__") and not isinstance(v, str):
        try:
            return [
                str(x).strip()
                for x in list(v)
                if str(x).strip().lower() not in ("", "nan", "none", "null")
            ]
        except Exception:
            pass

    # ---- pandas NA scalar ----
    try:
        if pd.isna(v):
            return []
    except Exception:
        pass

    # ---- already list-like ----
    if isinstance(v, (list, tuple, set)):
        return [
            str(x).strip()
            for x in v
            if str(x).strip().lower() not in ("", "nan", "none", "null")
        ]

    s = str(v).strip()
    if not s or s.lower() in ("nan", "none", "null"):
        return []

    # ---- JSON string ----
    if s.startswith("[") and s.endswith("]"):
        try:
            parsed = json.loads(s)
            return parse_listish_value(parsed)
        except Exception:
            pass

        # ---- Python literal string ----
        try:
            parsed = ast.literal_eval(s)
            return parse_listish_value(parsed)
        except Exception:
            pass

    # ---- delimiter fallback ----
    if any(sep in s for sep in [",", ";", "|"]):
        return [
            p.strip().strip("'").strip('"')
            for p in re.split(r"[,\;\|]\s*", s)
            if p.strip().lower() not in ("", "nan", "none", "null")
        ]

    # ---- single token ----
    return [s]

def clean_for_json(x):
    """
    Recursively convert values to JSON-safe Python objects:
    - np.nan / float('nan') / pd.NA -> None
    - numpy scalars -> Python scalars
    - lists/tuples -> cleaned lists
    - dicts -> cleaned dicts
    """
    # None stays None
    if x is None:
        return None

    # pandas missing
    if x is pd.NA:
        return None

    # numpy scalar (e.g., np.int64, np.float64)
    if isinstance(x, np.generic):
        x = x.item()

    # float NaN
    if isinstance(x, float) and math.isnan(x):
        return None

    # pandas / numpy nan (covers many cases)
    try:
        if pd.isna(x):
            return None
    except Exception:
        pass

    # list / tuple
    if isinstance(x, (list, tuple)):
        return [clean_for_json(v) for v in x]

    # dict
    if isinstance(x, dict):
        return {str(k): clean_for_json(v) for k, v in x.items()}

    return x

def safe_json_list(x):
    """
    Return a JSON-safe list for JSONField(list). Never returns None.
    - Missing/NaN -> []
    - Scalar -> [scalar]
    - List/tuple -> cleaned list
    """
    v = clean_for_json(x)  # your existing recursive cleaner
    if v is None:
        return []
    if isinstance(v, list):
        return v
    if isinstance(v, tuple):
        return list(v)
    # If something slips through as scalar, wrap it
    return [v]

# ---------- core builder ----------

def build_tcga_dataset_simple(
    maf_csv_path: str,
    clinical_csv_path: str,
    tss_csv_path: str,
):
    # MAF
    maf = pd.read_csv(maf_csv_path)
    # Drop duplicate rows
    maf = maf.drop_duplicates()
    KEEP_COLS = [
        # Sample identifiers
        "Tumor_Sample_Barcode",
        "case_id",
        # Gene / variant identity
        "Hugo_Symbol",
        "Entrez_Gene_Id",
        "Chromosome",
        "Start_Position",
        "End_Position",
        "Reference_Allele",
        "Tumor_Seq_Allele2",
        # Functional annotation
        "Variant_Classification",
        "Variant_Type",
        "HGVSc",
        "HGVSp_Short",
        "Transcript_ID",
        "Exon_Number",
        # Protein-level details
        "Protein_position",
        "Amino_acids",
        "Codons",
        # Impact & cancer relevance
        "IMPACT",
        "SIFT",
        "PolyPhen",
        "COSMIC",
        "hotspot",
        # Read-level confidence 
        "t_depth",
        "t_alt_count",
    ]
    maf = maf.loc[:, maf.columns.intersection(KEEP_COLS)]

    # Group & aggregate
    group_col = "Tumor_Sample_Barcode"
    # Columns that should remain scalar per sample after grouping
    SCALAR_COLS = [
        "case_id",
    ]
    
    # Build agg dictionary: scalar columns -> first; rest -> list
    agg_cols = [c for c in KEEP_COLS if c != group_col and c in maf.columns]
    
    agg_dict = {}
    for c in agg_cols:
        if c in SCALAR_COLS:
            agg_dict[c] = "first"
        else:
            agg_dict[c] = list
    
    grouped = (
        maf
        .groupby(group_col, dropna=False, sort=False)  # sort=False helps preserve original row order within groups
        .agg(agg_dict)
        .reset_index()
    )

    # Derive TSS (upper) and patient barcode
    # Ensure clean string
    grouped["Tumor_Sample_Barcode"] = (
        grouped["Tumor_Sample_Barcode"]
        .astype("string")
        .str.strip()
    )
    
    # Extract patient barcode: TCGA-XX-YYYY
    grouped["bcr_patient_barcode"] = (
        grouped["Tumor_Sample_Barcode"]
        .str.split("-", expand=True)
        .iloc[:, :3]
        .agg("-".join, axis=1)
    )
    
    # Extract TSS 
    grouped["TSS"] = (
        grouped["Tumor_Sample_Barcode"]
        .str.split("-", expand=True)
        .iloc[:, 1]
    )

    # TSS CSV (only those present)
    tss_ref = pd.read_csv(tss_csv_path)
    if "TSS Code" not in tss_ref.columns:
        raise ValueError("Expected 'TSS Code' column in TSS CSV file.")

    tss_subset = (
        tss_ref[tss_ref["TSS Code"].isin([t for t in grouped["TSS"] if t is not None])]
        .reset_index(drop=True)
        .rename(columns={
            "TSS Code": "TSS",
            "Source Site": "Source_Site",
            "Study Name": "Study_Name"
        })
    )

    # Merge grouped MAF + TSS (left)
    donor_with_loc = pd.merge(grouped, tss_subset, on="TSS", how="left")

    # Clinical inner merge
    clinical = pd.read_csv(clinical_csv_path)
    CLINICAL_KEEP_COLS = [
        # Join keys
        "bcr_patient_barcode",
        "patient_id",
        "bcr_patient_uuid",
        "project",
        # Demographics
        "gender",
        "race_list",
        "ethnicity",
        "age_at_initial_pathologic_diagnosis",
        "year_of_initial_pathologic_diagnosis",
        # Outcome / follow-up
        "vital_status",
        "days_to_death",
        "days_to_last_followup",
        "person_neoplasm_cancer_status",
        # Treatment
        "radiation_therapy",
        "postoperative_rx_tx",
        "history_of_neoadjuvant_treatment",
        "primary_therapy_outcome_success",
        # Stage (generalizable)
        "stage_event_system_version",
        "stage_event_clinical_stage",
        "stage_event_pathologic_stage",
        "stage_event_tnm_categories",
        # Optional tumor characterization 
        "tumor_tissue_site",
        "tissue_source_site",
        "histological_type",
        "icd_o_3_site",
        "icd_o_3_histology",
        "icd_10",
        "laterality",
    ]

    clinical = clinical.loc[:, clinical.columns.intersection(CLINICAL_KEEP_COLS)]
    clinical = clinical.rename(columns={'age_at_initial_pathologic_diagnosis': 'age_at_diagnosis', 'radiation_therapy': 'treatments_radiation_treatment_or_therapy',
     'race_list': 'race', 'year_of_initial_pathologic_diagnosis': 'year_of_diagnosis', 'stage_event_pathologic_stage': 'ajcc_pathologic_stage',
     "postoperative_rx_tx": "treatments_pharmaceutical_treatment_or_therapy","Source Site": "Source_Site", "Study Name": "Study_Name"})


    if "bcr_patient_barcode" not in clinical.columns:
        raise ValueError("Expected 'bcr_patient_barcode' column in Clinical CSV.")
    # Keep all samples; clinical fields will be NaN if missing
    final = pd.merge(donor_with_loc, clinical, on="bcr_patient_barcode", how="left")

    # Drop 'BCR' if present
    if "BCR" in final.columns:
        final = final.drop(columns=["BCR"])

    return final


# ---------- command ----------

class Command(BaseCommand):
    help = "Read data_config.json; for each cancer: build/consume total_df and load into SQLite."

    def __init__(self):
        super().__init__()
        cfg_path = os.path.join(settings.BASE_DIR, "data_config.json")
        if not os.path.exists(cfg_path):
            raise CommandError(f"data_config.json not found at {cfg_path}")
        with open(cfg_path, "r") as f:
            self.data_config = json.load(f)

    def add_arguments(self, parser):
        parser.add_argument(
            "--cancer",
            help="Cancer slug key from data_config.json:cancers (e.g. 'lung', 'skin'). "
                 "If omitted, process all listed cancers."
        )
        parser.add_argument(
            "--truncate",
            action="store_true",
            help="Delete existing DB rows for this cancer before inserting new ones."
        )
        parser.add_argument(
            "--csv",
            action="store_true",
            help="Also write total.csv next to MAF/clinical (for inspection)."
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Build/consume total_df and print stats, but do not write to the DB."
        )

    def handle(self, *args, **opts):
        cancers_cfg = self.data_config.get("cancers") or {}
        if not cancers_cfg:
            raise CommandError("No 'cancers' section in data_config.json")

        # TSS codes path (required by your logic)
        tss_path = self.data_config.get("tss_codes")
        if not tss_path or not Path(tss_path).exists():
            raise CommandError(f"Missing or invalid 'tss_codes' path in data_config.json: {tss_path}")

        # Optionally restrict to one cancer
        if opts["cancer"]:
            slug = opts["cancer"].lower()
            if slug not in cancers_cfg:
                raise CommandError(f"'{slug}' not found under data_config.json['cancers']")
            cancers_cfg = {slug: cancers_cfg[slug]}

        final_cols = [
            # =========================
            # Core identifiers
            # =========================
            "Tumor_Sample_Barcode",
            "case_id",
            "bcr_patient_barcode",
            "patient_id",
            "bcr_patient_uuid",
            "project",

            # =========================
            # Molecular / MAF-derived (list-valued per sample)
            # =========================
            "Hugo_Symbol",
            "Entrez_Gene_Id",
            "Chromosome",
            "Start_Position",
            "End_Position",
            "Reference_Allele",
            "Tumor_Seq_Allele2",
            "Variant_Classification",
            "Variant_Type",
            "HGVSc",
            "HGVSp_Short",
            "Transcript_ID",
            "Exon_Number",
            "Protein_position",
            "Amino_acids",
            "Codons",
            "IMPACT",
            "SIFT",
            "PolyPhen",
            "COSMIC",
            "hotspot",
            "t_depth",
            "t_alt_count",

            # =========================
            # TSS / site metadata
            # =========================
            "TSS",
            "Source_Site",
            "Study_Name",

            # =========================
            # Tumor characterization
            # =========================
            "tumor_tissue_site",
            "tissue_source_site",
            "histological_type",
            "icd_o_3_site",
            "icd_o_3_histology",
            "icd_10",

            # =========================
            # Demographics
            # =========================
            "gender",
            "race",
            "ethnicity",

            # =========================
            # Diagnosis timing
            # =========================
            "age_at_diagnosis",
            "year_of_diagnosis",

            # =========================
            # Stage
            # =========================
            "ajcc_pathologic_stage",
            "stage_event_system_version",
            "stage_event_clinical_stage",
            "stage_event_tnm_categories",

            # =========================
            # Outcomes / follow-up
            # =========================
            "vital_status",
            "days_to_death",
            "days_to_last_followup",
            "person_neoplasm_cancer_status",

            # =========================
            # Treatment
            # =========================
            "treatments_radiation_treatment_or_therapy",
            "treatments_pharmaceutical_treatment_or_therapy",
            "history_of_neoadjuvant_treatment",
            "primary_therapy_outcome_success",
        ]

        for slug, spec in cancers_cfg.items():
            label = spec.get("label", slug.title())
            maf_path = spec.get("maf")
            clinical_path = spec.get("clinical")

            if not maf_path or not clinical_path:
                self.stdout.write(self.style.WARNING(
                    f"[{slug}] Missing 'maf' or 'clinical' in data_config.json. Skipping."
                ))
                continue

            maf_p = Path(maf_path)
            clin_p = Path(clinical_path)
            if not maf_p.exists():
                self.stdout.write(self.style.WARNING(f"[{slug}] MAF not found: {maf_p}. Skipping."))
                continue
            if not clin_p.exists():
                self.stdout.write(self.style.WARNING(f"[{slug}] Clinical not found: {clin_p}. Skipping."))
                continue

            # Get/create CancerType by name (matches your cancer_types labels)
            cancer_obj, _ = CancerType.objects.get_or_create(name=label)

            self.stdout.write(f"\n=== Processing {label} ({slug}) ===")

            out_dir = maf_p.parent
            parquet_path = out_dir / "total.parquet"
            csv_path = out_dir / "total.csv"

            # -----------------------------
            # Prefer existing Parquet if it exists
            # -----------------------------
            if parquet_path.exists():
                self.stdout.write(self.style.SUCCESS(
                    f"[{slug}] Found existing total.parquet → Loading directly."
                ))
                total = pd.read_parquet(parquet_path)
            else:
                self.stdout.write(self.style.WARNING(
                    f"[{slug}] No total.parquet found → Building from MAF + Clinical + TSS."
                ))
                total = build_tcga_dataset_simple(str(maf_p), str(clin_p), str(tss_path))

            # Ensure all final columns exist and are ordered correctly
            for col in final_cols:
                if col not in total.columns:
                    total[col] = pd.NA
            total = total[final_cols].copy()

            # Clean numeric columns
            total["age_at_diagnosis"] = total["age_at_diagnosis"].apply(safe_int)
            total["year_of_diagnosis"] = total["year_of_diagnosis"].apply(safe_int)

            # Ensure the three list columns are REALLY lists[str] (even if parquet/csv had list-strings)
            for col in ["Hugo_Symbol", "HGVSc", "Variant_Classification"]:
                total[col] = total[col].apply(parse_listish_value)

            # Save/overwrite Parquet so it's always in the expected schema
            parquet_path.parent.mkdir(parents=True, exist_ok=True)
            total.to_parquet(parquet_path, index=False)
            self.stdout.write(self.style.SUCCESS(f"[{slug}] Saved {parquet_path}"))

            # Optional CSV export
            if opts["csv"]:
                total_csv = total.copy()
                for col in ["Hugo_Symbol", "HGVSc", "Variant_Classification"]:
                    total_csv[col] = total_csv[col].apply(lambda x: json.dumps(x))
                total_csv.to_csv(csv_path, index=False)
                self.stdout.write(self.style.SUCCESS(f"[{slug}] Saved {csv_path}"))

            self.stdout.write(self.style.SUCCESS(
                f"[{slug}] total_df shape: {total.shape[0]} × {total.shape[1]}"
            ))

            if opts["dry_run"]:
                self.stdout.write(self.style.WARNING(f"[{slug}] Dry-run: no DB writes."))
                continue

            # Optionally delete existing DB rows for this cancer
            if opts["truncate"]:
                deleted = TotalRecordAgg.objects.filter(cancer=cancer_obj).delete()[0]
                self.stdout.write(self.style.WARNING(f"[{slug}] Deleted existing rows: {deleted}"))

            # Bulk insert into TotalRecordAgg
            rows = []
            for _, r in total.iterrows():
                rows.append(
                    TotalRecordAgg(
                        cancer=cancer_obj,
                        # --- Core IDs ---
                        Tumor_Sample_Barcode=safe_str(r.get("Tumor_Sample_Barcode")),
                        case_id=safe_str(r.get("case_id")),
                        bcr_patient_barcode=safe_str(r.get("bcr_patient_barcode")),
                        patient_id=safe_str(r.get("patient_id")),
                        bcr_patient_uuid=safe_str(r.get("bcr_patient_uuid")),
                        project=safe_str(r.get("project")),
                        # --- MAF / molecular (often list-valued after grouping) ---
                        Hugo_Symbol=safe_json_list(r.get("Hugo_Symbol")),
                        Entrez_Gene_Id=safe_json_list(r.get("Entrez_Gene_Id")),
                        Chromosome=safe_json_list(r.get("Chromosome")),
                        Start_Position=safe_json_list(r.get("Start_Position")),
                        End_Position=safe_json_list(r.get("End_Position")),
                        Reference_Allele=safe_json_list(r.get("Reference_Allele")),
                        Tumor_Seq_Allele2=safe_json_list(r.get("Tumor_Seq_Allele2")),
                        Variant_Classification=safe_json_list(r.get("Variant_Classification")),
                        Variant_Type=safe_json_list(r.get("Variant_Type")),
                        HGVSc=safe_json_list(r.get("HGVSc")),
                        HGVSp_Short=safe_json_list(r.get("HGVSp_Short")),
                        Transcript_ID=safe_json_list(r.get("Transcript_ID")),
                        Exon_Number=safe_json_list(r.get("Exon_Number")),
                        Protein_position=safe_json_list(r.get("Protein_position")),
                        Amino_acids=safe_json_list(r.get("Amino_acids")),
                        Codons=safe_json_list(r.get("Codons")),
                        IMPACT=safe_json_list(r.get("IMPACT")),
                        SIFT=safe_json_list(r.get("SIFT")),
                        PolyPhen=safe_json_list(r.get("PolyPhen")),
                        COSMIC=safe_json_list(r.get("COSMIC")),
                        hotspot=safe_json_list(r.get("hotspot")),
                        t_depth=safe_json_list(r.get("t_depth")),
                        t_alt_count=safe_json_list(r.get("t_alt_count")),
                        # --- Location / TSS reference join ---
                        TSS=safe_str(r.get("TSS")),
                        Source_Site=safe_str(r.get("Source_Site")),   # renamed from "Source Site"
                        Study_Name=safe_str(r.get("Study_Name")),     # renamed from "Study Name"
                        # --- Clinical / tumor characterization ---
                        tumor_tissue_site=safe_str(r.get("tumor_tissue_site")),
                        tissue_source_site=safe_str(r.get("tissue_source_site")),
                        histological_type=safe_str(r.get("histological_type")),
                        icd_o_3_site=safe_str(r.get("icd_o_3_site")),
                        icd_o_3_histology=safe_str(r.get("icd_o_3_histology")),
                        icd_10=safe_str(r.get("icd_10")),
                        # --- Demographics ---
                        gender=safe_str(r.get("gender")),
                        race=safe_str(r.get("race")),                 # renamed from race_list
                        ethnicity=safe_str(r.get("ethnicity")),
                        # --- Diagnosis timing (renamed) ---
                        age_at_diagnosis=safe_int(r.get("age_at_diagnosis")),
                        year_of_diagnosis=safe_int(r.get("year_of_diagnosis")),
                        # --- Stage (renamed pathologic stage) ---
                        ajcc_pathologic_stage=safe_str(r.get("ajcc_pathologic_stage")),
                        stage_event_system_version=safe_str(r.get("stage_event_system_version")),
                        stage_event_clinical_stage=safe_str(r.get("stage_event_clinical_stage")),
                        stage_event_tnm_categories=safe_str(r.get("stage_event_tnm_categories")),
                        # --- Outcome / follow-up ---
                        vital_status=safe_str(r.get("vital_status")),
                        days_to_death=safe_int(r.get("days_to_death")),
                        days_to_last_followup=safe_int(r.get("days_to_last_followup")),
                        person_neoplasm_cancer_status=safe_str(r.get("person_neoplasm_cancer_status")),
                        # --- Treatment (radiation renamed; pharma recommended rename) ---
                        treatments_radiation_treatment_or_therapy=safe_str(
                            r.get("treatments_radiation_treatment_or_therapy")
                        ),
                        treatments_pharmaceutical_treatment_or_therapy=safe_str(
                            r.get("treatments_pharmaceutical_treatment_or_therapy")
                        ),
                        # --- Other clinical fields  ---
                        history_of_neoadjuvant_treatment=safe_str(r.get("history_of_neoadjuvant_treatment")),
                        primary_therapy_outcome_success=safe_str(r.get("primary_therapy_outcome_success")),
                    )
                )


            with transaction.atomic():
                TotalRecordAgg.objects.bulk_create(rows, batch_size=5000)

            self.stdout.write(self.style.SUCCESS(
                f"[{slug}] Loaded {len(rows)} rows into TotalRecordAgg."
            ))
