/** Boss content uses Scott's existing campaign art; IDs never select replacement assets. */
export type BossAttackKind = 'aimed-fan' | 'gap-ring' | 'weave-wall' | 'lane-salvo';
export type BossWarningColor = 'amber' | 'magenta';

export interface BossAttackProfile {
  readonly id: string;
  readonly name: string;
  readonly kind: BossAttackKind;
  readonly telegraphFrames: number;
  readonly recoveryFrames: number;
  readonly projectileCount: number;
  readonly speed: number;
  readonly big: boolean;
  readonly color: BossWarningColor;
}

export interface BossProfile {
  readonly id: string;
  readonly name: string;
  readonly epithet: string;
  readonly sector: string;
  /** Existing campaign event/rig/art identity, retained by the engine adapter. */
  readonly sourceBossId: string;
  readonly designSource: string;
  readonly patternOffset: number;
  readonly attacks: readonly BossAttackProfile[];
  readonly phases: readonly {
    readonly name: string;
    readonly threshold: number;
    readonly attackIds: readonly string[];
  }[];
  readonly part: {
    readonly id: string;
    readonly name: string;
    readonly side: 'left' | 'right';
    readonly healthRatio: number;
    readonly disablesAttackId: string;
  };
}

type BossSeed = readonly [
  id: string, name: string, epithet: string, sector: string, sourceBossId: string,
  attackNames: readonly [string, string, string, string], partName: string,
  phaseNames: readonly [string, string, string], offset: number
];

const seeds: readonly BossSeed[] = [
  ['gatekeeper-prime', 'Gatekeeper Prime', 'Custodian of Closed Knowledge', 'Launch Bay', 'gatekeeper-prime',
    ['Rejection Volley', 'Access Ring', 'Embargo Lattice', 'Final Notice'], 'Access Cannon', ['Gate Check', 'Restricted Access', 'Open Resistance'], 0],
  ['prism-moth', 'Prism Moth', 'The Citation Collector', 'Citation Storm', 'prism-moth',
    ['Crystal Fan', 'Prism Bloom', 'Wingbeat Weave', 'Kaleidoscope Gate'], 'Brood Prism', ['Crystal Nursery', 'Prism Metamorphosis', 'Brood Eclipse'], 1],
  ['frontier-crownclaw', 'Frontier Crownclaw', 'Warden of the Review Queue', 'Peer Review Nebula', 'frontier-crownclaw',
    ['Claw Crossfire', 'Crown Aperture', 'Bastion Crabwalk', 'Critical Cross Link'], 'Harpoon Claw', ['Bastion Lock', 'Crown Cross Link', 'Critical Review'], 2],
  ['helios-clawcarrier', 'Helios Clawcarrier', 'Collector of Exhausted Grants', 'Grant Desert', 'helios-clawcarrier',
    ['Claw Battery', 'Reactor Aperture', 'Machine Gun Channel', 'Solar Foreclosure'], 'Port Battery', ['Siege Calibration', 'Armor Shear', 'Reactor Overload'], 3],
  ['nullwake-revenant', 'Nullwake Revenant', 'A Hypothesis That Will Not Die', 'Null Hypothesis Void', 'nullwake-revenant',
    ['Borrowed Charge', 'Null Halo', 'Memory Lattice', 'Backplane Divide'], 'Memory Relay', ['Borrowed Charge', 'False Recovery', 'Backplane Crown'], 4],
  ['singularity-crab', 'Singularity Commander', 'Last Warden of the Archive', 'Singularity Archive', 'singularity-crab',
    ['Pylon Barrage', 'Event Horizon', 'Tidal Channel', 'Archive Collapse'], 'Gravity Pylon', ['Gravitational Calibration', 'Event Horizon Gaze', 'Archive Liberation'], 5],
  ['orbit-gyroscope', 'Aurora Oculus', 'Observer of Forbidden Signals', 'Replication Reef', 'orbit-gyroscope',
    ['Survey Fan', 'Orbital Aperture', 'Reverse Orbit', 'Oculus Divide'], 'Survey Lens', ['Survey Orbit', 'Reverse Overdrive', 'Signal Lock'], 6],
  ['hammerhead-siege', 'Gloamforge Mantis', 'The Impact Factor Furnace', 'Impact Factor Forge', 'hammerhead-siege',
    ['Crucible Barrage', 'Smelter Halo', 'Cleaver Weave', 'Furnace Shutters'], 'Crucible Arm', ['Crucible Measure', 'Cleaver Unfurl', 'Forge Unbound'], 7],
  ['paywall-decimator', 'Paywall Decimator', 'Subscription Required to Survive', 'The Paywall', 'paywall-decimator',
    ['Invoice Volley', 'Premium Perimeter', 'Shutter Channel', 'Renewal Deadline'], 'Billing Cannon', ['Metered Access', 'Premium Lock', 'Subscription Collapse'], 8],
  ['umbra-needlewing', 'Umbra Needlewing', 'Hunter of Missing Data', 'Data Graveyard', 'umbra-needlewing',
    ['Predator Needles', 'Wing Shard Gate', 'Needle Lattice', 'Blackout Ambush'], 'Needle Projector', ['Wing Survey', 'Blackout Hunt', 'Last Evidence'], 9],
  ['peer-reviewer', 'The Peer Reviewer', 'Major Revisions Required', 'Peer Review Nebula', 'gatekeeper-prime',
    ['Reviewer Two', 'Circular Reasoning', 'Revision Queue', 'Desk Rejection'], 'Review Stamp', ['Initial Submission', 'Major Revisions', 'Decision Pending'], 10],
  ['impact-factor', 'Impact Factor', 'Metrics Above Discovery', 'Impact Factor Forge', 'orbit-gyroscope',
    ['Metric Scatter', 'Prestige Orbit', 'Ranking Ladder', 'Quartile Cutoff'], 'Citation Counter', ['Measure', 'Rank', 'Reject'], 11],
  ['grant-reaper', 'Grant Reaper', 'Your Funding Has Expired', 'Grant Desert', 'helios-clawcarrier',
    ['Budget Cuts', 'Funding Cycle', 'Austerity Channel', 'Deadline Guillotine'], 'Budget Siphon', ['Application', 'Panel Review', 'Final Cut'], 12],
  ['citation-hydra', 'Citation Hydra', 'Every Reference Demands Another', 'Citation Storm', 'frontier-crownclaw',
    ['Reference Fork', 'Recursive Halo', 'Bibliography Weave', 'Retraction Gate'], 'Reference Crown', ['One More Source', 'Recursive Review', 'Infinite Appendix'], 13],
  ['replication-crisis', 'Replication Crisis', 'Results May Never Repeat', 'Replication Reef', 'prism-moth',
    ['Duplicate Signal', 'Confidence Halo', 'Control Group', 'Null Result'], 'Replication Prism', ['Observation', 'Independent Trial', 'Null Hypothesis'], 14]
];

