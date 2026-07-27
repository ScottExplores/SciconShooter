const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const TEST_CAMPAIGN = {
  schemaVersion: 1,
  revision: 3,
  id: 'wallet-roundtrip-campaign',
  name: 'Wallet Roundtrip Campaign',
  updatedAt: '2026-07-26T00:00:00.000Z',
  fps: 60,
  recordCard: {},
  hudAssets: {},
  levels: [
    {
      id: 'mission-alpha',
      name: 'Alpha',
      description: 'Alpha route.',
      order: 1,
      backgroundId: 'alpha-background',
      scoreTarget: 1_000,
      scorecard: { encounterAssetKey: 'ALPHA_ART' },
      waves: [
        { id: 'alpha-wave-1', name: 'Alpha One', order: 1, durationSeconds: 30, events: [] },
        { id: 'alpha-wave-2', name: 'Alpha Two', order: 2, durationSeconds: 30, events: [] }
      ]
    },
    {
      id: 'mission-beta',
      name: 'Beta',
      description: 'Beta route.',
      order: 2,
      backgroundId: 'beta-background',
      scoreTarget: 2_000,
      scorecard: { encounterAssetKey: 'BETA_ART' },
      waves: [
        { id: 'beta-wave-1', name: 'Beta One', order: 1, durationSeconds: 30, events: [] }
      ]
    }
  ]
};

const compileCampaignProgression = () => {
  const source = fs.readFileSync(path.join(root, 'services', 'campaignProgression.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  const levelConfig = {
    DEFAULT_GAME_CAMPAIGN: TEST_CAMPAIGN,
    flattenLevels: (campaign) => campaign.levels.slice().sort((left, right) => left.order - right.order),
    getBackground: () => ({ tint: '#123456' }),
    getPrimaryAssetPath: (key) => `/test/${key}.png`
  };
  Function('exports', 'require', 'module', compiled)(
    module.exports,
    (request) => request === './levelConfig' ? levelConfig : require(request),
    module
  );
  return module.exports;
};

test('client Campaign sanitizer rejects globally valid Waves paired with the wrong Mission', () => {
  const progression = compileCampaignProgression();
  const fresh = progression.createCampaignProgress(TEST_CAMPAIGN);
  const record = (resultId, missionId, waveId) => ({
    resultId,
    playerId: 'wallet:0xabc',
    campaignId: TEST_CAMPAIGN.id,
    campaignRevision: TEST_CAMPAIGN.revision,
    missionId,
    waveId,
    completedAt: '2026-07-26T12:00:00.000Z',
    stageComplete: false,
    firstClearGranted: false,
    coinsAwarded: 10,
    starsEarned: 0
  });

  const sanitized = progression.sanitizeCampaignProgress({
    ...fresh,
    completionRecords: [
      record('valid-alpha', 'mission-alpha', 'alpha-wave-1'),
      record('mismatched-beta', 'mission-alpha', 'beta-wave-1'),
      record('unknown-mission', 'mission-missing', 'alpha-wave-1'),
      record('unknown-wave', 'mission-alpha', 'missing-wave'),
      record('   ', 'mission-alpha', 'alpha-wave-2')
    ]
  }, { campaign: TEST_CAMPAIGN });

  assert.deepEqual(
    Array.from(sanitized.completionRecords, (entry) => ({
      resultId: entry.resultId,
      missionId: entry.missionId,
      waveId: entry.waveId
    })),
    [{
      resultId: 'valid-alpha',
      missionId: 'mission-alpha',
      waveId: 'alpha-wave-1'
    }]
  );
});
