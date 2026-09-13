"""Small adversarial fixtures; these do not download the production dataset."""
import base64
from email.message import Message
import hashlib
import io
import json
from pathlib import Path

import numpy as np
import pytest

from scicon_fly import data


def spec_for(payload: bytes):
    return {"filename": "fixture.feather", "url": "https://storage.googleapis.com/flyem-male-cns/v1.0/fixture.feather", "sha256": hashlib.sha256(payload).hexdigest(), "size_bytes": len(payload)}


def metadata_for(spec, payload):
    return {"url": spec["url"], "etag": '"test-object"', "generation": "123", "size_bytes": len(payload), "md5_base64": base64.b64encode(hashlib.md5(payload).digest()).decode()}


class Response(io.BytesIO):
    def __init__(self, payload, metadata, status=200, content_range=None):
        super().__init__(payload)
        self.status = status
        self.headers = Message()
        self.headers["ETag"] = metadata["etag"]
        self.headers["x-goog-generation"] = metadata["generation"]
        if content_range:
            self.headers["Content-Range"] = content_range


def test_neuron_inclusion_retains_uncertain_classes_excludes_glia():
    mask = data.neuron_mask(["cb_intrinsic", "vnc_tbc", "", "vnc_motor", "glia", "ENS"], ["Traced", "Assign", "Traced", "Glia", "Traced", "Anchor"])
    assert mask.tolist() == [True, True, False, False, False, True]


def test_sparse_contacts_preserve_weak_edges_autapses_and_merge_duplicates():
    ids = np.array([10, 20, 30], dtype=np.uint64)
    indptr, indices, contacts, counts = data.compile_csr(ids, [20, 10, 10, 30, 999], [10, 10, 10, 20, 10], [1, 2, 3, 4, 9])
    assert indptr.tolist() == [0, 1, 2, 3]
    assert indices.tolist() == [0, 0, 1]
    assert contacts.tolist() == [5, 1, 4]
    assert counts == {"input_rows": 5, "retained_rows": 4, "excluded_rows": 1, "merged_duplicate_rows": 1}


@pytest.mark.parametrize("contacts", [[0], [-1], [float("nan")], [0.5]])
def test_bad_contact_counts_rejected(contacts):
    with pytest.raises(ValueError, match="positive finite integers"):
        data.compile_csr([1, 2], [1], [2], contacts)


def test_unknown_and_modulatory_labels_are_not_invented_excitation():
    assert data.canonical_nt("unclear") == "unknown"
    config = data.read_json(data.DEFAULT_CONFIG)
    assert all(config["neurotransmitter_signs"][label] == 0 for label in ("unknown", "dopamine", "serotonin", "octopamine"))


def test_resumed_download_validates_range_and_atomically_promotes(tmp_path, monkeypatch):
    payload = b"a small immutable official fixture"
    spec = spec_for(payload)
    metadata = metadata_for(spec, payload)
    partial = tmp_path / "fixture.feather.part"
    partial.write_bytes(payload[:7])
    data.atomic_json(tmp_path / "fixture.feather.part.json", metadata)
    monkeypatch.setattr(data, "remote_metadata", lambda url: metadata)
    def open_response(request, timeout):
        assert request.get_header("Range") == "bytes=7-"
        return Response(payload[7:], metadata, 206, f"bytes 7-{len(payload) - 1}/{len(payload)}")
    monkeypatch.setattr(data.urllib.request, "urlopen", open_response)
    result = data.download_file(spec, tmp_path)
    assert result["sha256"] == spec["sha256"]
    assert (tmp_path / spec["filename"]).read_bytes() == payload
    assert not partial.exists()
    assert not (tmp_path / "fixture.feather.download.lock").exists()


def test_range_ignored_restarts_instead_of_appending(tmp_path, monkeypatch):
    payload = b"unchanged remote object"
    spec = spec_for(payload)
    metadata = metadata_for(spec, payload)
    (tmp_path / "fixture.feather.part").write_bytes(payload[:3])
    data.atomic_json(tmp_path / "fixture.feather.part.json", metadata)
    monkeypatch.setattr(data, "remote_metadata", lambda url: metadata)
    monkeypatch.setattr(data.urllib.request, "urlopen", lambda request, timeout: Response(payload, metadata))
    data.download_file(spec, tmp_path)
    assert (tmp_path / spec["filename"]).read_bytes() == payload


