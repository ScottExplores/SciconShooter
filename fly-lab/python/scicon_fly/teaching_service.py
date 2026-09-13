"""Bounded, append-only service for the explicitly synthetic teaching experiment."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from datetime import datetime, timezone

import psutil
from .artifacts import LAB_ROOT, atomic_json, source_identity

ROOT = LAB_ROOT / 'runtime' / 'teaching'


def request_config(body):
    if not isinstance(body, dict) or set(body) != {'requestId', 'seed', 'rewardedCue'}:
        raise ValueError('Expected a request ID, seed and rewarded cue')
    if not isinstance(body['requestId'], str) or not re.fullmatch(r'[a-f0-9]{32}', body['requestId']):
        raise ValueError('Invalid teaching request ID')
    if type(body['seed']) is not int or not 0 <= body['seed'] <= 4294967295:
        raise ValueError('Seed must be a whole number in [0,4294967295]')
    if body['rewardedCue'] not in ('A', 'B'):
        raise ValueError('Rewarded cue must be A or B')
    return dict(body)


def load_result(folder):
    record = json.loads((folder / 'record.json').read_text(encoding='utf-8'))
    result_bytes = (folder / 'result.json').read_bytes()
    if record['status'] != 'completed' or hashlib.sha256(result_bytes).hexdigest() != record['resultSha256']:
        raise ValueError('The saved teaching result failed its integrity check')
    return {'record': record, 'experiment': json.loads(result_bytes)}


def latest():
    pointer = ROOT / 'latest.json'
    if not pointer.exists():
        return None
    value = json.loads(pointer.read_text(encoding='utf-8'))
    run_id = value.get('requestId', '')
    if not re.fullmatch(r'[a-f0-9]{32}', run_id):
        raise ValueError('Invalid saved teaching identifier')
    return load_result(ROOT / run_id)


def run(body):
    config = request_config(body)
    folder = ROOT / config['requestId']
    if folder.exists():
        record = json.loads((folder / 'record.json').read_text(encoding='utf-8'))
        if record['config'] != config:
            raise ValueError('Request ID already belongs to different settings')
        if record['status'] != 'completed':
            raise ValueError('This attempt is incomplete or failed; its evidence is preserved. Use a new request ID.')
        return load_result(folder)
    folder.mkdir(parents=True, exist_ok=False)
    identity = source_identity()
    record = {'schemaVersion': 1, 'status': 'running', 'config': config,
              'createdAt': datetime.now(timezone.utc).isoformat(),
              'classification': 'SYNTHETIC_TEACHING_EXPERIMENT',
              'sourceTreeHash': identity['sourceTreeHash'], 'gitCommit': identity['gitCommit']}
    atomic_json(folder / 'record.json', record)
    # The source snapshot covers only this small demonstrator and its dependencies.
    source_names = ['teaching.py', 'teaching_service.py', 'plasticity.py', 'model.py']
    snapshot = folder / 'source'
    snapshot.mkdir()
    record['sourceFiles'] = {}
    for name in source_names:
        data = (Path(__file__).parent / name).read_bytes()
        (snapshot / name).write_bytes(data)
        record['sourceFiles'][name] = hashlib.sha256(data).hexdigest()
    atomic_json(folder / 'record.json', record)
    env = os.environ.copy()
    env.update(PYTHONPATH=str(LAB_ROOT / 'python'), PYTHONUNBUFFERED='1')
    for key in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS', 'NUMEXPR_NUM_THREADS', 'VECLIB_MAXIMUM_THREADS', 'BLIS_NUM_THREADS'):
        env[key] = '2'
    started = time.monotonic()
    peak, samples, observed_ids = 0, 0, set()
    process, owner = None, None
    try:
        with (folder / 'worker.log').open('w', encoding='utf-8') as log:
            process = subprocess.Popen([sys.executable, '-m', 'scicon_fly.teaching', '--seed', str(config['seed']),
                                        '--rewarded-cue', config['rewardedCue'], '--output', str(folder / 'result.json')],
                                       cwd=LAB_ROOT, env=env, stdout=log, stderr=log,
                                       creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            owner = psutil.Process(process.pid)
            while process.poll() is None:
                try:
                    members = [owner, *owner.children(recursive=True)]
                    rss = 0
                    for member in members:
                        try:
                            rss += member.memory_info().rss
                            observed_ids.add(member.pid)
                        except psutil.NoSuchProcess:
                            pass
                    peak, samples = max(peak, rss), samples + 1
                    if rss > 4 * 1024 ** 3 or time.monotonic() - started > 180:
                        for member in reversed(members):
                            try:
                                member.kill()
                            except psutil.NoSuchProcess:
                                pass
                        process.wait(timeout=10)
                        raise RuntimeError('Teaching worker exceeded its 4 GiB sampled-memory or 3-minute budget')
                except psutil.NoSuchProcess:
                    break
                time.sleep(.05)
            if process.wait() != 0:
                raise RuntimeError('Teaching calculation failed; its worker log is preserved')
        if identity['sourceTreeHash'] != source_identity()['sourceTreeHash']:
            raise RuntimeError('Source changed during the calculation; result is not accepted')
        result = (folder / 'result.json').read_bytes()
        json.loads(result)
        record.update(status='completed', resultSha256=hashlib.sha256(result).hexdigest())
    except Exception as error:
        record.update(status='failed', error=str(error))
        # Monitoring and I/O failures must not release admission while an owned
        # simulation keeps running. The Popen handle also covers an inaccessible
        # psutil process tree without broad system-wide process enumeration.
        if process is not None and process.poll() is None:
            try:
                if owner is not None:
                    for child in reversed(owner.children(recursive=True)):
                        try:
                            child.kill()
                        except psutil.Error:
                            pass
            except psutil.Error:
                pass
            try:
                process.kill()
                process.wait(timeout=10)
            except (OSError, subprocess.TimeoutExpired) as cleanup_error:
                record['cleanupError'] = str(cleanup_error)
        raise
    finally:
        record['completedAt'] = datetime.now(timezone.utc).isoformat()
        record['resources'] = {'wallSeconds': time.monotonic() - started, 'sampledPeakRssBytes': peak,
                               'samples': samples, 'processes': len(observed_ids), 'numericalThreads': 2,
                               'scope': 'Owned worker process tree; sampled RSS is not an OS allocation ceiling.'}
        atomic_json(folder / 'record.json', record)
    atomic_json(ROOT / 'latest.json', {'requestId': config['requestId']})
    return load_result(folder)
