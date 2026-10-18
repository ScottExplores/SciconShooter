import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const loadService = (name, dependencies, globals = {}) => {
  const source = fs.readFileSync(new URL(`../../services/${name}.ts`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const loaded = [];
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    ...globals,
    require(specifier) {
      loaded.push(specifier);
      if (!(specifier in dependencies)) throw new Error(`Unexpected eager dependency: ${specifier}`);
      return dependencies[specifier];
    }
  };
  vm.runInNewContext(compiled, context);
  return { service: module.exports, loaded };
};

const address = '0x1111111111111111111111111111111111111111';

test('cached identity remains a validated hint without initializing the wallet SDK', () => {
  const { service, loaded } = loadService('baseAccountCache', {
    '../constants': { STORAGE_KEYS: { WALLET_ADDRESS: 'wallet' } }
  });
  assert.equal(service.readCachedBaseAccount({ getItem: () => ` ${address} ` }), address);
  assert.equal(service.readCachedBaseAccount({ getItem: () => 'not-an-address' }), null);
  assert.equal(service.readCachedBaseAccount({ getItem() { throw new Error('storage disabled'); } }), null);
  assert.equal(service.readCachedBaseAccount(null), null);
  assert.equal(service.parseBaseAccountAccounts([address, 'invalid']), null);
  assert.deepEqual(loaded, ['../constants']);
});

test('wallet quota reads neither initialize payment code nor request interactive authentication', async () => {
  let authenticationCalls = 0;
  const { service, loaded } = loadService('walletPurchaseService', {
    '../constants': { DONATION_CONFIG: {}, RSC_PURCHASE_SKUS: {} },
    './walletProfileService': { loadAuthenticatedWalletProfile() { authenticationCalls++; } },
    './walletPurchasePendingStore': {}
  }, {
    fetch: async () => ({ ok: true, json: async () => ({ walletAddress: address, weeklyRunQuota: { attemptsRemaining: 5 } }) })
  });
  assert.equal((await service.loadWeeklyRunAttemptQuota(address)).attemptsRemaining, 5);
  assert.equal(authenticationCalls, 0);
  assert.equal(loaded.includes('./baseAccountWallet'), false);
});

test('ship access reads preserve wallet binding and do not initialize payment code', async () => {
  const response = {
    walletAddress: address,
    access: {
      bio: false, eth: false, btc: false, bioBalanceRaw: null, bioBalance: null,
      bioThresholdRaw: '100', campaignMastered: false, unlockedPlayerShips: ['researchhub']
    }
  };
  const { service, loaded } = loadService('playerShipAccessService', {
    '../constants': { BIO_SHIP_HOLDING_REQUIREMENT: { minimumAmountRaw: '100' }, DONATION_CONFIG: {}, PLAYER_SHIP_PURCHASE_SKUS: {} },
    './walletProfileService': { loadAuthenticatedWalletProfile() { throw new Error('must not authenticate'); } },
    './playerShipPurchasePendingStore': {}
  }, { fetch: async () => ({ ok: true, json: async () => response }) });
  assert.equal((await service.loadPlayerShipAccess(address)).bio, false);
  response.walletAddress = '0x2222222222222222222222222222222222222222';
  await assert.rejects(service.loadPlayerShipAccess(address), /different Base Account/);
  assert.equal(loaded.includes('./baseAccountWallet'), false);
});
