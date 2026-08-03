const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');
const loadCommonJsModule = (relativePath, dependencies, globals = {}) => {
  const filename = path.join(root, relativePath);
  const moduleBox = { exports: {} };
  const localRequire = (request) => (
    Object.prototype.hasOwnProperty.call(dependencies, request)
      ? dependencies[request]
      : require(request)
  );
  const factory = vm.runInNewContext(
    `(function(exports, require, module, __filename, __dirname) {${read(...relativePath.split('/'))}\n})`,
    { Buffer, console, process, ...globals },
    { filename }
  );
  factory(moduleBox.exports, localRequire, moduleBox, filename, path.dirname(filename));
  return moduleBox.exports;
};

const {
  BASE_CHAIN_ID,
  RSC_CONTINUE_RECIPIENT_ADDRESS,
  RSC_CONTRACT_ADDRESS
} = require('../api/_lib/walletPurchaseCatalog');

const WALLET = '0x1111111111111111111111111111111111111111';
const OTHER_WALLET = '0x2222222222222222222222222222222222222222';
const RUN_ID = '123e4567-e89b-42d3-a456-426614174111';
const ORDER_ID = '123e4567-e89b-42d3-a456-426614174222';
const HASH = `0x${'ab'.repeat(32)}`;
const NOW = 2_000_000_000_000;

const orderFor = ({
  continueSequence = 1,
  status = 'quoted',
  walletAddress = WALLET,
  runId = RUN_ID,
  orderId = ORDER_ID,
  transactionHash = HASH,
  logIndex = 7
} = {}) => ({
  order_id: orderId,
  run_id: runId,
  wallet_address: walletAddress,
  continue_sequence: continueSequence,
  chain_id: BASE_CHAIN_ID,
  token_address: RSC_CONTRACT_ADDRESS,
  recipient_address: RSC_CONTINUE_RECIPIENT_ADDRESS,
  amount_raw: (5_000_000_000_000_000_000n * BigInt(continueSequence)).toString(),
  lives_reward: 5,
  status,
  expires_at: new Date(NOW + 15 * 60 * 1000).toISOString(),
  transaction_hash: status === 'fulfilled' ? transactionHash : null,
  log_index: status === 'fulfilled' ? logIndex : null,
  created_at: new Date(NOW).toISOString(),
  updated_at: new Date(NOW).toISOString(),
  fulfilled_at: status === 'fulfilled' ? new Date(NOW + 60_000).toISOString() : null
});

const loadContinuePayments = ({ fetchSupabaseJson, runStart = {} }) => loadCommonJsModule(
  'api/_lib/continuePayments.js',
  {
    crypto: require('node:crypto'),
    './supabase': {
      fetchSupabaseJson,
      supabaseHeaders: (headers = {}) => headers
    },
    './walletProfileAuth': require('../api/_lib/walletProfileAuth'),
    './runReceipts': {
      verifyRunStart: () => ({
        runId: RUN_ID,
        runMode: 'standard',
        testRun: false,
        expiresAt: NOW + 60 * 60 * 1000,
        identity: { kind: 'guest' },
        ...runStart
      })
    },
    './walletPurchaseCatalog': require('../api/_lib/walletPurchaseCatalog')
  }
);

const transferLog = async ({
  from = WALLET,
  to = RSC_CONTINUE_RECIPIENT_ADDRESS,
  continueSequence = 1,
  logIndex = 7
} = {}) => {
  const { encodeAbiParameters, encodeEventTopics } = await import('viem');
  const abi = [{
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false }
    ]
  }];
  return {
    address: RSC_CONTRACT_ADDRESS,
    topics: encodeEventTopics({ abi, eventName: 'Transfer', args: { from, to } }),
    data: encodeAbiParameters(
      [{ type: 'uint256' }],
      [5_000_000_000_000_000_000n * BigInt(continueSequence)]
    ),
    logIndex
  };
};

const publicClientFor = ({ chainId = BASE_CHAIN_ID, status = 'success', logs = [] } = {}) => ({
  getChainId: async () => chainId,
  getTransactionReceipt: async () => ({ status, logs, blockNumber: 100n }),
  getBlock: async () => ({ timestamp: BigInt(Math.floor((NOW + 60_000) / 1000)) })
});

