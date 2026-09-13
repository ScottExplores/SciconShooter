"""Display-only image-change signals derived from verified recorded observations.

This module runs no game engine or neural model and never changes an export.
The signal measures pixel change, not biological sensing or neural activity.
"""
from __future__ import annotations
import argparse
import base64
import hashlib
import json
import threading
from collections import OrderedDict
from copy import deepcopy
from pathlib import Path
import gzip
import numpy as np
import pyarrow.parquet as pq
from .artifacts import verify_export

WIDTH, HEIGHT, GAIN = 96, 208, 8
PIXELS = WIDTH * HEIGHT
MAX_DECISIONS = 1800
MAX_RECORD_BYTES = 65536
REQUIRED_FILES = {'initial.json', 'actions.parquet', 'observations.jsonl.gz'}
_CACHE = OrderedDict()
_CACHE_LOCK = threading.RLock()


def decode_gray(observation, expected_hash=None):
    if not isinstance(observation, dict):
        raise ValueError('Recorded observation must be an object')
    if type(observation.get('width')) is not int or type(observation.get('height')) is not int:
        raise ValueError('Recorded observation dimensions must be integers')
    if (observation['width'], observation['height']) != (WIDTH, HEIGHT):
        raise ValueError('Recorded observation must be 96 by 208 pixels')
    encoded = observation.get('grayBase64')
    if not isinstance(encoded, str) or len(encoded) > MAX_RECORD_BYTES:
        raise ValueError('Invalid recorded grayscale encoding')
    try:
        gray = base64.b64decode(encoded, validate=True)
    except (ValueError, TypeError) as error:
        raise ValueError('Invalid recorded grayscale encoding') from error
    if len(gray) != PIXELS:
        raise ValueError('Recorded grayscale byte count does not match its shape')
    actual = hashlib.sha256(gray).hexdigest()
    if actual != observation.get('sha256') or (expected_hash is not None and actual != expected_hash):
        raise ValueError('Recorded grayscale hash differs from the sealed observation hash')
    return gray


def gray_change(previous, current):
    before = np.frombuffer(previous, dtype=np.uint8).astype(np.int16)
    after = np.frombuffer(current, dtype=np.uint8).astype(np.int16)
    total = int(np.abs(after - before).sum(dtype=np.int64))
    return min(1.0, max(0.0, total * GAIN / (PIXELS * 255)))


def input_change(previous_observation, current_observation):
    """The same validated pixel-change function for atomic live snapshots."""
    return gray_change(decode_gray(previous_observation), decode_gray(current_observation))


def derive_signals(experiment):
    path = Path(experiment).resolve(strict=True)
    required_checksums(path)
    failures = verify_export(path)
    if failures:
        raise ValueError('Export checksum mismatch: ' + ', '.join(failures))
    initial = json.loads((path / 'initial.json').read_text(encoding='utf8'))
    parquet = pq.ParquetFile(path / 'actions.parquet')
    if not 0 <= parquet.metadata.num_rows <= MAX_DECISIONS:
        raise ValueError('Observation sidecars are limited to 1800 decisions')
    actions = parquet.read(columns=['seq', 'tick', 'observationHash']).to_pylist()
    if any(type(row['seq']) is not int for row in actions) or [row['seq'] for row in actions] != list(range(1, len(actions) + 1)):
        raise ValueError('Recorded action sequence is not contiguous')
    expected = [{'seq': 0, 'tick': initial['tick'], 'observationHash': initial['observationHash']}, *actions]
    if expected[0]['tick'] != 0 or any(type(row['tick']) is not int for row in expected):
        raise ValueError('Recorded ticks must start at zero and be integers')
    if any(current['tick'] <= previous['tick'] for previous, current in zip(expected, expected[1:])):
        raise ValueError('Recorded ticks are not strictly increasing')
    frames = []
    previous_gray = None
    with gzip.open(path / 'observations.jsonl.gz', 'rb') as stream:
        for row in expected:
            line = stream.readline(MAX_RECORD_BYTES + 1)
            if not line:
                raise ValueError('Recorded observations end before the action timeline')
            if len(line) > MAX_RECORD_BYTES:
                raise ValueError('Recorded observation exceeds the bounded record size')
            observation = json.loads(line)
            if type(observation.get('tick')) is not int or observation['tick'] != row['tick']:
                raise ValueError('Recorded observation order/tick differs from the action timeline')
            gray = decode_gray(observation, row['observationHash'])
            change = 0.0 if previous_gray is None else gray_change(previous_gray, gray)
            frames.append({'seq': row['seq'], 'tick': row['tick'], 'inputChange': change})
            previous_gray = gray
        if stream.read(1):
            raise ValueError('Recorded observations contain extra frames after the action timeline')
    return {'version': 1, 'source': 'recorded-grayscale', 'gain': GAIN, 'frames': frames}


def required_checksums(path):
    checksums_path = path / 'checksums.json'
    checksums_bytes = checksums_path.read_bytes()
    checksums = json.loads(checksums_bytes)
    if not isinstance(checksums, dict):
        raise ValueError('Invalid export checksum manifest')
    missing = REQUIRED_FILES.difference(checksums)
    if missing:
        raise ValueError('Required observation files are absent from checksums.json: ' + ', '.join(sorted(missing)))
    return checksums_bytes, checksums


def export_fingerprint(path):
    checksums_bytes, checksums = required_checksums(path)
    stamps = []
    for name in sorted(checksums):
        target = (path / name).resolve(strict=True)
        if not target.is_relative_to(path) or not target.is_file():
            raise ValueError('Invalid export checksum path')
        stat = target.stat()
        stamps.append((name, str(target), stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns))
    return hashlib.sha256(checksums_bytes).hexdigest(), tuple(stamps)


def get_signals(experiment):
    """Bounded in-memory cache; changing any sealed file invalidates verification."""
    path = Path(experiment).resolve(strict=True)
    with _CACHE_LOCK:
        before = export_fingerprint(path)
        cached = _CACHE.get(path)
        if cached is not None and cached[0] == before:
            _CACHE.move_to_end(path)
            return deepcopy(cached[1])
        result = derive_signals(path)
        if export_fingerprint(path) != before:
            raise ValueError('Export changed while deriving its display signal')
        _CACHE[path] = (before, result)
        _CACHE.move_to_end(path)
        while len(_CACHE) > 8:
            _CACHE.popitem(last=False)
        return deepcopy(result)


def main():
    parser = argparse.ArgumentParser(description='Derive display-only image change from verified recorded grayscale frames')
    parser.add_argument('experiment', type=Path)
    args = parser.parse_args()
    try:
        result = get_signals(args.experiment)
    except (OSError, ValueError, KeyError) as error:
        parser.exit(1, 'Cannot derive input signals: {}\n'.format(error))
    print(json.dumps(result, separators=(',', ':'), allow_nan=False))


if __name__ == '__main__':
    main()
