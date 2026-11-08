const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('wallet choices list discovered EVM providers, Base, and optional WalletConnect', async () => {
  const discovery = await import('../services/evmWalletDiscovery.ts');
  const choices = discovery.buildWalletChoices({
    announced: [
      { uuid: '1', name: 'MetaMask', rdns: 'io.metamask', icon: 'mm' },
      { uuid: '2', name: 'Rabby', rdns: 'io.rabby' },
      { uuid: '3', name: 'Coinbase Wallet', rdns: 'com.coinbase.wallet' },
      { uuid: '4', name: 'MetaMask', rdns: 'io.metamask' },
      { uuid: '5', name: 'Example Wallet', rdns: 'dev.example.wallet' }
    ],
    mobile: false,
    pageUrl: 'https://www.sciconshooter.xyz/',
    walletConnectProjectId: 'public-project-id'
  });

  assert.deepEqual(choices.map((choice) => choice.title), [
    'Base Account',
    'MetaMask',
    'Rabby',
    'Coinbase Wallet',
    'Example Wallet',
    'WalletConnect'
  ]);
  assert.equal(choices.some((choice) => /all wallets/i.test(choice.title)), false);
  assert.equal(choices.some((choice) => /solana|phantom/i.test(`${choice.title} ${choice.detail}`)), false);
  assert.equal(choices.find((choice) => choice.id === 'walletconnect').detail, 'QR code');
});

test('mobile handoff offers MetaMask and Coinbase app links when those wallets are not injected', async () => {
  const discovery = await import('../services/evmWalletDiscovery.ts');
  const choices = discovery.buildWalletChoices({
    announced: [],
    mobile: true,
    pageUrl: 'https://www.sciconshooter.xyz/play?display=mobile-frame',
    walletConnectProjectId: ''
  });
  const metamask = choices.find((choice) => choice.id === 'handoff:metamask');
  const coinbase = choices.find((choice) => choice.id === 'handoff:coinbase');
  assert.equal(metamask.method, 'handoff');
  assert.equal(
    metamask.handoffUrl,
    'https://metamask.app.link/dapp/www.sciconshooter.xyz/play?display=mobile-frame'
  );
  assert.equal(
    coinbase.handoffUrl,
    'https://go.cb-w.com/dapp?cb_url=https%3A%2F%2Fwww.sciconshooter.xyz%2Fplay%3Fdisplay%3Dmobile-frame'
  );
  assert.equal(choices.some((choice) => choice.method === 'walletconnect'), false);
});

test('stale wallet results and guest-link responses are rejected', async () => {
  const discovery = await import('../services/evmWalletDiscovery.ts');
  const linking = await import('../services/guestWalletLink.ts');
  assert.equal(discovery.shouldApplyWalletResult(4, 4), true);
  assert.equal(discovery.shouldApplyWalletResult(4, 5), false);
  assert.equal(linking.isCurrentGuestLinkResult({
    requestGeneration: 3,
    currentGeneration: 3,
    requestWallet: '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD',
    activeWallet: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    resultWallet: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
  }), true);
  assert.equal(linking.isCurrentGuestLinkResult({
    requestGeneration: 3,
    currentGeneration: 4,
    requestWallet: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    activeWallet: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    resultWallet: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
  }), false);
  assert.equal(linking.isCurrentGuestLinkResult({
    requestGeneration: 3,
    currentGeneration: 3,
    requestWallet: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    activeWallet: '0x1111111111111111111111111111111111111111',
    resultWallet: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
  }), false);
});

test('guest coin preparation uses the higher device balance once', async () => {
  const linking = await import('../services/guestWalletLink.ts');
  const base = {
    stats: { highScore: 10, totalCoins: 4, playerName: '' },
    weeklyState: {
      coins: 30,
      durableCampaignCoins: 12,
      unlockedSlots: { left: false, right: true },
      ownedMiniShips: { scout: 1 },
      shipUpgrades: { researchhub: { fireRate: 1, speed: 0, ability: 0, startingHearts: 0 } },
      weeklyStats: { score: 99, weeklyRunAttempts: 2, runs: 1, enemiesDefeated: 0, coinsEarned: 0 }
    },
    permanentState: {
      mintedMiniShips: ['forged'],
      lifetimeStats: { bestScore: 10 },
      unlockedPlayerShips: ['researchhub', 'eth', 'bio']
    },
    selectedShipId: 'researchhub'
  };
  const other = structuredClone(base);
  other.stats.highScore = 25;
  other.weeklyState.coins = 12;
  other.weeklyState.ownedMiniShips = { scout: 3 };
  other.weeklyState.shipUpgrades.researchhub.fireRate = 4;
  const prepared = linking.prepareGuestLinkSnapshot(base, other);
  assert.equal(prepared.stats.highScore, 25);
  assert.equal(prepared.weeklyState.coins, 30);
  assert.notEqual(prepared.weeklyState.coins, 42);
  assert.equal(prepared.weeklyState.unlockedSlots.right, false);
  assert.equal(prepared.weeklyState.weeklyStats.score, 0);
  assert.equal(prepared.weeklyState.ownedMiniShips.scout, 3);
  assert.equal(prepared.weeklyState.shipUpgrades.researchhub.fireRate, 4);
  assert.deepEqual(prepared.permanentState.mintedMiniShips, []);
  assert.equal(prepared.permanentState.unlockedPlayerShips.includes('eth'), false);
  assert.equal(prepared.permanentState.unlockedPlayerShips.includes('bio'), false);
});

test('the connect entry keeps the homepage control and opens a chooser', () => {
  const control = fs.readFileSync(path.join(root, 'components', 'WalletControl.tsx'), 'utf8');
  const runtime = fs.readFileSync(path.join(root, 'components', 'WalletRuntime.tsx'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
  const wallet = fs.readFileSync(path.join(root, 'services', 'baseAccountWallet.ts'), 'utf8');

  assert.match(control, /Connect Wallet/);
  assert.match(control, /rounded-full border border-cyan-300\/40/);
  assert.match(runtime, /data-testid="wallet-chooser"|WalletChooser/);
  assert.match(runtime, /shouldApplyWalletResult/);
  assert.match(runtime, /eip6963:requestProvider/);
  assert.match(runtime, /type: 'release'/);
  assert.match(app, /linkAuthenticatedGuestProgress/);
  assert.match(app, /isCurrentGuestLinkResult/);
  assert.match(app, /activeProfileIdRef\.current !== walletProfileId/);
  assert.match(wallet, /method: 'wallet_sendCalls'/);
  assert.match(wallet, /sendBaseTransaction/);
  assert.doesNotMatch(runtime, /solana|phantom/i);
});
