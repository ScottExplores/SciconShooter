const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.WALLET_PROFILE_AUTH_SECRET = 'wallet-profile-api-test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

const { getWeeklyBoundaryMeta } = require('../shared/weeklyCompetitionBoundary');
const campaign = require('../game-config/campaign.json');
const signaturesPath = require.resolve('../api/_lib/baseSignatures');
const routePath = require.resolve('../api/_lib/walletProfileRoute');
const signatures = require(signaturesPath);
const originalVerifyBaseMessage = signatures.verifyBaseMessage;
signatures.verifyBaseMessage = async ({ signature }) => signature === '0xverified';
delete require.cache[routePath];
const walletProfileHandler = require(routePath);

const WALLET = '0x3333333333333333333333333333333333333333';
const CAMPAIGN_LEVELS = campaign.levels.slice().sort((left, right) => left.order - right.order);
const FIRST_MISSION = CAMPAIGN_LEVELS[0];
const SECOND_MISSION = CAMPAIGN_LEVELS[1];
const FIRST_WAVE = FIRST_MISSION.waves.slice().sort((left, right) => left.order - right.order)[0];
const SECOND_MISSION_WAVE = SECOND_MISSION.waves
  .slice()
  .sort((left, right) => left.order - right.order)[0];
const SECOND_MISSION_LAST_WAVE = SECOND_MISSION.waves
  .slice()
  .sort((left, right) => left.order - right.order)
  .at(-1);
const GRAPH_ENTRY = campaign.campaignGraph.nodes.find((node) => (
  node.nodeId === campaign.campaignGraph.entryNodeId
));
const GRAPH_ROUTE_A_ID = GRAPH_ENTRY.outgoingEdges[0].toNodeId;
const FIRST_BOSS_EVENT_ID = campaign.levels
  .flatMap((level) => level.waves.flatMap((wave) => wave.events))
  .find((event) => event.kind === 'boss' && event.bossId === campaign.sectors[0].majorBossId).id;
const CAMPAIGN_REWARD_ID = `campaign:${FIRST_MISSION.id}:first-clear`;
const CAMPAIGN_BRANCH_REWARD_ID = 'campaign-branch:test-branch:reward-receipt-1';
const CAMPAIGN_RESULT_ID = 'wallet-api-campaign-result';

const jsonResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  async text() { return data == null ? '' : JSON.stringify(data); }
});

const makeResponse = () => ({
  statusCode: 0,
  headers: {},
  setHeader(name, value) { this.headers[name] = value; },
  end(body) { this.body = body ? JSON.parse(body) : null; }
});

const makeRequest = (method, body, cookie) => ({
  method,
  body,
  headers: {
    host: 'www.sciconshooter.xyz',
    origin: 'https://www.sciconshooter.xyz',
    ...(cookie ? { cookie } : {})
  }
});

const cookiePair = (setCookie) => {
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  const activeCookie = cookies.find((cookie) => !/Max-Age=0(?:;|$)/.test(String(cookie)));
  return String(activeCookie || '').split(';')[0];
};

