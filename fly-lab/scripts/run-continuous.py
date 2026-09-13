"""Use the lab's isolated Python executable; launch from any directory."""
from pathlib import Path
import sys

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'python'))
from scicon_fly.continuous import main

if __name__=='__main__':raise SystemExit(main())
