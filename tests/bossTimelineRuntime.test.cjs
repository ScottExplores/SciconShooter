const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const loadRuntime = () => {
  const source = fs.readFileSync(
    path.join(root, 'services', 'gameplay', 'bosses', 'BossTimelineRuntime.ts'),
    'utf8'
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const moduleBox = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module: moduleBox, require, Math, Number, Object, Array }
  );
  return moduleBox.exports;
};

const timeline = {
  durationSeconds: 2,
  loop: true,
  clips: [
    {
      id: 'opening-warning',
      label: 'Opening warning',
      track: 'presentation',
      primitiveId: 'telegraph',
      trigger: 'time',
      startSeconds: 0.25,
      durationSeconds: 0.25,
      phaseId: 'opening'
    },
    {
      id: 'opening-burst',
      label: 'Opening burst',
      track: 'attack',
      primitiveId: 'aimed-burst',
      trigger: 'time',
      startSeconds: 0.5,
      durationSeconds: 0.1,
      phaseId: 'opening',
      telegraphClipId: 'opening-warning',
      repeat: { count: 3, intervalSeconds: 0.25 }
    },
    {
      id: 'rage-shields',
      label: 'Rage shields',
      track: 'defense',
      primitiveId: 'set-shield',
      trigger: 'phase-enter',
      startSeconds: 0,
      durationSeconds: 0.1,
      phaseId: 'rage',
      parameters: { shieldCount: 4 }
    },
    {
      id: 'death-flash',
      label: 'Death flash',
      track: 'presentation',
      primitiveId: 'effect-cue',
      trigger: 'death',
      startSeconds: 0,
      durationSeconds: 0.2
    }
  ]
};

const authoredTimeline = {
  durationSeconds: 2.5,
  loop: true,
  clips: [
    {
      id: 'opening-pulse-warning',
      label: 'Opening pulse warning',
      track: 'presentation',
      primitiveId: 'telegraph',
      trigger: 'time',
      startSeconds: 0.1,
      durationSeconds: 0.2,
      phaseId: 'opening',
      repeat: { count: 2, intervalSeconds: 0.5 }
    },
    {
      id: 'opening-pulse',
      label: 'Opening pulse',
      track: 'attack',
      primitiveId: 'gap-ring',
      trigger: 'time',
      startSeconds: 0.3,
      durationSeconds: 0.1,
      phaseId: 'opening',
      telegraphClipId: 'opening-pulse-warning',
      repeat: { count: 2, intervalSeconds: 0.5 }
    },
    {
      id: 'opening-gate-warning',
      label: 'Opening gate warning',
      track: 'presentation',
      primitiveId: 'telegraph',
      trigger: 'time',
      startSeconds: 1,
      durationSeconds: 0.2,
      phaseId: 'opening'
    },
    {
      id: 'opening-gate',
      label: 'Opening gate',
      track: 'attack',
      primitiveId: 'weave-wall',
      trigger: 'time',
      startSeconds: 1.2,
      durationSeconds: 0.1,
      phaseId: 'opening',
      telegraphClipId: 'opening-gate-warning'
    },
    {
      id: 'opening-corridor-recovery',
      label: 'Opening corridor recovery',
      track: 'presentation',
      primitiveId: 'effect-cue',
      trigger: 'time',
      startSeconds: 1.4,
      durationSeconds: 0.3,
      phaseId: 'opening'
    },
    {
      id: 'rage-pulse-warning',
      label: 'Rage pulse warning',
      track: 'presentation',
      primitiveId: 'telegraph',
      trigger: 'time',
      startSeconds: 0.2,
      durationSeconds: 0.2,
      phaseId: 'rage'
    },
    {
      id: 'rage-pulse',
      label: 'Rage pulse',
      track: 'attack',
      primitiveId: 'gap-ring',
      trigger: 'time',
      startSeconds: 0.4,
      durationSeconds: 0.1,
      phaseId: 'rage',
      telegraphClipId: 'rage-pulse-warning'
    },
    {
      id: 'rage-gate-warning',
      label: 'Rage gate warning',
      track: 'presentation',
      primitiveId: 'telegraph',
      trigger: 'time',
      startSeconds: 0.8,
      durationSeconds: 0.2,
      phaseId: 'rage'
    },
    {
      id: 'rage-gate',
      label: 'Rage gate',
      track: 'attack',
      primitiveId: 'weave-wall',
      trigger: 'time',
      startSeconds: 1,
      durationSeconds: 0.1,
      phaseId: 'rage',
      telegraphClipId: 'rage-gate-warning'
    },
    {
      id: 'rage-corridor-recovery',
      label: 'Rage corridor recovery',
      track: 'presentation',
      primitiveId: 'effect-cue',
      trigger: 'time',
      startSeconds: 1.2,
      durationSeconds: 0.3,
      phaseId: 'rage'
    }
  ],
  attacks: [{
    id: 'corridor',
    label: 'Revenant corridor',
    role: 'signature',
    skillTest: 'route-combination',
    recognitionCue: 'Both claws close around the core.',
    solution: 'Follow the warned opening, then change lanes.',
    safeRouteRule: 'channel-to-quadrant',
    sourceSocketRoles: ['port', 'starboard', 'core'],
    variants: [
      {
        phaseId: 'opening',
        beatClipIds: ['opening-pulse', 'opening-gate'],
        recoveryClipId: 'opening-corridor-recovery'
      },
      {
        phaseId: 'rage',
        beatClipIds: ['rage-pulse', 'rage-gate'],
        recoveryClipId: 'rage-corridor-recovery'
      }
    ]
  }]
};

