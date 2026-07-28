import type {
  BossTimelineClip,
  BossTimelinePrimitiveId,
  BossTimelineTrackKind
} from './types';

export type BossTimelineParameterKey = keyof NonNullable<BossTimelineClip['parameters']>;

export interface BossTimelinePrimitiveDescriptor {
  id: BossTimelinePrimitiveId;
  label: string;
  track: BossTimelineTrackKind;
  description: string;
  damaging: boolean;
  supportsRepeat: boolean;
  parameterKeys: readonly BossTimelineParameterKey[];
}

const primitive = (
  id: BossTimelinePrimitiveId,
  label: string,
  track: BossTimelineTrackKind,
  description: string,
  damaging = false,
  supportsRepeat = false,
  parameterKeys: readonly BossTimelineParameterKey[] = []
): BossTimelinePrimitiveDescriptor => ({
  id,
  label,
  track,
  description,
  damaging,
  supportsRepeat,
  parameterKeys
});

/**
 * Shared runtime/editor registry. Adding a primitive here is not enough to
 * make it executable: the engine dispatcher and validation tests must also
 * recognize it. Keeping the metadata centralized prevents inspector drift.
 */
export const BOSS_TIMELINE_PRIMITIVES: Readonly<Record<
  BossTimelinePrimitiveId,
  BossTimelinePrimitiveDescriptor
