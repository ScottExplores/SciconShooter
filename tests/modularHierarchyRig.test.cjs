const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const rigRoot = path.join(root, 'services', 'pixi', 'boss-rigs');

const transpile = (fileName, moduleOverrides = Object.freeze({})) => {
  const source = fs.readFileSync(path.join(rigRoot, fileName), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const moduleBox = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    {
      module: moduleBox,
      exports: moduleBox.exports,
      require: (specifier) => moduleOverrides[specifier] ?? require(specifier),
      Array,
      Error,
      Map,
      Math,
      Number,
      Object,
      Set,
      String
    }
  );
  return { exports: moduleBox.exports, source };
};

const runtime = transpile('ModularHierarchyRig.ts');
const destructionRuntime = transpile('ModularBossDestructionRuntime.ts');
const gloamforge = transpile('GloamforgeModularPose.ts');
const socketRuntime = transpile('ModularBossWeaponSocketRuntime.ts', {
  './ModularHierarchyRig': runtime.exports
});

const PART_IDS = Array.from(gloamforge.exports.GLOAMFORGE_MODULAR_PART_IDS);
const FRAME_IDS = Array.from(gloamforge.exports.GLOAMFORGE_MODULAR_FRAME_IDS);

const virtualParts = new Set(['root', 'arm.port.mount', 'arm.starboard.mount']);
const hiddenParts = new Set([
  ...virtualParts,
  'baffle.port',
  'baffle.starboard',
  'cleaver',
  'muzzle.port',
  'muzzle.starboard'
]);

const frameForPart = Object.freeze({
  body: 'body.closed',
  'baffle.port': 'baffle.port',
  'baffle.starboard': 'baffle.starboard',
  'arm.port.shell': 'arm.port.shell',
  'arm.starboard.shell': 'arm.starboard.shell',
  'arm.port.inner': 'arm.port.inner',
  'arm.starboard.inner': 'arm.starboard.inner',
  'cannon.port': 'cannon.port.idle',
  'cannon.starboard': 'cannon.starboard.idle',
  'pod.port': 'pod.port',
  'pod.starboard': 'pod.starboard',
  'leg.outer-port': 'leg.outer-port',
  'leg.inner-port': 'leg.inner-port',
  'leg.inner-starboard': 'leg.inner-starboard',
  'leg.outer-starboard': 'leg.outer-starboard',
  cleaver: 'cleaver',
  exhaust: 'exhaust.small',
  'muzzle.port': 'muzzle.small',
  'muzzle.starboard': 'muzzle.small'
});

const parentForPart = Object.freeze({
  root: null,
  body: 'root',
  'baffle.port': 'body',
  'baffle.starboard': 'body',
  'arm.port.mount': 'root',
  'arm.starboard.mount': 'root',
  'arm.port.shell': 'arm.port.mount',
  'arm.starboard.shell': 'arm.starboard.mount',
  'arm.port.inner': 'body',
  'arm.starboard.inner': 'body',
  'cannon.port': 'arm.port.mount',
  'cannon.starboard': 'arm.starboard.mount',
  'pod.port': 'arm.port.mount',
  'pod.starboard': 'arm.starboard.mount',
  'leg.outer-port': 'body',
  'leg.inner-port': 'body',
  'leg.inner-starboard': 'body',
  'leg.outer-starboard': 'body',
  cleaver: 'body',
  exhaust: 'root',
  'muzzle.port': 'cannon.port',
  'muzzle.starboard': 'cannon.starboard'
});

const roleForPart = (partId) => {
  if (virtualParts.has(partId)) return 'joint';
  if (partId === 'body') return 'body';
  if (partId.startsWith('baffle.')) return 'armor';
  if (partId.startsWith('arm.')) return 'arm';
  if (partId.startsWith('cannon.')) return 'weapon';
  if (partId.startsWith('pod.')) return 'pod';
  if (partId.startsWith('leg.')) return 'stabilizer';
  if (partId === 'cleaver') return 'phase-attachment';
  if (partId === 'exhaust') return 'exhaust';
  return 'effect';
};

