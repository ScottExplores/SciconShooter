const test = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');

const modulePromise = import('../scripts/driver.mjs');
const assetUrl = new URL('http://127.0.0.1:5180/game-art/test.png');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function fixture({body=Buffer.from([137,80,78,71,13,10]), status=200, method='GET', url=assetUrl}={}) {
  const calls = {};
  const route = {
    request:() => ({method:() => method, url:() => url.href,
      headers:() => ({'if-none-match':'old','If-Modified-Since':'yesterday',range:'bytes=0-0','accept-encoding':'gzip'})}),
    continue:async () => { calls.continued = true; },
    fetch:async options => {
      calls.fetch = options;
      return {status:() => status, url:() => url.href, body:async () => body,
        headers:() => ({'content-type':'image/png','content-length':'999','content-encoding':'gzip','transfer-encoding':'chunked'}),
        dispose:async () => {calls.disposed=true;}};
    },
    fulfill:async options => {calls.fulfilled = options;},
  };
  return {route,calls,body,url};
}

test('asset provenance hashes the exact nonempty bytes fulfilled to the browser', async () => {
  const {AssetByteLedger} = await modulePromise;
  const ledger = new AssetByteLedger();
  const f = fixture();
  await ledger.serve(f.route,f.url);
  const manifest = ledger.snapshot();
  assert.equal(manifest.assetProvenanceVersion,'intercepted-response-bytes-v1');
  assert.equal(manifest.assetManifest[f.url.pathname],digest(f.body));
  assert.equal(manifest.assetByteLengths[f.url.pathname],f.body.length);
  assert.deepEqual(f.calls.fulfilled.body,f.body);
  assert.equal(f.calls.fulfilled.headers['content-length'],String(f.body.length));
  assert.equal(f.calls.fulfilled.headers['content-encoding'],undefined);
  assert.equal(f.calls.fulfilled.headers['transfer-encoding'],undefined);
  assert.deepEqual(f.calls.fetch.headers,{'accept-encoding':'identity'});
  assert.equal(f.calls.fetch.maxRedirects,0);
  assert.equal(f.calls.disposed,true);
});

test('HEAD and rejected empty/304/redirect/error replies cannot overwrite a known asset', async () => {
  const {AssetByteLedger} = await modulePromise;
  const ledger = new AssetByteLedger();
  const original = fixture();
  await ledger.serve(original.route,original.url);
  const before = ledger.snapshot();
  const head = fixture({method:'HEAD',body:Buffer.alloc(0)});
  await ledger.serve(head.route,head.url);
  assert.equal(head.calls.continued,true);
  assert.equal(head.calls.fetch,undefined);
  for (const options of [{body:Buffer.alloc(0)},{status:304},{status:302},{status:404},{status:206}]) {
    const f=fixture(options);
    await assert.rejects(ledger.serve(f.route,f.url),/Empty asset body|complete HTTP 200/);
    assert.equal(f.calls.fulfilled,undefined);
    assert.equal(f.calls.disposed,true);
  }
  assert.deepEqual(ledger.snapshot(),before);
});

test('asset bytes cannot change within a session and the episode manifest stays sealed', async () => {
  const {AssetByteLedger} = await modulePromise;
  const ledger = new AssetByteLedger();
  const original = fixture();
  await ledger.serve(original.route,original.url);
  ledger.sealed=true;
  const before=ledger.snapshot();
  await ledger.serve(original.route,original.url);
  const changed=fixture({body:Buffer.from('different image')});
  await assert.rejects(ledger.serve(changed.route,changed.url),/bytes changed/);
  const late=fixture({url:new URL('/game-art/late.png',assetUrl)});
  await assert.rejects(ledger.serve(late.route,late.url),/not loaded before/);
  assert.deepEqual(ledger.snapshot(),before);
  ledger.sealed=false;
  await ledger.serve(late.route,late.url);
  assert.equal(Object.keys(ledger.snapshot().assetManifest).length,2);
});

test('asset fulfillment failure cannot add a phantom manifest entry', async () => {
  const {AssetByteLedger} = await modulePromise;
  const ledger = new AssetByteLedger();
  const f=fixture();
  f.route.fulfill=async () => {throw new Error('connection closed');};
  await assert.rejects(ledger.serve(f.route,f.url),/connection closed/);
  assert.deepEqual(ledger.snapshot().assetManifest,{});
  assert.equal(f.calls.disposed,true);
});