test('Continue quotes derive the next escalating price from server history', async () => {
  let inserted = null;
  const payments = loadContinuePayments({
    fetchSupabaseJson: async (requestPath, options = {}) => {
      if (requestPath.includes('wallet_address=neq.')) return [];
      if (requestPath.includes('status=eq.fulfilled')) {
        return [orderFor({ continueSequence: 2, status: 'fulfilled' })];
      }
      if (requestPath.includes('status=eq.quoted') && !options.method) return [];
      if (options.method === 'POST') {
        inserted = JSON.parse(options.body);
        return [{
          ...inserted,
          transaction_hash: null,
          log_index: null,
          fulfilled_at: null
        }];
      }
      throw new Error(`Unexpected Continue quote request: ${requestPath}`);
    }
  });

  const quote = await payments.createContinuePaymentQuote({
    address: WALLET,
    startToken: 'signed-server-run-start',
    now: NOW
  });
  assert.equal(quote.runId, RUN_ID);
  assert.equal(quote.continueSequence, 3);
  assert.equal(quote.rscAmount, '15');
  assert.equal(quote.rscAmountRaw, '15000000000000000000');
  assert.equal(quote.livesReward, 5);
  assert.equal(quote.recipientAddress, RSC_CONTINUE_RECIPIENT_ADDRESS);
  assert.equal(inserted.continue_sequence, 3);
  assert.equal(inserted.amount_raw, '15000000000000000000');
});

test('Continue quote authorization rejects self-payment and a wallet-bound run mismatch', async () => {
  let reads = 0;
  const fetchSupabaseJson = async () => {
    reads += 1;
    return [];
  };
  const selfPayments = loadContinuePayments({ fetchSupabaseJson });
  await assert.rejects(
    selfPayments.createContinuePaymentQuote({
      address: RSC_CONTINUE_RECIPIENT_ADDRESS,
      startToken: 'signed-run',
      now: NOW
    }),
    (error) => error.code === 'continue_payment_self_payment_forbidden'
  );

  const mismatchedPayments = loadContinuePayments({
    fetchSupabaseJson,
    runStart: {
      identity: { kind: 'wallet', walletAddress: OTHER_WALLET }
    }
  });
  await assert.rejects(
    mismatchedPayments.createContinuePaymentQuote({
      address: WALLET,
      startToken: 'signed-run',
      now: NOW
    }),
    (error) => error.code === 'continue_payment_wallet_mismatch'
  );
  assert.equal(reads, 0, 'authorization must fail before touching the Continue ledger');
});

test('Continue quotes reuse and renew the unique server order for a run sequence', async () => {
  const expired = {
    ...orderFor({ continueSequence: 1 }),
    created_at: new Date(NOW - 20 * 60 * 1000).toISOString(),
    expires_at: new Date(NOW - 1).toISOString()
  };
  let patchCount = 0;
  let insertCount = 0;
  const payments = loadContinuePayments({
    fetchSupabaseJson: async (requestPath, options = {}) => {
      if (requestPath.includes('wallet_address=neq.')) return [];
      if (requestPath.includes('status=eq.fulfilled')) return [];
      if (requestPath.includes('status=eq.quoted') && !options.method) return [expired];
      if (options.method === 'PATCH') {
        patchCount += 1;
        return [{ ...expired, ...JSON.parse(options.body) }];
      }
      if (options.method === 'POST') insertCount += 1;
      return [];
    }
  });
  const quote = await payments.createContinuePaymentQuote({
    address: WALLET,
    startToken: 'signed-run',
    now: NOW
  });
  assert.equal(quote.orderId, ORDER_ID);
  assert.ok(Date.parse(quote.expiresAt) > NOW);
  assert.equal(patchCount, 1);
  assert.equal(insertCount, 0);
});

test('Continue receipt verification requires one exact Base RSC transfer in the quote window', async () => {
  const payments = loadContinuePayments({ fetchSupabaseJson: async () => [] });
  const order = orderFor({ continueSequence: 2 });
  const exactLog = await transferLog({ continueSequence: 2 });
  assert.deepEqual(
    JSON.parse(JSON.stringify(await payments.verifyContinuePaymentReceipt({
      order,
      transactionHash: HASH,
      publicClient: publicClientFor({ logs: [exactLog] })
    }))),
    {
      transactionHash: HASH,
      logIndex: 7,
      paymentBlockTime: new Date(NOW + 60_000).toISOString()
    }
  );
  await assert.rejects(
    payments.verifyContinuePaymentReceipt({
      order,
      transactionHash: HASH,
      publicClient: publicClientFor({ chainId: 84532, logs: [exactLog] })
    }),
    /Base mainnet/
  );
  await assert.rejects(
    payments.verifyContinuePaymentReceipt({
      order,
      transactionHash: HASH,
      publicClient: publicClientFor({ logs: [await transferLog({ continueSequence: 1 })] })
    }),
    /exactly one matching/
  );
  await assert.rejects(
    payments.verifyContinuePaymentReceipt({
      order,
      transactionHash: HASH,
      publicClient: publicClientFor({ logs: [exactLog, { ...exactLog, logIndex: 8 }] })
    }),
    /exactly one matching/
  );
});

