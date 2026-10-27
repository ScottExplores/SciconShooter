const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

process.env.RUN_RECEIPT_SECRET = process.env.RUN_RECEIPT_SECRET || 'founder-anti-cheat-receipt-secret';
process.env.WALLET_PROFILE_AUTH_SECRET = process.env.WALLET_PROFILE_AUTH_SECRET
  || 'founder-anti-cheat-wallet-secret-32';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'founder-anti-cheat-service-key';

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const appSource = read('App.tsx');
const startScreenSource = read('components/StartScreen.tsx');
const shipServiceSource = read('services/playerShipService.ts');
const bossLabSource = read('services/gameplay/bossLab.ts');
const archiveSource = read('services/bossArchive.ts');
const archiveProgressSource = read('services/bossArchiveProgression.ts');
const constantsSource = read('constants.ts');
const campaign = require('../game-config/campaign.json');
const { DEFAULT_FOUNDER_WALLET } = require('../api/_lib/founderWallet');
const { signPayload, createRunStart } = require('../api/_lib/runReceipts');
const leaderboardHandler = require('../api/leaderboard');
const runReceiptHandler = require('../api/run-receipts');
const { readTopEligibleScore } = require('../api/_lib/weeklyCompetitionService');
const {
  SESSION_COOKIE_NAME,
  createWalletProfileSession
} = require('../api/_lib/walletProfileAuth');

const FOUNDER_CHECKSUM = '0x3A8D692Aabdd4981080a8F6af8375a21359464Bf';

