"""Create an exact reproducibility archive from the frozen assay and its source."""
from pathlib import Path
import hashlib
import json
import zipfile

LAB = Path(__file__).resolve().parents[1]
OUTPUT = LAB / "runtime/reduced-conditioning-v1-reproducibility.zip"
EVIDENCE = LAB / "evidence/reduced-conditioning-v1"
files = {f"evidence/reduced-conditioning-v1/{p.name}": p.read_bytes() for p in EVIDENCE.iterdir() if p.is_file()}
for relative in ("configs/reduced-conditioning-v1.json", "python/scicon_fly/reduced_conditioning.py", "scripts/run-reduced-conditioning.py", "scripts/reproduce-reduced-conditioning.py"):
    files[relative] = (LAB / relative).read_bytes()
files["README.md"] = (LAB / "docs/REDUCED_CONDITIONING_REPRODUCTION.md").read_bytes()
files["METHODS_AND_RESULTS.md"] = (LAB / "docs/REDUCED_CONDITIONING.md").read_bytes()
files["requirements.txt"] = b"numpy==2.2.6\n"
files["PACKAGE_SHA256.json"] = (json.dumps({name: hashlib.sha256(data).hexdigest() for name, data in sorted(files.items())}, indent=2)+"\n").encode()
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(OUTPUT, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name, data in sorted(files.items()):
        info = zipfile.ZipInfo(name, (2026, 9, 13, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, data)
print(json.dumps({"path": str(OUTPUT), "bytes": OUTPUT.stat().st_size, "sha256": hashlib.sha256(OUTPUT.read_bytes()).hexdigest(), "files": len(files)}))
