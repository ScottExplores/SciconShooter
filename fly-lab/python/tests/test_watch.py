import base64
import hashlib
import json
import threading
from copy import deepcopy
from pathlib import Path
import pyarrow as pa
import pyarrow.parquet as pq
import pytest
from scicon_fly import watch


def digest(data):return hashlib.sha256(data).hexdigest()

@pytest.fixture
def recording(tmp_path,monkeypatch):
    run=tmp_path/'experiments'/'run-1';run.mkdir(parents=True)
    runtime={'assetProvenanceVersion':'intercepted-response-bytes-v1','assetHash':'fixture-assets'}
    results=[];actions=[]
    for seq in range(3):
        png=b'PNG fixture '+bytes([seq])
        result={'tick':seq*3,'simTimeMs':seq*50,'stateHash':f'state-{seq}','eventsHash':f'events-{seq}',
                'runtimeIdentity':runtime,'observation':{'sha256':f'gray-{seq}'},
                'frame':{'pngDataUrl':'data:image/png;base64,'+base64.b64encode(png).decode(),'sha256':digest(png),'width':390,'height':844},
                'state':{'score':seq*10,'lives':3,'enemiesDefeated':seq,'player':{'x':20+seq,'y':30,'width':10,'height':12},
                         'runtime':{'waveNumber':1,'waveName':'Fixture'}}}
        results.append(result)
        actions.append({'seq':seq,'tick':result['tick'],'stateHash':result['stateHash'],'frameHash':digest(png),
                        'observationHash':result['observation']['sha256'],'eventsHash':result['eventsHash'],
                        'movement':'E','fire':bool(seq%2)})
    for name,value in {'metadata.json':{'sourceTreeHash':'fixture-source','gitCommit':'fixture-commit'},
                       'config.json':{'controller':'random','seed':1,'episode':{'timeLimitSeconds':1}},
                       'runtime.json':runtime,'initial.json':actions[0],
                       'summary.json':{'status':'completed','score':20,'lives':3,'kills':2}}.items():
        (run/name).write_text(json.dumps(value))
    pq.write_table(pa.Table.from_pylist(actions[1:]),run/'actions.parquet')
    pq.write_table(pa.Table.from_pylist([{'tick':3,'reward':1.},{'tick':6,'reward':1.}]),run/'rewards.parquet')
    pq.write_table(pa.Table.from_pylist([],schema=pa.schema([('tick',pa.int64()),('payload',pa.string())])),run/'neural-summary.parquet')
    (run/'checksums.json').write_text(json.dumps({p.name:digest(p.read_bytes()) for p in run.iterdir()}))
    monkeypatch.setattr(watch,'source_identity',lambda:{'sourceTreeHash':'fixture-source'})
    return run,results,actions


class Driver:
    def __init__(self,results):self.results=deepcopy(results);self.requests=[];self.closed=False
    def call(self,command,**kwargs):
        self.requests.append(command)
        if command['op']=='close':return {'closed':True}
        return self.results[0 if command['op']=='reset' else command['seq']]
    def close(self):self.closed=True


class Encoder:
    instances=[]
    version='fixture encoder'
    def __init__(self,path):self.path=Path(path);self.frames=[];self.closed=False;self.instances.append(self)
    def write(self,png):self.frames.append(png)
    def finish(self):self.path.write_bytes(b''.join(self.frames))
    def close(self):self.closed=True


def test_byte_ranges_support_browser_seek_and_reject_ambiguous_requests():
    assert watch.byte_range(None,100)==(0,99,False)
    assert watch.byte_range('bytes=12-24',100)==(12,24,True)
    assert watch.byte_range('bytes=98-',100)==(98,99,True)
    assert watch.byte_range('bytes=-10',100)==(90,99,True)
    assert watch.byte_range('bytes=0-999',100)==(0,99,True)
    for value in ('bytes=100-','bytes=2-1','bytes=-0','bytes=-','bytes=0-1,3-4','items=0-1'):
        with pytest.raises(ValueError):watch.byte_range(value,100)