const compilePlayerShipService = () => {
  const compiled = ts.transpileModule(shipServiceSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const moduleBox = { exports: {} };
  const localRequire = (request) => {
    if (request === '../constants') {
      return {
        ASSETS: {
          PLAYER_SHIP: 'researchhub.png',
          BIO_SHIP: 'bio.png',
          NIH_SHIP: 'nih.png',
          ETH_SHIP: 'eth.png',
          BTC_SHIP: 'btc.png'
        }
      };
    }
    if (request === './campaignProgression') {
      return {
        CAMPAIGN_STAR_TOTAL: 180,
        getCampaignMasteryStatus: () => ({
          completedMissions: 0,
          totalMissions: 60,
          earnedStars: 0,
          totalStars: 180,
          mastered: false
        })
      };
    }
    return require(request);
  };
  Function('exports', 'require', 'module', compiled)(moduleBox.exports, localRequire, moduleBox);
  return moduleBox.exports;
};

const loadBossArchive = () => {
  const compiled = ts.transpileModule(archiveSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  const localRequire = (request) => {
    if (request === '../constants') {
      return {
        ASSETS: {
          PIXI_BOSS_OPEN_ORBIT_ARM_LEFT: '/components/open-orbit-left.png',
          PIXI_BOSS_OPEN_ORBIT_ARM_RIGHT: '/components/open-orbit-right.png',
          PIXI_BOSS_PAYWALL_CANNON_LEFT: '/components/paywall-left.png',
          PIXI_BOSS_PAYWALL_CANNON_RIGHT: '/components/paywall-right.png',
          PIXI_BOSS_PAYWALL_HELMET: '/components/paywall-helmet.png'
        }
      };
    }
    if (request === '../game-config/catalog') {
      const majorBossIds = new Set([
        'gatekeeper',
        ...(campaign.sectors || []).map((sector) => sector.majorBossId)
      ]);
      return { isMajorBossId: (bossId) => majorBossIds.has(bossId) };
    }
    if (request === './levelConfig') {
      return {
        DEFAULT_GAME_CAMPAIGN: campaign,
        cloneGameCampaign: (value) => JSON.parse(JSON.stringify(value)),
        getAssetPaths: (assetKey) => [`/resolved/${assetKey}/frame-1`],
        getPrimaryAssetPath: (assetKey) => `/resolved/${assetKey}`
      };
    }
    return require(request);
  };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, localRequire, module);`,
    { module, localRequire, Object, Map, Set, Array, Boolean, Math, Number, String }
  );
  return module.exports;
};

const campaignBossEvents = () => {
  const events = [];
  for (const level of campaign.levels) {
    for (const wave of level.waves || []) {
      for (const event of wave.events || []) {
        if (event.kind === 'boss') events.push({ level, wave, event });
      }
    }
  }
  return events;
};

const makeResponse = () => ({
  statusCode: 0,
  headers: {},
  setHeader(name, value) { this.headers[name] = value; },
  end(body) { this.body = body ? JSON.parse(body) : null; }
});

const competitiveReceipt = (overrides = {}) => signPayload({
  type: 'run-receipt',
  runId: crypto.randomUUID(),
  gameVersion: 'test',
  runMode: 'weekly-streak',
  startedAt: Date.now() - 60_000,
  finishedAt: Date.now(),
  expiresAt: Date.now() + 60_000,
  metrics: { score: 9000, wave: 8, durationMs: 60_000, enemiesDefeated: 20, coinsCollected: 4 },
  weeklyCampaign: { weeklyId: 'test-week', startNodeId: 'weekly-run-founder-depth-1' },
  integrity: 'server-verified',
  testRun: false,
  ...overrides
});

test('founder wallet matches the donation recipient and stays non-competitive', () => {
  assert.match(constantsSource, new RegExp(`RECIPIENT_ADDRESS:\\s*"${FOUNDER_CHECKSUM}"`));
  assert.equal(FOUNDER_CHECKSUM.toLowerCase(), DEFAULT_FOUNDER_WALLET);
  assert.match(appSource, /activeWalletAddress\?\.toLowerCase\(\) === DONATION_CONFIG\.RECIPIENT_ADDRESS\.toLowerCase\(\)/);
  assert.match(appSource, /const isFounderSandboxRun = isOwnerWallet \|\| isOwnerTestRun/);
  assert.match(appSource, /const isNonCompetitiveRun = isFounderSandboxRun \|\| isBossArchiveRun \|\| isCampaignLabRun \|\| isCampaignBranchRun/);
  assert.match(appSource, /const isWeeklyLeaderboardRun = isWeeklyCampaignRun && !isNonCompetitiveRun/);
  assert.match(appSource, /testRun: isOwnerWallet/);
  assert.match(appSource, /if \(isFounderSandboxRun\) \{[\s\S]*?finalizeCurrentRun\(\)/);
  assert.match(appSource, /setShowNameInput\(isWeeklyLeaderboardRun\)/);
  assert.match(read('api/leaderboard.js'), /isFounderWalletAddress\(receiptWallet\)/);
  assert.match(read('api/_lib/runReceipts.js'), /isFounderWalletAddress\(walletSession\?\.walletAddress\)/);
  assert.match(read('api/_lib/weeklyCompetitionService.js'), /founderWalletAddress\(\)/);
});

test('founder wallet unlocks every ship, including the NIH hull, without a purchase', () => {
  const ships = compilePlayerShipService();
  const founderUnlocks = ships.getPlayerShipUnlocks({
    unlockAll: true,
    accessStatus: 'idle',
    permanentUnlockIds: [],
    authoritativePaidUnlockIds: []
  });
  for (const shipId of ships.PLAYABLE_PLAYER_SHIP_IDS) {
    assert.equal(ships.isPlayerShipUnlocked(shipId, founderUnlocks), true, shipId);
    assert.equal(ships.getUsablePlayerShip(shipId, founderUnlocks), shipId);
  }
  const nihHull = Object.values(ships.PLAYER_SHIPS).find((ship) => (
    /nih/i.test(`${ship.id} ${ship.name} ${ship.assetUrl}`)
  )) || ships.PLAYER_SHIPS.bio;
  assert.match(nihHull.name, /^NIH$/);
  assert.equal(ships.isPlayerShipUnlocked(nihHull.id, founderUnlocks), true);
  assert.equal(ships.getUsablePlayerShip(nihHull.id, founderUnlocks), nihHull.id);
  const unpaid = ships.getPlayerShipUnlocks({ accessStatus: 'idle' });
  assert.equal(unpaid.eth, false);
  assert.equal(unpaid.btc, false);
  assert.match(appSource, /unlockAll: isOwnerWallet/);
  assert.doesNotMatch(appSource, /usableShipId === 'bio' && !isOwnerWallet/);
  assert.match(shipServiceSource, /bio: true/);
  assert.match(read('api/_lib/playerShipAccess.js'), /player_ship_self_payment_forbidden/);
});

test('founder wallet opens every Boss Lab fight, boss replay, and the campaign lab', () => {
  const bosses = campaignBossEvents();
  const majorBossIds = new Set([
    'gatekeeper',
    ...(campaign.sectors || []).map((sector) => sector.majorBossId)
  ]);
  const lateCampaignBosses = [
    'frontier-crownclaw',
    'nullwake-revenant',
    'umbra-needlewing'
  ];
  for (const bossId of lateCampaignBosses) {
    assert.equal(majorBossIds.has(bossId), true, bossId);
    assert.ok(bosses.some((entry) => entry.event.bossId === bossId), bossId);
  }
  assert.match(bossLabSource, /if \(event\.kind !== 'boss'\) continue;/);
  assert.match(bossLabSource, /id: `campaign:\$\{level\.id\}:\$\{wave\.id\}:\$\{event\.id\}`/);
  assert.match(bossLabSource, /SANDBOX_BOSS_ROSTER\.map/);
  assert.doesNotMatch(bossLabSource, /isMajorBossId|founderSandbox|isOwnerWallet/);
  for (const entry of bosses) {
    const choiceId = `campaign:${entry.level.id}:${entry.wave.id}:${entry.event.id}`;
    assert.match(choiceId, /^campaign:[^:]+:[^:]+:.+$/);
  }

  const archive = loadBossArchive();
  const replayIds = new Set(archive.BOSS_ARCHIVE_CATALOG.map((entry) => entry.bossId));
  for (const bossId of majorBossIds) {
    if (bossId === 'gatekeeper') continue;
    assert.equal(replayIds.has(bossId), true, `${bossId} is missing from boss replay`);
  }
  assert.match(archiveSource, /event\.kind === 'boss' && isMajorBossId\(event\.bossId\)/);
  assert.match(archiveSource, /BOSS_ARCHIVE_CATALOG = buildBossArchiveCatalog\(\)/);
  assert.match(
    appSource,
    /!isOwnerWallet\s*&&\s*!permanentSquadState\.bossArchive\.unlockedEventIds\.includes\(requestedBossReplay\.eventId\)/
  );
  assert.match(archiveProgressSource, /unlockedEventIds: BOSS_ARCHIVE_CATALOG\.map\(\(entry\) => entry\.eventId\)/);
  assert.match(startScreenSource, /founderSandbox \|\| bossArchiveDeveloperControls\?\.enabled/);
  assert.match(
    startScreenSource,
    /bossArchiveDevelopmentAccess && bossArchiveDevUnlockAll\s*\? BOSS_ARCHIVE_CATALOG\s*:\s*earnedBossArchiveEntries/
  );
  assert.match(appSource, /createBossArchiveDeveloperControls\(\(\) => founderAuthorizationRef\.current\)/);
  assert.match(appSource, /campaignLabRequest && founderAuthorizationRef\.current/);
  assert.match(appSource, /Campaign Lab launch rejected: connect the authorized founder wallet\./);
});

test('a connected founder wallet is signed as a Pilot Test run even when the client omits the flag', async () => {
  const started = createRunStart('test', {
    testRun: false,
    walletSession: {
      walletAddress: FOUNDER_CHECKSUM,
      profileId: `wallet:${DEFAULT_FOUNDER_WALLET}`
    }
  });
  assert.equal(started.testRun, true);
  assert.equal(started.identity.walletAddress, FOUNDER_CHECKSUM);

  const other = createRunStart('test', {
    testRun: false,
    walletSession: {
      walletAddress: '0x1111111111111111111111111111111111111111',
      profileId: 'wallet:0x1111111111111111111111111111111111111111'
    }
  });
  assert.equal(other.testRun, false);

  const walletCookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(createWalletProfileSession(FOUNDER_CHECKSUM))}`;
  const response = makeResponse();
  await runReceiptHandler({
    method: 'POST',
    body: {
      action: 'start',
      walletAddress: FOUNDER_CHECKSUM,
      testRun: false
    },
    headers: { cookie: walletCookie },
    socket: { remoteAddress: '203.0.113.64' }
  }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.testRun, true);
  assert.equal(response.body.identity.walletAddress, DEFAULT_FOUNDER_WALLET);
});

