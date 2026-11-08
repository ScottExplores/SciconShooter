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

test('guest economy is not merged into a wallet snapshot', async () => {
  const linking = await import('../services/guestWalletLink.ts');
  const wallet = {
    stats: { highScore: 10, totalCoins: 4, playerName: 'Wallet' },
    weeklyState: {
      coins: 30,
      unlockedSlots: { left: false, right: false },
      weeklyStats: { score: 0, runs: 0 }
    },
    permanentState: {
      lifetimeStats: { bestScore: 10, runs: 0 },
      unlockedPlayerShips: ['researchhub']
    },
    selectedShipId: 'researchhub'
  };
  const guest = structuredClone(wallet);
  guest.stats.highScore = 1_000_000_000;
  guest.stats.totalCoins = 1_000_000_000;
  guest.weeklyState.coins = 1_000_000_000;
  guest.weeklyState.unlockedSlots.right = true;
  const prepared = linking.prepareGuestLinkSnapshot(guest, wallet);
  assert.equal(prepared, wallet);
  assert.equal(prepared.weeklyState.coins, 30);
  assert.equal(prepared.stats.highScore, 10);
  assert.equal(linking.walletSnapshotHasOwnedProgress(wallet), true);
  assert.equal(linking.walletSnapshotHasOwnedProgress({
    ...wallet,
    stats: { highScore: 0, totalCoins: 0, playerName: '' },
    weeklyState: { ...wallet.weeklyState, coins: 0 },
    permanentState: {
      lifetimeStats: { bestScore: 0, runs: 0 },
      unlockedPlayerShips: ['researchhub'],
      campaignProgress: { completedMissionIds: [] }
    }
  }), false);
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
  assert.doesNotMatch(app, /linkAuthenticatedGuestProgress/);
  assert.match(runtime, /settleAttempt\(generation, outcome, attempt, address\)/);
  assert.match(runtime, /accountEvents\.on\?\.\('accountsChanged'/);
  assert.match(runtime, /accountEvents\.on\?\.\('disconnect'/);
  assert.match(app, /activeProfileIdRef\.current !== walletProfileId/);
  assert.match(wallet, /method: 'wallet_sendCalls'/);
  assert.match(wallet, /sendBaseTransaction/);
  assert.doesNotMatch(runtime, /solana|phantom/i);
});
