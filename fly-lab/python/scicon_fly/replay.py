"""Replay an exported episode, checking every action and policy observation."""
import argparse, json
from pathlib import Path
import pyarrow.parquet as pq
from .artifacts import LAB_ROOT, verify_export, source_identity, atomic_json
from .server import JsonProcess
from .watch import close_driver

def replay(path,allow_source_mismatch=False):
    path=Path(path).resolve()
    failures=verify_export(path)
    if failures:raise ValueError('Export checksum mismatch: '+', '.join(failures))
    config=json.loads((path/'config.json').read_text());metadata=json.loads((path/'metadata.json').read_text())
    actual=source_identity()
    if actual['sourceTreeHash']!=metadata['sourceTreeHash'] and not allow_source_mismatch:raise ValueError('Source identity differs; restore source.zip or explicitly request a diagnostic replay')
    driver=JsonProcess(['node',str(LAB_ROOT/'scripts'/'driver.mjs'),'--render-profile',config.get('renderProfile','swiftshader')],'replay')
    try:
        initial=driver.call({'op':'reset','seed':config['seed'],'episode':config['episode']})
        expected_runtime=json.loads((path/'runtime.json').read_text())
        if initial['runtimeIdentity']!=expected_runtime:raise ValueError('Chromium/render runtime differs from recorded runtime')
        expected_initial=json.loads((path/'initial.json').read_text())
        if initial['stateHash']!=expected_initial['stateHash'] or initial['observation']['sha256']!=expected_initial['observationHash'] or initial['frame']['sha256']!=expected_initial['frameHash']:raise ValueError('Initial state or pixels differ')
        rows=pq.read_table(path/'actions.parquet').to_pylist()
        for row in rows:
            result=driver.call({'op':'step','seq':row['seq'],'action':{'movement':row['movement'],'fire':row['fire']}})
            if result['stateHash']!=row['stateHash'] or result['observation']['sha256']!=row['observationHash'] or result['frame']['sha256']!=row['frameHash'] or result['eventsHash']!=row['eventsHash']:
                return {'passed':False,'decision':row['seq'],'tick':result['tick'],'stateMatched':result['stateHash']==row['stateHash'],'pixelsMatched':result['observation']['sha256']==row['observationHash']}
        return {'passed':True,'decisions':len(rows),'sourceMatched':actual['sourceTreeHash']==metadata['sourceTreeHash'],'runtime':expected_runtime}
    finally:close_driver(driver)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('experiment');parser.add_argument('--allow-source-mismatch',action='store_true');args=parser.parse_args()
    result=replay(args.experiment,args.allow_source_mismatch);print(json.dumps(result,indent=2));raise SystemExit(0 if result['passed'] else 1)
if __name__=='__main__':main()
