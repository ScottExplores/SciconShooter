"""Run a bounded, immutable real-circuit assay; never launch a game."""
import argparse
import os
from pathlib import Path
import sys

# Set before NumPy import. Deliberately do not inherit a wider numerical pool.
for key in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
    os.environ[key] = "2"
LAB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB / "python"))
from scicon_fly.reduced_conditioning import run_study

parser = argparse.ArgumentParser()
parser.add_argument("--config", type=Path, default=LAB / "configs/reduced-conditioning-v1.json")
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
result = run_study(args.config, args.output)
print(result["claim"])
print(result["execution"])
for row in result["results"]:
    print(row["condition"], "specific depression", round(100*row["meanSpecificSuppression"], 5), "%")
