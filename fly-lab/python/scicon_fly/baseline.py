"""Bounded, reproducible game baselines; no neural worker or learning claim.

Owns a separate Coordinator/Chromium instance and never resets the dashboard's
episode. Completed records appear in the existing experiment library. Requires
the private lab web server for canonical assets. The budget is checked between
synchronous commands; one in-flight command may exceed it by its timeout.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import platform
import time

import psutil
import pyarrow.parquet as pq

from .artifacts import LAB_ROOT, atomic_json, digest, source_identity, verify_export


def plan(spec):
    if spec.get('schemaVersion') != 1 or spec.get('purpose') != 'ENGINEERING_BASELINE_NOT_LEARNING':
        raise ValueError('An explicit version 1 engineering baseline protocol is required')
    if spec.get('scenario') != 'operation-open-galaxy' or spec.get('conditions') != ['idle', 'random']:
        raise ValueError('Baseline compares idle and random movement in ORBIT ENTRY only')
    seeds = spec.get('seeds')
    if not isinstance(seeds, list) or not 1 <= len(seeds) <= 20 or any(type(s) is not int or not 0 <= s < 2**32 for s in seeds) or len(set(seeds)) != len(seeds):
        raise ValueError('Use 1..20 distinct uint32 development seeds')
    seconds = spec.get('timeLimitSeconds')
    if type(seconds) is not int or not 1 <= seconds <= 90:
        raise ValueError('Episode duration must be 1..90 integer seconds')
    if spec.get('constantFire') is not True:
        raise ValueError('Both conditions must use constant fire to isolate movement')
    if spec.get('renderProfile') not in ('swiftshader', 'local-d3d11'):
        raise ValueError('Select an explicit supported rendering profile')
    if not spec.get('seedRole', '').startswith('development-only'):
        raise ValueError('Baseline seeds must be reserved for development')
    episodes = []
    for index, seed in enumerate(seeds):
        # Counterbalance order without selecting it from observed scores.
        for controller in (['idle', 'random'] if index % 2 == 0 else ['random', 'idle']):
            episodes.append({'index': len(episodes), 'controller': controller, 'seed': seed})
    return {'schemaVersion': 1, 'protocol': spec, 'protocolHash': digest(spec), 'episodes': episodes,
            'maximumSimulatedSeconds': len(episodes) * seconds, 'evidence': 'INSUFFICIENT EVIDENCE'}


def inspect_episode(path, row, spec):
    """Validate completed exports before including their descriptive endpoints."""
    path = Path(path)
    required = {'config.json', 'summary.json', 'metadata.json', 'runtime.json', 'actions.parquet',
                'neural-summary.parquet', 'synaptic-changes.parquet', 'source.zip', 'initial.json',
                'observations.jsonl.gz', 'events.parquet', 'rewards.parquet'}
    checksums = json.loads((path / 'checksums.json').read_text())
    if not isinstance(checksums, dict) or not required <= checksums.keys():
        raise ValueError('Baseline export checksum manifest omits required evidence')
    failures = verify_export(path)
    if failures:
        raise ValueError('Baseline export checksum mismatch: ' + ', '.join(failures))
    read = lambda name: json.loads((path / name).read_text())
    config, summary, metadata = read('config.json'), read('summary.json'), read('metadata.json')
    if summary.get('status') != 'completed' or metadata.get('status') != 'completed':
        raise ValueError('An interrupted attempt cannot count as a completed baseline')
    expected = {'controller': row['controller'], 'seed': row['seed'], 'constantFire': True,
                'renderProfile': spec['renderProfile'], 'reinforcementProtocol': 'none', 'phase': 'evaluation'}
    if any(config.get(key) != value for key, value in expected.items()):
        raise ValueError('Recorded baseline condition differs from its frozen schedule')
    if config.get('episode', {}).get('timeLimitSeconds') != spec['timeLimitSeconds'] or config.get('episode', {}).get('levelId') != spec['scenario']:
        raise ValueError('Recorded scenario/horizon differs from the baseline protocol')
    if config.get('study', {}).get('protocolHash') != digest(spec):
        raise ValueError('Recorded baseline protocol hash differs')
    actions = pq.read_table(path / 'actions.parquet').to_pylist()
    if not actions or len(actions) != summary['decisions'] or any(not action['fire'] for action in actions):
        raise ValueError('Missing decisions or nonconstant firing in baseline export')
    if row['controller'] == 'idle' and any(action['movement'] != 'idle' for action in actions):
        raise ValueError('Idle condition contains movement')
    if pq.read_table(path / 'neural-summary.parquet').num_rows or pq.read_table(path / 'synaptic-changes.parquet').num_rows:
        raise ValueError('Engineering baselines must contain no neural activity or plasticity')
    switches = sum(a['movement'] != b['movement'] for a, b in zip(actions, actions[1:]))
    return {**row, 'runId': path.name, 'score': summary['score'], 'kills': summary['kills'],
            'livesRemaining': summary['lives'], 'recordedOutcomeReward': summary['reward'],
            'simulatedSeconds': summary['simTimeMs'] / 1000, 'decisions': len(actions),
            'movingFraction': sum(a['movement'] != 'idle' for a in actions) / len(actions),
            'movementSwitches': switches, 'fireFraction': 1.0,
            'sourceTreeHash': metadata['sourceTreeHash'], 'gitCommit': metadata['gitCommit'],
            'runtimeHash': digest(read('runtime.json')), 'exportChecksumManifestHash': digest(read('checksums.json'))}


def sampled_process_tree_rss():
    """Sum RSS, not unique physical memory; excludes the separate Vite server."""
    process = psutil.Process()
    total = 0
    for child in [process, *process.children(recursive=True)]:
        try:
            total += child.memory_info().rss
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    return total


def execute(spec, output, *, maximum_wall_minutes, coordinator_factory=None, clock=time.monotonic):
    schedule = plan(spec)
    if not math.isfinite(maximum_wall_minutes) or maximum_wall_minutes <= 0:
        raise ValueError('A finite positive wall-clock budget is required')
    if coordinator_factory is None:
        from .server import Coordinator
        coordinator_factory = Coordinator
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    atomic_json(output / 'schedule.json', schedule)
    source = source_identity()
    atomic_json(output / 'source-identity.json', source)
    atomic_json(output / 'machine.json', {'platform': platform.platform(), 'python': platform.python_version(),
                'logicalCpus': psutil.cpu_count(), 'ramBytes': psutil.virtual_memory().total,
                'memoryMetric': 'Between-command sampled sum of RSS for this Python process and children; shared pages may be counted more than once; Vite/dashboard excluded'})
    started = clock()
    records = []
    coordinator = coordinator_factory()
    active = None
    def check_budget():
        if clock() - started >= maximum_wall_minutes * 60:
            raise TimeoutError('Declared baseline budget exhausted; unfinished attempts are not completed results')
    try:
        for row in schedule['episodes']:
            check_budget()
            active = dict(row)
            episode_started = clock()
            coordinator.reset({'controller': row['controller'], 'seed': row['seed'], 'phase': 'evaluation',
                               'timeLimitSeconds': spec['timeLimitSeconds'], 'constantFire': True,
                               'renderProfile': spec['renderProfile'],
                               'study': {'id': spec['id'], 'purpose': spec['purpose'], 'protocolHash': schedule['protocolHash'], **row}})
            active['runId'] = coordinator.run_id
            peak_rss = sampled_process_tree_rss()
            loop_started = clock()
            while coordinator.status != 'completed':
                check_budget()
                if coordinator.status in ('error', 'interrupted', 'stopped', 'cancelled'):
                    raise RuntimeError(coordinator.error or 'Baseline episode interrupted')
                coordinator.step()
                peak_rss = max(peak_rss, sampled_process_tree_rss())
            loop_wall = clock() - loop_started
            record = inspect_episode(coordinator.writer.path, row, spec)
            if record['sourceTreeHash'] != source['sourceTreeHash'] or source_identity()['sourceTreeHash'] != source['sourceTreeHash']:
                raise ValueError('Source changed during baseline batch')
            if records and record['runtimeHash'] != records[0]['runtimeHash']:
                raise ValueError('Runtime/asset identity changed during baseline batch')
            record.update(wallSeconds=clock() - episode_started, decisionLoopWallSeconds=loop_wall,
                          sampledPeakProcessTreeRssBytes=peak_rss,
                          wallSecondsPerSimulatedSecond=loop_wall / record['simulatedSeconds'])
            records.append(record)
            atomic_json(output / 'episodes.json', records)
            atomic_json(output / 'progress.json', {'status': 'running', 'completed': len(records), 'planned': len(schedule['episodes']), 'lastRunId': record['runId']})
            print(json.dumps({'completed': len(records), 'planned': len(schedule['episodes']), **record}), flush=True)
        result = {'status': 'completed', 'purpose': spec['purpose'], 'evidence': 'INSUFFICIENT EVIDENCE',
                  'completed': len(records), 'wallSeconds': clock() - started, 'episodes': records,
                  'interpretation': 'Descriptive development baseline only. No neural worker, learning, trained replicas, or inferential tests. Reward is an outcome ledger, not delivered reinforcement.',
                  'throughputMetric': 'Decision loop includes stepping, recording, finalization and between-command process-tree sampling; excludes reset and post-run integrity verification. Not a pure engine or neural benchmark.'}
        atomic_json(output / 'results.json', result)
        atomic_json(output / 'progress.json', {'status': 'completed', 'completed': len(records), 'planned': len(schedule['episodes'])})
        return result
    except BaseException as error:
        atomic_json(output / 'interrupted.json', {'status': 'interrupted', 'error': str(error), 'completed': len(records),
                    'activeAttempt': active, 'time': datetime.now(timezone.utc).isoformat(), 'evidence': 'INSUFFICIENT EVIDENCE'})
        raise
    finally:
        try:
            driver = getattr(coordinator, 'driver', None)
            if driver:
                from .watch import close_driver
                try:
                    close_driver(driver)
                finally:
                    coordinator.driver = None
        finally:
            coordinator.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('protocol')
    parser.add_argument('--output', required=True)
    parser.add_argument('--max-wall-minutes', type=float, required=True)
    args = parser.parse_args()
    execute(json.loads(Path(args.protocol).read_text()), args.output, maximum_wall_minutes=args.max_wall_minutes)


if __name__ == '__main__':
    main()
