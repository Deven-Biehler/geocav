import os
import ast
import pandas as pd

from django.conf import settings
from django.core.management.base import BaseCommand
from dashboard.models import CancerType, NetworkNodeMeta


def safe_str(x):
    if x is None:
        return ""
    try:
        if pd.isna(x):
            return ""
    except Exception:
        pass
    return str(x)


def safe_int(x):
    if x is None:
        return None
    try:
        if pd.isna(x):
            return None
    except Exception:
        pass
    s = str(x).strip()
    if s == "" or s.lower() in ("nan", "none", "null"):
        return None
    try:
        return int(float(s))
    except Exception:
        return None


def safe_list(x):
    """
    Parse list-like columns from CSV.
    Supports:
      - actual Python-list string: "['TP53|c.1A>T', 'KRAS|c.35G>T']"
      - JSON-like list string: '["a","b"]'
      - delimiter string: "a; b; c" or "a, b, c"
      - empty / NaN
    """
    if x is None:
        return []
    try:
        if pd.isna(x):
            return []
    except Exception:
        pass

    if isinstance(x, list):
        return x

    s = str(x).strip()
    if s == "" or s.lower() in ("nan", "none", "null", "[]"):
        return []

    # Try Python literal eval first
    if (s.startswith("[") and s.endswith("]")) or (s.startswith("(") and s.endswith(")")):
        try:
            v = ast.literal_eval(s)
            if isinstance(v, (list, tuple, set)):
                return list(v)
        except Exception:
            pass

    # Fallback: split heuristics
    if ";" in s:
        return [p.strip() for p in s.split(";") if p.strip()]
    if "," in s:
        return [p.strip() for p in s.split(",") if p.strip()]

    # single value
    return [s]


class Command(BaseCommand):
    help = "Load per-cancer nodes_df.csv (node metadata) into NetworkNodeMeta (bulk insert)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--folder",
            required=True,
            help="Folder under media/molecular (e.g., 'stomach', 'ovarian')."
        )
        parser.add_argument(
            "--cancer-name",
            default=None,
            help="CancerType.name in DB (e.g., 'Stomach Cancer'). If omitted, we try to infer from folder."
        )
        parser.add_argument(
            "--csv",
            default=None,
            help="Optional custom path to nodes_df.csv. If omitted, uses MEDIA_ROOT/molecular/<folder>/nodes_df.csv"
        )
        parser.add_argument("--batch-size", type=int, default=2000)
        parser.add_argument("--keep-existing", action="store_true")


    def handle(self, *args, **opts):
        folder = opts["folder"].strip()
        cancer_name = (opts.get("cancer_name") or "").strip()
        batch_size = opts["batch_size"]
        keep_existing = opts["keep_existing"]

        # --- Resolve CSV path using folder ---
        if opts["csv"]:
            csv_path = opts["csv"]
            if not os.path.isabs(csv_path):
                csv_path = os.path.join(settings.BASE_DIR, csv_path)
        else:
            csv_path = os.path.join(settings.MEDIA_ROOT, "molecular", folder, "nodes_df.csv")

        if not os.path.exists(csv_path):
            raise FileNotFoundError(f"nodes_df.csv not found at: {csv_path}")

        # --- Resolve CancerType using cancer-name (or infer from folder) ---
        candidates = []
        if cancer_name:
            candidates.append(cancer_name)
        else:
            # infer from folder
            candidates.extend([
                folder,
                folder.title(),
                f"{folder.title()} Cancer",
            ])

        cancer_obj = None
        for nm in candidates:
            cancer_obj = CancerType.objects.filter(name__iexact=nm).first()
            if cancer_obj:
                break

        if cancer_obj is None:
            raise ValueError(
                f"Could not find CancerType. Tried names: {candidates}. "
                f"Available CancerType names: {list(CancerType.objects.values_list('name', flat=True))}"
            )

        self.stdout.write(self.style.NOTICE(f"Reading: {csv_path}"))
        df = pd.read_csv(csv_path)

        if "Tumor_Sample_Barcode" not in df.columns:
            raise ValueError("nodes_df.csv must contain 'Tumor_Sample_Barcode' column.")

        # node_index = row order (0..N-1)
        df = df.reset_index(drop=True)
        df["node_index"] = range(len(df))

        # wipe existing unless keep flag
        if not keep_existing:
            deleted, _ = NetworkNodeMeta.objects.filter(cancer=cancer_obj).delete()
            self.stdout.write(self.style.WARNING(f"Deleted existing NetworkNodeMeta rows: {deleted}"))

        rows = []
        for r in df.itertuples(index=False):
            rows.append(
                NetworkNodeMeta(
                    cancer=cancer_obj,
                    node_index=int(getattr(r, "node_index")),
                    Tumor_Sample_Barcode=safe_str(getattr(r, "Tumor_Sample_Barcode", "")),

                    # list fields
                    event_ids=safe_list(getattr(r, "event_ids", None)),
                    genes=safe_list(getattr(r, "genes", None)),

                    # clinical fields
                    age_at_initial_pathologic_diagnosis=safe_int(getattr(r, "age_at_initial_pathologic_diagnosis", None)),
                    gender=safe_str(getattr(r, "gender", "")),
                    vital_status=safe_str(getattr(r, "vital_status", "")),
                    race_list=safe_str(getattr(r, "race_list", "")),
                    ethnicity=safe_str(getattr(r, "ethnicity", "")),

                    # optional counts
                    n_events=safe_int(getattr(r, "n_events", None)),
                    n_genes=safe_int(getattr(r, "n_genes", None)),
                )
            )

        NetworkNodeMeta.objects.bulk_create(rows, batch_size=batch_size)
        self.stdout.write(self.style.SUCCESS(f"Inserted {len(rows)} NetworkNodeMeta rows for '{cancer_obj.name}'"))
