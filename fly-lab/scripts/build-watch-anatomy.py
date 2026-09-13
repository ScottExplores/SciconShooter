"""Build an honest lightweight MaleCNS anatomy preview from cached release data.

No inferred coordinates, connectivity, activity, or external downloads. Run with
fly-lab's Python venv after official annotation and graph ingestion.
"""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import numpy as np
import pyarrow.feather as feather

LAB = Path(__file__).resolve().parents[1]
MAX_POINTS = 45_000


def sha256(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def build():
    configuration = json.loads((LAB / 'configs/datasets.json').read_text())
    source = configuration['files']['annotations']
    paths = list((LAB / 'data/raw').rglob(source['filename']))
    if len(paths) != 1:
        raise ValueError('Exactly one cached official annotation file is required')
    annotation_path = paths[0]
    if sha256(annotation_path) != source['sha256']:
        raise ValueError('Official annotation hash does not match the pinned manifest')
    graph_path = LAB / 'data/compiled/v1.0/graph.npz'
    with np.load(graph_path, allow_pickle=False) as graph:
        retained = set(graph['ids'].tolist())
    columns = ['bodyId', 'somaLocation', 'superclass']
    rows = feather.read_table(annotation_path, columns=columns).to_pylist()
    rows = [r for r in rows if r['bodyId'] in retained and isinstance(r['somaLocation'], list)
            and len(r['somaLocation']) == 3 and np.isfinite(r['somaLocation']).all()]
    # Hash ordering avoids preferentially selecting older/lower body IDs. One
    # original soma per 3-D spatial bin retains distributed anatomical coverage.
    rows.sort(key=lambda r: hashlib.sha256(str(r['bodyId']).encode('ascii')).digest())

    def select(width):
        occupied = {}
        for row in rows:
            key = tuple(int(p) // width for p in row['somaLocation'])
            if key not in occupied:
                occupied[key] = row
        return list(occupied.values())

    # Freeze an integer voxel width; points themselves are never moved or averaged.
    width = 64
    selected = select(width)
    while len(selected) > MAX_POINTS:
        width += 16
        selected = select(width)
    selected.sort(key=lambda r: r['bodyId'])
    classes = sorted({r['superclass'] for r in selected})
    original_positions = np.asarray([r['somaLocation'] for r in rows], dtype=np.int64)
    skeleton_source = LAB / 'data/compiled/morphology.json'
    skeletons = []
    if skeleton_source.is_file():
        morphology = json.loads(skeleton_source.read_text())
        if morphology.get('units') != 'nm' or morphology.get('dataset') != configuration['dataset']:
            raise ValueError('Cached skeleton coordinate frame is incompatible')
        for neuron in morphology['neurons']:
            if neuron['id'] not in ('10001', '164190'):
                continue
            skeletons.append({'id': neuron['id'], 'type': neuron['type'], 'source': neuron['source'],
                              'positions': [round(v / 8, 5) for p in neuron['points'] for v in p],
                              'segments': [v for segment in neuron['segments'] for v in segment]})
    result = {
        'schemaVersion': 1,
        'dataset': configuration['dataset'],
        'classification': 'STATIC_ANATOMICAL_PREVIEW',
        'source': {'url': source['url'], 'sha256': source['sha256'], 'page': configuration['source_page']},
        'license': configuration['license'], 'attribution': configuration['attribution'],
        'coordinateSpace': 'Male CNS EM', 'coordinateUnits': '8 nm voxels',
        'retainedNeuronCount': len(retained), 'availableSomaCount': len(rows),
        'displayedSomaCount': len(selected),
        'selection': {'method': 'One unchanged soma per spatial bin; lowest SHA256(body ID) wins',
                      'voxelWidth': width, 'maximumPoints': MAX_POINTS,
                      'missingPositions': 'Omitted; never inferred', 'graphFileSha256': sha256(graph_path)},
        'bounds': {'min': original_positions.min(0).tolist(), 'max': original_positions.max(0).tolist()},
        'classes': classes,
        'bodyIds': [str(r['bodyId']) for r in selected],
        'positions': [int(v) for r in selected for v in r['somaLocation']],
        'classIndices': [classes.index(r['superclass']) for r in selected],
        'skeletons': skeletons,
        'skeletonProvenance': {'path': 'data/compiled/morphology.json', 'sha256': sha256(skeleton_source)} if skeletons else None,
        'displayMeaning': 'Cell-body locations plus two source skeleton samples. Camera rotation only; no simulated neural activity.',
    }
    output = LAB / 'src/watch-soma.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(result, separators=(',', ':'), ensure_ascii=True) + '\n'
    if len(serialized.encode()) > 3_000_000:
        raise ValueError('Anatomical preview exceeds its 3 MB payload budget')
    output.write_text(serialized, encoding='utf8')
    print(json.dumps({'output': str(output), 'bytes': output.stat().st_size,
                      'displayedSomas': len(selected), 'availableSomas': len(rows),
                      'spatialBinWidthVoxels': width, 'skeletons': len(skeletons),
                      'sha256': sha256(output)}, indent=2))


if __name__ == '__main__':
    build()