test('boss timeline schedules bounded repeated cues on deterministic simulation frames', () => {
  const {
    getBossTimelineCuesAtFrame,
    getBossTimelineDurationFrames
  } = loadRuntime();

  assert.equal(getBossTimelineDurationFrames(timeline, 60), 120);
  assert.deepEqual(
    Array.from(getBossTimelineCuesAtFrame(timeline, 30, 'opening', 60), (cue) => [
      cue.clip.id,
      cue.executionIndex,
      cue.timelineFrame
    ]),
    [['opening-burst', 0, 30]]
  );
  assert.deepEqual(
    Array.from(getBossTimelineCuesAtFrame(timeline, 45, 'opening', 60), (cue) => [
      cue.clip.id,
      cue.executionIndex
    ]),
    [['opening-burst', 1]]
  );
  assert.deepEqual(
    Array.from(getBossTimelineCuesAtFrame(timeline, 150, 'opening', 60), (cue) => cue.clip.id),
    ['opening-burst'],
    'looping must replay the same cue at the same phase-relative frame'
  );
  assert.equal(getBossTimelineCuesAtFrame(timeline, 30, 'rage', 60).length, 0);
});

test('manual attack starts at its linked telegraph even when the damage window is tiny', () => {
  const {
    getBossTimelineAttackStartFrame,
    getBossTimelineCuesAtFrame
  } = loadRuntime();

  assert.equal(
    getBossTimelineAttackStartFrame(timeline, 'opening-burst', 'opening', 60),
    15,
    'the manual attack sentence must begin at the 0.25 second warning'
  );
  assert.deepEqual(
    Array.from(
      getBossTimelineCuesAtFrame(timeline, 15, 'opening', 60),
      (cue) => cue.clip.id
    ),
    ['opening-warning']
  );
  assert.deepEqual(
    Array.from(
      getBossTimelineCuesAtFrame(timeline, 30, 'opening', 60),
      (cue) => cue.clip.id
    ),
    ['opening-burst'],
    'a 0.1 second damaging clip still executes on its exact simulation frame'
  );
  assert.equal(
    getBossTimelineAttackStartFrame(timeline, 'opening-burst', 'rage', 60),
    null,
    'manual lookup cannot cross authored phase boundaries'
  );
  assert.equal(
    getBossTimelineAttackStartFrame(timeline, 'missing-attack', 'opening', 60),
    null
  );
});

test('attack playback windows include the full grouped recovery and legacy repeated clip', () => {
  const { getBossTimelineAttackWindow } = loadRuntime();

  assert.deepEqual(
    JSON.parse(JSON.stringify(getBossTimelineAttackWindow(
      authoredTimeline,
      'corridor',
      'opening',
      60
    ))),
    {
      attackId: 'corridor',
      phaseId: 'opening',
      startFrame: 6,
      endFrame: 102
    }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(getBossTimelineAttackWindow(
      timeline,
      'opening-burst',
      'opening',
      60
    ))),
    {
      attackId: 'opening-burst',
      phaseId: 'opening',
      startFrame: 15,
      endFrame: 66
    }
  );
  assert.equal(getBossTimelineAttackWindow(timeline, 'missing', 'opening', 60), null);
});