test('founder receipts cannot post to the event leaderboard or win the prize', async () => {
  const originalFetch = global.fetch;
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    return {
      ok: true,
      status: 200,
      async json() { return []; },
      async text() { return '[]'; }
    };
  };

  try {
    const posted = makeResponse();
    await leaderboardHandler({
      method: 'POST',
      body: {
        name: 'FOUNDER',
        score: 999999,
        receiptToken: competitiveReceipt({
          identity: {
            kind: 'wallet',
            walletAddress: FOUNDER_CHECKSUM,
            profileIdHash: 'founder'
          }
        })
      },
      headers: {},
      socket: { remoteAddress: '203.0.113.65' }
    }, posted);
    assert.equal(posted.statusCode, 403);
    assert.equal(posted.body.code, 'PILOT_TEST_RUN_FORBIDDEN');
    assert.match(posted.body.error, /not eligible/i);

    const proposal = makeResponse();
    await leaderboardHandler({
      method: 'POST',
      body: {
        action: 'select-proposal',
        proposalId: '33131',
        receiptToken: competitiveReceipt({
          testRun: true,
          identity: {
            kind: 'wallet',
            walletAddress: DEFAULT_FOUNDER_WALLET,
            profileIdHash: 'founder'
          }
        })
      },
      headers: {},
      socket: { remoteAddress: '203.0.113.66' }
    }, proposal);
    assert.equal(proposal.statusCode, 403);
    assert.equal(proposal.body.code, 'PILOT_TEST_RUN_FORBIDDEN');
    assert.equal(fetchCalled, false);
  } finally {
    global.fetch = originalFetch;
  }

  const founderRow = {
    name: 'FOUNDER',
    score: 999999,
    wave: 60,
    date: '2020-02-03T12:00:00.000Z',
    wallet_address: FOUNDER_CHECKSUM,
    run_id: 'founder-event-run',
    verified: true,
    receipt_hash: 'founder-event-hash'
  };
  const contender = {
    name: 'CONTENDER',
    score: 1200,
    wave: 4,
    date: '2020-02-04T12:00:00.000Z',
    wallet_address: '0x1111111111111111111111111111111111111111',
    run_id: 'contender-run',
    verified: true,
    receipt_hash: 'contender-hash'
  };
  global.fetch = async () => ({
    ok: true,
    status: 200,
    async text() { return JSON.stringify([founderRow, contender]); }
  });
  try {
    const winner = await readTopEligibleScore('2020-02-02');
    assert.equal(winner.run_id, 'contender-run');
    assert.notEqual(String(winner.wallet_address).toLowerCase(), DEFAULT_FOUNDER_WALLET);
  } finally {
    global.fetch = originalFetch;
  }
});
