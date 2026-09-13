"""Audit author-documented L2 workbook renames using metadata only.

Reads all seven XLSX sheets as ZIP/XML and an explicit HDF5 metadata allowlist.
No response dataset is dereferenced, no external code is executed, no source
record is rewritten, and no calibration or biological split is performed.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from xml.etree import ElementTree as ET
from zipfile import ZipFile

EXPECTED = {
    "L2_ASAP2f.mat": (117007438, "31e3942cee9025c152f96f929d30357ff14e6cf3b4f3c972f005c89524e946df"),
    "L1L2_Metadata.xlsx": (195431, "0c6c428b1a297fb7c63b24a6f1a6e60516320ca6bde550614639d865dcdcfcea"),
    "README.md": (15130, "fbedd08a47ba0927cf416c1a8d73bdd889e5779c309f79f94970b02c1f7f87e7"),
}
ALLOWLIST = ("seriesID", "flyID", "genotype", "stimcode", "nFrames", "zdepth", "wavelength", "ditherHold")
COMPARISONS = {"genotype": "Fly Genotype", "stimcode": "Stimulus", "nFrames": "Frames (imaging)",
               "zdepth": "Z-depth", "wavelength": "Wavelength", "ditherHold": "Dither Hold"}


def sha(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def sources(raw):
    result = []
    for name, (size, digest) in EXPECTED.items():
        path = raw / name
        if path.stat().st_size != size or sha(path) != digest:
            raise ValueError(f"Input identity mismatch: {name}")
        result.append({"name": name, "bytes": size, "sha256": digest})
    return result


def read_sheets(path):
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    office_rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    result = []
    with ZipFile(path) as archive:
        if sum(member.file_size for member in archive.infolist()) > 25_000_000:
            raise ValueError("Unexpected XLSX expansion size")
        strings = ["".join(node.text or "" for node in item.iter(f"{{{ns['m']}}}t"))
                   for item in ET.fromstring(archive.read("xl/sharedStrings.xml"))]
        relations = {node.attrib["Id"]: node.attrib["Target"] for node in
                     ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))}
        for sheet in ET.fromstring(archive.read("xl/workbook.xml")).find("m:sheets", ns):
            target = relations[sheet.attrib[f"{{{office_rel}}}id"]]
            member = target.lstrip("/") if target.startswith("/") else "xl/" + target
            if ".." in Path(member).parts:
                raise ValueError("Unexpected XLSX relationship path")
            rows = []
            for row in ET.fromstring(archive.read(member)).find("m:sheetData", ns):
                cells = {}
                for cell in row:
                    value_node = cell.find("m:v", ns)
                    value = value_node.text if value_node is not None else ""
                    if cell.attrib.get("t") == "s":
                        value = strings[int(value)]
                    elif cell.attrib.get("t") == "inlineStr":
                        value = "".join(node.text or "" for node in cell.iter(f"{{{ns['m']}}}t"))
                    cells[re.match(r"[A-Z]+", cell.attrib["r"])[0]] = value
                rows.append({"row": int(row.attrib["r"]), "cells": cells})
            result.append({"name": sheet.attrib["name"], "member": member, "rows": rows})
    return result


def read_metadata(path):
    import h5py
    import numpy as np

    records = {}
    with h5py.File(path, "r") as handle:
        fields = handle["roiDataMat"]
        selected_raw = handle["iResp"][()].reshape(-1)
        if not np.all(selected_raw == np.floor(selected_raw)):
            raise ValueError("Noninteger selected row index")
        selected = set(map(int, selected_raw))
        if len(selected) != len(selected_raw):
            raise ValueError("Repeated selected row index")

        def metadata_value(node):
            if isinstance(node, h5py.Group) or node.size > 1000:
                raise ValueError("Metadata allowlist reached an unexpected object")
            if node.attrs.get("MATLAB_empty"):
                return None
            if h5py.check_dtype(ref=node.dtype):
                if node.size != 1:
                    raise ValueError("Expected scalar metadata cell")
                return metadata_value(handle[node[()].reshape(-1)[0]])
            values = node[()].reshape(-1)
            if node.attrs.get("MATLAB_class") == b"char":
                return "".join(chr(int(value)) for value in values)
            if len(values) != 1 or not np.isfinite(values[0]):
                raise ValueError("Expected finite numeric metadata scalar")
            return float(values[0])

        columns, rows = fields["seriesID"].shape
        if columns != 2 or not all(1 <= index <= rows for index in selected):
            raise ValueError("Unexpected metadata axes/selection")
        for row in range(rows):
            for column in range(columns):
                record = {key: metadata_value(handle[fields[key][column, row]]) for key in ALLOWLIST}
                sid = record["seriesID"]
                if sid in records:
                    if records[sid]["metadata"] != record:
                        raise ValueError(f"Inconsistent metadata within series: {sid}")
                else:
                    records[sid] = {"metadata": record, "recording_column": column + 1,
                                    "matlab_roi_rows": [], "selected_matlab_roi_rows": []}
                records[sid]["matlab_roi_rows"].append(row + 1)
                if row + 1 in selected:
                    records[sid]["selected_matlab_roi_rows"].append(row + 1)
        return records, sorted(fields.keys()), h5py.__version__, np.__version__


def audit(raw):
    identity = sources(raw)
    sheets = read_sheets(raw / "L1L2_Metadata.xlsx")
    records, available_fields, h5py_version, numpy_version = read_metadata(raw / "L2_ASAP2f.mat")
    tabular = []
    note_records = []
    fly_memberships = []
    for sheet in sheets:
        if sheet["name"] == "List of flies":
            figure, condition = None, None
            for row in sheet["rows"]:
                if row["cells"].get("A"):
                    figure = row["cells"]["A"]
                value = row["cells"].get("B", "")
                if re.fullmatch(r"\d{6}_fly\d+", value):
                    fly_memberships.append({"fly_label": value, "figure_section": figure, "condition": condition,
                                            "cell": f"B{row['row']}", "sheet": sheet["name"]})
                elif value:
                    condition = value
            continue
        headers = next((row["cells"] for row in sheet["rows"] if row["cells"].get("A") == "Time Series ID"), None)
        if headers is None:
            raise ValueError(f"Missing explicit table header: {sheet['name']}")
        for row in sheet["rows"]:
            if not re.match(r"^\d{6}_fly\d+_LDM|^Tseries-", row["cells"].get("A", "")):
                continue
            data = {headers[key]: value for key, value in row["cells"].items() if key in headers}
            record = {"sheet": sheet["name"], "row": row["row"], "series_cell": f"A{row['row']}", "data": data}
            tabular.append(record)
            comment = data.get("comments", "")
            match = re.search(r"MANUALLY RENAMED FLY(\d+) TO DISTINGUISH FROM OTHER (\d{6}) FOLDER", comment)
            if match:
                target = re.match(r"^(\d{6}_fly\d+)_", data["Time Series ID"])[1]
                old = f"{match[2]}_fly{match[1]}"
                note_records.append({**record, "comment_cell": f"V{row['row']}", "old_prefix_in_author_comment": old,
                                     "release_prefix": target, "exact_comment": comment})
    all_rows = [row for row in tabular if row["sheet"] == "All Metadata"]
    index = defaultdict(list)
    for row in all_rows:
        index[row["data"]["Time Series ID"]].append(row)
    renames = {}
    for note in note_records:
        old, new = note["old_prefix_in_author_comment"], note["release_prefix"]
        if old in renames and renames[old] != new:
            raise ValueError("Conflicting explicit rename notes")
        renames[old] = new
    assessments = []
    namespace_rows = defaultdict(lambda: {"mat_ids": set(), "workbook_ids": set(), "series_count": 0, "selected_roi_rows": set()})
    for sid, mat_record in sorted(records.items()):
        metadata = mat_record["metadata"]
        prefix = re.match(r"^(\d{6}_fly\d+)_", sid)[1]
        target_prefix = renames.get(prefix, prefix)
        target_sid = target_prefix + sid[len(prefix):]
        matches = index.get(target_sid, [])
        differences, comparisons, corroboration = {}, {}, []
        if len(matches) == 1:
            worksheet = matches[0]["data"]
            for key, label in COMPARISONS.items():
                source = metadata[key]
                target = worksheet.get(label)
                agrees = source == target if isinstance(source, str) else target not in (None, "") and abs(source - float(target)) <= 1e-9
                comparisons[key] = {"mat": source, "workbook": target, "agrees": bool(agrees)}
                if not agrees:
                    differences[key] = comparisons[key]
            for extra in tabular:
                if extra["sheet"] != "All Metadata" and extra["data"].get("Time Series ID") == target_sid:
                    unequal = {key: {"all_metadata": value, "figure_sheet": extra["data"].get(key)} for key, value in worksheet.items()
                               if extra["data"].get(key) != value}
                    corroboration.append({"sheet": extra["sheet"], "row": extra["row"], "differing_columns": unequal})
            namespace_rows[prefix]["workbook_ids"].add(worksheet["Fly ID"])
        namespace_rows[prefix]["mat_ids"].add(metadata["flyID"])
        namespace_rows[prefix]["series_count"] += 1
        namespace_rows[prefix]["selected_roi_rows"].update(mat_record["selected_matlab_roi_rows"])
        direct_conflicts = []
        for direct in index.get(sid, []):
            if target_sid != sid:
                direct_conflicts.append({"sheet": direct["sheet"], "row": direct["row"], "series_id": sid,
                                         "genotype": direct["data"].get("Fly Genotype"), "zdepth": direct["data"].get("Z-depth"),
                                         "numeric_fly_id": direct["data"].get("Fly ID")})
        assessments.append({"mat_series_id": sid, "release_series_id_for_explicit_note_check": target_sid,
                            "rename_source": "EXPLICIT_AUTHOR_WORKBOOK_COMMENT" if prefix in renames else "UNCHANGED_LABEL",
                            "mat_metadata": metadata, "recording_column": mat_record["recording_column"],
                            "all_roi_rows": len(mat_record["matlab_roi_rows"]), "selected_matlab_roi_rows": mat_record["selected_matlab_roi_rows"],
                            "workbook_match_count": len(matches), "workbook_row": matches[0] if len(matches) == 1 else None,
                            "shared_metadata_comparisons": comparisons, "shared_metadata_disagreements": differences,
                            "figure_sheet_corroboration": corroboration, "literal_old_label_collisions": direct_conflicts,
                            "status": "AUTHOR_RENAME_AND_SHARED_METADATA_AGREE" if prefix in renames and len(matches) == 1 and not differences else
                                      "EXACT_LABEL_AND_SHARED_METADATA_AGREE" if len(matches) == 1 and not differences else "UNRESOLVED"})
    namespaces = []
    for prefix, values in sorted(namespace_rows.items()):
        namespaces.append({"mat_prefix": prefix, "release_prefix": renames.get(prefix, prefix),
                           "mat_numeric_ids": sorted(values["mat_ids"]), "workbook_numeric_ids": sorted(values["workbook_ids"]),
                           "series_count": values["series_count"], "selected_roi_rows": len(values["selected_roi_rows"]),
                           "numeric_id_offset_is_not_applied": True})
    selected_mat_rows = sorted({row for record in assessments for row in record["selected_matlab_roi_rows"]})
    unresolved_selected = sorted({row for record in assessments if record["status"] == "UNRESOLVED" for row in record["selected_matlab_roi_rows"]})
    before_after = sources(raw)
    if before_after != identity:
        raise ValueError("Sources changed during read-only audit")
    return {"schema_version": 1, "status": "AUTHOR_METADATA_CROSSWALK_AUDIT_ONLY", "source_doi": "10.5061/dryad.ngf1vhj4c",
            "source_identities": identity, "script_sha256": sha(__file__), "runtime": {"python": sys.version.split()[0], "h5py": h5py_version, "numpy": numpy_version},
            "sheet_inventory": [{"name": sheet["name"], "xml_member": sheet["member"], "row_count": len(sheet["rows"]),
                                 "170607_rows": sum(any("170607" in value for value in row["cells"].values()) for row in sheet["rows"])} for sheet in sheets],
            "explicit_author_rename_notes": note_records, "renames_extracted_from_explicit_comments": renames,
            "170607_list_of_flies_memberships": [item for item in fly_memberships if item["fly_label"].startswith("170607_")],
            "untreated_l2_list_memberships": [item for item in fly_memberships if item["condition"] == "L2>>ASAP2f (21Dhh-ASAP2f)"],
            "metadata_allowlist_dereferenced": list(ALLOWLIST), "selection_index_read": "iResp",
            "available_mat_struct_fields": available_fields,
            "laser_comparison_limit": "Only wavelength and ditherHold are available as directly comparable MAT metadata. Workbook transmission, detector gain/offset, rotation, layer and PWM are retained but are not independently checked against the MAT.",
            "series_assessments": assessments, "numeric_id_namespaces": namespaces,
            "status_counts": dict(Counter(item["status"] for item in assessments)),
            "selected_roi_rows": len(selected_mat_rows), "unresolved_selected_matlab_roi_rows": unresolved_selected,
            "response_datasets_read": False, "response_values_exported": False, "source_records_rewritten": False,
            "split_frozen": False, "fitting_performed": False,
            "interpretation": "Workbook comments document the two old-to-release prefix renames. Matching shared recording metadata supports the declared associations; the source records are preserved and no numeric offset is applied globally. Figure tabs within one workbook are corroborating views, not independent experiments.",
            "limits": ["Metadata agreement establishes an auditable released-record association, not independent proof of physical animal identity or genotype.",
                       "MAT record groups with zero selected rows still require explicit treatment; do not silently omit unresolved groups from the inventory.",
                       "High/low-luminance aggregate provenance, physical cell tracking, physiological validity and learning remain outside this audit."]}


def main():
    lab = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, default=lab / "data/raw/vision-physiology/pang-2025/dryad-v3")
    parser.add_argument("--output", type=Path, default=lab / "docs/evidence/l2-workbook-crosswalk-v1.json")
    parser.add_argument("--worker", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.worker:
        args.output.write_text(json.dumps(audit(args.raw), indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
        return
    if args.output.exists():
        raise FileExistsError("Preserve completed evidence; specify a fresh output")
    import psutil
    env = os.environ.copy()
    for name in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
        env[name] = "2"
    pending = args.output.with_suffix(".pending.json")
    if pending.exists():
        raise FileExistsError("Preserve prior pending evidence")
    started = time.monotonic()
    process = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "--worker", "--raw", str(args.raw), "--output", str(pending)], env=env)
    root = psutil.Process(process.pid)
    peak, pids, error = 0, set(), None
    while process.poll() is None:
        try:
            members = [root] + root.children(recursive=True)
            rss = 0
            for member in members:
                try:
                    rss += member.memory_info().rss
                    pids.add(member.pid)
                except psutil.NoSuchProcess:
                    pass
            peak = max(peak, rss)
            if rss > 4 * 1024**3 or time.monotonic() - started > 45 * 60:
                error = "Owned process tree exceeded sampled 4-GiB/45-minute guard"
                for member in reversed(members):
                    try:
                        member.kill()
                    except psutil.NoSuchProcess:
                        pass
                break
        except psutil.NoSuchProcess:
            break
        time.sleep(0.05)
    code = process.wait()
    if code or error:
        raise RuntimeError(error or f"Metadata worker exited {code}; pending evidence retained")
    result = json.loads(pending.read_text(encoding="utf-8"))
    result["resource_audit"] = {"thread_limits": 2, "owned_process_tree_peak_sampled_rss_bytes": peak,
                                "sampled_process_count": len(pids), "wall_seconds": time.monotonic() - started,
                                "sample_interval_seconds": 0.05, "memory_limit_bytes": 4 * 1024**3, "time_limit_seconds": 45 * 60,
                                "scope": "Spawned Python launcher and recursively discovered descendants only; sampled RSS is not an OS allocation ceiling."}
    pending.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    pending.rename(args.output)
    print(json.dumps({"output": str(args.output), "statuses": result["status_counts"], "unresolved_selected_rows": result["unresolved_selected_matlab_roi_rows"], "resources": result["resource_audit"]}))


if __name__ == "__main__":
    main()
