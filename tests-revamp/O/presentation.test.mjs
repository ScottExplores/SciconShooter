import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

globalThis.navigator ??= { userAgent: 'node-test' };
const bundle = await build({
  stdin: { contents: `
    export { InteractiveBossPresentation, interactiveBossPalette } from './services/revamp/bosses/InteractiveBossPresentation';
    export { createBossEncounter } from './services/revamp/bosses/runtime';
    export { getRevampBoss } from './services/revamp/bosses/catalog';
    export { setInteractiveLayer, updateInteractivePartDamage } from './services/revamp/bosses/interactive';
    export { MiniInteractivePresentation } from './services/revamp/bosses/MiniInteractivePresentation';
    export { attachInteractiveMini, getInteractiveMini } from './services/revamp/bosses/miniInteractive';
    export { createBossAttackPlan } from './services/revamp/bosses/patterns';
    export { Graphics } from 'pixi.js';
  `, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent',
});
const directory = await mkdtemp(join(tmpdir(), 'scicon-O-presentation-'));
after(() => rm(directory, { recursive: true, force: true }));
await writeFile(join(directory, 'bundle.mjs'), bundle.outputFiles[0].text);
const { InteractiveBossPresentation, interactiveBossPalette, createBossEncounter, getRevampBoss,
  setInteractiveLayer, updateInteractivePartDamage, MiniInteractivePresentation, attachInteractiveMini,
  getInteractiveMini, createBossAttackPlan, Graphics } = await import(pathToFileURL(join(directory, 'bundle.mjs')));

function fixture(id = 'gatekeeper-prime') {
  const boss = { x: 70, y: 148, width: 250, height: 200 };
  const state = createBossEncounter(boss, getRevampBoss(id), 1000, 'major');
  state.stage = 'warning';
  const anatomy = state.interactive;
  anatomy.coreX = 195; anatomy.coreY = 304; anatomy.hangarX = 195; anatomy.hangarY = 264;
  for (const part of anatomy.parts) {
    part.x = boss.x + boss.width * part.xRatio;
    part.y = boss.y + boss.height * part.yRatio;
  }
  const view = new InteractiveBossPresentation();
  const sync = () => view.sync(state, boss, 390, 844, false);
  const destroy = () => { view.root.destroy({ children: true }); view.arenaRoot.destroy({ children: true }); };
  return { boss, state, anatomy, view, sync, destroy };
}
const descendants = (root) => [root, ...root.children.flatMap(child => child.children ? descendants(child) : [child])];

test('part HP, damage state and destruction are independently visible with retained geometry', () => {
  const f = fixture();
  try {
    f.sync();
    const first = f.view.root.children[2];
    const second = f.view.root.children[3];
    const originalArmor = first.children[1].context.instructions[0];
    assert.equal(first.visible, true);
    assert.equal(second.visible, true);
    assert.equal(f.view.root.children[4].visible, false, 'second-layer weapons stay inside hull');
    f.anatomy.parts[0].hp *= 0.5;
    updateInteractivePartDamage(f.anatomy.parts[0]);
    f.sync();
    assert.equal(first.children[4].scale.x, 0.5);
    assert.equal(second.children[4].scale.x, 1);
    assert.notEqual(first.children[1].context.instructions[0], originalArmor, 'cracked pixels replace intact plate');
    f.anatomy.parts[0].hp = 0; f.anatomy.parts[0].broken = true;
    updateInteractivePartDamage(f.anatomy.parts[0]);
    f.sync();
    assert.equal(first.visible, true, 'destroyed fitting remains as attached wreckage');
    assert.equal(first.children[2].visible, false, 'destroyed muzzle is extinguished');
    assert.equal(first.children[4].visible, false, 'destroyed part no longer has an HP strip');
    assert.ok(first.children.slice(5).every(puff => puff.visible));
  } finally { f.destroy(); }
});

test('hatch doors open at runtime sockets and transformation preserves handed shell pieces', () => {
  const f = fixture('prism-moth');
  try {
    f.sync();
    const [core, hangar] = f.view.root.children;
    assert.deepEqual([core.x, core.y], [195, 304]);
    assert.deepEqual([hangar.x, hangar.y], [195, 264]);
    assert.equal(core.children[4].x, 0);
    assert.equal(core.children[5].x, 0);
    f.anatomy.coreOpen = 1; f.anatomy.hatchOpen = 1; f.anatomy.transform = 1;
    setInteractiveLayer(f.anatomy, 2);
    f.sync();
    assert.ok(core.children[4].x < 0 && core.children[5].x > 0, 'core doors retract in opposite directions');
    assert.ok(hangar.children[1].x < 0 && hangar.children[2].x > 0, 'escort hatch physically opens');
    assert.ok(core.children[0].x < 0 && core.children[1].x > 0, 'shell opens without mirroring source anatomy');
    assert.equal(f.view.root.children[4].visible, true, 'second armament layer emerges');
    assert.equal(f.view.root.children[2].visible, false, 'unbroken inactive layer has no duplicate fitting');
  } finally { f.destroy(); }
});

test('translation, pulses and open/close cycles allocate no new display objects or paths', () => {
  const f = fixture();
  try {
    f.sync();
    const initial = descendants(f.view.root);
    let clears = 0;
    for (const object of [...initial, ...descendants(f.view.arenaRoot)]) {
      if (!(object instanceof Graphics)) continue;
      const clear = object.clear.bind(object);
      object.clear = () => { clears++; return clear(); };
    }
    for (let frame = 0; frame < 120; frame++) {
      f.state.ageFrames = frame;
      f.boss.x += 0.25; f.boss.y += 0.25;
      for (const part of f.anatomy.parts) { part.x += 0.25; part.y += 0.25; }
      f.anatomy.coreX += 0.25; f.anatomy.coreY += 0.25;
      f.anatomy.hangarX += 0.25; f.anatomy.hangarY += 0.25;
      f.anatomy.coreOpen = frame % 30 / 30;
      f.anatomy.hatchOpen = frame % 20 / 20;
      f.sync();
    }
    assert.deepEqual(descendants(f.view.root), initial);
    assert.equal(clears, 0, 'only changed part state, layer, size or arena mode rebuilds pixel geometry');
    f.view.hide();
    assert.equal(f.view.root.visible, false);
    assert.equal(f.view.arenaRoot.visible, false);
  } finally { f.destroy(); }
});

test('four existing boss families receive palette-matched transformation silhouettes', () => {
  const palettes = ['prism-moth', 'frontier-crownclaw', 'helios-clawcarrier', 'gatekeeper-prime'].map(interactiveBossPalette);
  assert.equal(new Set(palettes.map(palette => palette.motif)).size, 4);
  assert.equal(new Set(palettes.map(palette => palette.armor)).size, 4);
  const paywall = interactiveBossPalette('paywall-decimator');
  assert.ok((paywall.armor >> 16) > (paywall.armor >> 8 & 255), 'red Paywall hull receives red armor');
  assert.ok((paywall.energy >> 8 & 255) > (paywall.energy >> 16), 'Paywall energy uses its source green');
  assert.deepEqual(interactiveBossPalette('paywall-wall'), interactiveBossPalette('unlisted'),
    'the exact major-art palette does not recolor segmented mini walls');
  const fracture = interactiveBossPalette('fracture-engine-elite');
  assert.ok((fracture.armor >> 16) > (fracture.armor >> 8 & 255)
    && (fracture.armor & 255) > (fracture.armor >> 8 & 255), 'Fracture fittings use the purple source armor');
  assert.deepEqual(interactiveBossPalette('fracture-engine-other'), interactiveBossPalette('unlisted'),
    'mini source matches stay exact');
});

test('Gloamforge fittings stay within its painted lower chassis in both layers', () => {
  const f = fixture('hammerhead-siege');
  try {
    // Its transparent source canvas extends well below the painted legs. The
    // screenshot regression is empty space between the hull and both fittings.
    for (const layer of [1, 2]) {
      setInteractiveLayer(f.anatomy, layer);
      f.sync();
      const parts = f.anatomy.parts.filter(part => part.layer === layer);
      assert.deepEqual(parts.map(part => part.xRatio).sort(), layer === 1 ? [0.27, 0.73] : [0.38, 0.62],
        'the handed horizontal sockets are unchanged');
      for (const part of parts) {
        const index = f.anatomy.parts.indexOf(part);
        const display = f.view.root.children[index + 2];
        assert.equal(display.visible, true);
        assert.equal(display.y, Math.round(part.y), 'rendered fitting and attack/collision socket agree');
        assert.ok(part.y - part.radius >= f.boss.y + f.boss.height * 0.55,
          'fitting stays below the shoulder weapons');
        assert.ok(part.y + part.radius <= f.boss.y + f.boss.height * 0.82,
          'fitting does not hang in transparent lower canvas');
      }
    }
  } finally { f.destroy(); }
});

test('paired mini hardware keeps separate HP and is removed immediately with its owner', () => {
  const first = { id: 'one', sourceItemId: 'twin-meridian-sentinels', x: 30, y: 140, width: 140, height: 120,
    hp: 100, maxHp: 100, bossComponents: [] };
  const second = { ...first, id: 'two', x: 220 };
  const engine = { frameCount: 0, entities: [first, second] };
  attachInteractiveMini(engine, first); attachInteractiveMini(engine, second);
  const state = getInteractiveMini(first);
  const other = getInteractiveMini(second);
  state.stage = other.stage = 'fire';
  const view = new MiniInteractivePresentation();
  try {
    assert.equal(view.sync(engine, false), true);
    assert.equal(view.root.children.length, 2);
    const [one, two] = view.root.children;
    assert.equal(one.children[2].x, Math.round(state.parts[0].x));
    assert.equal(two.children[2].x, Math.round(other.parts[0].x));
    state.parts[0].broken = true; state.parts[0].hp = 0;
    state.phase = 2; state.openAmount = 1;
    view.sync(engine, false);
    assert.equal(one.children[2].children[3].visible, false);
    assert.equal(two.children[2].children[3].visible, true);
    assert.ok(one.children[1].children[1].x < 0);
    second.bossPresentationBankRadians = Math.PI / 2;
    view.sync(engine, false);
    assert.equal(two.children[2].rotation, Math.PI / 2, 'hardware shares the authored hull bank');
    assert.equal(two.children[2].x, Math.round(second.x + second.width / 2 - second.height * 0.4));
    assert.equal(two.children[1].x, Math.round(second.x + second.width / 2 - second.height * 0.18), 'open core stays attached through a quarter turn');
    first.markedForDeletion = true;
    view.sync(engine, false);
    assert.equal(view.root.children.length, 1);
    assert.equal(one.destroyed, true, 'removed mini leaves no health bar or hazard cue');
    engine.entities = [];
    assert.equal(view.sync(engine, false), false);
    assert.equal(view.root.children.length, 0);
  } finally { view.root.destroy({ children: true }); }
});

test('small drone warning follows its exact locked plan and disappears before recovery', () => {
  const boss = { id: 'drone', sourceItemId: 'bottleneck-drone', x: 100, y: 140, width: 160, height: 120,
    hp: 100, maxHp: 100, bossComponents: [] };
  const engine = { frameCount: 0, entities: [boss] };
  attachInteractiveMini(engine, boss);
  const state = getInteractiveMini(boss);
  state.stage = 'warning';
  state.drone.plan = createBossAttackPlan({ origin: { x: 140, y: 240 }, player: { x: 195, y: 650 },
    attack: getRevampBoss('gatekeeper-prime').attacks[0], phase: 1, sequence: 0, rage: false });
  const view = new MiniInteractivePresentation();
  try {
    view.sync(engine, false);
    const warning = view.root.children[0].children[0];
    assert.equal(warning.visible, true);
    assert.ok(warning.context.instructions.length >= state.drone.plan.lines.length * 2);
    const firstPath = warning.context.instructions[0];
    for (let frame = 0; frame < 48; frame++) { state.ageFrames++; view.sync(engine, false); }
    assert.equal(warning.context.instructions[0], firstPath, 'locked warning geometry survives pulses');
    state.stage = 'recovery'; view.sync(engine, false);
    assert.equal(warning.visible, false);
  } finally { view.root.destroy({ children: true }); }
});

test('wall vent warning follows its live marching segment without covering original segment art', () => {
  const boss = { id: 'wall', sourceItemId: 'paywall-wall', x: 120, y: 100, width: 54, height: 48,
    hp: 100, maxHp: 100, bossComponents: [], isCharging: true };
  const engine = { frameCount: 0, entities: [boss] };
  attachInteractiveMini(engine, boss);
  const view = new MiniInteractivePresentation();
  try {
    view.sync(engine, false);
    const [warning, core] = view.root.children[0].children;
    assert.equal(core.visible, false, 'wall retains its existing segmented body');
    assert.equal(warning.visible, true);
    assert.deepEqual([warning.x, warning.y], [147, 148]);
    const path = warning.context.instructions[0];
    boss.x += 10; boss.y += 2;
    view.sync(engine, false);
    assert.deepEqual([warning.x, warning.y], [157, 150]);
    assert.equal(warning.context.instructions[0], path);
    boss.isCharging = false;
    view.sync(engine, false);
    assert.equal(warning.visible, false);
  } finally { view.root.destroy({ children: true }); }
});
