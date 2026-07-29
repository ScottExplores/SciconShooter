export const MINI_BOSS_LAB_ENCOUNTER_IDS = Object.freeze([
  'fracture-engine-elite',
  'aegis-brood-core',
  'railspine-wallcrawler',
  'maw-carrier',
  'twin-meridian-sentinels',
  'prism-bloom',
  'aegis-convoy-captain',
  'gridline-sentries'
] as const);

export type MiniBossEncounterId = typeof MINI_BOSS_LAB_ENCOUNTER_IDS[number];

export const MINI_BOSS_LAB_CATEGORY_IDS = Object.freeze([
  'mini-bosses',
  'elite-enemies',
  'paired-encounters',
  'guardian-formations',
  'wall-encounters'
] as const);

export type MiniBossLabCategoryId = typeof MINI_BOSS_LAB_CATEGORY_IDS[number];

export type MiniBossEncounterKind =
  | 'paired'
  | 'guardian'
  | 'wall'
  | 'carrier'
  | 'solo'
  | 'convoy'
  | 'grid';

export type MiniBossMemberRole =
  | 'primary'
  | 'leader'
  | 'partner'
  | 'guardian'
  | 'satellite'
  | 'escort'
  | 'sentry-west'
  | 'sentry-east'
  | 'sentry-north'
  | 'sentry-south';

export type MiniBossAssetUsage =
  | 'primary-body'
  | 'linked-unit'
  | 'projectile'
  | 'telegraph'
  | 'beam'
  | 'death-vfx';

export interface MiniBossAssetBinding {
  readonly id: string;
  readonly usage: MiniBossAssetUsage;
  readonly status: 'approved-existing' | 'approved-generated';
  readonly galleryCategory: 'Mini Bosses';
  readonly provenance: 'existing-runtime-art' | 'generated-mini-boss-lab-v2';
  readonly url?: string;
  readonly frames?: readonly string[];
}

export interface MiniBossMemberArchetype {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly roles: readonly MiniBossMemberRole[];
  readonly maxHealth: number;
  readonly collisionRadiusPixels: number;
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly assetId: string;
  readonly damageable: boolean;
}

export interface MiniBossAttackDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly telegraphSeconds: number;
  readonly activeSeconds: number;
  readonly recoverySeconds: number;
  readonly emissionIntervalFrames: number;
  readonly maximumProjectilesPerEmission: number;
  readonly projectileAssetId?: string;
  readonly telegraphAssetId?: string;
}

export interface MiniBossSafeRouteWaypoint {
  readonly xRatio: number;
  readonly yRatio: number;
}

export interface MiniBossSafeRouteVariant {
  readonly id: string;
  readonly corridorWidthPixels: number;
  readonly waypoints: readonly MiniBossSafeRouteWaypoint[];
}

export interface MiniBossSafeRouteContract {
  readonly kind:
    | 'alternating-diagonal-corridor'
    | 'rotating-halo-gap'
    | 'moving-rail-lane'
    | 'carrier-release-lanes'
    | 'paired-role-lanes'
    | 'incomplete-ring-gap'
    | 'convoy-pocket'
    | 'safe-quadrant';
  readonly logicalViewportWidth: 390;
  readonly logicalViewportHeight: 844;
  readonly playerDiameterPixels: number;
  readonly minimumClearancePixels: number;
  readonly minimumGapPixels: number;
  readonly variants: readonly MiniBossSafeRouteVariant[];
}

export interface MiniBossExecutionBudgets {
  readonly maximumHostileEntities: number;
  readonly maximumProjectiles: number;
  readonly maximumBeams: number;
  readonly maximumReinforcements: number;
  readonly maximumGuardians: number;
}

export interface MiniBossCompactHealthDefinition {
  readonly mode: 'shared' | 'per-member' | 'primary-with-guardians';
  readonly label: string;
  readonly widthPixels: number;
  readonly followsMember: boolean;
  readonly defaultVisible: true;
}

export type MiniBossChoreographyProfile =
  | Readonly<{
      kind: 'paired-crossfire';
      coreArchetypeId: string;
      satelliteArchetypeId: string;
      baseCadenceFrames: number;
      survivorCadenceMultiplier: number;
      diagonalInsetRatio: number;
    }>
  | Readonly<{
      kind: 'guardian-halo';
      coreArchetypeId: string;
      guardianArchetypeId: string;
      haloRadiusRatio: number;
      gapArcDegrees: number;
      exposedWhenGuardianCountAtMost: number;
    }>
  | Readonly<{
      kind: 'edge-rail';
      wallArchetypeId: string;
      edgeInsetRatio: number;
      traverseSeconds: number;
    }>
  | Readonly<{
      kind: 'carrier-release';
      carrierArchetypeId: string;
      releaseCount: number;
      approachSpeedPixelsPerSecond: number;
    }>
  | Readonly<{
      kind: 'mirror-exchange';
      sentinelArchetypeId: string;
      exchangeSeconds: number;
      survivorCadenceMultiplier: number;
    }>
  | Readonly<{
      kind: 'rotating-gap';
      coreArchetypeId: string;
      projectileCount: number;
      gapSlots: number;
      clockwiseFirst: boolean;
    }>
  | Readonly<{
      kind: 'convoy-command';
      captainArchetypeId: string;
      escortArchetypeId: string;
      formationWidthRatio: number;
      exposeCaptainWhenEscortsAtMost: number;
    }>
  | Readonly<{
      kind: 'quadrant-grid';
      sentryArchetypeId: string;
      boundaryInsetRatio: number;
      shiftSeconds: number;
    }>;