const buildManifest = () => {
  const frames = Object.fromEntries(FRAME_IDS.map((frameId, index) => [
    frameId,
    {
      x: (index % 8) * 8,
      y: Math.floor(index / 8) * 8,
      width: 8,
      height: 8
    }
  ]));
  const parts = PART_IDS.map((partId, index) => ({
    id: partId,
    role: roleForPart(partId),
    parentId: parentForPart[partId],
    frameId: frameForPart[partId] ?? null,
    transform: {
      x: partId === 'root'
        ? 100
        : partId === 'arm.port.mount'
          ? -30
          : partId === 'arm.starboard.mount'
            ? 30
            : partId === 'cannon.port'
              ? -20
              : partId === 'cannon.starboard'
                ? 20
                : 0,
      y: partId === 'root' ? 50 : 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1
    },
    anchor: virtualParts.has(partId) ? null : { x: 0.5, y: 0.5 },
    layer: index,
    visible: !hiddenParts.has(partId)
  }));
  return {
    kind: 'modular-hierarchy-v1',
    id: 'gloamforge-mantis',
    designSize: { width: 720, height: 620 },
    atlas: {
      url: '/gloamforge-mantis-atlas.png',
      contentHash: 'a'.repeat(64),
      width: 64,
      height: 32,
      frames
    },
    parts,
    animations: [
      {
        kind: 'fixed-frame-sequence-v1',
        id: 'exhaust-idle',
        partId: 'exhaust',
        frameIds: ['exhaust.small', 'exhaust.medium', 'exhaust.large'],
        frameHold: 3,
        loop: true
      },
      {
        kind: 'fixed-frame-sequence-v1',
        id: 'body-phase-open',
        partId: 'body',
        frameIds: ['body.closed', 'body.open'],
        frameHold: 5,
        loop: false
      }
    ],
    sockets: [
      { id: 'muzzle-port', role: 'projectile-muzzle', partId: 'cannon.port', x: -4, y: 0, rotation: 0 },
      { id: 'muzzle-starboard', role: 'projectile-muzzle', partId: 'cannon.starboard', x: 4, y: 0, rotation: 0 },
      { id: 'pod-port', role: 'detachable-pod', partId: 'pod.port', x: 0, y: 4, rotation: 0 },
      { id: 'pod-starboard', role: 'detachable-pod', partId: 'pod.starboard', x: 0, y: 4, rotation: 0 },
      { id: 'crucible-core', role: 'core-origin', partId: 'body', x: 0, y: 0, rotation: 0 },
      { id: 'cleaver-root', role: 'melee-root', partId: 'body', x: 0, y: 6, rotation: 0 }
    ]
  };
};

test('strict registration validates and freezes one complete Gloamforge hierarchy', () => {
  const manifest = buildManifest();
  const issues = runtime.exports.validateModularBossRigManifest(manifest);
  assert.equal(issues.length, 0);
  const registration = runtime.exports.registerModularBossRig(manifest);

  assert.equal(Object.isFrozen(registration.manifest), true);
  assert.equal(Object.isFrozen(registration.manifest.designSize), true);
  assert.equal(Object.isFrozen(registration.manifest.parts), true);
  assert.equal(registration.manifest.supplementalAtlases, undefined);
  assert.equal(registration.atlases.length, 1);
  assert.equal(registration.atlases[0], registration.manifest.atlas);
  assert.equal(Object.isFrozen(registration.atlases), true);
  assert.equal(Object.isFrozen(registration.frameById), true);
  assert.equal(Object.isFrozen(registration.atlasByFrameId), true);
  assert.equal(registration.frameById['body.closed'], registration.manifest.atlas.frames['body.closed']);
  assert.equal(registration.atlasByFrameId['body.closed'], registration.manifest.atlas);
  assert.equal(registration.topologicalPartIds[0], 'root');
  assert.ok(
    registration.topologicalPartIds.indexOf('arm.port.mount')
    < registration.topologicalPartIds.indexOf('cannon.port')
  );
  assert.equal(runtime.exports.sampleRegisteredModularBossAnimationFrame(
    registration,
    'exhaust-idle',
    0
  ), 'exhaust.small');
  assert.equal(runtime.exports.sampleRegisteredModularBossAnimationFrame(
    registration,
    'exhaust-idle',
    6
  ), 'exhaust.large');
  assert.equal(runtime.exports.sampleRegisteredModularBossAnimationFrame(
    registration,
    'exhaust-idle',
    9
  ), 'exhaust.small');
  assert.equal(gloamforge.exports.validateGloamforgeRigCompatibility(registration).length, 0);
});

