import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const previousImage = globalThis.Image;
globalThis.Image = class { complete = false; naturalWidth = 0; };
const directory = await mkdtemp(join(tmpdir(), 'scicon-O-wall-route-'));
after(async () => {
  if (previousImage === undefined) delete globalThis.Image;
  else globalThis.Image = previousImage;
  await rm(directory, { recursive: true, force: true });
});
const bundle = await build({
  stdin: { contents: `
    export { GameEngine } from './services/gameLogic';
    export { createCombatLabStats } from './services/combatLab';
    export { attachInteractiveMini } from './services/revamp/bosses/miniInteractive';
    export { updateInteractiveWallFire } from './services/revamp/bosses/miniWall';
    export { proveRevampBossAttack } from './services/revamp/bosses/safeRoute';
    export { EntityType } from './types';
  `, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
  define: { 'import.meta.env': '{}' }
});
const modulePath = join(directory, 'engine.mjs');
await writeFile(modulePath, bundle.outputFiles[0].text);
const { GameEngine, createCombatLabStats, attachInteractiveMini, updateInteractiveWallFire,
  proveRevampBossAttack, EntityType } = await import(pathToFileURL(modulePath));

test('actual single and paired wall volleys retain conservative routes at bounded live vent origins', () => {
  const engine = new GameEngine(createCombatLabStats(), {
    previewMode: true, audioEnabled: false, preloadCanvasAssets: false, randomSeed: 12345
  });
  engine.init(390, 844);
  let scenarios = 0;
  for (const paired of [false, true]) {
    for (const ventX of [27, 52, 123, 195, 267, 338, 363]) {
      // Lowest vent is just inside the wall driver's exact 0.55*height cutoff.
      for (const ventY of [48, 148, 300, 464.1]) {
        const event = `revamp:wall-route:${paired}:${ventX}:${ventY}`;
        engine.entities = [];
        const members = [0, 1, 2].map(index => {
          const member = engine.createEntity(EntityType.ENEMY_INVADER, ventX - 27, index ? -100 : ventY - 48);
          Object.assign(member, { width: 54, height: 48, hp: 10, maxHp: 10,
            sourceItemId: 'paywall-wall', sourceEventId: event, projectileSpeed: 4.2, bossComponents: [] });
          engine.entities.push(member);
          attachInteractiveMini(engine, member);
          return member;
        });
        updateInteractiveWallFire(engine, members);
        const surviving = paired ? members.slice(0, 1) : members;
        if (paired) members.slice(1).forEach(member => { member.hp = 0; member.markedForDeletion = true; });
        engine.frameCount += 60;
        updateInteractiveWallFire(engine, surviving);
        assert.equal(members[0].isCharging, true, 'the selected live vent owns the warning');
        const projectiles = () => engine.entities.filter(entity => entity.type === EntityType.PROJECTILE);
        engine.frameCount += 47;
        updateInteractiveWallFire(engine, surviving);
        assert.equal(projectiles().length, 0, 'no shot exists before the 48-frame warning completes');
        engine.frameCount++;
        updateInteractiveWallFire(engine, surviving);
        const shots = projectiles();
        assert.equal(shots.length, paired ? 2 : 1);
        for (const shot of shots) {
          assert.equal(shot.width, 12); assert.equal(shot.height, 12);
          assert.ok(Math.abs(Math.hypot(shot.vx, shot.vy) - 4.2) < 1e-12);
          assert.equal(shot.bossOwnerId, members[0].id);
          assert.ok(Math.abs(shot.x + shot.width / 2 - ventX) < 1e-12);
          assert.ok(Math.abs(shot.y + shot.height / 2 - ventY) < 1e-12);
          assert.ok(shot.y + shot.height / 2 + shot.vy * 180 > 760,
            'all sampled rounds pass every lower player start before the replay ends');
        }
        // Certify the actual emitted positions and velocities, not a copy of the
        // wall's angle math. C retains its normal uncertainty and player limits.
        const plan = {
          projectiles: shots.map(shot => ({ x: shot.x + shot.width / 2, y: shot.y + shot.height / 2,
            vx: shot.vx, vy: shot.vy, size: shot.width })),
          zones: [], lines: [], sockets: [{ x: ventX, y: ventY }],
          safeRoute: { x: ventX < 195 ? 338 : 52, y: 717.4 },
          warningFrames: 48, liveFrames: 180, recoveryFrames: 0, color: 'amber'
        };
        for (const x of [52, 123, 195, 267, 338]) for (const y of [464.2, 590.8, 717.4]) {
          const proof = proveRevampBossAttack(plan, { x, y });
          assert.equal(proof.status, 'proven', `${paired}/${ventX},${ventY}/${x},${y}`);
          assert.ok(proof.minimumClearancePixels >= 6);
          assert.equal(proof.checkedFrames, 228);
          scenarios++;
        }
      }
    }
  }
  assert.equal(scenarios, 840);
});
