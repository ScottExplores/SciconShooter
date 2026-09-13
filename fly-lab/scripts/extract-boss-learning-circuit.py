"""Freeze real right beta'2a KC/MBON01/PAM02 nomination; no gameplay fitting."""
from pathlib import Path
import hashlib
import json
import sys

import numpy as np
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.feather as feather

LAB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LAB / "python"))
from scicon_fly.boss_learning import PARAMETERS, MODEL_VERSION, canonical


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def extract():
    compiled = LAB / "data/compiled/v1.0"
    manifest = json.loads((compiled / "manifest.json").read_text())
    graph_hash = digest(compiled / "graph.npz")
    if manifest.get("synthetic") is not False or graph_hash != manifest["graph_sha256"]:
        raise ValueError("Real graph provenance mismatch")
    raw = LAB / "data/raw/v1.0/body-annotations-male-cns-v1.0-minconf-0.5.feather"
    if digest(raw) != manifest["sources"]["annotations"]["sha256"]:
        raise ValueError("Raw annotation checksum mismatch")
    with np.load(compiled / "graph.npz", allow_pickle=False) as z:
        ids, types, sides, nts = z["ids"], z["neuron_types"], z["neuron_sides"], z["neurotransmitters"]
        p, indices, counts = z["indptr"], z["indices"], z["contacts"]
        lookup = {int(v): j for j, v in enumerate(ids)}
        mb = lookup[10013]
        if (str(types[mb]), str(sides[mb])) != ("MBON01", "R"):
            raise ValueError("Pinned MBON changed")
        dans = np.flatnonzero((types == "PAM02") & (sides == "R"))
        if len(dans) != 8 or any(nts[d] != "dopamine" for d in dans):
            raise ValueError("PAM02 nomination changed")
        dan_out = {int(d): {int(j): int(c) for j, c in zip(indices[p[d]:p[d+1]], counts[p[d]:p[d+1]])} for d in dans}
        edges, excluded = [], []
        for k in np.flatnonzero(np.char.startswith(types, "KCa'b'") & (sides == "R")):
            hit = np.flatnonzero(indices[p[k]:p[k+1]] == mb)
            if not len(hit):
                continue
            if len(hit) != 1 or nts[k] != "acetylcholine":
                raise ValueError("Unique acetylcholine KC connection required")
            contacts = [{"danId": str(int(ids[d])), "contacts": dan_out[int(d)][int(k)]} for d in dans if int(k) in dan_out[int(d)]]
            item = {"kcId": str(int(ids[k])), "kcType": str(types[k]), "mbonId": "10013", "contacts": int(counts[p[k]+hit[0]]), "danContacts": contacts}
            (edges if contacts else excluded).append(item)
        selected = {lookup[int(e["kcId"])] for e in edges} | {mb} | set(map(int, dans))
        pairs = {(lookup[int(e["kcId"])], mb) for e in edges}
        omitted = []
        for pre in sorted(selected):
            for post, c in zip(indices[p[pre]:p[pre+1]], counts[p[pre]:p[pre+1]]):
                if int(post) in selected and (pre, int(post)) not in pairs:
                    omitted.append([str(int(ids[pre])), str(int(ids[post])), int(c)])
        source_n, source_e = len(ids), len(indices)
        selected_ids = [int(ids[i]) for i in sorted(selected)]
    table = feather.read_table(raw)
    rows = table.filter(pc.is_in(table["bodyId"], value_set=pa.array(selected_ids))).select(["bodyId", "type", "instance", "somaSide", "somaLocation"]).to_pylist()
    neurons = [{"id": str(r["bodyId"]), "type": r["type"], "instance": r["instance"], "side": r["somaSide"], "soma": r["somaLocation"], "role": "MBON" if r["bodyId"] == 10013 else "DAN" if r["type"] == "PAM02" else "KC"} for r in rows]
    value = {"schemaVersion": 1, "modelVersion": MODEL_VERSION, "synthetic": False, "dataset": "MaleCNS v1.0",
             "parameters": PARAMETERS, "mbonId": "10013", "danIds": [n["id"] for n in neurons if n["role"] == "DAN"],
             "compartment": "beta-prime-2a", "neurons": neurons, "edges": edges,
             "neuronCount": len(neurons), "kcCount": len(edges), "contactCount": sum(e["contacts"] for e in edges),
             "danContactCount": sum(d["contacts"] for e in edges for d in e["danContacts"]),
             "graphSha256": graph_hash, "graphManifestSha256": digest(compiled / "manifest.json"), "rawSources": manifest["sources"],
             "sourceNeuronCount": source_n, "sourceEdgeCount": source_e,
             "excludedKcsWithoutObservedDanContact": excluded,
             "omittedInternalDirectedPairs": len(omitted), "omittedInternalContacts": sum(e[2] for e in omitted),
             "omittedInternalPairsSha256": hashlib.sha256(canonical(omitted).encode()).hexdigest(),
             "selection": "All right KCa'b'* acetylcholine cells with a positive directed edge to MBON01 body10013 and positive incoming edge from at least one right PAM02 dopamine cell. No contact threshold. Gamma KCs excluded because PAM02 compartment is beta'2a.",
             "boundary": "Only real KC->MBON contacts transmit rates. DAN->KC edges nominate plasticity, not measured receptor gain. Other internal/external edges, optic lobes and VNC excluded. Soma coordinates are not synapse locations; compartment membership is a type-level crosswalk, not synapse-localized verification.",
             "coordinateUnits": "Original released somaLocation coordinates,8nm voxels; displayed geometry must use declared affine mapping.",
             "sources": [
                 {"title": "MaleCNS v1.0 released annotations and connectivity", "url": "https://male-cns.janelia.org/download/"},
                 {"title": "Li et al2020 mushroom-body connectome type and compartment crosswalk", "url": "https://elifesciences.org/articles/62576"},
                 {"title": "McCurdy et al2021 PAM-beta'2a pairing depresses MBON-gamma5beta'2a cue responses", "url": "https://pubmed.ncbi.nlm.nih.gov/33602917/"},
             ]}
    target = LAB / "configs/boss-learning-circuit-v1.json"
    if target.exists():
        if json.loads(target.read_text()) != value:
            raise ValueError("Existing frozen circuit differs; do not overwrite")
    else:
        target.write_text(canonical(value)+"\n", encoding="utf-8")
    print(json.dumps({"path": str(target), "sha256": digest(target), "neurons": len(neurons), "kcs": len(edges), "kcContacts": value["contactCount"], "danContacts": value["danContactCount"]}))


if __name__ == "__main__":
    extract()