test('supplemental atlases share one frozen frame namespace for parts, poses, and animations', () => {
  const manifest = buildManifest();
  manifest.supplementalAtlases = [
    {
      url: '/gloamforge-mantis-damage-atlas.png',
      contentHash: 'b'.repeat(64),
      width: 32,
      height: 16,
      frames: {
        'body.damage': { x: 0, y: 0, width: 16, height: 16 },
        'body.death': { x: 16, y: 0, width: 16, height: 16 }
      }
    }
  ];
  manifest.parts.find((part) => part.id === 'body').frameId = 'body.damage';
  manifest.animations.push({
    kind: 'fixed-frame-sequence-v1',
    id: 'body-damage-cycle',
    partId: 'body',
    frameIds: ['body.damage', 'body.death'],
    frameHold: 2,
    loop: false
  });

  assert.equal(runtime.exports.validateModularBossRigManifest(manifest).length, 0);
  const registration = runtime.exports.registerModularBossRig(manifest);
  const supplementalAtlas = registration.manifest.supplementalAtlases[0];

  assert.equal(registration.atlases.length, 2);
  assert.equal(registration.atlases[1], supplementalAtlas);
  assert.equal(Object.isFrozen(registration.manifest.supplementalAtlases), true);
  assert.equal(Object.isFrozen(supplementalAtlas), true);
  assert.equal(Object.isFrozen(supplementalAtlas.frames), true);
  assert.equal(Object.isFrozen(registration.frameById['body.damage']), true);
  assert.equal(registration.frameById['body.damage'], supplementalAtlas.frames['body.damage']);
  assert.equal(registration.atlasByFrameId['body.death'], supplementalAtlas);
  assert.equal(runtime.exports.sampleRegisteredModularBossAnimationFrame(
    registration,
    'body-damage-cycle',
    0
  ), 'body.damage');
  assert.equal(runtime.exports.sampleRegisteredModularBossAnimationFrame(
    registration,
    'body-damage-cycle',
    99
  ), 'body.death');

  const resolved = runtime.exports.resolveModularBossRigHierarchy(registration, {
    body: { frameId: 'body.death' }
  });
  assert.equal(resolved.partById.body.frameId, 'body.death');
  assert.equal(resolved.partById.body.frame, registration.frameById['body.death']);
});

test('registered destruction fragments are bounded, referenced, frozen, and deterministic', () => {
  const manifest = buildManifest();
  manifest.destruction = {
    durationFrames: 90,
    fragments: [{
      partId: 'body',
      delayFrames: 6,
      travelX: -84,
      travelY: 110,
      rotationRadians: -Math.PI * 1.5
    }]
  };
  assert.equal(runtime.exports.validateModularBossRigManifest(manifest).length, 0);
  const registration = runtime.exports.registerModularBossRig(manifest);
  assert.equal(Object.isFrozen(registration.manifest.destruction), true);
  assert.equal(Object.isFrozen(registration.manifest.destruction.fragments), true);
  assert.equal(Object.isFrozen(registration.manifest.destruction.fragments[0]), true);

  const fragment = registration.manifest.destruction.fragments[0];
  const before = destructionRuntime.exports.sampleModularBossDestructionFragment(
    registration.manifest.destruction,
    fragment,
    5
  );
  const midpoint = destructionRuntime.exports.sampleModularBossDestructionFragment(
    registration.manifest.destruction,
    fragment,
    48
  );
  const repeated = destructionRuntime.exports.sampleModularBossDestructionFragment(
    registration.manifest.destruction,
    fragment,
    48
  );
  assert.equal(before.visible, false);
  assert.equal(midpoint.visible, true);
  assert.ok(midpoint.xOffset < 0);
  assert.ok(midpoint.yOffset > 0);
  assert.deepEqual(midpoint, repeated);

  const broken = buildManifest();
  broken.destruction = {
    durationFrames: 30,
    fragments: [{
      partId: 'missing-fragment',
      delayFrames: 30,
      travelX: 0,
      travelY: 0,
      rotationRadians: 0
    }]
  };
  const issues = runtime.exports.validateModularBossRigManifest(broken);
  assert.ok(Array.from(issues).some((entry) => (
    entry.path === '/destruction/fragments/0/partId'
    && entry.code === 'missing_reference'
  )));
  assert.ok(Array.from(issues).some((entry) => (
    entry.path === '/destruction/fragments/0/delayFrames'
    && entry.code === 'out_of_bounds'
  )));
});

