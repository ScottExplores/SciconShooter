const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const runId = '11111111-2222-4333-8444-555555555555';
const address = '0x1111111111111111111111111111111111111111';
const callsId = `0x${'12'.repeat(32)}`;
const transactionHash = `0x${'ab'.repeat(32)}`;
const pendingKey = `scicon_pending_mission_mint:${runId}`;

const loadRecordMintService = ({ responses, pending = null }) => {
  const source = fs.readFileSync(path.join(root, 'services', 'recordMintService.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText.replaceAll('import.meta.env', '({ VITE_PAYMASTER_PROXY_URL: "" })');
  const storedValues = new Map();
  if (pending) storedValues.set(pendingKey, JSON.stringify(pending));
  const queuedResponses = [...responses];
  const fetchCalls = [];

  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    console,
    localStorage: {
      getItem: (key) => storedValues.get(key) ?? null,
      setItem: (key, value) => storedValues.set(key, value),
      removeItem: (key) => storedValues.delete(key)
    },
    fetch: async (url, options) => {
      fetchCalls.push({ url, options });
      const payload = queuedResponses.shift();
      if (payload === undefined) throw new Error(`Unexpected mint request: ${url}`);
      return {
        ok: true,
        status: 200,
        json: async () => payload
      };
    },
    require: (specifier) => {
      if (specifier === 'viem') return { encodeFunctionData: () => '0x' };
      if (specifier === './sciconRecordsAbi') return { sciconRecordsAbi: [] };
      if (specifier === './baseAccountWallet') {
        return {
          waitForBaseCallsTransaction: async () => transactionHash,
          sendAttributedBaseCalls: async ({ onSubmitted }) => {
            onSubmitted(callsId);
            return transactionHash;
          }
        };
      }
      throw new Error(`Unexpected dependency: ${specifier}`);
    }
  };
  vm.runInNewContext(compiled, context);
  return {
    mintMissionRecord: module.exports.mintMissionRecord,
    storedValues,
    fetchCalls
  };
};

const receipt = { runId, receiptToken: 'signed-run-receipt' };

test('a false 200 recovery response keeps the submitted mint pending for retry', async () => {
  const harness = loadRecordMintService({
    pending: { address, callsId, sponsored: false },
    responses: [{ confirmed: false }]
  });

  await assert.rejects(
    harness.mintMissionRecord({ address, receipt }),
    /confirmation is still pending/i
  );

  const retained = JSON.parse(harness.storedValues.get(pendingKey));
  assert.equal(retained.callsId, callsId);
  assert.equal(retained.transactionHash, transactionHash);
  assert.equal(harness.fetchCalls.length, 1);
});

test('a malformed 200 fresh-confirmation response preserves the new pending mint', async () => {
  const harness = loadRecordMintService({
    responses: [
      {
        contractAddress: address,
        runId: `0x${'34'.repeat(32)}`,
        score: 1234,
        wave: 4,
        visualSeed: '42',
        tokenUri: 'https://www.sciconshooter.xyz/api/record-card/test',
        expiresAt: 1_900_000_000,
        signature: `0x${'56'.repeat(65)}`,
        sponsoredEligible: false
      },
      {}
    ]
  });

  await assert.rejects(
    harness.mintMissionRecord({ address, receipt }),
    /confirmation is still pending/i
  );

  const retained = JSON.parse(harness.storedValues.get(pendingKey));
  assert.equal(retained.callsId, callsId);
  assert.equal(retained.transactionHash, transactionHash);
  assert.equal(harness.fetchCalls.length, 2);
});

test('an exact confirmed response clears the pending mint and returns its token', async () => {
  const harness = loadRecordMintService({
    pending: { address, callsId, transactionHash, sponsored: true },
    responses: [{ confirmed: true, tokenId: '42' }]
  });

  const result = await harness.mintMissionRecord({ address, receipt });

  assert.equal(result.tokenId, '42');
  assert.equal(result.transactionHash, transactionHash);
  assert.equal(harness.storedValues.has(pendingKey), false);
});