export interface MiniBossEncounterDefinition {
  readonly id: MiniBossEncounterId;
  readonly displayName: string;
  readonly eventId: `sandbox-mini-boss-lab:${MiniBossEncounterId}:v1`;
  readonly primaryCategory: MiniBossLabCategoryId;
  readonly categories: readonly MiniBossLabCategoryId[];
  readonly encounterKind: MiniBossEncounterKind;
  readonly batch: 'A' | 'B';
  readonly sandboxReady: true;
  readonly campaignAssigned: true;
  readonly expectedDurationSeconds: number;
  readonly entranceSeconds: number;
  readonly deterministicSeed: string;
  readonly memberArchetypes: readonly MiniBossMemberArchetype[];
  readonly assets: readonly MiniBossAssetBinding[];
  readonly signature: MiniBossAttackDefinition;
  readonly support: MiniBossAttackDefinition;
  readonly safeRoute: MiniBossSafeRouteContract;
  readonly budgets: MiniBossExecutionBudgets;
  readonly compactHealth: MiniBossCompactHealthDefinition;
  readonly choreography: MiniBossChoreographyProfile;
}

export interface MiniBossMemberInstance {
  readonly id: string;
  readonly archetypeId: string;
  readonly label: string;
  readonly role: MiniBossMemberRole;
  readonly maxHealth: number;
  readonly collisionRadiusPixels: number;
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly assetId: string;
  readonly damageable: boolean;
}

export interface MiniBossMemberRuntimeInput {
  readonly id: string;
  readonly health?: number;
  readonly alive?: boolean;
}

export interface MiniBossEncounterSampleContext {
  readonly frame: number;
  readonly fps?: number;
  readonly viewportWidth?: number;
  readonly viewportHeight?: number;
  readonly seed?: string | number;
  readonly members?: readonly MiniBossMemberRuntimeInput[];
  readonly hitMemberIds?: readonly string[];
  readonly reinforcementsSpawned?: number;
  readonly defeatElapsedFrames?: number;
}

export type MiniBossAnimationState =
  | 'entrance'
  | 'idle'
  | 'attack'
  | 'hit'
  | 'damage'
  | 'critical'
  | 'death';

export interface MiniBossMemberFrameState {
  readonly id: string;
  readonly archetypeId: string;
  readonly role: MiniBossMemberRole;
  readonly assetId: string;
  readonly x: number;
  readonly y: number;
  readonly rotationRadians: number;
  readonly scale: number;
  readonly opacity: number;
  readonly health: number;
  readonly healthRatio: number;
  readonly alive: boolean;
  readonly animationState: MiniBossAnimationState;
  readonly edgeAttached: boolean;
  readonly damageable: boolean;
}

export type MiniBossHazardKind =
  | 'projectile-burst'
  | 'diagonal-crossfire'
  | 'ring-with-gap'
  | 'beam'
  | 'rail-sweep'
  | 'guardian-pulse'
  | 'formation-burst'
  | 'grid-boundary';

export interface MiniBossHazardCommand {
  readonly id: string;
  readonly ownerEventId: string;
  readonly sourceMemberId?: string;
  readonly attackId: string;
  readonly kind: MiniBossHazardKind;
  readonly warning: boolean;
  readonly damaging: boolean;
  readonly emitNow: boolean;
  readonly emissionIndex: number;
  readonly projectileCount: number;
  readonly projectileAssetId?: string;
  readonly origin: Readonly<{ x: number; y: number }>;
  readonly target: Readonly<{ x: number; y: number }>;
  readonly angleRadians?: number;
  readonly gapCenterRadians?: number;
  readonly gapArcRadians?: number;
  readonly safeCorridorId: string;
}

export interface MiniBossReinforcementCommand {
  readonly id: string;
  readonly ownerEventId: string;
  readonly count: number;
  readonly assetId: string;
  readonly target: Readonly<{ x: number; y: number }>;
  readonly speedPixelsPerSecond: number;
}

export interface MiniBossGuardFrameState {
  readonly active: boolean;
  readonly primaryExposed: boolean;
  readonly survivingGuardianCount: number;
  readonly guardedMemberIds: readonly string[];
  readonly gapCenterRadians?: number;
  readonly gapArcRadians?: number;
}

export interface MiniBossCleanupCommand {
  readonly requested: boolean;
  readonly ownerEventId: string;
  readonly removeOwnedProjectiles: boolean;
  readonly removeOwnedBeams: boolean;
  readonly removeOwnedReinforcements: boolean;
  readonly preserveUnrelatedEntities: true;
}

export type MiniBossEncounterStage =
  | 'entrance'
  | 'idle'
  | 'signature'
  | 'support'
  | 'low-health'
  | 'survivor'
  | 'death'
  | 'cleanup';

export interface MiniBossEncounterFrameState {
  readonly encounterId: MiniBossEncounterId;
  readonly eventId: string;
  readonly frame: number;
  readonly stage: MiniBossEncounterStage;
  readonly activeAttackId?: string;
  readonly activeAttackName?: string;
  readonly attackBeat: 'none' | 'warning' | 'action' | 'recovery';
  readonly lowHealth: boolean;
  readonly survivorMode: boolean;
  readonly members: readonly MiniBossMemberFrameState[];
  readonly hazards: readonly MiniBossHazardCommand[];
  readonly reinforcements: readonly MiniBossReinforcementCommand[];
  readonly guard: MiniBossGuardFrameState;
  readonly safeCorridorId: string;
  readonly cleanup: MiniBossCleanupCommand;
}

export interface MiniBossDefinitionDiagnostic {
  readonly level: 'error' | 'warning';
  readonly code: string;
  readonly message: string;
}

export interface MiniBossSafeRouteProofResult {
  readonly encounterId: MiniBossEncounterId;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly requiredGapPixels: number;
  readonly measuredMinimumGapPixels: number;
  readonly passed: boolean;
  readonly diagnostics: readonly MiniBossDefinitionDiagnostic[];
}