test('supplemental atlas validation rejects duplicate frame IDs and bounded-list overflow', () => {
  const duplicate = buildManifest();
  duplicate.supplementalAtlases = [{
    url: '/duplicate-atlas.png',
    contentHash: 'c'.repeat(64),
    width: 8,
    height: 8,
    frames: {
      'body.closed': { x: 0, y: 0, width: 8, height: 8 }
    }
  }];
  const duplicateIssues = runtime.exports.validateModularBossRigManifest(duplicate);
  assert.ok(Array.from(duplicateIssues).some((entry) => (
    entry.code === 'duplicate_id'
    && entry.path === '/supplementalAtlases/0/frames/body.closed'
  )));

  const overflow = buildManifest();
  overflow.supplementalAtlases = Array.from({ length: 9 }, (_, index) => ({
    url: `/supplemental-${index}.png`,
    contentHash: String(index + 1).repeat(64),
    width: 1,
    height: 1,
    frames: {
      [`supplemental.${index}`]: { x: 0, y: 0, width: 1, height: 1 }
    }
  }));
  const overflowIssues = runtime.exports.validateModularBossRigManifest(overflow);
  assert.ok(Array.from(overflowIssues).some((entry) => (
    entry.code === 'limit_exceeded'
    && entry.path === '/supplementalAtlases'
    && entry.message.includes('8')
  )));
});

test('validation rejects cycles, duplicate parts, invalid transforms, and broken fixed references', () => {
  const invalid = buildManifest();
  invalid.parts.push({ ...invalid.parts[1] });
  invalid.parts[0].parentId = 'body';
  invalid.parts[1].transform.x = Number.POSITIVE_INFINITY;
  invalid.parts[2].frameId = 'missing.frame';
  invalid.animations[0].frameIds[1] = 'missing.animation.frame';
  invalid.sockets[0].partId = 'missing-part';
  const issues = runtime.exports.validateModularBossRigManifest(invalid);
  const codes = new Set(Array.from(issues, (entry) => entry.code));

  assert.equal(codes.has('duplicate_id'), true);
  assert.equal(codes.has('cycle'), true);
  assert.equal(codes.has('invalid_type'), true);
  assert.equal(codes.has('missing_reference'), true);
});

test('world transforms carry joint motion into descendants and anatomy-owned sockets', () => {
  const registration = runtime.exports.registerModularBossRig(buildManifest());
  const resolved = runtime.exports.resolveModularBossRigHierarchy(registration, {
    root: { rotationOffset: Math.PI / 2 },
    'arm.port.mount': { xOffset: -2 }
  });
  const rootPart = resolved.partById.root;
  const portCannon = resolved.partById['cannon.port'];
  const portMuzzle = resolved.socketById['muzzle-port'];

  assert.equal(rootPart.frame, null);
  assert.equal(rootPart.visible, false);
  assert.ok(Math.abs(portCannon.worldTransform.tx - 100) < 1e-9);
  assert.ok(Math.abs(portCannon.worldTransform.ty - -2) < 1e-9);
  assert.ok(Math.abs(portMuzzle.worldX - 100) < 1e-9);
  assert.ok(Math.abs(portMuzzle.worldY - -6) < 1e-9);
  assert.ok(Math.abs(portMuzzle.worldRotation - Math.PI / 2) < 1e-9);
});

