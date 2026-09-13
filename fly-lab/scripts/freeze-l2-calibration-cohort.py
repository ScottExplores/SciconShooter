"""Freeze the prespecified L2 date-group assignment without reading responses.

Uses the hash-bound inventory and author-comment crosswalk. The MAT file is
hashed for identity only; this script has no HDF5/MAT response reader. Future
reproduction can choose a fresh output path, but cannot alter the pinned policy.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
from itertools import combinations
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

POLICY_SHA256 = "7f83391651817564115204d02d1cd8d1340780000b93043db4a3c31e724d956d"


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def prefix(series):
    match = re.match(r"^(\d{6}_fly\d+)_LDM(?:_\d+)?$", series)
    if not match:
        raise ValueError(f"Unexpected recording-series label: {series}")
    return match[1]


def verified_input(lab, descriptor):
    path = (lab / descriptor["path"]).resolve()
    if not path.is_relative_to(lab.resolve()) or digest(path) != descriptor["sha256"]:
        raise ValueError(f"Input location or hash mismatch: {descriptor['path']}")
    return path


def freeze(lab, protocol_path):
    if digest(protocol_path) != POLICY_SHA256:
        raise ValueError("The assignment policy differs from the pre-assignment freeze")
    protocol = json.loads(protocol_path.read_text(encoding="utf-8"))
    source_paths = {key: verified_input(lab, protocol[key]) for key in ("source_mat", "inventory", "crosswalk")}
    inventory = json.loads(source_paths["inventory"].read_text(encoding="utf-8"))
    crosswalk = json.loads(source_paths["crosswalk"].read_text(encoding="utf-8"))
    original_rows = inventory["roi_membership"]
    selected_order = inventory["selected_matlab_rows_in_original_order"]
    row_numbers = [row["matlab_roi_row"] for row in original_rows]
    if row_numbers != list(range(1, protocol["expected_original_roi_rows"] + 1)):
        raise ValueError("Original ROI ledger is incomplete or reordered")
    if len(selected_order) != protocol["expected_original_selected_roi_rows"] or len(set(selected_order)) != len(selected_order):
        raise ValueError("Selected iResp count or uniqueness mismatch")
    selected_set = set(selected_order)
    if {row["matlab_roi_row"] for row in original_rows if row["selected"]} != selected_set:
        raise ValueError("Stored selection flags do not match original iResp membership")
    assessments = crosswalk["series_assessments"]
    by_series = {item["mat_series_id"]: item for item in assessments}
    if len(by_series) != len(assessments):
        raise ValueError("Duplicate original series keys")
    canonical_series = [item["release_series_id_for_explicit_note_check"] for item in assessments]
    if len(set(canonical_series)) != len(canonical_series):
        raise ValueError("Duplicate canonical series keys across original recording records")
    namespaces = {item["mat_prefix"]: item for item in crosswalk["numeric_id_namespaces"]}
    acceptable = {"EXACT_LABEL_AND_SHARED_METADATA_AGREE", "AUTHOR_RENAME_AND_SHARED_METADATA_AGREE"}
    rows = []
    for original in original_rows:
        number = original["matlab_roi_row"]
        search = by_series[original["search_series_id"]]
        experiment = by_series[original["experimental_series_id"]]
        search_release = search["release_series_id_for_explicit_note_check"]
        experiment_release = experiment["release_series_id_for_explicit_note_check"]
        release_group = prefix(experiment_release)
        if prefix(search_release) != release_group:
            raise ValueError(f"Search and experimental records split across release groups at ROI row {number}")
        if search["recording_column"] != 1 or experiment["recording_column"] != 2:
            raise ValueError("Unexpected search/experimental recording columns")
        if number not in selected_set:
            included = False
        else:
            included = True
            if search["status"] not in acceptable or experiment["status"] not in acceptable:
                raise ValueError("Selected row still has an unresolved source association")
        if (number in search["selected_matlab_roi_rows"]) != included or (number in experiment["selected_matlab_roi_rows"]) != included:
            raise ValueError("Crosswalk selected membership disagrees with original iResp")
        namespace = namespaces[prefix(original["experimental_series_id"])]
        if namespace["release_prefix"] != release_group:
            raise ValueError("Release group disagrees with numeric-ID namespace record")
        if included and (len(namespace["mat_numeric_ids"]) != 1 or len(namespace["workbook_numeric_ids"]) != 1):
            raise ValueError("Selected group lacks unambiguous retained numeric namespaces")
        rows.append({"original_matlab_roi_row": number, "source_selected": included,
                     "original_mat_series_prefix": prefix(original["experimental_series_id"]),
                     "release_group": release_group, "recording_date_yymmdd": release_group[:6],
                     "original_search_series_id": original["search_series_id"],
                     "original_experimental_series_id": original["experimental_series_id"],
                     "canonical_search_series_id": search_release, "canonical_experimental_series_id": experiment_release,
                     "mat_numeric_fly_ids": namespace["mat_numeric_ids"], "workbook_numeric_fly_ids": namespace["workbook_numeric_ids"],
                     "polarity_scope": ["dark", "light"],
                     "search_crosswalk_status": search["status"], "experimental_crosswalk_status": experiment["status"],
                     "membership_basis": "original_iResp" if included else "not_selected_by_original_iResp"})
    selected_groups = sorted({row["release_group"] for row in rows if row["source_selected"]})
    declared_groups = sorted(item["fly_label"] for item in crosswalk["untreated_l2_list_memberships"])
    if selected_groups != declared_groups or len(selected_groups) != protocol["expected_selected_release_groups"]:
        raise ValueError("Selected canonical groups differ from the author-listed cohort")
    groups_by_date = defaultdict(list)
    for group in selected_groups:
        groups_by_date[group[:6]].append(group)
    dates = sorted(groups_by_date)
    if len(dates) != protocol["expected_selected_recording_dates"]:
        raise ValueError("Unexpected recording-date count")
    policy = protocol["assignment"]
    if len(dates) - policy["enumerate_assessment_date_count"] != policy["remaining_development_date_count"]:
        raise ValueError("Inconsistent date partition counts")
    # Ranking uses dates and release-group counts ONLY. ROI counts are not
    # calculated for candidate subsets or supplied to this ranking key.
    ranked = []
    for chosen in combinations(dates, policy["enumerate_assessment_date_count"]):
        assessment_groups = sorted(group for date in chosen for group in groups_by_date[date])
        hash_input = policy["sha256_prefix"] + ",".join(chosen)
        ranked.append({"assessment_dates": list(chosen), "assessment_release_groups": assessment_groups,
                       "assessment_release_group_count": len(assessment_groups),
                       "absolute_group_count_difference_from_target": abs(len(assessment_groups) - policy["target_assessment_release_group_count"]),
                       "sha256_input_utf8": hash_input, "sha256_tiebreak": hashlib.sha256(hash_input.encode("utf-8")).hexdigest()})
    ranked.sort(key=lambda item: (item["absolute_group_count_difference_from_target"], item["sha256_tiebreak"], tuple(item["assessment_dates"])))
    if len(ranked) != 35:
        raise ValueError("Expected all 35 three-of-seven subsets")
    for rank, candidate in enumerate(ranked, start=1):
        candidate["rank"] = rank
    assessment_dates = set(ranked[0]["assessment_dates"])
    development_dates = set(dates) - assessment_dates
    if assessment_dates & development_dates or assessment_dates | development_dates != set(dates):
        raise ValueError("Date partitions are not disjoint and complete")
    group_partitions = {group: "assessment" if group[:6] in assessment_dates else "development" for group in selected_groups}
    for row in rows:
        row["group_reserved_partition"] = group_partitions.get(row["release_group"])
        row["partition"] = group_partitions[row["release_group"]] if row["source_selected"] else "source_unselected"
    row_index = {row["original_matlab_roi_row"]: row for row in rows}
    selected_manifest = [row_index[number] for number in selected_order]
    counts = Counter(row["partition"] for row in rows)
    if counts["source_unselected"] != protocol["expected_source_unselected_rows"]:
        raise ValueError("Source-unselected ledger count changed")
    groups = [{"release_group": group, "recording_date_yymmdd": group[:6], "partition": group_partitions[group],
               "selected_matlab_roi_rows_in_original_iResp_order": [number for number in selected_order if row_index[number]["release_group"] == group]}
              for group in selected_groups]
    if any(len({row["partition"] for row in selected_manifest if row["release_group"] == group}) != 1 for group in selected_groups):
        raise ValueError("A release group crosses partitions")
    for key, path in source_paths.items():
        if digest(path) != protocol[key]["sha256"]:
            raise ValueError("Input changed while freezing cohort")
    if digest(protocol_path) != POLICY_SHA256:
        raise ValueError("Protocol changed while freezing cohort")
    now = datetime.now(timezone.utc)
    if now < datetime.fromisoformat(protocol["policy_declared_utc"].replace("Z", "+00:00")):
        raise ValueError("Clock precedes declared policy freeze")
    return {"schema_version": 1, "status": "MEMBERSHIP_AND_ASSIGNMENT_FROZEN_NO_FITTING",
            "assignment_computed_utc": now.isoformat(), "policy_declared_utc": protocol["policy_declared_utc"],
            "protocol_path": str(protocol_path.relative_to(lab)).replace("\\", "/"), "protocol_sha256": POLICY_SHA256,
            "runner_sha256": digest(__file__), "root_prespecified_seed_policy": policy,
            "random_number_generator_used": False,
            "source_identities": [{"role": key, **protocol[key], "bytes": path.stat().st_size} for key, path in source_paths.items()],
            "cohort_counts": {"original_roi_rows": len(rows), "selected_roi_rows": len(selected_manifest), "source_unselected_rows": counts["source_unselected"],
                              "selected_release_groups": len(selected_groups), "selected_dates": len(dates)},
            "all_candidate_rankings": ranked,
            "chosen_rank": 1, "development_dates": sorted(development_dates), "assessment_dates": sorted(assessment_dates),
            "development_release_groups": [group for group in selected_groups if group_partitions[group] == "development"],
            "assessment_release_groups": [group for group in selected_groups if group_partitions[group] == "assessment"],
            "partition_selected_roi_counts_reported_after_assignment": {key: counts[key] for key in ("development", "assessment")},
            "selected_rows_in_original_iResp_order": selected_order, "selected_manifest": selected_manifest,
            "release_group_assignments": groups, "original_214_row_ledger": rows,
            "unresolved_source_unselected_rows": [row["original_matlab_roi_row"] for row in rows if row["partition"] == "source_unselected" and
                                                  (row["search_crosswalk_status"] == "UNRESOLVED" or row["experimental_crosswalk_status"] == "UNRESOLVED")],
            "assessment_label": protocol["assessment_label"], "prior_exposure": protocol["prior_exposure"],
            "membership_restriction": "No new exclusion rule was applied. Both polarities and every included row/recording remain in the release group's date partition. Source-unselected rows are accounted for but are not assigned to fitting or assessment.",
            "response_values_read": False, "response_values_exported": False, "fitting_performed": False, "training_performed": False,
            "physiology_protocol_frozen": False, "validation_gates_changed": False, "not_frozen_here": protocol["not_frozen_here"]}


def main():
    lab = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--protocol", type=Path, default=lab / "configs/candidates/l2-calibration-cohort-v1.json")
    parser.add_argument("--output", type=Path, default=lab / "docs/evidence/l2-calibration-cohort-v1-freeze.json")
    parser.add_argument("--worker", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.worker:
        args.output.write_text(json.dumps(freeze(lab, args.protocol.resolve()), indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
        return
    if args.output.exists():
        raise FileExistsError("Preserve the original freeze; use a fresh output for deterministic verification")
    import psutil
    pending = args.output.with_suffix(".pending.json")
    if pending.exists():
        raise FileExistsError("Prior pending freeze exists; inspect without overwriting")
    env = os.environ.copy()
    for key in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
        env[key] = "2"
    started = time.monotonic()
    process = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "--worker", "--protocol", str(args.protocol), "--output", str(pending)], env=env)
    owner = psutil.Process(process.pid)
    peak, pids, failure = 0, set(), None
    while process.poll() is None:
        try:
            members = [owner] + owner.children(recursive=True)
            rss = 0
            for member in members:
                try:
                    rss += member.memory_info().rss
                    pids.add(member.pid)
                except psutil.NoSuchProcess:
                    pass
            peak = max(peak, rss)
            if rss > 4 * 1024**3 or time.monotonic() - started > 45 * 60:
                failure = "Owned metadata-freeze process tree exceeded sampled resource limit"
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
    if failure or code:
        raise RuntimeError(failure or f"Freeze worker failed with code {code}; pending evidence preserved")
    result = json.loads(pending.read_text(encoding="utf-8"))
    result["resource_audit"] = {"thread_limits": 2, "owned_process_tree_peak_sampled_rss_bytes": peak,
                                "sampled_process_count": len(pids), "wall_seconds": time.monotonic() - started,
                                "sample_interval_seconds": 0.05, "memory_limit_bytes": 4 * 1024**3, "time_limit_seconds": 45 * 60,
                                "limitation": "Only the owned launcher and descendants are sampled/terminated; sampled RSS is not an OS allocation limit."}
    pending.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    pending.rename(args.output)
    print(json.dumps({"output": str(args.output), "assessment_dates": result["assessment_dates"],
                      "development_dates": result["development_dates"], "assessment_groups": len(result["assessment_release_groups"]),
                      "development_groups": len(result["development_release_groups"]), "row_counts": result["partition_selected_roi_counts_reported_after_assignment"],
                      "resources": result["resource_audit"]}))


if __name__ == "__main__":
    main()
