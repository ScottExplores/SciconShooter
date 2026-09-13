"""Recover a crashed attempt's durable journal into a separate diagnostic export.

The original directory is never altered. Recovery never claims completed data.
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import pyarrow as pa
import pyarrow.parquet as pq
from .artifacts import atomic_json


def recover(source,destination):
    source=Path(source).resolve();destination=Path(destination).resolve()
    if not (source/'journal.jsonl').is_file():raise ValueError('Missing durable experiment journal')
    if destination==source or destination.is_relative_to(source):raise ValueError('Recovery destination must be separate from the source')
    if destination.exists():raise ValueError('Recovery destination must be new')
    records=[];incomplete_tail=False
    with (source/'journal.jsonl').open(encoding='utf8') as stream:
        for line in stream:
            try:row=json.loads(line)
            except ValueError:incomplete_tail=True;break
            if row['action']['seq']!=len(records)+1:raise ValueError('Journal sequence has a gap; manual investigation required')
            records.append(row)
    observations=[];observation_error=None
    try:
        with gzip.open(source/'observations.jsonl.gz','rt',encoding='utf8') as stream:
            for line in stream:observations.append(json.loads(line))
    except (OSError,EOFError,ValueError) as error:observation_error=str(error)
    destination.mkdir(parents=True)
    # Preserve all original evidence, including partial gzip/Parquet files.
    shutil.copytree(source,destination/'original')
    for name,rows in [('actions',[r['action'] for r in records]),('rewards',[{'tick':r['action']['tick'],'reward':float(r['reward'])} for r in records]),
                      ('events',[{'tick':r['action']['tick'],'payload':json.dumps(e,sort_keys=True)} for r in records for e in r.get('events',[])])]:
        if rows:pq.write_table(pa.Table.from_pylist(rows),destination/(name+'.parquet'),compression='zstd')
    with gzip.open(destination/'readable-observations.jsonl.gz','wt',encoding='utf8') as stream:
        for observation in observations:stream.write(json.dumps(observation)+'\n')
    report={'status':'INTERRUPTED_RECOVERY','evidence':'INSUFFICIENT EVIDENCE','source':str(source),
            'completeJournalDecisions':len(records),'incompleteJournalTail':incomplete_tail,'readableObservations':len(observations),
            'observationReadError':observation_error,'missingObservationTicks':[r['action']['tick'] for r in records if r['action']['tick'] not in {o['tick'] for o in observations}],
            'originalChecksumsPresent':(source/'checksums.json').exists(),'eligibleForCompletedStudyAnalysis':False}
    atomic_json(destination/'recovery.json',report)
    atomic_json(destination/'recovery-checksums.json',{p.relative_to(destination).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in destination.rglob('*') if p.is_file()})
    return report


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('source');parser.add_argument('destination');args=parser.parse_args()
    print(json.dumps(recover(args.source,args.destination),indent=2))


if __name__=='__main__':main()
