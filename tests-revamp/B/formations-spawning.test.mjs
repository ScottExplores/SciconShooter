import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const temporary = await mkdtemp(join(tmpdir(), 'scicon-B-trains-'));
await build({ entryPoints: ['services/gameLogic.ts'], bundle: true, platform: 'node', format: 'esm',
  outfile: join(temporary, 'engine.mjs'), logLevel: 'silent', define: {
    'import.meta.env.PROD': 'false', 'import.meta.env.DEV': 'false', 'import.meta.env.MODE': '"test"'
  } });
globalThis.Image ??= class { set src(_value) {} };
const { GameEngine } = await import(pathToFileURL(join(temporary, 'engine.mjs')).href);
await rm(temporary, { recursive: true, force: true });

test('real engine staggers all nonpincer ribbon members instead of stacking pairs at one age', () => {
  for (const path of ['revamp-swoop', 'revamp-loop', 'revamp-s-curve', 'revamp-side-sweep',
    'revamp-corkscrew', 'revamp-bottom-flank', 'revamp-train']) {
    const engine = new GameEngine({ score: 0, highScore: 0, wave: 1, coins: 0, totalCoins: 0,
      enemiesDefeated: 0, bombs: 2, bombCharge: 0, bombChargeMax: 100, shipAbilityCooldown: 0,
      shipAbilityCooldownMax: 960, lives: 3, repairsCount: 0, upgrades: { fireRate: 0, speed: 0, ability: 0 },
      powerupUses: {}, bossProgress: 0, isBossActive: false, bossHp: 0, bossMaxHp: 100 },
    { audioEnabled: false, preloadCanvasAssets: false, testMode: true, randomSeed: 'revamp-train-regression' });
    engine.init(390, 844);
    const authored = engine.getConfiguredSpawnEvents().find(event => event.id.includes('divers'));
    assert.ok(authored);
    const event = { ...authored, startSeconds: 0, durationSeconds: 10,
      formationBehavior: { ...authored.formationBehavior, entryPathId: path } };
    engine.getConfiguredSpawnEvents = () => [event];
    let sampledVisiblePairs = 0;
    // Isolate the actual spawn/formation pipeline from weapons and player kills.
    for (let frame = 1; frame <= 480; frame++) {
      engine.frameCount = frame;
      engine.waveProgressFrames = frame;
      engine.spawnConfiguredEnemies();
      engine.revampEnemies.tick(engine);
      for (const enemy of engine.entities.filter(entity => entity.campaignRoleId)) {
        engine.stepConfiguredEnemyFormation(enemy);
      }
      engine.separateAssembledFormationMembers();
      const entrants = engine.entities.filter(entity => entity.campaignRoleId && entity.formationState === 'entry'
        && entity.y >= 0 && entity.y < engine.height && entity.x >= 0 && entity.x < engine.width);
      for (let left = 0; left < entrants.length; left++) for (let right = left + 1; right < entrants.length; right++) {
        sampledVisiblePairs++;
        const a = entrants[left], b = entrants[right];
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 0.001,
          `${path}: members ${a.formationIndex}/${b.formationIndex} stack on frame ${frame}`);
      }
    }
    const members = engine.entities.filter(entity => entity.campaignRoleId === 'role-revamp-diver');
    assert.equal(members.length, 6, `${path} admits the complete train`);
    assert.equal(new Set(members.map(member => member.campaignSpawnFrame)).size, 6, `${path} uses six distinct arrival beats`);
    assert.ok(sampledVisiblePairs > 100, `${path} was exercised with multiple visible followers`);
  }
});
