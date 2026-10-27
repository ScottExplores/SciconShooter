const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const bundle = (entryPoint) => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, entryPoint)],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    logLevel: 'silent'
  });
  const loaded = { exports: {} };
  Function('require', 'module', 'exports', result.outputFiles[0].text)(
    require,
    loaded,
    loaded.exports
  );
  return loaded.exports;
};

const { getSandboxBossKit } = bundle('services/gameplay/sandboxBossRoster.ts');
const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config/campaign.json'), 'utf8'));

const quietGaps = (timeline) => {
  const gaps = [];
  const phases = [...new Set(timeline.clips.map((clip) => clip.phaseId).filter(Boolean))];
  for (const phaseId of phases) {
    const clips = timeline.clips.filter((clip) => clip.phaseId === phaseId);
    const warnings = clips
      .filter((clip) => clip.primitiveId === 'telegraph')
      .sort((left, right) => left.startSeconds - right.startSeconds);
    for (let index = 0; index < warnings.length - 1; index += 1) {
      const warning = warnings[index];
      const actionId = warning.id.replace(/-warning$/, '');
      const recovery = clips.find((clip) => clip.id === `${actionId}-recovery`);
      assert.ok(recovery, `${actionId} needs its recovery beat`);
      const recoveryEnd = recovery.startSeconds + recovery.durationSeconds;
      const gap = warnings[index + 1].startSeconds - recoveryEnd;
      gaps.push(gap);
      assert.ok(gap > 2.3 && gap < 3.6, `${phaseId} idle ${gap}s between ${actionId} and the next warning`);
    }
  }
  return gaps;
};

const NAMED_BOSSES = [
  ['cinderjaw-siege-beetle', 3.4],
  ['vesperglass-mothmother', 3.2],
  ['twin-halo-wardens', 3],
  ['riftcoil-wyrm', 2.8],
  ['gloamforge-mantis', 2.6]
];

test('serial bosses move between attacks and later kits step up', () => {
  let previousQuiet = 4;
  for (const [bossId, quietSeconds] of NAMED_BOSSES) {
    const timeline = getSandboxBossKit(bossId).timeline;
    const gaps = quietGaps(timeline);
    assert.ok(gaps.length >= 3, `${bossId} should chain several sentences`);
    for (const gap of gaps) {
      assert.ok(Math.abs(gap - quietSeconds) < 0.05, `${bossId} gap ${gap} expected ${quietSeconds}`);
    }
    assert.ok(quietSeconds < previousQuiet, `${bossId} should step up from the previous kit`);
    previousQuiet = quietSeconds;
    const lastEnd = timeline.clips.reduce(
      (end, clip) => Math.max(end, clip.startSeconds + clip.durationSeconds),
      0
    );
    const seam = (timeline.durationSeconds - lastEnd) + 2;
    assert.ok(seam < 3.6, `${bossId} loops after ${seam}s of quiet`);
    assert.ok(timeline.durationSeconds < 80, `${bossId} should not sit out a 90s loop`);
  }
});

test('campaign Gloamforge uses the packed mantis cadence', () => {
  const event = campaign.levels
    .flatMap((level) => level.waves)
    .flatMap((wave) => wave.events)
    .find((event) => event.timeline?.clips?.some((clip) => clip.id === 'sandbox-gloamforge-measure-port-cannon'));
  assert.ok(event, 'M45 should carry the Gloamforge timeline');
  const kit = getSandboxBossKit('gloamforge-mantis').timeline;
  assert.equal(event.timeline.clips.length, kit.clips.length);
  for (const clip of kit.clips) {
    const authored = event.timeline.clips.find((candidate) => candidate.id === clip.id);
    assert.ok(authored, clip.id);
    assert.equal(authored.startSeconds, clip.startSeconds, clip.id);
  }
  assert.equal(event.timeline.durationSeconds, kit.durationSeconds);
  const gaps = quietGaps(event.timeline);
  assert.ok(gaps.every((gap) => gap <= 3));
});