test('authored attack sentences resolve only the requested phase variant', () => {
  const { resolveBossTimelineAttackVariant } = loadRuntime();

  const opening = resolveBossTimelineAttackVariant(authoredTimeline, 'corridor', 'opening');
  assert.equal(opening.attack.id, 'corridor');
  assert.equal(opening.attack.role, 'signature');
  assert.equal(opening.variant.phaseId, 'opening');
  assert.deepEqual(Array.from(opening.variant.beatClipIds), ['opening-pulse', 'opening-gate']);

  assert.equal(
    resolveBossTimelineAttackVariant(authoredTimeline, 'corridor'),
    null,
    'a multi-phase attack is ambiguous without a phase'
  );
  assert.equal(
    resolveBossTimelineAttackVariant(authoredTimeline, 'corridor', 'missing'),
    null
  );
  assert.equal(
    resolveBossTimelineAttackVariant(authoredTimeline, 'missing', 'opening'),
    null
  );

  const oneVariantTimeline = {
    ...authoredTimeline,
    attacks: [{
      ...authoredTimeline.attacks[0],
      variants: [authoredTimeline.attacks[0].variants[0]]
    }]
  };
  assert.equal(
    resolveBossTimelineAttackVariant(oneVariantTimeline, 'corridor').variant.phaseId,
    'opening',
    'one variant remains safe to resolve without redundant phase input'
  );
});

test('manual trigger resolves the authored sentence before the legacy clip fallback', () => {
  const { getBossTimelineAttackStartFrame } = loadRuntime();

  assert.equal(
    getBossTimelineAttackStartFrame(authoredTimeline, 'corridor', 'opening', 60),
    6,
    'the opening phase starts from the first linked warning'
  );
  assert.equal(
    getBossTimelineAttackStartFrame(authoredTimeline, 'corridor', 'rage', 60),
    12,
    'the same attack ID resolves a different phase-owned warning'
  );
  assert.equal(
    getBossTimelineAttackStartFrame(authoredTimeline, 'opening-pulse', 'opening', 60),
    6,
    'old single damaging clip IDs remain valid preview commands'
  );
  assert.equal(
    getBossTimelineAttackStartFrame(authoredTimeline, 'corridor', 'missing', 60),
    null,
    'authored attack IDs cannot leak into another phase'
  );
});

test('active attack diagnostics expand repeats and report warning, fire, transition, and recovery', () => {
  const { getBossTimelineActiveAttackAtFrame } = loadRuntime();
  const activeAt = (frame) => getBossTimelineActiveAttackAtFrame(
    authoredTimeline,
    frame,
    'opening',
    60
  );

  const firstWarning = activeAt(6);
  assert.equal(firstWarning.stage, 'warning');
  assert.equal(firstWarning.attack.id, 'corridor');
  assert.equal(firstWarning.phaseId, 'opening');
  assert.equal(firstWarning.beatIndex, 1);
  assert.equal(firstWarning.beatCount, 3);
  assert.equal(firstWarning.executionIndex, 0);
  assert.equal(firstWarning.beatClip.id, 'opening-pulse');
  assert.equal(firstWarning.activeClip.id, 'opening-pulse-warning');

  const firstFire = activeAt(18);
  assert.equal(firstFire.stage, 'fire');
  assert.equal(firstFire.beatIndex, 1);
  assert.equal(firstFire.activeClip.id, 'opening-pulse');

  const firstTransition = activeAt(30);
  assert.equal(firstTransition.stage, 'transition');
  assert.equal(firstTransition.beatIndex, 2);
  assert.equal(firstTransition.executionIndex, 1);

  const repeatedWarning = activeAt(36);
  assert.equal(repeatedWarning.stage, 'warning');
  assert.equal(repeatedWarning.beatIndex, 2);
  assert.equal(repeatedWarning.executionIndex, 1);

  const repeatedFire = activeAt(48);
  assert.equal(repeatedFire.stage, 'fire');
  assert.equal(repeatedFire.beatIndex, 2);
  assert.equal(repeatedFire.executionIndex, 1);

  const nextBeatTransition = activeAt(56);
  assert.equal(nextBeatTransition.stage, 'transition');
  assert.equal(nextBeatTransition.beatIndex, 3);
  assert.equal(nextBeatTransition.beatClip.id, 'opening-gate');

  const finalWarning = activeAt(60);
  assert.equal(finalWarning.stage, 'warning');
  assert.equal(finalWarning.beatIndex, 3);
  assert.equal(finalWarning.activeClip.id, 'opening-gate-warning');

  const finalFire = activeAt(72);
  assert.equal(finalFire.stage, 'fire');
  assert.equal(finalFire.beatIndex, 3);

  const settle = activeAt(80);
  assert.equal(settle.stage, 'transition');
  assert.equal(settle.beatIndex, 3);

  const recovery = activeAt(84);
  assert.equal(recovery.stage, 'recovery');
  assert.equal(recovery.beatIndex, 3);
  assert.equal(recovery.activeClip.id, 'opening-corridor-recovery');

  assert.equal(activeAt(102), null, 'the attack ends when its recovery window closes');
  assert.equal(
    activeAt(156).stage,
    'warning',
    'loop normalization reports the same deterministic attack stage'
  );
});

