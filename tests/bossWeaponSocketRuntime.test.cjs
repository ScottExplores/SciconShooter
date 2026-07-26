const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

const loadTypeScriptModule = (relativePath) => {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module, require, Math, Number, Object }
  );
  return module.exports;
};

const toPlain = (value) => JSON.parse(JSON.stringify(value));

const profile = {
  kind: 'normalized-boss-sockets-v1',
  sockets: [
    { id: 'port-claw', role: 'port', xRatio: 0.2, yRatio: 0.25 },
    { id: 'starboard-claw', role: 'starboard', xRatio: 0.8, yRatio: 0.75 },
    { id: 'core', role: 'core', xRatio: 0.5, yRatio: 0.4 }
  ]
};

test('normalized boss sockets sample deterministically inside the supplied boss bounds', () => {
  const {
    BOSS_WEAPON_SOCKET_ROLES,
    sampleBossWeaponSockets
  } = loadTypeScriptModule('services/gameplay/bosses/BossWeaponSocketRuntime.ts');
  const input = {
    profile,
    x: 100,
    y: 200,
    width: 400,
    height: 300
  };
  const first = sampleBossWeaponSockets(input);
  const repeated = sampleBossWeaponSockets(input);

  assert.deepEqual(Array.from(BOSS_WEAPON_SOCKET_ROLES), ['core', 'port', 'starboard']);
  assert.deepEqual(toPlain(first), [
    { id: 'port-claw', role: 'port', xRatio: 0.2, yRatio: 0.25, x: 180, y: 275 },
    { id: 'starboard-claw', role: 'starboard', xRatio: 0.8, yRatio: 0.75, x: 420, y: 425 },
    { id: 'core', role: 'core', xRatio: 0.5, yRatio: 0.4, x: 300, y: 320 }
  ]);
  assert.deepEqual(toPlain(repeated), toPlain(first));
  assert.equal(Object.isFrozen(first), true);
  first.forEach((socket) => assert.equal(Object.isFrozen(socket), true));
});

test('boss socket role filtering preserves authored order and exact anatomy ownership', () => {
  const { sampleBossWeaponSockets } = loadTypeScriptModule(
    'services/gameplay/bosses/BossWeaponSocketRuntime.ts'
  );
  const port = sampleBossWeaponSockets({
    profile,
    role: 'port',
    x: 10,
    y: 20,
    width: 100,
    height: 200
  });
  const core = sampleBossWeaponSockets({
    profile,
    role: 'core',
    x: 10,
    y: 20,
    width: 100,
    height: 200
  });

  assert.deepEqual(toPlain(port), [
    { id: 'port-claw', role: 'port', xRatio: 0.2, yRatio: 0.25, x: 30, y: 70 }
  ]);
  assert.deepEqual(toPlain(core), [
    { id: 'core', role: 'core', xRatio: 0.5, yRatio: 0.4, x: 60, y: 100 }
  ]);
});

test('boss socket sampling clamps ratios and unsafe dimensions without mutating the profile', () => {
  const { sampleBossWeaponSockets } = loadTypeScriptModule(
    'services/gameplay/bosses/BossWeaponSocketRuntime.ts'
  );
  const clampedProfile = {
    kind: 'normalized-boss-sockets-v1',
    sockets: [
      { id: 'below', role: 'port', xRatio: -2, yRatio: -0.1 },
      { id: 'above', role: 'starboard', xRatio: 3, yRatio: 1.5 }
    ]
  };
  const snapshot = structuredClone(clampedProfile);

  assert.deepEqual(toPlain(sampleBossWeaponSockets({
    profile: clampedProfile,
    x: 25,
    y: 40,
    width: 200,
    height: 100
  })), [
    { id: 'below', role: 'port', xRatio: -2, yRatio: -0.1, x: 25, y: 40 },
    { id: 'above', role: 'starboard', xRatio: 3, yRatio: 1.5, x: 225, y: 140 }
  ]);
  assert.deepEqual(toPlain(sampleBossWeaponSockets({
    profile: clampedProfile,
    x: 25,
    y: 40,
    width: -200,
    height: Number.POSITIVE_INFINITY
  })), [
    { id: 'below', role: 'port', xRatio: -2, yRatio: -0.1, x: 25, y: 40 },
    { id: 'above', role: 'starboard', xRatio: 3, yRatio: 1.5, x: 25, y: 40 }
  ]);
  assert.deepEqual(clampedProfile, snapshot);
  assert.equal(sampleBossWeaponSockets({
    profile: undefined,
    x: 0,
    y: 0,
    width: 10,
    height: 10
  }).length, 0);
  assert.equal(sampleBossWeaponSockets({
    profile: { kind: 'unsupported', sockets: [] },
    x: 0,
    y: 0,
    width: 10,
    height: 10
  }).length, 0);
});
