const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');

const loadPolicy = () => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, 'services', 'campaignEnemyFiring.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    logLevel: 'silent'
  });
  const module = { exports: {} };
  Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
};

const {
  canCampaignEnemyFire,
  getCampaignFireDelayFrames,
  isCampaignPriorityFireRole,
  resolveCampaignFormationFiringBehavior
} = loadPolicy();

const eligibility = (overrides = {}) => ({
  behavior: 'post-formation',
  fireDelaySeconds: 2,
  formationFiringBehavior: 'staggered',
  formationState: 'hold',
  isElite: false,
  spawnFrame: 100,
  currentFrame: 220,
  framesPerSecond: 60,
  ...overrides
});

test('Campaign fire delay converts authored seconds to deterministic whole frames', () => {
  assert.equal(getCampaignFireDelayFrames(2.25, 60), 135);
  assert.equal(getCampaignFireDelayFrames(-4, 60), 0);
  assert.equal(getCampaignFireDelayFrames(undefined, 60), 0);
});

test('role policies gate no-fire, post-formation, formation-command, and elite-only states', () => {
  assert.equal(canCampaignEnemyFire(eligibility({ behavior: 'none' })), false);
  assert.equal(canCampaignEnemyFire(eligibility({ currentFrame: 219 })), false, 'spawn delay remains quiet');
  assert.equal(canCampaignEnemyFire(eligibility({ formationState: 'entry' })), false);
  assert.equal(canCampaignEnemyFire(eligibility({ formationState: 'dive' })), false);
  assert.equal(canCampaignEnemyFire(eligibility({ formationState: 'hold' })), true);
  assert.equal(canCampaignEnemyFire(eligibility({ behavior: 'formation-command', formationState: 'hold' })), false);
  assert.equal(canCampaignEnemyFire(eligibility({ behavior: 'formation-command', formationState: 'dive' })), true);
  assert.equal(canCampaignEnemyFire(eligibility({ behavior: 'elite-only', isElite: false })), false);
  assert.equal(canCampaignEnemyFire(eligibility({ behavior: 'elite-only', isElite: true })), true);
});

test('formation-pack fire policy can mute or delay otherwise eligible shooters', () => {
  assert.equal(canCampaignEnemyFire(eligibility({ formationFiringBehavior: 'none' })), false);
  assert.equal(canCampaignEnemyFire(eligibility({
    behavior: 'aimed-burst',
    formationFiringBehavior: 'post-formation',
    formationState: 'entry'
  })), false);
  assert.equal(canCampaignEnemyFire(eligibility({
    behavior: 'aimed-burst',
    formationFiringBehavior: 'post-formation',
    formationState: 'hold'
  })), true);
  assert.equal(canCampaignEnemyFire(eligibility({ behavior: undefined })), true, 'legacy enemies stay compatible');
});

test('priority packs recognize pressure roles and resolve the active pack policy', () => {
  assert.equal(isCampaignPriorityFireRole('burst-shooter'), true);
  assert.equal(isCampaignPriorityFireRole('suppressor'), true);
  assert.equal(isCampaignPriorityFireRole('formation-unit'), false);
  const packs = [
    { id: 'pack-a', enemyRoleIds: ['role-a'], firingBehavior: 'staggered' },
    { id: 'pack-b', enemyRoleIds: ['role-b'], firingBehavior: 'priority' }
  ];
  assert.equal(resolveCampaignFormationFiringBehavior('role-b', packs), 'priority');
  assert.equal(resolveCampaignFormationFiringBehavior('missing-role', packs), undefined);
});