test('active attack diagnostics stay phase-owned and respect a non-looping endpoint', () => {
  const { getBossTimelineActiveAttackAtFrame } = loadRuntime();
  const rage = getBossTimelineActiveAttackAtFrame(authoredTimeline, 12, 'rage', 60);
  assert.equal(rage.phaseId, 'rage');
  assert.equal(rage.stage, 'warning');
  assert.equal(rage.beatCount, 2);
  assert.equal(rage.beatClip.id, 'rage-pulse');

  const nonLooping = { ...authoredTimeline, loop: false };
  assert.equal(
    getBossTimelineActiveAttackAtFrame(nonLooping, 151, 'opening', 60),
    null
  );
  assert.equal(
    getBossTimelineActiveAttackAtFrame(authoredTimeline, 12, 'missing', 60),
    null
  );
});

test('boss timeline resolves phase-entry and death cues without wall-clock state', () => {
  const { getBossTimelineTriggeredCues } = loadRuntime();

  assert.deepEqual(
    Array.from(getBossTimelineTriggeredCues(timeline, 'phase-enter', 'rage'), (cue) => cue.clip.id),
    ['rage-shields']
  );
  assert.deepEqual(
    Array.from(getBossTimelineTriggeredCues(timeline, 'phase-enter', 'opening'), (cue) => cue.clip.id),
    []
  );
  assert.deepEqual(
    Array.from(getBossTimelineTriggeredCues(timeline, 'death'), (cue) => cue.clip.id),
    ['death-flash']
  );
});

test('boss timeline scheduler contains no ambient randomness and caps simultaneous cues', () => {
  const { getBossTimelineCuesAtFrame } = loadRuntime();
  const source = fs.readFileSync(
    path.join(root, 'services', 'gameplay', 'bosses', 'BossTimelineRuntime.ts'),
    'utf8'
  );
  assert.doesNotMatch(source, /Math\.random/);

  const crowded = {
    durationSeconds: 1,
    loop: false,
    clips: Array.from({ length: 20 }, (_, index) => ({
      id: `effect-${index}`,
      label: `Effect ${index}`,
      track: 'presentation',
      primitiveId: 'effect-cue',
      trigger: 'time',
      startSeconds: 0.1,
      durationSeconds: 0.1
    }))
  };
  assert.equal(getBossTimelineCuesAtFrame(crowded, 6, undefined, 60).length, 8);
});

test('a non-looping endpoint cue executes once and does not repeat after the timeline ends', () => {
  const { getBossTimelineCuesAtFrame } = loadRuntime();
  const endingTimeline = {
    durationSeconds: 1,
    loop: false,
    clips: [{
      id: 'ending-effect',
      label: 'Ending effect',
      track: 'presentation',
      primitiveId: 'effect-cue',
      trigger: 'time',
      startSeconds: 1,
      durationSeconds: 0.1
    }]
  };

  assert.deepEqual(
    Array.from(getBossTimelineCuesAtFrame(endingTimeline, 60, undefined, 60), (cue) => cue.clip.id),
    ['ending-effect']
  );
  assert.equal(getBossTimelineCuesAtFrame(endingTimeline, 61, undefined, 60).length, 0);
  assert.equal(getBossTimelineCuesAtFrame(endingTimeline, 600, undefined, 60).length, 0);
});