test('Continue settlement revives only after the atomic receipt RPC fulfills the order', async () => {
  let order = orderFor({ continueSequence: 2 });
  let rpcCalls = 0;
  const payments = loadContinuePayments({
    fetchSupabaseJson: async (requestPath) => {
      if (requestPath.startsWith('rpc/scicon_settle_continue_payment')) {
        rpcCalls += 1;
        order = {
          ...order,
          status: 'fulfilled',
          transaction_hash: HASH,
          log_index: 7,
          fulfilled_at: new Date(NOW + 90_000).toISOString()
        };
        return {
          accepted: true,
          duplicate: false,
          orderId: ORDER_ID,
          runId: RUN_ID,
          continueSequence: 2,
          livesReward: 5
        };
      }
      if (requestPath.includes(`order_id=eq.${ORDER_ID}`)) return [{ ...order }];
      throw new Error(`Unexpected Continue settlement request: ${requestPath}`);
    }
  });
  const settlement = await payments.settleContinuePayment({
    address: WALLET,
    orderId: ORDER_ID,
    transactionHash: HASH,
    publicClient: publicClientFor({ logs: [await transferLog({ continueSequence: 2 })] })
  });
  assert.equal(settlement.accepted, true);
  assert.equal(settlement.duplicate, false);
  assert.equal(settlement.continueSequence, 2);
  assert.equal(settlement.rscAmount, '10');
  assert.equal(settlement.livesReward, 5);
  assert.equal(rpcCalls, 1);

  const duplicate = await payments.settleContinuePayment({
    address: WALLET,
    orderId: ORDER_ID,
    transactionHash: HASH,
    publicClient: {
      getChainId: async () => { throw new Error('duplicate must not re-read Base'); }
    }
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(rpcCalls, 1);
});

test('Continue API and client are authenticated, same-origin, resumable, and share the routed function budget', async () => {
  const routeSource = read('api', '_lib', 'continuePaymentRoute.js');
  const serverSource = read('api', '_lib', 'continuePayments.js');
  const clientSource = read('services', 'continuePaymentService.ts');
  const pendingSource = read('services', 'continuePaymentPendingStore.ts');
  const runtimeSource = read('components', 'WalletRuntime.tsx');
  const appSource = read('App.tsx');
  const mintRouter = read('api', 'mint-records.js');
  const vercel = read('vercel.json');
  const runReceipts = read('api', '_lib', 'runReceipts.js');

  assert.match(routeSource, /assertSameOrigin\(req\)/);
  assert.match(routeSource, /readWalletProfileSession\(req\)/);
  assert.match(routeSource, /address: session\.walletAddress/);
  assert.match(serverSource, /verifyRunStart\(startToken\)/);
  assert.match(serverSource, /continueSequence\) \* BigInt|CONTINUE_COST_STEP_RAW \* BigInt\(continueSequence\)/);
  assert.match(serverSource, /recipientAddress !== RSC_CONTINUE_RECIPIENT_ADDRESS/);
  assert.match(serverSource, /recipientAddress === walletAddress/);
  assert.match(serverSource, /rpc\/\$\{SETTLE_CONTINUE_PAYMENT_RPC\}/);
  assert.match(runReceipts, /verifyRunStart/);
  assert.match(clientSource, /loadAuthenticatedWalletProfile\(walletAddress, \{ interactive: true \}\)/);
  assert.match(clientSource, /resumePendingContinuePayment/);
  assert.match(clientSource, /const settlement = await settleContinuePayment/);
  assert.match(pendingSource, /callsId/);
  assert.match(pendingSource, /transactionHash/);
  assert.match(runtimeSource, /const settlement = await executeContinuePayment/);
  assert.match(runtimeSource, /onContinueSuccess\(settlement\)/);
  assert.match(appSource, /setContinuesUsed\(settlement\.continueSequence\)/);
  assert.match(appSource, /lives: settlement\.livesReward/);
  assert.match(mintRouter, /route === 'continue-payments'/);
  assert.match(vercel, /"source": "\/api\/continue-payments"[\s\S]*?"destination": "\/api\/mint-records\?route=continue-payments"/);
  assert.equal(
    fs.readdirSync(path.join(root, 'api')).filter((name) => name.endsWith('.js')).length,
    12,
    'Continue routing must not exceed the Vercel Hobby function limit'
  );

  const route = loadCommonJsModule('api/_lib/continuePaymentRoute.js', {
    './walletProfileAuth': {
      assertSameOrigin: () => undefined,
      readWalletProfileSession: () => ({ walletAddress: WALLET })
    },
    './rateLimit': { checkRateLimit: () => ({ allowed: true }) },
    './continuePayments': {
      createContinuePaymentQuote: async () => {
        throw Object.assign(new Error('Supabase private constraint detail'), { statusCode: 400 });
      },
      settleContinuePayment: async () => null
    }
  }, { console: { error: () => undefined } });
  const response = {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = body; }
  };
  await route({ method: 'POST', headers: {}, body: { action: 'quote', startToken: 'x' } }, response);
  assert.equal(response.statusCode, 400);
  assert.deepEqual(JSON.parse(response.body), { error: 'Continue payment request failed.' });
  assert.doesNotMatch(response.body, /Supabase|constraint/i);
});