const kinds: readonly BossAttackKind[] = ['aimed-fan', 'gap-ring', 'weave-wall', 'lane-salvo'];

export const REVAMP_BOSSES: readonly BossProfile[] = Object.freeze(seeds.map((seed) => {
  const [id, name, epithet, sector, sourceBossId, names, partName, phaseNames, offset] = seed;
  const attacks = Object.freeze(kinds.map((kind, index): BossAttackProfile => Object.freeze({
    id: `${id}:${kind}`,
    name: names[index],
    kind,
    // Rage never reduces this warning; colour and geometry are not difficulty settings.
    telegraphFrames: [48, 54, 72, 66][index] + offset % 3 * 3,
    recoveryFrames: [60, 66, 66, 84][index],
    projectileCount: [3 + offset % 2 * 2, 16 + offset % 3 * 2, 10 + offset % 2 * 5, 2][index],
    speed: 3.1 + offset % 4 * 0.15,
    big: index === 3,
    color: index % 2 === 0 ? 'amber' : 'magenta'
  })));
  return Object.freeze({
    id, name, epithet, sector, sourceBossId,
    designSource: `Boss Test Runner V0.34 / ${sourceBossId}; authored revamp timing and patterns`,
    patternOffset: offset,
    attacks,
    phases: Object.freeze([
      Object.freeze({ name: phaseNames[0], threshold: 1, attackIds: Object.freeze([attacks[0].id, attacks[1].id]) }),
      Object.freeze({ name: phaseNames[1], threshold: 0.66, attackIds: Object.freeze([attacks[2].id, attacks[0].id, attacks[1].id]) }),
      Object.freeze({ name: phaseNames[2], threshold: 0.33, attackIds: Object.freeze([attacks[3].id, attacks[2].id, attacks[1].id, attacks[0].id]) })
    ]),
    part: Object.freeze({
      id: `${id}:emitter`, name: partName,
      side: offset % 2 === 0 ? 'left' as const : 'right' as const,
      healthRatio: 0.15,
      disablesAttackId: attacks[0].id
    })
  });
}));

const byId = new Map(REVAMP_BOSSES.map((boss) => [boss.id, boss]));
export const getRevampBoss = (id: string | undefined): BossProfile | undefined => (
  id ? byId.get(id.replace(/^revamp:/, '')) : undefined
);

/** Stable content selection; never ambient randomness or display-size dependent. */
export const resolveRevampBoss = (sourceBossId: string | undefined, eventId = ''): BossProfile | undefined => {
  if (eventId.startsWith('revamp:')) return getRevampBoss(eventId);
  if (sourceBossId?.startsWith('revamp:')) return getRevampBoss(sourceBossId);
  const explicit = getRevampBoss(sourceBossId);
  if (explicit && explicit.id !== explicit.sourceBossId) return explicit;
  const variants = REVAMP_BOSSES.filter((boss) => boss.sourceBossId === sourceBossId);
  if (!variants.length) return undefined;
  // Preserve sector bosses and teach their identity on the campaign's first encounter.
  if (!eventId || eventId.startsWith('stage-')) return variants[0];
  const weeklyStage = /^weekly-run-stage-(\d+)-boss-event$/.exec(eventId);
  if (weeklyStage) {
    // The authoritative weekly planner shuffles source bosses in strength pairs.
    // Alternating major slots makes both variants reachable in the first roster
    // rotation; using the low bit of a string hash biases odd stage numbers.
    const majorOrdinal = Math.max(0, Math.floor((Number(weeklyStage[1]) + 1) / 4) - 1);
    return variants[majorOrdinal % variants.length];
  }
  let hash = 2166136261;
  for (const character of eventId) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return variants[(hash >>> 0) % variants.length];
};
