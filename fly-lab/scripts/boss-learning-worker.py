"""JSON-lines bridge for the reduced anatomical boss controller."""
import os
from pathlib import Path
import sys

for name in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
    os.environ[name] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from scicon_fly.boss_learning import serve

if __name__ == "__main__":
    serve()