test('simulation socket sampler follows the exact modular limb pose deterministically', () => {
  const registration = runtime.exports.registerModularBossRig(buildManifest());
  const samplePose = (input) => ({
    'arm.port.mount': {
      rotationOffset: input.action?.side === 'port' ? Math.PI / 2 : 0
    }
  });
  const sampler = socketRuntime.exports.createModularBossWeaponSocketPoseSampler(
    registration,
    samplePose
  );
  const idleInput = {
    frameCount: 12,
    reducedMotion: false,
    healthRatio: 1,
    phaseIndex: 1
  };
  const firingInput = {
    ...idleInput,
    action: {
      primitiveId: 'side-barrage',
      stage: 'fire',
      progress: 0.5,
      side: 'port',
      sequence: 0
    }
  };
  const idle = sampler(idleInput);
  const firing = sampler(firingInput);
  const repeated = sampler(firingInput);
  const idlePort = idle.sockets.find((socket) => socket.id === 'muzzle-port');
  const firingPort = firing.sockets.find((socket) => socket.id === 'muzzle-port');
  const firingStarboard = firing.sockets.find((socket) => socket.id === 'muzzle-starboard');
  const core = firing.sockets.find((socket) => socket.id === 'crucible-core');

  assert.equal(idlePort.role, 'port');
  assert.equal(firingStarboard.role, 'starboard');
  assert.equal(core.role, 'core');
  assert.notEqual(firingPort.xRatio, idlePort.xRatio);
  assert.notEqual(firingPort.yRatio, idlePort.yRatio);
  assert.deepEqual(firing, repeated);
  assert.equal(Object.isFrozen(firing.sockets), true);
});

test('simulation socket sampler maps Prism left/right anatomy and filters each attack source', () => {
  const manifest = buildManifest();
  manifest.id = 'prism-moth-broodkeeper';
  manifest.sockets = [
    { id: 'wing-edge-left', role: 'projectile-muzzle', partId: 'cannon.port', x: -4, y: 0, rotation: 0 },
    { id: 'wing-edge-right', role: 'projectile-muzzle', partId: 'cannon.starboard', x: 4, y: 0, rotation: 0 },
    { id: 'wing-tip-left', role: 'projectile-muzzle', partId: 'cannon.port', x: -8, y: 0, rotation: 0 },
    { id: 'wing-tip-right', role: 'projectile-muzzle', partId: 'cannon.starboard', x: 8, y: 0, rotation: 0 },
    { id: 'brood-release-left', role: 'detachable-pod', partId: 'pod.port', x: 0, y: 4, rotation: 0 },
    { id: 'brood-release-right', role: 'detachable-pod', partId: 'pod.starboard', x: 0, y: 4, rotation: 0 },
    { id: 'prism-core', role: 'core-origin', partId: 'body', x: 0, y: 0, rotation: 0 }
  ];
  const registration = runtime.exports.registerModularBossRig(manifest);
  const sampler = socketRuntime.exports.createModularBossWeaponSocketPoseSampler(
    registration,
    () => ({})
  );
  const baseInput = {
    frameCount: 40,
    reducedMotion: false,
    healthRatio: 1,
    phaseIndex: 1
  };
  const sample = (primitiveId) => sampler({
    ...baseInput,
    action: {
      primitiveId,
      stage: 'fire',
      progress: 0.5,
      sequence: 0
    }
  });

  assert.deepEqual(
    Array.from(sample('prism-wingbeat-weave').sockets, (socket) => [socket.id, socket.role]),
    [
      ['wing-edge-left', 'port'],
      ['wing-edge-right', 'starboard'],
      ['wing-tip-left', 'port'],
      ['wing-tip-right', 'starboard']
    ]
  );
  assert.deepEqual(
    Array.from(sample('prism-brood-procession').sockets, (socket) => socket.id),
    ['brood-release-left', 'brood-release-right', 'prism-core']
  );
  assert.deepEqual(
    Array.from(sample('prism-lunar-swoop').sockets, (socket) => socket.id),
    ['wing-tip-left', 'wing-tip-right']
  );
  assert.deepEqual(
    Array.from(sample('prism-kaleidoscope-brood').sockets, (socket) => socket.id),
    ['brood-release-left', 'brood-release-right', 'prism-core']
  );
});

