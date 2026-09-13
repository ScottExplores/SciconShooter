"""Read-only Dryad L2 membership/timing audit; never fit or export responses.

Run with the isolated vision-reference Python environment (h5py is required).
The supervising process limits BLAS threads and samples worker RSS/time. HDF5 is
opened read-only; stimulus/identity values are inspected, response values are
used solely for finite-value counts. No author MATLAB/Python code is executed.
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


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def verify_sources(raw):
    records = []
    for name, (size, sha) in EXPECTED.items():
        path = raw / name
        actual = digest(path)
        if path.stat().st_size != size or actual != sha:
            raise ValueError(f"Source identity mismatch: {name}")
        records.append({"file": name, "bytes": size, "sha256": actual})
    return records


def workbook_rows(path):
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    rel_ns = "http://schemas.openxmlformats.org/package/2006/relationships"
    office_rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    with ZipFile(path) as archive:
        if sum(item.file_size for item in archive.infolist()) > 25_000_000:
            raise ValueError("Unexpected workbook expansion size")
        shared = ["".join(node.text or "" for node in item.iter(f"{{{ns['m']}}}t"))
                  for item in ET.fromstring(archive.read("xl/sharedStrings.xml"))]
        relationships = {r.attrib["Id"]: r.attrib["Target"] for r in
                         ET.fromstring(archive.read("xl/_rels/workbook.xml.rels")).findall(f"{{{rel_ns}}}Relationship")}
        sheets, all_rows = [], None
        for sheet in ET.fromstring(archive.read("xl/workbook.xml")).find("m:sheets", ns):
            target = relationships[sheet.attrib[f"{{{office_rel}}}id"]]
            member = target.lstrip("/") if target.startswith("/") else "xl/" + target
            if ".." in Path(member).parts:
                raise ValueError("Unexpected worksheet path")
            rows = []
            for row in ET.fromstring(archive.read(member)).find("m:sheetData", ns):
                values = {}
                for cell in row:
                    column = re.match(r"[A-Z]+", cell.attrib["r"])[0]
                    value = cell.find("m:v", ns)
                    content = value.text if value is not None else ""
                    if cell.attrib.get("t") == "s":
                        content = shared[int(content)]
                    elif cell.attrib.get("t") == "inlineStr":
                        content = "".join(x.text or "" for x in cell.iter(f"{{{ns['m']}}}t"))
                    values[column] = content
                rows.append(values)
            sheets.append({"name": sheet.attrib["name"], "xml_rows": len(rows)})
            if sheet.attrib["name"] == "All Metadata":
                headers = rows[0]
                all_rows = [{headers[k]: value for k, value in row.items() if k in headers}
                            for row in rows[1:] if row.get("A")]
        if all_rows is None:
            raise ValueError("All Metadata sheet missing")
    return sheets, all_rows


def audit(raw):
    import h5py
    import numpy as np

    source_records = verify_sources(raw)
    sheets, spreadsheet = workbook_rows(raw / "L1L2_Metadata.xlsx")
    index = defaultdict(list)
    for row in spreadsheet:
        index[row["Time Series ID"]].append(row)
    header = (raw / "L2_ASAP2f.mat").open("rb").read(116).decode("ascii").rstrip()
    with h5py.File(raw / "L2_ASAP2f.mat", "r") as handle:
        def empty(node):
            return bool(node.attrs.get("MATLAB_empty", False))

        def text(node):
            if empty(node):
                return None
            if h5py.check_dtype(ref=node.dtype) and node.size == 1:
                return text(handle[node[()].reshape(-1)[0]])
            if node.attrs.get("MATLAB_class") != b"char":
                raise ValueError(f"Expected MATLAB char at {node.name}")
            return "".join(chr(int(v)) for v in node[()].reshape(-1))

        def numeric(node):
            if empty(node):
                return np.array([])
            if h5py.check_dtype(ref=node.dtype):
                if node.size != 1:
                    raise ValueError(f"Expected singleton numeric reference at {node.name}")
                return numeric(handle[node[()].reshape(-1)[0]])
            if node.size > 1_000_000:
                raise ValueError(f"Unexpected single metadata/response array size: {node.name}")
            return np.asarray(node[()])

        def scalar(node):
            value = numeric(node).reshape(-1)
            if not value.size:
                return None
            if value.size != 1:
                raise ValueError(f"Expected scalar at {node.name}")
            return float(value[0])

        def metadata_values(node):
            if h5py.check_dtype(ref=node.dtype):
                return [metadata_values(handle[ref]) for ref in node[()].ravel(order="C")]
            return numeric(node).reshape(-1).tolist()

        def descriptor(node, timing=False):
            if isinstance(node, h5py.Group):
                return {"kind": "group", "fields": sorted(node.keys())}
            if h5py.check_dtype(ref=node.dtype):
                return {"kind": "cell", "hdf5_shape": list(node.shape),
                        "matlab_shape": list(reversed(node.shape)),
                        "elements_matlab_order": [descriptor(handle[ref], timing) for ref in node[()].ravel(order="C")]}
            array = numeric(node).reshape(-1)
            stored_dimensions = None
            logical_shape = list(reversed(node.shape))
            if empty(node):
                # MATLAB 7.3 stores an empty array's logical dimensions as the
                # dataset payload; the HDF5 [rank] container is not its shape.
                dimensions = np.asarray(node[()]).reshape(-1)
                if not np.all(np.isfinite(dimensions)) or not np.all(dimensions == np.floor(dimensions)) or np.any(dimensions < 0):
                    raise ValueError(f"Invalid MATLAB empty-array dimensions at {node.name}")
                stored_dimensions = [int(value) for value in dimensions]
                logical_shape = stored_dimensions
            result = {"kind": "numeric", "hdf5_shape": list(node.shape),
                      "matlab_shape": logical_shape, "matlab_empty": empty(node),
                      "elements": int(array.size), "nonfinite": int(np.count_nonzero(~np.isfinite(array)))}
            if stored_dimensions is not None:
                result["stored_dimension_metadata"] = stored_dimensions
            if timing and array.size:
                delta = np.diff(array)
                result.update({"first_seconds": float(array[0]), "last_seconds": float(array[-1]),
                               "strictly_increasing": bool(np.all(delta > 0)),
                               "spacing_seconds_unique_rounded_12": sorted(set(np.round(delta, 12).tolist()))[:20]})
            return result

        data = handle["roiDataMat"]
        meta = handle["roiMetaMat"]
        ncols, nrows = data["seriesID"].shape
        if ncols != 2 or any(node.shape != (2, nrows) for node in data.values()):
            raise ValueError("Unexpected ROI struct axes")
        selected_raw = numeric(handle["iResp"]).reshape(-1)
        if not np.all(selected_raw == np.floor(selected_raw)):
            raise ValueError("Noninteger MATLAB ROI indices")
        selected = [int(v) for v in selected_raw]
        if len(set(selected)) != len(selected) or not all(1 <= v <= nrows for v in selected):
            raise ValueError("Invalid or duplicate MATLAB ROI indices")
        selected_set = set(selected)
        flies = defaultdict(lambda: {"all_roi_rows": 0, "selected_roi_rows": 0, "search_series": set(), "experimental_series": set()})
        series = {}
        roi_records = []
        issues = []
        response_schemas = Counter()
        timing_schemas = Counter()
        missingness = Counter()
        pair_mismatches = []
        roi_keys = Counter()
        for row in range(nrows):
            matlab_row = row + 1
            included = matlab_row in selected_set
            identities = []
            for column in range(2):
                def field(name):
                    return handle[data[name][column, row]]

                identity = {"series_id": text(field("seriesID")), "fly_id_field": scalar(field("flyID")),
                            "genotype": text(field("genotype")), "stimcode": text(field("stimcode")),
                            "roi_mask": scalar(field("roiMask")), "zdepth": scalar(field("zdepth"))}
                match = re.match(r"^(\d{6}_fly\d+)_", identity["series_id"] or "")
                if not match:
                    raise ValueError("Cannot resolve biological fly from seriesID")
                identity["biological_fly_id"] = match[1]
                m_series = text(handle[meta["seriesID"][column, row]])
                m_mask = scalar(handle[meta["roiMaskInd"][column, row]])
                if m_series != identity["series_id"] or m_mask != identity["roi_mask"]:
                    issues.append({"issue": "roi_metadata_identity_mismatch", "row": matlab_row, "column": column + 1})
                response = {name: descriptor(field(name)) for name in ("rats", "stdErr", "stdErrs", "dFF")}
                timing = descriptor(field("t"), timing=True)
                response_schemas[json.dumps({"column": column + 1, **response}, sort_keys=True)] += 1
                timing_schemas[json.dumps({"column": column + 1, **timing}, sort_keys=True)] += 1
                def count_missing(item):
                    if item.get("kind") == "cell":
                        return sum(count_missing(v) for v in item["elements_matlab_order"])
                    return item.get("nonfinite", 0)
                for name, schema in response.items():
                    count = count_missing(schema)
                    if count:
                        missingness[f"column_{column + 1}_{name}_nonfinite_values_all"] += count
                        missingness[f"column_{column + 1}_{name}_records_with_nonfinite_all"] += 1
                        if included:
                            missingness[f"column_{column + 1}_{name}_nonfinite_values_selected"] += count
                            missingness[f"column_{column + 1}_{name}_records_with_nonfinite_selected"] += 1
                sid = identity["series_id"]
                if sid not in series:
                    stim = field("stimDat")
                    processed = field("pStimDat")
                    stim_fields = ("FlashDuration", "GrayDuration", "FlashContrast", "GrayContrast", "stimIFI", "nFlashes", "nUpdates", "RepeatRNGSeed", "rndSeed")
                    stimulus = {key: metadata_values(stim[key]) for key in stim_fields if key in stim}
                    transitions = numeric(processed["stimEpochStartTimes"]).reshape(-1)
                    epoch_indices = numeric(processed["rcStimInd"]).reshape(-1)
                    duration_by_epoch = {}
                    if len(transitions) == len(epoch_indices):
                        for epoch in sorted(set(epoch_indices.tolist())):
                            durations = np.diff(transitions)[epoch_indices[:-1] == epoch]
                            duration_by_epoch[str(int(epoch))] = {"completed_intervals": int(durations.size),
                                                               "duration_seconds_unique_rounded_6": sorted(set(np.round(durations, 6).tolist()))[:40]}
                    else:
                        issues.append({"issue": "transition_index_length_mismatch", "series_id": sid,
                                       "transition_count": len(transitions), "index_count": len(epoch_indices)})
                    matches = index.get(sid, [])
                    if len(matches) != 1:
                        issues.append({"issue": "spreadsheet_series_match_count", "series_id": sid, "count": len(matches)})
                    allowed = ("Fly ID", "Fly Genotype", "Age", "Sex", "Stimulus", "Frames (imaging)", "Imaging Frame Rate (Hz)", "PWM", "Dither Hold", "Layer", "Z-depth")
                    sheet_values = {key: matches[0].get(key, "") for key in allowed} if len(matches) == 1 else None
                    if sheet_values and (sheet_values["Fly Genotype"] != identity["genotype"] or sheet_values["Stimulus"] != identity["stimcode"]):
                        issues.append({"issue": "spreadsheet_condition_label_mismatch", "series_id": sid,
                                       "mat_genotype": identity["genotype"], "spreadsheet_genotype": sheet_values["Fly Genotype"],
                                       "mat_stimulus": identity["stimcode"], "spreadsheet_stimulus": sheet_values["Stimulus"]})
                    series[sid] = {**identity, "recording_column": column + 1, "n_frames": scalar(field("nFrames")),
                                   "imIFI_seconds": scalar(field("imIFI")), "bin_shift_seconds": scalar(field("BIN_SHIFT")),
                                   "dither_hold": scalar(field("ditherHold")), "stimulus_declared_fields": stimulus,
                                   "processed_stimulus_fields": sorted(processed.keys()), "epoch_index_counts": dict(Counter(map(lambda x: str(int(x)), epoch_indices))),
                                   "completed_epoch_durations": duration_by_epoch,
                                   "imaging_times": descriptor(field("imFrameStartTimes"), timing=True),
                                   "spreadsheet": sheet_values, "all_roi_rows": 0, "selected_roi_rows": 0}
                series[sid]["all_roi_rows"] += 1
                series[sid]["selected_roi_rows"] += int(included)
                identities.append(identity)
            search, experimental = identities
            differences = {key: {"search": search[key], "experimental": experimental[key]} for key in
                           ("biological_fly_id", "roi_mask", "zdepth", "genotype") if search[key] != experimental[key]}
            if differences:
                pair_mismatches.append({"matlab_roi_row": matlab_row, "selected": included, "differences": differences})
            fly = experimental["biological_fly_id"]
            flies[fly]["all_roi_rows"] += 1
            flies[fly]["selected_roi_rows"] += int(included)
            flies[fly]["search_series"].add(search["series_id"])
            flies[fly]["experimental_series"].add(experimental["series_id"])
            key = (experimental["series_id"], experimental["roi_mask"])
            roi_keys[key] += 1
            roi_records.append({"matlab_roi_row": matlab_row, "selected": included, "biological_fly_id": fly,
                                "search_series_id": search["series_id"], "experimental_series_id": experimental["series_id"],
                                "roi_mask": experimental["roi_mask"]})
        for record in flies.values():
            for key in ("search_series", "experimental_series"):
                record[key] = sorted(record[key])
        readme = (raw / "README.md").read_text(encoding="utf-8")
        l2_section = readme.split("* L2>>ASAP2f (21Dhh-ASAP2f)", 1)[1].split("* L2>>ASAP2f +CDM", 1)[0]
        readme_flies = sorted(set(re.findall(r"\d{6}_fly\d+", l2_section)))
        global_scalars = {name: scalar(handle[name]) for name in ("interpFrameRate", "binWidthMult", "inv")}
        top_level = {name: {"kind": "group" if isinstance(node, h5py.Group) else "dataset",
                            "hdf5_shape": list(node.shape) if isinstance(node, h5py.Dataset) else None,
                            "fields": sorted(node.keys()) if isinstance(node, h5py.Group) else None}
                     for name, node in handle.items() if name != "#refs#"}
    if verify_sources(raw) != source_records:
        raise ValueError("Sources changed during audit")
    for issue in issues:
        if issue.get("series_id") in series:
            issue["all_roi_rows"] = series[issue["series_id"]]["all_roi_rows"]
            issue["selected_roi_rows"] = series[issue["series_id"]]["selected_roi_rows"]
    fly_mapping = []
    for fly in sorted(flies):
        matching = [record for record in series.values() if record["biological_fly_id"] == fly]
        fly_mapping.append({"mat_series_prefix": fly,
                            "mat_numeric_fly_ids": sorted(set(record["fly_id_field"] for record in matching)),
                            "exact_series_match_workbook_fly_ids": sorted(set(record["spreadsheet"]["Fly ID"] for record in matching if record["spreadsheet"])),
                            "identity_crosswalk_status": "UNVERIFIED; preserve both namespaces and resolve condition conflicts before splitting"})
    return {
        "schema_version": 1, "inventory_version": 2, "status": "MEMBERSHIP_AND_STIMULUS_AUDIT_ONLY",
        "supersedes": {"inventory": "docs/evidence/l2-dryad-inventory-v1.json",
                       "preserved_inspector": "data/raw/vision-physiology/pang-2025/dryad-v3/inventory-v1-inspector.py",
                       "corrections": ["Qualify intended release condition; individual record genotype/animal crosswalk remains unresolved.",
                                       "Decode MATLAB_empty logical dimensions from stored payload rather than its HDF5 container shape."]},
        "source_doi": "10.5061/dryad.ngf1vhj4c", "dryad_version_id": 335185,
        "sources": source_records, "script_sha256": digest(__file__),
        "runtime": {"python": sys.version.split()[0], "h5py": h5py.__version__, "numpy": np.__version__},
        "mat_header": header, "top_level_schema": top_level,
        "axis_convention": "HDF5 references have shape [recording_column=2, ROI_row=214]; MATLAB struct shape is [214,2]. Column 1 search, column 2 experimental; iResp is MATLAB one-based ROI rows.",
        "response_cell_convention": "Nested t/rats cells store HDF5 [epoch=2, singleton=1], MATLAB [1,2]; MATLAB epoch 1 is dark and epoch 2 light per README. Output descriptors contain no response values.",
        "global_scalars": global_scalars, "roi_rows_all": nrows, "roi_rows_selected": len(selected),
        "selected_matlab_rows_in_original_order": selected, "biological_fly_count_all": len(flies),
        "biological_fly_count_selected": sum(v["selected_roi_rows"] > 0 for v in flies.values()),
        "biological_fly_count_qualification": "Counts of distinct fly groups in the MAT series-ID namespace; not yet a verified crosswalk to release metadata or physical individuals.",
        "fly_identity_namespaces": fly_mapping,
        "fly_counts": dict(sorted(flies.items())), "roi_membership": roi_records,
        "readme_untreated_l2_fly_ids": readme_flies,
        "mat_flies_missing_from_readme": sorted(set(flies) - set(readme_flies)),
        "readme_flies_missing_from_mat": sorted(set(readme_flies) - set(flies)),
        "search_experimental_field_differences": pair_mismatches,
        "search_experimental_difference_interpretation": "ROI mask indices need not identify the same physical cell across separately processed recordings. Preserve differing local indices; do not treat equality or inequality as cell tracking.",
        "duplicate_experimental_series_roi_keys": [{"series_id": k[0], "roi_mask": k[1], "count": v} for k, v in roi_keys.items() if v > 1],
        "spreadsheet_sheets": sheets, "spreadsheet_all_metadata_rows": len(spreadsheet),
        "series": dict(sorted(series.items())), "metadata_issues": issues,
        "missingness_nonzero_counts": dict(sorted(missingness.items())),
        "response_schema_counts": [{"count": count, "descriptor": json.loads(key)} for key, count in sorted(response_schemas.items())],
        "timing_schema_counts": [{"count": count, "descriptor": json.loads(key)} for key, count in sorted(timing_schemas.items())],
        "response_values_exported": False, "fitting_performed": False, "split_frozen": False,
        "limitations": [
            "Fly is the biological unit; ROIs, both polarities, repeated fields and search/experimental records within a fly are dependent. Series prefixes and numeric flyID namespaces require reconciliation before this release can support a physical-fly split.",
            "The intended release condition is untreated L2 ASAP2f female physiology, but per-record genotype and animal identity remain unresolved where MAT and release metadata conflict. Transfer to male anatomy and fluorescence-to-voltage/release mappings remain assumptions.",
            "No aggregate response computation or GitHub aggregate correspondence check was performed, so provenance of highLum/lowLum aggregate curves is unresolved.",
            "Timing descriptors and finite-value checks are metadata quality checks, not physiological model validation.",
            "Scope excludes raw microscopy ZIP archives and other genotypes, drug conditions and naturalistic MAT files.",
        ],
        "preliminary_attempt": {"local_path": "data/raw/vision-physiology/pang-2025/dryad-v3/inventory-preliminary-wrapper-only.json",
                                "limitation": "Superseded descriptive attempt compared global numeric flyID incorrectly with the local filename suffix and sampled only the Windows launcher RSS. Its output is preserved; do not use those mismatch counts or memory measurement."},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    lab = Path(__file__).resolve().parents[1]
    parser.add_argument("--raw", type=Path, default=lab / "data/raw/vision-physiology/pang-2025/dryad-v3")
    parser.add_argument("--output", type=Path, default=lab / "docs/evidence/l2-dryad-inventory-v2.json")
    parser.add_argument("--worker", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.worker:
        result = audit(args.raw)
        args.output.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
        return
    if args.output.exists():
        raise FileExistsError("Preserve completed inventory: choose a fresh output path")
    import psutil
    env = os.environ.copy()
    for key in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
        env[key] = "2"
    interim = args.output.with_suffix(".pending.json")
    if interim.exists():
        raise FileExistsError("Prior pending audit exists; inspect it first")
    command = [sys.executable, str(Path(__file__).resolve()), "--worker", "--raw", str(args.raw), "--output", str(interim)]
    started = time.monotonic()
    process = subprocess.Popen(command, env=env)
    sampled = psutil.Process(process.pid)
    peak_rss = 0
    observed_pids = set()
    failure = None
    while process.poll() is None:
        try:
            owned = [sampled] + sampled.children(recursive=True)
            rss = 0
            for member in owned:
                try:
                    rss += member.memory_info().rss
                    observed_pids.add(member.pid)
                except psutil.NoSuchProcess:
                    continue
            peak_rss = max(peak_rss, rss)
            if rss > 4 * 1024**3:
                failure = "Sampled worker RSS exceeded 4 GiB"
            elif time.monotonic() - started > 45 * 60:
                failure = "Worker exceeded 45 minutes"
        except psutil.NoSuchProcess:
            break
        if failure:
            for member in reversed(owned):
                try:
                    member.kill()
                except psutil.NoSuchProcess:
                    pass
            break
        time.sleep(0.05)
    code = process.wait()
    if failure or code:
        raise RuntimeError(failure or f"Audit worker exited {code}; pending evidence preserved")
    result = json.loads(interim.read_text(encoding="utf-8"))
    result["resource_audit"] = {"thread_limits": 2, "sampled_owned_process_tree_peak_rss_bytes": peak_rss,
                                "sampled_process_count": len(observed_pids),
                                "scope": "Spawned Python launcher plus all recursively discovered child processes; only this owned tree is terminated on a guard failure.",
                                "sample_interval_seconds": 0.05, "wall_seconds": time.monotonic() - started,
                                "memory_limit_bytes": 4 * 1024**3, "time_limit_seconds": 45 * 60,
                                "limitation": "RSS is sampled, not an OS-enforced allocation limit; an unsampled transient peak is possible."}
    interim.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    interim.rename(args.output)
    print(json.dumps({"output": str(args.output), "roi_rows": result["roi_rows_all"],
                      "selected_rois": result["roi_rows_selected"], "selected_flies": result["biological_fly_count_selected"],
                      "metadata_issues": len(result["metadata_issues"]), "resources": result["resource_audit"]}))


if __name__ == "__main__":
    main()