def test_player_trail_uses_real_ship_center_and_missing_data_stays_unavailable():
    assert watch.player_center({'player':{'x':20,'y':30,'width':10,'height':12}})=={'x':25,'y':36}
    assert watch.player_center({}) is None
    assert watch.compact_neural(None) is None
    assert watch.compact_neural({'spikes':2,'privateLargeArray':[1,2]})=={'spikes':2}


def test_strict_source_and_export_checks_fail_before_starting_engine(recording,tmp_path,monkeypatch):
    run,results,_=recording;launches=[]
    def factory(profile):launches.append(profile);return Driver(results)
    monkeypatch.setattr(watch,'source_identity',lambda:{'sourceTreeHash':'wrong-source'})
    with pytest.raises(ValueError,match='Source identity differs'):
        watch.build_preview(run,tmp_path/'cache-a',factory,encoder_factory=Encoder)
    monkeypatch.setattr(watch,'source_identity',lambda:{'sourceTreeHash':'fixture-source'})
    (run/'summary.json').write_text('{}')
    with pytest.raises(ValueError,match='Export checksum mismatch'):
        watch.build_preview(run,tmp_path/'cache-b',factory,encoder_factory=Encoder)
    assert launches==[]


def test_verified_frames_timeline_and_provenance_publish_only_after_complete_replay(recording,tmp_path):
    run,results,_=recording;driver=Driver(results);progress=[]
    manifest=watch.build_preview(run,tmp_path/'cache',lambda _:driver,lambda **values:progress.append(values),encoder_factory=Encoder)
    assert manifest['verification']['decisions']==2
    assert manifest['controllerLabel']=='Random baseline' and manifest['neuralRecorded'] is False
    assert manifest['displayOnly'] and manifest['media']['durationSeconds']==.15
    timeline=json.loads((tmp_path/'cache'/'timeline.json').read_text())
    assert [row['videoTimeSeconds'] for row in timeline]==[0,.05,.1]
    assert [(row['movement'],row['fire']) for row in timeline]==[('idle',False),('E',True),('E',False)]
    assert timeline[-1]['player']=={'x':27,'y':36} and timeline[-1]['totalReward']==2
    assert all(row['neural'] is None for row in timeline)
    assert progress[-1]=={'done':2,'total':2}
    assert len(Encoder.instances[-1].frames)==3 and Encoder.instances[-1].closed
    assert driver.closed and driver.requests[-1]=={'op':'close'}


@pytest.mark.parametrize('corruption',['state','png','runtime'])
def test_mismatched_results_never_publish_a_cache(recording,tmp_path,corruption):
    run,results,_=recording;driver=Driver(results)
    if corruption=='state':driver.results[1]['stateHash']='changed'
    elif corruption=='png':driver.results[1]['frame']['pngDataUrl']='data:image/png;base64,Y2hhbmdlZA=='
    else:driver.results[1]['runtimeIdentity']={'assetHash':'changed'}
    folder=tmp_path/'failed'
    with pytest.raises(ValueError):watch.build_preview(run,folder,lambda _:driver,encoder_factory=Encoder)
    assert not (folder/'manifest.json').exists()
    assert driver.closed and Encoder.instances[-1].closed


def test_cancellation_releases_driver_and_encoder_without_publishing(recording,tmp_path):
    run,results,_=recording;driver=Driver(results);cancel=threading.Event()
    class CancellingEncoder(Encoder):
        def write(self,png):super().write(png);cancel.set()
    with pytest.raises(watch.PreviewCancelled):
        watch.build_preview(run,tmp_path/'cancelled',lambda _:driver,cancel=cancel,encoder_factory=CancellingEncoder)
    assert driver.closed and Encoder.instances[-1].closed
    assert not (tmp_path/'cancelled'/'manifest.json').exists()