test('challenge authentication creates a secure session and profile saves use revision CAS', async (t) => {
  const originalFetch = global.fetch;
  const challenges = new Map();
  const profiles = new Map();

  global.fetch = async (url, options = {}) => {
    // REVAMP(G): D reads the authoritative paid reserve when hydrating a profile.
    if (String(url).includes('scicon_wallet_entitlements?')) return jsonResponse([{ purchased_tokens_available: 0 }]);
    const parsed = new URL(String(url));
    const table = parsed.pathname.split('/').pop();
    const body = options.body ? JSON.parse(options.body) : null;

    if (table === 'scicon_wallet_profile_challenges') {
      if (options.method === 'POST') {
        challenges.set(body.challenge_id, {
          ...body,
          used_at: null,
          created_at: new Date().toISOString()
        });
        return jsonResponse(null, 201);
      }
      const challengeId = String(parsed.searchParams.get('challenge_id') || '').replace(/^eq\./, '');
      const challenge = challenges.get(challengeId);
      if (!challenge) return jsonResponse([]);
      if (options.method === 'PATCH') {
        if (challenge.used_at) return jsonResponse([]);
        Object.assign(challenge, body);
        return jsonResponse([challenge]);
      }
      return jsonResponse([challenge]);
    }

    if (table === 'scicon_wallet_profiles') {
      const address = String(parsed.searchParams.get('wallet_address') || '').replace(/^eq\./, '');
      if (options.method === 'POST') {
        if (profiles.has(body.wallet_address)) return jsonResponse([]);
        const row = {
          ...body,
          created_at: new Date().toISOString()
        };
        profiles.set(body.wallet_address, row);
        return jsonResponse([row], 201);
      }
      if (options.method === 'PATCH') {
        const row = profiles.get(address);
        const expectedRevision = Number(
          String(parsed.searchParams.get('revision') || '').replace(/^eq\./, '')
        );
        if (!row || row.revision !== expectedRevision) return jsonResponse([]);
        Object.assign(row, body);
        return jsonResponse([row]);
      }
      const row = profiles.get(address);
      return jsonResponse(row ? [row] : []);
    }

    throw new Error(`Unexpected Supabase request: ${url}`);
  };

  t.after(() => {
    global.fetch = originalFetch;
    signatures.verifyBaseMessage = originalVerifyBaseMessage;
    delete require.cache[routePath];
  });

  const challengeResponse = makeResponse();
  await walletProfileHandler(
    makeRequest('POST', { action: 'challenge', address: WALLET }),
    challengeResponse
  );
  assert.equal(challengeResponse.statusCode, 200);
  assert.match(challengeResponse.body.message, new RegExp(`Wallet: ${WALLET}`));
  assert.equal(challenges.size, 1);

  const authResponse = makeResponse();
  await walletProfileHandler(makeRequest('POST', {
    action: 'authenticate',
    address: WALLET,
    challengeId: challengeResponse.body.challengeId,
    signature: '0xverified'
  }), authResponse);
  assert.equal(authResponse.statusCode, 200);
  assert.equal(authResponse.body.walletAddress, WALLET);
  assert.equal(authResponse.body.profile, null);
  assert.match(String(authResponse.headers['Set-Cookie']), /HttpOnly/);
  assert.match(String(authResponse.headers['Set-Cookie']), /Secure/);
  assert.ok(challenges.get(challengeResponse.body.challengeId).used_at);

  const cookie = cookiePair(authResponse.headers['Set-Cookie']);
  const emptyProfileSessionResponse = makeResponse();
  await walletProfileHandler(
    makeRequest('GET', null, cookie),
    emptyProfileSessionResponse
  );
  assert.equal(emptyProfileSessionResponse.statusCode, 200);
  assert.equal(emptyProfileSessionResponse.body.walletAddress, WALLET);
  assert.equal(emptyProfileSessionResponse.body.profile, null);

  const currentWeek = getWeeklyBoundaryMeta().weekKey;
  const spoofedSaveResponse = makeResponse();
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await walletProfileHandler(makeRequest('POST', {
      action: 'save',
      walletAddress: '0x4444444444444444444444444444444444444444',
      expectedRevision: 0,
      snapshot: {}
    }, cookie), spoofedSaveResponse);
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(spoofedSaveResponse.statusCode, 403);
  assert.equal(profiles.size, 0);

  const spoofedLogoutResponse = makeResponse();
  console.error = () => {};
  try {
    await walletProfileHandler(makeRequest('POST', {
      action: 'logout',
      walletAddress: '0x4444444444444444444444444444444444444444'
    }, cookie), spoofedLogoutResponse);
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(spoofedLogoutResponse.statusCode, 403);
  assert.equal(spoofedLogoutResponse.headers['Set-Cookie'], undefined);

  const saveResponse = makeResponse();
  await walletProfileHandler(makeRequest('POST', {
    action: 'save',
    walletAddress: WALLET,
    expectedRevision: 0,
    snapshot: {
      weeklyState: {
        profileId: 'pilot:wrong',
        weekKey: currentWeek,
        coins: 50,
        durableCampaignCoins: 35,
        unlockedSlots: { left: true, right: false },
        ownedMiniShips: { 'citation-dart': 1 },
        equipped: { left: 'citation-dart', right: null },
        shipUpgrades: {},
        weeklyStats: {},
        creditedCampaignRewardIds: [
          CAMPAIGN_REWARD_ID,
          CAMPAIGN_BRANCH_REWARD_ID,
          'not-a-campaign-reward'
        ]
      },
      permanentState: {
        profileId: 'pilot:wrong',
        mintedMiniShips: ['citation-dart'],
        dailyGifts: {},
        lifetimeStats: {},
        bossArchive: {
          unlockedEventIds: ['open-orbit-gatekeeper'],
          seenEventIds: ['open-orbit-gatekeeper']
        },
        campaignProgress: {
          version: 4,
          campaignId: campaign.id,
          campaignRevision: campaign.revision,
          recommendedMissionId: SECOND_MISSION.id,
          recommendedWaveId: SECOND_MISSION_LAST_WAVE.id,
          recommendedGraphNodeId: GRAPH_ROUTE_A_ID,
          currentGraphNodeId: GRAPH_ROUTE_A_ID,
          furthestMainGraphNodeId: GRAPH_ROUTE_A_ID,
          unlockedGraphNodeIds: [GRAPH_ENTRY.nodeId, GRAPH_ROUTE_A_ID, 'unknown-node'],
          completedGraphNodeIds: [GRAPH_ENTRY.nodeId],
          selectedRouteTargetBySourceNodeId: {
            [GRAPH_ENTRY.nodeId]: GRAPH_ROUTE_A_ID
          },
          pendingRouteChoice: null,
          unlockedMissionIds: [FIRST_MISSION.id, SECOND_MISSION.id],
          unlockedWaveIdsByMission: {
            [FIRST_MISSION.id]: [FIRST_WAVE.id],
            [SECOND_MISSION.id]: [SECOND_MISSION_WAVE.id, SECOND_MISSION_LAST_WAVE.id]
          },
          missionRecords: {
            [FIRST_MISSION.id]: {
              completedWaveIds: [FIRST_WAVE.id],
              bestScore: 777
            }
          },
          claimedRewardIds: [CAMPAIGN_REWARD_ID],
          processedResultIds: [CAMPAIGN_RESULT_ID],
          completionRecords: [
            {
              resultId: CAMPAIGN_RESULT_ID,
              playerId: `wallet:${WALLET}`,
              campaignId: campaign.id,
              campaignRevision: campaign.revision,
              missionId: FIRST_MISSION.id,
              waveId: FIRST_WAVE.id,
              completedAt: '2026-07-23T18:00:00.000Z',
              coinsAwarded: 20
            },
            {
              resultId: 'wallet-api-mismatched-result',
              missionId: FIRST_MISSION.id,
              waveId: SECOND_MISSION_WAVE.id
            }
          ],
          unviewedMissionIds: [SECOND_MISSION.id],
          unviewedRewardIds: [CAMPAIGN_REWARD_ID]
        }
      },
      stats: { playerName: 'SCOTT' },
      selectedShipId: 'researchhub'
    }
  }, cookie), saveResponse);
  assert.equal(saveResponse.statusCode, 200);
  assert.equal(saveResponse.body.profile.revision, 1);
  assert.equal(saveResponse.body.profile.profileId, `wallet:${WALLET}`);
  assert.equal(saveResponse.body.profile.snapshot.weeklyState.profileId, `wallet:${WALLET}`);
  assert.equal(saveResponse.body.profile.snapshot.weeklyState.coins, 50);
  assert.equal(saveResponse.body.profile.snapshot.weeklyState.durableCampaignCoins, 35);
  assert.equal(
    'mintedMiniShips' in saveResponse.body.profile.snapshot.permanentState,
    false
  );
  assert.deepEqual(
    saveResponse.body.profile.snapshot.permanentState.bossArchive.unlockedEventIds,
    [FIRST_BOSS_EVENT_ID]
  );
  assert.deepEqual(
    saveResponse.body.profile.snapshot.permanentState.bossArchive.seenEventIds,
    [FIRST_BOSS_EVENT_ID]
  );
  assert.equal(saveResponse.body.profile.snapshot.permanentState.bossArchive.version, 2);
  assert.equal(
    saveResponse.body.profile.snapshot.permanentState.bossArchive.dailyChallenge.successfulClearsUsed,
    0
  );
  assert.deepEqual(
    saveResponse.body.profile.snapshot.weeklyState.creditedCampaignRewardIds,
    [CAMPAIGN_REWARD_ID]
  );
  const savedCampaign = saveResponse.body.profile.snapshot.permanentState.campaignProgress;
  assert.equal(savedCampaign.campaignId, campaign.id);
  assert.equal(savedCampaign.version, 4);
  assert.equal(savedCampaign.campaignRevision, campaign.revision);
  assert.equal(savedCampaign.recommendedMissionId, SECOND_MISSION.id);
  assert.equal(savedCampaign.recommendedWaveId, SECOND_MISSION_WAVE.id);
  assert.deepEqual(savedCampaign.missionRecords[FIRST_MISSION.id].completedWaveIds, [FIRST_WAVE.id]);
  assert.equal(savedCampaign.missionRecords[FIRST_MISSION.id].bestScore, 777);
  assert.deepEqual(savedCampaign.claimedRewardIds, [CAMPAIGN_REWARD_ID]);
  assert.deepEqual(savedCampaign.processedResultIds, [CAMPAIGN_RESULT_ID]);
  assert.equal(savedCampaign.recommendedGraphNodeId, GRAPH_ROUTE_A_ID);
  assert.equal(savedCampaign.currentGraphNodeId, GRAPH_ROUTE_A_ID);
  assert.equal(savedCampaign.furthestMainGraphNodeId, GRAPH_ROUTE_A_ID);
  assert.deepEqual(savedCampaign.completedGraphNodeIds, [GRAPH_ENTRY.nodeId]);
  assert.equal(savedCampaign.unlockedGraphNodeIds.includes('unknown-node'), false);
  assert.deepEqual(savedCampaign.selectedRouteTargetBySourceNodeId, {
    [GRAPH_ENTRY.nodeId]: GRAPH_ROUTE_A_ID
  });
  assert.deepEqual(
    savedCampaign.completionRecords.map((record) => record.resultId),
    [CAMPAIGN_RESULT_ID]
  );

  const getResponse = makeResponse();
  await walletProfileHandler(makeRequest('GET', null, cookie), getResponse);
  assert.equal(getResponse.statusCode, 200);
  assert.equal(getResponse.body.profile.revision, 1);
  assert.equal(getResponse.body.profile.snapshot.stats.playerName, 'SCOTT');
  assert.equal(getResponse.body.profile.snapshot.weeklyState.coins, 50);
  assert.equal(getResponse.body.profile.snapshot.weeklyState.durableCampaignCoins, 35);
  assert.deepEqual(
    getResponse.body.profile.snapshot.permanentState.bossArchive.unlockedEventIds,
    [FIRST_BOSS_EVENT_ID]
  );
  assert.deepEqual(
    getResponse.body.profile.snapshot.permanentState.bossArchive.seenEventIds,
    [FIRST_BOSS_EVENT_ID]
  );
  assert.equal(getResponse.body.profile.snapshot.permanentState.bossArchive.version, 2);
  assert.deepEqual(
    getResponse.body.profile.snapshot.weeklyState.creditedCampaignRewardIds,
    [CAMPAIGN_REWARD_ID]
  );
  const loadedCampaign = getResponse.body.profile.snapshot.permanentState.campaignProgress;
  assert.equal(loadedCampaign.version, 4);
  assert.equal(loadedCampaign.recommendedMissionId, SECOND_MISSION.id);
  assert.equal(loadedCampaign.recommendedWaveId, SECOND_MISSION_WAVE.id);
  assert.equal(loadedCampaign.missionRecords[FIRST_MISSION.id].bestScore, 777);
  assert.deepEqual(loadedCampaign.claimedRewardIds, [CAMPAIGN_REWARD_ID]);
  assert.deepEqual(loadedCampaign.processedResultIds, [CAMPAIGN_RESULT_ID]);
  assert.equal(loadedCampaign.recommendedGraphNodeId, GRAPH_ROUTE_A_ID);
  assert.equal(loadedCampaign.currentGraphNodeId, GRAPH_ROUTE_A_ID);
  assert.deepEqual(loadedCampaign.selectedRouteTargetBySourceNodeId, {
    [GRAPH_ENTRY.nodeId]: GRAPH_ROUTE_A_ID
  });
  assert.deepEqual(
    loadedCampaign.completionRecords.map((record) => ({
      resultId: record.resultId,
      missionId: record.missionId,
      waveId: record.waveId
    })),
    [{
      resultId: CAMPAIGN_RESULT_ID,
      missionId: FIRST_MISSION.id,
      waveId: FIRST_WAVE.id
    }]
  );

  const conflictResponse = makeResponse();
  console.error = () => {};
  try {
    await walletProfileHandler(makeRequest('POST', {
      action: 'save',
      walletAddress: WALLET,
      expectedRevision: 0,
      snapshot: getResponse.body.profile.snapshot
    }, cookie), conflictResponse);
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(conflictResponse.statusCode, 409);
  assert.equal(conflictResponse.body.currentRevision, 1);
  assert.equal(conflictResponse.body.profile.revision, 1);
});

test('Boss Archive Challenge endpoints reject requests without a wallet-profile session', async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const startResponse = makeResponse();
    await walletProfileHandler(makeRequest('POST', {
      action: 'start-boss-challenge',
      eventId: 'open-orbit-gatekeeper',
      variantId: 'standard'
    }), startResponse);
    assert.equal(startResponse.statusCode, 401);

    const settleResponse = makeResponse();
    await walletProfileHandler(makeRequest('POST', {
      action: 'settle-boss-challenge',
      runToken: 'not-a-run-token',
      victory: true,
      clearTimeMs: 10000,
      damageTaken: 0
    }), settleResponse);
    assert.equal(settleResponse.statusCode, 401);
  } finally {
    console.error = originalConsoleError;
  }
});

test('Campaign branch start and settlement endpoints reject requests without a wallet-profile session', async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const startResponse = makeResponse();
    await walletProfileHandler(makeRequest('POST', {
      action: 'start-campaign-branch',
      branchId: campaign.campaignBranches[0].branchId
    }), startResponse);
    assert.equal(startResponse.statusCode, 401);

    const settleResponse = makeResponse();
    await walletProfileHandler(makeRequest('POST', {
      action: 'settle-campaign-branch',
      attemptToken: 'not-an-attempt-token',
      outcome: 'success',
      destroyedByType: {},
      collectedPresentCoins: 0
    }), settleResponse);
    assert.equal(settleResponse.statusCode, 401);
  } finally {
    console.error = originalConsoleError;
  }
});
