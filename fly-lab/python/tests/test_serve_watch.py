import gzip
import hashlib
import http.client
import importlib.util
import json
import sys
import threading
from pathlib import Path
import pytest

spec=importlib.util.spec_from_file_location('scicon_portable_watch_server',Path(__file__).resolve().parents[2]/'scripts'/'serve-watch.py')
portable=importlib.util.module_from_spec(spec)
sys.modules[spec.name]=portable
spec.loader.exec_module(portable)


@pytest.fixture
def bundle(tmp_path):
    files={'index.html':b'<html>Portable display</html>',
           'assets/app.js':b'export const value=42;\n'*10000,
           'timeline.json':json.dumps([{'tick':i,'movement':'N'} for i in range(10000)]).encode(),
           'replay.mp4':bytes(range(256))*4096,
           'serve-watch.py':b'print("not downloadable")'}
    for name,body in files.items():
        path=tmp_path/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(body)
    (tmp_path/'secret.txt').write_text('unlisted file')
    (tmp_path/'checksums.json').write_text(json.dumps({name:hashlib.sha256(body).hexdigest() for name,body in files.items()}))
    return tmp_path,files


def test_package_verifies_all_hashes_and_never_exposes_unlisted_files_or_source(bundle):
    root,files=bundle;package=portable.VerifiedPackage(root)
    assert package.verified_count==5
    assert package.find('secret.txt') is None
    assert package.find('serve-watch.py') is None
    assert package.find('../secret.txt') is None
    assert package.find('assets/app.js').compressed is not None
    (root/'serve-watch.py').write_text('modified source')
    with pytest.raises(ValueError,match='checksum mismatch'):portable.VerifiedPackage(root)


def test_manifest_escape_and_changed_package_files_are_rejected(bundle):
    root,files=bundle;package=portable.VerifiedPackage(root)
    (root/'index.html').write_text('changed')
    with pytest.raises(ValueError,match='Package file changed'):package.find('index.html')
    (root/'checksums.json').write_text(json.dumps({'../escape.txt':'0'*64}))
    with pytest.raises(ValueError,match='Invalid checksums'):portable.VerifiedPackage(root)


def test_range_and_encoding_negotiation():
    assert portable.parse_range(None,100)==(0,99,False)
    assert portable.parse_range('bytes=90-',100)==(90,99,True)
    assert portable.parse_range('bytes=-10',100)==(90,99,True)
    assert portable.parse_range('bytes=1-999',100)==(1,99,True)
    for value in ('bytes=100-','bytes=2-1','bytes=-0','bytes=1-2,3-4','bytes=-'):
        with pytest.raises(ValueError):portable.parse_range(value,100)
    assert portable.accepts_gzip('gzip, deflate')
    assert not portable.accepts_gzip('gzip;q=0, *;q=1')
    assert not portable.accepts_gzip('gzip;q=invalid')


def test_http_gzip_streams_ranges_head_cache_and_read_only_policy(bundle):
    root,files=bundle
    server=portable.WatchServer(('127.0.0.1',0),portable.VerifiedPackage(root))
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    def request(method,path,headers=None):
        connection=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=3)
        connection.request(method,path,headers=headers or {})
        response=connection.getresponse();body=response.read();result=response.status,dict(response.getheaders()),body
        connection.close();return result
    try:
        assert request('GET','/')[2]==files['index.html']
        for name in ('assets/app.js','timeline.json'):
            for _ in range(5):
                status,headers,body=request('GET','/'+name,{'Accept-Encoding':'gzip'})
                assert status==200 and headers['Content-Encoding']=='gzip'
                assert headers['Connection']=='close' and gzip.decompress(body)==files[name]
                assert len(body)==int(headers['Content-Length'])
            assert request('GET','/'+name,{'Accept-Encoding':'gzip','If-None-Match':headers['ETag']})[0]==304
        status,headers,body=request('GET','/replay.mp4',{'Range':'bytes=17-65539'})
        assert status==206 and body==files['replay.mp4'][17:65540]
        assert headers['Content-Range']=='bytes 17-65539/1048576'
        assert request('HEAD','/replay.mp4',{'Range':'bytes=17-65539'})[2]==b''
        assert request('GET','/replay.mp4',{'Range':'bytes=1048576-'})[0]==416
        assert request('GET','/secret.txt')[0]==404
        assert request('GET','/serve-watch.py')[0]==404
        assert request('GET','/assets/')[0]==404
        assert request('GET','/%2e%2e/secret.txt')[0]==404
        assert request('GET','/',{'Host':'untrusted.example'})[0]==403
        for method in ('POST','PUT','PATCH','DELETE','OPTIONS'):
            assert request(method,'/')[0]==405
    finally:server.shutdown();server.server_close();thread.join(timeout=3)