def test_cache_reads_do_not_start_engine_and_detect_tampering(recording,tmp_path):
    run,results,_=recording;library=watch.WatchLibrary(run.parent,tmp_path/'watch')
    assert library.catalog('fixture-source')['runs'][0]['status']=='not-built'
    assert library.thread is None
    folder=library.cache/'run-1-fixture'
    watch.build_preview(run,folder,lambda _:Driver(results),encoder_factory=Encoder)
    watch.atomic_json(library.cache/'index.json',{'run-1':{'folder':folder.name,'sha256':watch.file_hash(folder/'manifest.json')}})
    assert library.catalog('fixture-source')['runs'][0]['status']=='ready'
    assert library.manifest('run-1')['verification']['passed']
    assert library.artifact('run-1','replay.mp4')[0]==folder/'replay.mp4'
    assert library.thread is None
    (folder/'replay.mp4').write_bytes(b'tampered')
    with pytest.raises(ValueError,match='checksum mismatch'):library.artifact('run-1','replay.mp4')
    with pytest.raises(ValueError):library.artifact('run-1','../../private.txt')
    with pytest.raises(ValueError):library.run('../run-1')


def test_live_frames_are_tied_to_snapshot_and_only_three_are_retained(tmp_path):
    class Coordinator:
        lock=threading.Lock();running=True;status='running';run_id='run-1';seq=1
        config={'controller':'random'};action={'movement':'NW','fire':True};neural_summary=None;error=None
        watch_snapshot={'seq':1,'action':{'movement':'E','fire':False},'neural':None}
        latest={'tick':3,'simTimeMs':50,'state':{'score':1,'lives':3,'enemiesDefeated':1},
                'frame':{'pngDataUrl':'data:image/png;base64,cG5n'}}
    library=watch.WatchLibrary(tmp_path/'experiments',tmp_path/'cache');coordinator=Coordinator()
    snapshot=library.live(coordinator)
    assert snapshot['frameUrl'].endswith('/run-1-1.png') and snapshot['neural'] is None
    assert snapshot['action']=={'movement':'E','fire':False}
    assert 'state' not in snapshot and 'history' not in snapshot
    assert library.live_frame('run-1-1')==b'png'
    for seq in range(2,5):coordinator.seq=seq;coordinator.watch_snapshot={**coordinator.watch_snapshot,'seq':seq};library.live(coordinator)
    assert library.live_frame('run-1-1') is None and len(library.live_frames)==3


def test_http_watch_read_seek_head_and_admission_are_safe(recording,tmp_path,monkeypatch):
    import http.client
    from http.server import ThreadingHTTPServer
    from scicon_fly import server
    run,results,_=recording;library=watch.WatchLibrary(run.parent,tmp_path/'watch')
    folder=library.cache/'run-1-http'
    watch.build_preview(run,folder,lambda _:Driver(results),encoder_factory=Encoder)
    watch.atomic_json(library.cache/'index.json',{'run-1':{'folder':folder.name,'sha256':watch.file_hash(folder/'manifest.json')}})
    monkeypatch.setattr(server,'WATCH',library)
    httpd=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
    thread=threading.Thread(target=httpd.serve_forever,daemon=True);thread.start()
    def request(method,path,headers=None):
        connection=http.client.HTTPConnection('127.0.0.1',httpd.server_port,timeout=3)
        connection.request(method,path,headers=headers or {})
        response=connection.getresponse();body=response.read();result=response.status,dict(response.getheaders()),body
        connection.close();return result
    try:
        status,headers,body=request('GET','/watch/run-1/replay.mp4',{'Range':'bytes=1-5'})
        assert status==206 and body==(folder/'replay.mp4').read_bytes()[1:6]
        assert headers['Content-Range'].startswith('bytes 1-5/')
        assert request('HEAD','/watch/run-1/replay.mp4')[2]==b''
        assert request('GET','/watch/run-1/replay.mp4',{'Range':'bytes=999999-'})[0]==416
        assert request('GET','/watch/run-1/replay.mp4',{'If-None-Match':headers['ETag']})[0]==304
        assert json.loads(request('GET','/watch')[2])['runs'][0]['status']=='ready'
        assert library.thread is None
        assert request('POST','/watch/demo')[0]==403
        library.job={'status':'building','done':0,'total':1}
        status,_,body=request('POST','/start',{'X-Scicon-Lab':'1'})
        assert status==400 and b'watch demo/replay build is active' in body
    finally:httpd.shutdown();httpd.server_close();thread.join(timeout=3)
