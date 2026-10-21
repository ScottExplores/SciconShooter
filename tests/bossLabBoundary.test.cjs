const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('boss lab production modules do not import the local Director tree', () => {
  for (const relative of [
    'services/gameplay/bossLab.ts',
    'services/gameplay/sandboxBossRoster.ts',
    'components/BossLab.tsx',
    'index.tsx',
    'vite.config.ts'
  ]) {
    const source = read(relative);
    assert.doesNotMatch(source, /director\/src|director-data|from ['"][^'"]*director/);
    assert.doesNotMatch(source, /director-sandbox-prototype|Director Sandbox/);
  }
  assert.doesNotMatch(read('vite.config.ts'), /['"]@game['"]/);
});

test('boss lab lists encounter labels without building every fight', async () => {
  const { createServer } = await import('vite');
  const server = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error'
  });
  try {
    const lab = await server.ssrLoadModule('/services/gameplay/bossLab.ts');
    const started = performance.now();
    const choices = lab.listBossLabEncounterChoices();
    const elapsed = performance.now() - started;
    assert.equal(choices.length, 54);
    assert.ok(elapsed < 1000, `listing encounters took ${elapsed.toFixed(0)}ms`);
    assert.equal(choices.some((choice) => Object.hasOwn(choice, 'campaign')), false);
    assert.equal(choices.some((choice) => choice.id === 'sandbox:abyssal-octarch'), true);

    const fight = lab.buildBossLabFight('sandbox:abyssal-octarch');
    assert.equal(fight.id, 'sandbox:abyssal-octarch');
    assert.equal(fight.artwork.modularRig.manifest.id, 'abyssal-octarch');
    assert.equal(fight.artwork.eventId, 'sandbox-abyssal-octarch');
    const hosted = fight.campaign.levels.some((level) => (
      level.waves.some((wave) => wave.events.some((event) => event.id === 'sandbox-abyssal-octarch'))
    ));
    assert.equal(hosted, true);

    const again = lab.buildBossLabFight('sandbox:abyssal-octarch');
    assert.equal(again, fight);
    const next = lab.buildBossLabFight(choices[0].id);
    assert.notEqual(next, fight);
    assert.equal(next.campaign === fight.campaign, false);
  } finally {
    await server.close();
  }
});
