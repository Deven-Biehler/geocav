# dashboard/management/commands/preprocess_from_config.py

import os
import json
import math
from pathlib import Path

import pandas as pd
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from dashboard.models import CancerType, TotalRecordAgg


# ---------- helpers ----------

def safe_int(x):
    try:
        if pd.isna(x):
            return None
        f = float(x)
        if math.isnan(f):
            return None
        return int(f)
    except Exception:
        return None


def to_list(series):
    # ensure clean list[str] (drop NA/empty)
    vals = []
    for v in series.dropna().astype(str).map(str.strip):
        if v and v.lower() != "nan":
            vals.append(v)
    return vals

def safe_str(x):
    if pd.isna(x):
        return ""
    return str(x).strip()


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

    # Group & aggregate
    grouped = (
        maf.astype(str)
           .groupby("Tumor_Sample_Barcode")
           .aggregate({
               "Hugo_Symbol": list,
               "HGVSc": list,
               "Variant_Classification": list,
           })
           .reset_index()
    )

    # Derive TSS (upper) and patient barcode
    tss_list = []
    patient_list = []
    for sb in grouped["Tumor_Sample_Barcode"]:
        parts = str(sb).split("-")
        tss_list.append(parts[1].upper() if len(parts) > 1 else None)
        patient_list.append("-".join(parts[:3]) if len(parts) >= 3 else None)

    grouped["TSS"] = tss_list
    grouped["bcr_patient_barcode"] = patient_list

    # TSS CSV (only those present)
    tss_ref = pd.read_csv(tss_csv_path)
    if "TSS Code" not in tss_ref.columns:
        raise ValueError("Expected 'TSS Code' column in TSS CSV file.")

    tss_subset = (
        tss_ref[tss_ref["TSS Code"].isin([t for t in tss_list if t is not None])]
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
    if "bcr_patient_barcode" not in clinical.columns:
        raise ValueError("Expected 'bcr_patient_barcode' column in Clinical CSV.")
    final = pd.merge(donor_with_loc, clinical, on="bcr_patient_barcode", how="inner")

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

        # Final column schema you described
        final_cols = [
            "Tumor_Sample_Barcode",
            "Hugo_Symbol", "HGVSc", "Variant_Classification",
            "TSS", "bcr_patient_barcode",
            "Source_Site", "Study_Name",
            "ajcc_pathologic_stage", "age_at_diagnosis", "year_of_diagnosis",
            "race", "gender", "ethnicity", "vital_status",
            "treatments_pharmaceutical_treatment_or_therapy",
            "treatments_radiation_treatment_or_therapy"
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

            # Ensure the three list columns are really lists of strings
            for col in ["Hugo_Symbol", "HGVSc", "Variant_Classification"]:
                def normalize_list(v):
                    if isinstance(v, list):
                        return [str(x).strip() for x in v if str(x).strip() not in ("", "nan", "None")]
                    # Fallback: treat scalar as single-element series
                    return to_list(pd.Series([v]))
                total[col] = total[col].apply(normalize_list)

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
                        Tumor_Sample_Barcode=safe_str(r["Tumor_Sample_Barcode"]),
                        Hugo_Symbol=r["Hugo_Symbol"],
                        HGVSc=r["HGVSc"],
                        Variant_Classification=r["Variant_Classification"],
                        TSS=safe_str(r["TSS"]),
                        bcr_patient_barcode=safe_str(r["bcr_patient_barcode"]),
                        Source_Site=safe_str(r["Source_Site"]),
                        Study_Name=safe_str(r["Study_Name"]),
                        ajcc_pathologic_stage=safe_str(r["ajcc_pathologic_stage"]),
                        age_at_diagnosis=safe_int(r["age_at_diagnosis"]),
                        year_of_diagnosis=safe_int(r["year_of_diagnosis"]),
                        race=safe_str(r["race"]),
                        gender=safe_str(r["gender"]),
                        ethnicity=safe_str(r["ethnicity"]),
                        vital_status=safe_str(r["vital_status"]),
                        treatments_pharmaceutical_treatment_or_therapy=safe_str(
                            r["treatments_pharmaceutical_treatment_or_therapy"]
                        ),
                        treatments_radiation_treatment_or_therapy=safe_str(
                            r["treatments_radiation_treatment_or_therapy"]
                        ),
                    )
                )


            with transaction.atomic():
                TotalRecordAgg.objects.bulk_create(rows, batch_size=1000)

            self.stdout.write(self.style.SUCCESS(
                f"[{slug}] Loaded {len(rows)} rows into TotalRecordAgg."
            ))