test('Gloamforge pose visibly braces, charges, fires, detaches pods, and deploys phase two', () => {
  const sample = gloamforge.exports.sampleGloamforgeModularPose;
  const base = {
    frameCount: 120,
    reducedMotion: false,
    healthRatio: 0.8,
    phaseIndex: 1
  };
  const idle = sample(base);
  assert.equal(idle.bodyFrameId, 'body.closed');
  assert.equal(idle.portCannonFrameId, 'cannon.port.idle');
  assert.equal(idle.partOverrides['muzzle.port'].visible, false);
  assert.equal(idle.partOverrides.cleaver.visible, false);

  const warning = sample({
    ...base,
    action: {
      primitiveId: 'side-barrage',
      stage: 'warning',
      progress: 0.8,
      side: 'port',
      motionCue: 'heavy-cannon'
    }
  });
  assert.equal(warning.portArmState, 'brace');
  assert.equal(warning.starboardArmState, 'idle');
  assert.equal(warning.portCannonFrameId, 'cannon.port.charge');
  assert.equal(warning.starboardCannonFrameId, 'cannon.starboard.idle');
  assert.ok(warning.partOverrides['arm.port.mount'].rotationOffset > 0);

  const firing = sample({
    ...base,
    frameCount: 120,
    action: {
      primitiveId: 'side-barrage',
      stage: 'fire',
      progress: 0.1,
      side: 'port',
      motionCue: 'heavy-cannon'
    }
  });
  assert.equal(firing.portArmState, 'open');
  assert.equal(firing.portCannonFrameId, 'cannon.port.fire');
  assert.equal(firing.partOverrides['muzzle.port'].visible, true);
  assert.equal(firing.partOverrides['muzzle.starboard'].visible, false);

  const pods = sample({
    ...base,
    action: {
      primitiveId: 'pod-volley',
      stage: 'fire',
      progress: 0.72,
      sequence: 0
    }
  });
  assert.ok(pods.portPodDetach > pods.starboardPodDetach);
  assert.ok(pods.partOverrides['pod.port'].yOffset > 20);
  assert.ok(pods.partOverrides['pod.port'].alpha < 1);

  const phaseTwo = sample({
    ...base,
    healthRatio: 0.3,
    phaseIndex: 2,
    phaseProgress: 1,
    action: {
      primitiveId: 'rail-sweep',
      stage: 'fire',
      progress: 0.5,
      motionCue: 'cleaver-sweep'
    }
  });
  assert.equal(phaseTwo.phaseTwo, true);
  assert.equal(phaseTwo.bodyFrameId, 'body.open');
  assert.equal(phaseTwo.cleaverDeployment, 1);
  assert.equal(phaseTwo.partOverrides.cleaver.visible, true);
  assert.equal(phaseTwo.partOverrides['baffle.port'].visible, true);
  assert.ok(phaseTwo.partOverrides.exhaust.scaleYMultiplier > idle.partOverrides.exhaust.scaleYMultiplier);
});

test('pose sampling is deterministic and reduced motion does not weaken authored attack state', () => {
  const input = {
    frameCount: 93,
    reducedMotion: false,
    healthRatio: 0.52,
    phaseIndex: 1,
    action: {
      primitiveId: 'gap-ring',
      stage: 'warning',
      progress: 0.7,
      sequence: 2,
      motionCue: 'crucible-ring'
    }
  };
  const full = gloamforge.exports.sampleGloamforgeModularPose(input);
  const repeated = gloamforge.exports.sampleGloamforgeModularPose(input);
  const reduced = gloamforge.exports.sampleGloamforgeModularPose({ ...input, reducedMotion: true });

  assert.deepEqual(JSON.parse(JSON.stringify(full)), JSON.parse(JSON.stringify(repeated)));
  assert.ok(Math.abs(reduced.partOverrides.root.yOffset) < Math.abs(full.partOverrides.root.yOffset));
  assert.equal(reduced.bodyFrameId, full.bodyFrameId);
  assert.equal(reduced.portArmState, full.portArmState);
  assert.doesNotMatch(
    gloamforge.source,
    /Math\.random|Date\.|performance\.|requestAnimationFrame|setTimeout|setInterval/
  );
});