>> = Object.freeze({
  telegraph: primitive('telegraph', 'Telegraph', 'presentation', 'Show a bounded warning before a damaging action.', false, true, ['warningSeconds', 'telegraphStyle', 'color']),
  'aimed-burst': primitive('aimed-burst', 'Aimed burst', 'attack', 'Fire the boss configured burst toward the player.', true, true, ['projectileCount']),
  'gap-ring': primitive(
    'gap-ring',
    'Gap ring',
    'attack',
    'Fire a radial ring whose exact opening follows an authored clockwise or counterclockwise route.',
    true,
    true,
    ['projectileCount', 'sequence', 'rotationDirection']
  ),
  'rotor-hazard-sentence': primitive(
    'rotor-hazard-sentence',
    'Rotor hazard sentence',
    'attack',
    'Sustain a bounded rotating emitter pattern with small pellets and staggered large sprite hazards.',
    true,
    false,
    ['projectileCount', 'sequence', 'pulseIntervalSeconds', 'motionCue']
  ),
  'radial-beam-array': primitive(
    'radial-beam-array',
    'Radial beam array',
    'laser',
    'Fire four angle-aware beam axes on the exact geometry shown by its spoke telegraph.',
    true,
    false,
    ['sequence', 'motionCue', 'rotationDirection']
  ),
  'corner-ambush-beam': primitive(
    'corner-ambush-beam',
    'Corner ambush beam',
    'laser',
    'Hold in a deterministic upper corner, lock the warned player position, and fire one beam on that exact geometry.',
    true,
    false,
    ['sequence']
  ),
  'corner-ambush-ram': primitive(
    'corner-ambush-ram',
    'Corner ambush ram',
    'movement',
    'Black out the arena, reveal the boss in a deterministic lower corner, then charge its warned body lane.',
    true,
    false,
    ['sequence']
  ),
  'paired-cannon-burst': primitive(
    'paired-cannon-burst',
    'Paired cannon burst',
    'attack',
    'Fire a bounded port, starboard, or coordinated rotary-cannon answer from registered visible muzzles.',
    true,
    true,
    [
      'projectileCount',
      'side',
      'sequence',
      'motionCue',
      'shotIntervalFrames',
      'projectileSpeedScale',
      'channelWidthPixels',
      'sweepRangeRatio',
      'sweepPasses'
    ]
  ),
  'articulated-melee-sweep': primitive(
    'articulated-melee-sweep',
    'Articulated melee sweep',
    'attack',
    'Move one or both registered claws through a visible sweep whose hit region follows the posed claw tips.',
    true,
    false,
    ['side', 'sequence', 'motionCue']
  ),
  'reactor-aperture-pattern': primitive(
    'reactor-aperture-pattern',
    'Reactor aperture pattern',
    'attack',
    'Emit one bounded incomplete reactor ring or mine remix with a deterministic reachable opening.',
    true,
    true,
    ['projectileCount', 'sequence', 'rotationDirection', 'motionCue']
  ),
  'tracking-pincer-dive': primitive(
    'tracking-pincer-dive',
    'Tracking pincer dive',
    'attack',
    'Run one bounded rise, track, lock, dive, close, hold, release, and return sequence with posed claw-tip damage only.',
    true,
    true,
    ['sequence', 'motionCue']
  ),
  'prism-wingbeat-weave': primitive(
    'prism-wingbeat-weave',
    'Prism wingbeat weave',
    'attack',
    'Release a bounded sequence of crystal-feather fans from live left and right wing-edge sockets.',
    true,
    true,
    [
      'projectileCount',
      'sequence',
      'motionCue',
      'shotIntervalFrames',
      'projectileSpeedScale',
      'channelWidthPixels',
      'sweepRangeRatio',
      'sweepPasses'
    ]
  ),
  'prism-brood-procession': primitive(
    'prism-brood-procession',
    'Prism brood procession',
    'summon',
    'Deploy, arm, hatch, and route a bounded deterministic procession of Prism broodlings.',
    true,
    true,
    [
      'projectileCount',
      'sequence',
      'motionCue',
      'shotIntervalFrames',
      'projectileSpeedScale',
      'channelWidthPixels',
      'sweepRangeRatio',
      'sweepPasses'
    ]
  ),
  'prism-lunar-swoop': primitive(
    'prism-lunar-swoop',
    'Lunar prism swoop',
    'movement',
    'Fly a bounded curved or diagonal body pass after an anatomy-led edge telegraph.',
    true,
    true,
    [
      'sequence',
      'motionCue',
      'projectileCount',
      'shotIntervalFrames',
      'projectileSpeedScale',
      'sweepRangeRatio',
      'sweepPasses'
    ]
  ),
  'prism-kaleidoscope-brood': primitive(
    'prism-kaleidoscope-brood',
    'Kaleidoscope brood',
    'summon',
    'Coordinate wing illumination, prism-core charge, cocoons, and broodlings into a moving safe corridor.',
    true,
    true,
    [
      'projectileCount',
      'sequence',
      'motionCue',
      'pulseIntervalSeconds',
      'shotIntervalFrames',
      'projectileSpeedScale',
      'channelWidthPixels',
      'sweepRangeRatio',
      'sweepPasses'
    ]
  ),
  'chainclaw-harpoon': primitive(
    'chainclaw-harpoon',
    'Chainclaw harpoon',
    'attack',
    'Unspool, launch, tension, retract, and mechanically reseat one or two socket-owned chain claws on a locked route.',
    true,
    true,
    ['sequence', 'side', 'motionCue', 'projectileSpeedScale']
  ),
  'crown-reactor-beam': primitive(
    'crown-reactor-beam',
    'Crown reactor beam',
    'laser',
    'Open the crown reactor and sweep one bounded beam, or the phase-two cross-linked relay, on the warned geometry.',
    true,
    true,
    ['sequence', 'motionCue', 'rotationDirection']
  ),
  'bastion-crabwalk-barrage': primitive(
    'bastion-crabwalk-barrage',
    'Bastion crabwalk barrage',
    'attack',
    'Crabwalk through a deterministic lateral route while alternating bounded socket-owned crown bolts and shell shards.',
    true,
    true,
    ['projectileCount', 'sequence', 'motionCue', 'shotIntervalFrames', 'projectileSpeedScale']
  ),
  'cross-beam': primitive('cross-beam', 'Cross beam', 'laser', 'Telegraph or fire the existing cross-beam presentation.', true, true),
  'rail-sweep': primitive('rail-sweep', 'Rail sweep', 'laser', 'Telegraph or fire a sweeping rail lane.', true, true, ['sequence']),
  'tail-fan': primitive('tail-fan', 'Tail fan', 'attack', 'Fire the registered tail-fan projectile pattern.', true, true, ['projectileCount', 'sequence']),
  'inward-collapse': primitive('inward-collapse', 'Inward collapse', 'attack', 'Fire projectiles that collapse toward the arena center.', true, true, ['projectileCount', 'sequence']),
  'rotating-cross': primitive('rotating-cross', 'Rotating cross', 'attack', 'Fire the registered rotating-cross pattern.', true, true, ['projectileCount', 'sequence']),
  'helix-volley': primitive('helix-volley', 'Helix volley', 'attack', 'Fire a left- or right-handed helix volley.', true, true, ['projectileCount', 'sequence', 'handedness']),
  'side-barrage': primitive('side-barrage', 'Side barrage', 'attack', 'Fire from the selected port or starboard side.', true, true, ['projectileCount', 'side', 'motionCue']),
  'pod-volley': primitive('pod-volley', 'Pod volley', 'attack', 'Launch a slow, readable fan of large animated sprite pods.', true, true, ['projectileCount', 'sequence']),
  'weave-wall': primitive('weave-wall', 'Weave wall', 'attack', 'Send deterministic projectile rows around a shifting two-lane safe channel.', true, true, ['projectileCount', 'sequence']),
  'summon-formation': primitive('summon-formation', 'Summon formation', 'summon', 'Spawn a bounded enemy reinforcement group.', true, false, ['summonCount', 'enemyId', 'formationPatternId']),
  'set-shield': primitive('set-shield', 'Set shield ring', 'defense', 'Enable, replace, or clear the boss shield ring.', false, false, ['shieldCount', 'enabled']),
  'set-weak-point': primitive('set-weak-point', 'Set weak point', 'defense', 'Enable or disable a registered boss component weak point.', false, false, ['componentId', 'enabled']),
  'set-movement': primitive('set-movement', 'Set movement', 'movement', 'Change movement pattern and phase speed multiplier.', false, false, ['movementPatternId', 'speedMultiplier']),
  'follow-path': primitive('follow-path', 'Follow path', 'movement', 'Traverse one allowlisted normalized movement path for the clip duration.', false, false, ['movementPathId']),
  'effect-cue': primitive(
    'effect-cue',
    'Effect cue',
    'presentation',
    'Play a safe existing effect cue.',
    false,
    false,
    ['color', 'motionCue']
  ),
  'camera-cue': primitive('camera-cue', 'Camera cue', 'presentation', 'Apply bounded screen shake for emphasis.', false, false, ['strength'])
});

export const BOSS_TIMELINE_TRACKS: ReadonlyArray<{
  id: BossTimelineTrackKind;
  label: string;
}> = Object.freeze([
  { id: 'movement', label: 'Movement' },
  { id: 'attack', label: 'Attacks' },
  { id: 'laser', label: 'Lasers' },
  { id: 'summon', label: 'Summons' },
  { id: 'defense', label: 'Defense' },
  { id: 'presentation', label: 'Presentation' }
]);

export const isDamagingBossTimelinePrimitive = (
  id: BossTimelinePrimitiveId
) => BOSS_TIMELINE_PRIMITIVES[id].damaging;