def test_source_identity_change_preserves_partial(tmp_path, monkeypatch):
    payload = b"unchanged object"
    spec = spec_for(payload)
    metadata = metadata_for(spec, payload)
    (tmp_path / "fixture.feather.part").write_bytes(payload[:3])
    data.atomic_json(tmp_path / "fixture.feather.part.json", {**metadata, "generation": "old"})
    monkeypatch.setattr(data, "remote_metadata", lambda url: metadata)
    with pytest.raises(ValueError, match="identity changed"):
        data.download_file(spec, tmp_path)
    assert (tmp_path / "fixture.feather.part").read_bytes() == payload[:3]
    assert not (tmp_path / spec["filename"]).exists()


def test_corrupt_existing_raw_is_never_replaced(tmp_path):
    payload = b"correct content"
    spec = spec_for(payload)
    metadata = metadata_for(spec, payload)
    path = tmp_path / spec["filename"]
    path.write_bytes(b"changed content")
    data.atomic_json(path.with_name(path.name + ".provenance.json"), {**metadata, "sha256": spec["sha256"]})
    with pytest.raises(ValueError, match="mismatch"):
        data.download_file(spec, tmp_path)
    assert path.read_bytes() == b"changed content"


def test_wrong_digest_never_promotes(tmp_path, monkeypatch):
    payload = b"data"
    spec = {**spec_for(payload), "sha256": "0" * 64}
    metadata = metadata_for(spec, payload)
    monkeypatch.setattr(data, "remote_metadata", lambda url: metadata)
    monkeypatch.setattr(data.urllib.request, "urlopen", lambda request, timeout: Response(payload, metadata))
    with pytest.raises(ValueError, match="SHA-256 mismatch"):
        data.download_file(spec, tmp_path)
    assert not (tmp_path / spec["filename"]).exists()
    assert (tmp_path / "fixture.feather.part").read_bytes() == payload


@pytest.mark.parametrize("filename", ["../escape.feather", "..\\escape.feather", "subdir/file.feather"])
def test_source_filename_cannot_escape_raw_directory(filename):
    with pytest.raises(ValueError, match="basename"):
        data.validate_source_spec({**spec_for(b"test"), "filename": filename})


def test_official_compiler_on_tiny_feather_fixture(tmp_path):
    import pyarrow as pa
    import pyarrow.feather as feather
    config = data.read_json(data.DEFAULT_CONFIG)
    config["dataset"] = "unit-test-synthetic:v1.0"
    config["synthetic"] = True
    raw = tmp_path / "raw" / "v1.0"
    raw.mkdir(parents=True)
    tables = {
        "annotations": pa.table({"bodyId": [10, 20, 30, 40, 99], "superclass": ["cb_intrinsic", "vnc_tbc", "descending_neuron", "cb_intrinsic", None], "status": ["Traced", "Assign", "Traced", "Glia", "Traced"], "type": ["KCg-d", "MBON01", "DNx01", "glial", "fragment"], "somaNeuromere": [None, "T1", None, None, None]}),
        "neurotransmitters": pa.table({"body": [10, 20, 30], "consensus_nt": ["acetylcholine", "unclear", "dopamine"]}),
        "weights": pa.table({"body_pre": [10, 20, 10, 30, 99], "body_post": [20, 30, 20, 30, 10], "weight": [2, 1, 3, 4, 9]}),
    }
    for name, table in tables.items():
        filename = config["files"][name]["filename"]
        path = raw / filename
        feather.write_feather(table, path)
        sha, md5, size = data.hash_file(path)
        config["files"][name].update(sha256=sha, size_bytes=size)
        data.atomic_json(path.with_name(filename + ".provenance.json"), {"url": config["files"][name]["url"], "sha256": sha, "md5_base64": md5, "size_bytes": size})
    config_path = tmp_path / "datasets.json"
    data.atomic_json(config_path, config)
    manifest = data.compile_dataset(config_path, tmp_path)
    assert manifest["synthetic"] is True
    assert manifest["counts"]["neurons"] == 3
    assert manifest["counts"]["directed_edges"] == 3
    assert manifest["counts"]["synaptic_contacts"] == 10
    assert manifest["counts"]["autapses"] == 1
    assert manifest["counts"]["merged_duplicate_rows"] == 1
    assert manifest["counts"]["zero_fast_sign_edges"] == 2
    assert manifest["counts"]["zero_fast_sign_contacts"] == 5
    with np.load(tmp_path / "compiled/v1.0/graph.npz", allow_pickle=False) as graph:
        assert graph["ids"].tolist() == [10, 20, 30]
        assert graph["signs"].tolist() == [1, 0, 0]
        assert graph["neuron_types"].tolist() == ["KCg-d", "MBON01", "DNx01"]
        assert graph["contacts"].dtype == np.uint32
    assert data.compile_dataset(config_path, tmp_path)["graph_sha256"] == manifest["graph_sha256"]
