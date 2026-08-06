import type {
  MiniBossAssetBinding,
  MiniBossAttackDefinition,
  MiniBossEncounterDefinition,
  MiniBossEncounterId,
  MiniBossLabCategoryId,
  MiniBossMemberArchetype,
  MiniBossSafeRouteContract,
  MiniBossSafeRouteVariant
} from './types.ts';
import { MINI_BOSS_LAB_ENCOUNTER_IDS } from './types.ts';

const STAGE_20_ENEMY_ROOT = '/game-art/generated/scicon-stage20-expansion-v1/enemies/frames';
const WARNING_EFFECT_ROOT = '/game-art/generated/ui/animations/boss-alert-banners-v1/effects';
const EXPLOSION_ROOT = '/game-art/pixi/effects/explosion';
const MINI_BOSS_LAB_V2_ROOT = '/game-art/generated/mini-boss-lab-v2';

const stage20Enemy = (name: string) => `${STAGE_20_ENEMY_ROOT}/${name}.png`;
const miniBossLabV2Frame = (encounterId: MiniBossEncounterId, fileName: string) => (
  `${MINI_BOSS_LAB_V2_ROOT}/${encounterId}/${fileName}`
);
const explosionFrames = Object.freeze(
  Array.from({ length: 7 }, (_, index) => `${EXPLOSION_ROOT}/frame-${index + 1}.png`)
);

const asset = (
  id: string,
  usage: MiniBossAssetBinding['usage'],
  source: { readonly url: string } | { readonly frames: readonly string[] }
): MiniBossAssetBinding => Object.freeze({
  id,
  usage,
  status: 'approved-existing',
  galleryCategory: 'Elite Enemies',
  provenance: 'existing-runtime-art',
  ...source
});

const generatedAnimatedBodyAsset = (
  id: string,
  encounterId: MiniBossEncounterId,
  frames: readonly string[]
): MiniBossAssetBinding => Object.freeze({
  id,
  usage: 'primary-body',
  status: 'approved-generated',
  galleryCategory: 'Elite Enemies',
  provenance: 'generated-mini-boss-lab-v2',
  frames: Object.freeze(frames.map((fileName) => miniBossLabV2Frame(encounterId, fileName)))
});
const generatedProjectileAsset = (
  id: string,
  encounterId: MiniBossEncounterId,
  frames: readonly string[],
  dimensions: Readonly<{ widthPixels: number; heightPixels: number }>
): MiniBossAssetBinding => Object.freeze({
  id,
  usage: 'projectile',
  status: 'approved-generated',
  galleryCategory: 'Elite Enemies',
  provenance: 'generated-mini-boss-lab-v2',
  frames: Object.freeze(frames.map((fileName) => miniBossLabV2Frame(encounterId, fileName))),
  ...dimensions
});
const linkedAsset = (id: string, url: string) => asset(id, 'linked-unit', { url });
const telegraphAsset = (id: string, file: string) => asset(id, 'telegraph', {
  url: `${WARNING_EFFECT_ROOT}/${file}.png`
});
const deathAsset = (id: string) => asset(id, 'death-vfx', { frames: explosionFrames });

const categoryList = (...values: MiniBossLabCategoryId[]): readonly MiniBossLabCategoryId[] => (
  Object.freeze(values)
);

const member = ({
  id,
  label,
  count,
  roles,
  maxHealth,
  collisionRadiusPixels,
  widthPixels,
  heightPixels,
  assetId,
  damageable = true
}: MiniBossMemberArchetype): MiniBossMemberArchetype => Object.freeze({
  id,
  label,
  count,
  roles: Object.freeze([...roles]),
  maxHealth,
  collisionRadiusPixels,
  widthPixels,
  heightPixels,
  assetId,
  damageable
});

const attack = (
  id: string,
  name: string,
  description: string,
  values: Omit<MiniBossAttackDefinition, 'id' | 'name' | 'description'>
): MiniBossAttackDefinition => Object.freeze({ id, name, description, ...values });

const routeVariant = (
  id: string,
  corridorWidthPixels: number,
  points: readonly (readonly [number, number])[]
): MiniBossSafeRouteVariant => Object.freeze({
  id,
  corridorWidthPixels,
  waypoints: Object.freeze(points.map(([xRatio, yRatio]) => Object.freeze({ xRatio, yRatio })))
});

const safeRoute = (
  kind: MiniBossSafeRouteContract['kind'],
  minimumGapPixels: number,
  variants: readonly MiniBossSafeRouteVariant[],
  minimumClearancePixels = 18
): MiniBossSafeRouteContract => Object.freeze({
  kind,
  logicalViewportWidth: 390,
  logicalViewportHeight: 844,
  playerDiameterPixels: 34,
  minimumClearancePixels,
  minimumGapPixels,
  variants: Object.freeze([...variants])
});

const sharedDeath = deathAsset('shared-mini-boss-death');

const FRACTURE_ENGINE_ELITE = Object.freeze({
  id: 'fracture-engine-elite',
  displayName: 'Fracture Engine Elite',
  eventId: 'sandbox-mini-boss-lab:fracture-engine-elite:v1',
  primaryCategory: 'elite-enemies',
  categories: categoryList('elite-enemies', 'paired-encounters', 'mini-bosses'),
  encounterKind: 'paired',
  batch: 'A',
  sandboxReady: true,
  campaignAssigned: true,
  expectedDurationSeconds: 28,
  entranceSeconds: 1.4,
  deterministicSeed: 'fracture-engine-elite-gold-v1',
  memberArchetypes: Object.freeze([
    member({
      id: 'fracture-core',
      label: 'Fracture Engine',
      count: 2,
      roles: ['leader', 'partner'],
      maxHealth: 900,
      collisionRadiusPixels: 50,
      widthPixels: 124,
      heightPixels: 124,
      assetId: 'fracture-core-body',
      damageable: true
    }),
    member({
      id: 'fracture-satellite',
      label: 'Fracture Satellite',
      count: 4,
      roles: ['satellite', 'satellite', 'satellite', 'satellite'],
      maxHealth: 120,
      collisionRadiusPixels: 15,
      widthPixels: 34,
      heightPixels: 34,
      assetId: 'fracture-satellite-body',
      damageable: true
    })
  ]),
  assets: Object.freeze([
    generatedAnimatedBodyAsset('fracture-core-body', 'fracture-engine-elite', [
      'fracture-engine-elite-neutral.png',
      'fracture-engine-elite-idle.png',
      'fracture-engine-elite-charge.png',
      'fracture-engine-elite-attack.png',
      'fracture-engine-elite-attack-b.png',
      'fracture-engine-elite-damage.png',
      'fracture-engine-elite-critical.png'
    ]),
    linkedAsset('fracture-satellite-body', stage20Enemy('orbit-disc')),
    generatedProjectileAsset('fracture-shard', 'fracture-engine-elite', [
      'fracture-shard-01.png',
      'fracture-shard-02.png',
      'fracture-shard-03.png',
      'fracture-shard-04.png'
    ], { widthPixels: 18, heightPixels: 36 }),
    telegraphAsset('fracture-warning', 'warning-ring-violet'),
    sharedDeath
  ]),
  signature: attack(
    'fracture-engine-elite:alternating-crossfire',
    'Alternating Fracture Crossfire',
    'The paired engines fire ordered left-right diagonal beats with a readable center route.',
    {
      telegraphSeconds: 0.75,
      activeSeconds: 3.2,
      recoverySeconds: 0.65,
      emissionIntervalFrames: 16,
      maximumProjectilesPerEmission: 3,
      projectileAssetId: 'fracture-shard',
      telegraphAssetId: 'fracture-warning'
    }
  ),
  support: attack(
    'fracture-engine-elite:satellite-shear',
    'Satellite Shear',
    'Four orbiting satellites peel into two offset lanes before returning to their paired leaders.',
    {
      telegraphSeconds: 0.65,
      activeSeconds: 2.5,
      recoverySeconds: 0.8,
      emissionIntervalFrames: 24,
      maximumProjectilesPerEmission: 2,
      projectileAssetId: 'fracture-shard',
      telegraphAssetId: 'fracture-warning'
    }
  ),
  safeRoute: safeRoute('alternating-diagonal-corridor', 96, [
    routeVariant('fracture-zig-left', 96, [[0.5, 0.9], [0.36, 0.69], [0.61, 0.48], [0.48, 0.3]]),
    routeVariant('fracture-zig-right', 96, [[0.5, 0.9], [0.64, 0.69], [0.39, 0.48], [0.52, 0.3]])
  ]),
  budgets: Object.freeze({
    maximumHostileEntities: 6,
    maximumProjectiles: 44,
    maximumBeams: 0,
    maximumReinforcements: 0,
    maximumGuardians: 4
  }),
  compactHealth: Object.freeze({
    mode: 'per-member',
    label: 'FRACTURE ENGINES',
    widthPixels: 92,
    followsMember: true,
    defaultVisible: true
  }),
  choreography: Object.freeze({
    kind: 'paired-crossfire',
    coreArchetypeId: 'fracture-core',
    satelliteArchetypeId: 'fracture-satellite',
    baseCadenceFrames: 20,
    survivorCadenceMultiplier: 1.65,
    diagonalInsetRatio: 0.14
  })
}) satisfies MiniBossEncounterDefinition;

const AEGIS_BROOD_CORE = Object.freeze({
  id: 'aegis-brood-core',
  displayName: 'Aegis Brood Core',
  eventId: 'sandbox-mini-boss-lab:aegis-brood-core:v1',
  primaryCategory: 'guardian-formations',
  categories: categoryList('guardian-formations', 'mini-bosses'),
  encounterKind: 'guardian',
  batch: 'A',
  sandboxReady: true,
  campaignAssigned: true,
  expectedDurationSeconds: 27,
  entranceSeconds: 1.6,
  deterministicSeed: 'aegis-brood-core-v1',
  memberArchetypes: Object.freeze([
    member({
      id: 'aegis-core',
      label: 'Brood Core',
      count: 1,
      roles: ['primary'],
      maxHealth: 1500,
      collisionRadiusPixels: 64,
      widthPixels: 170,
      heightPixels: 170,
      assetId: 'aegis-core-body',
      damageable: true
    }),
    member({
      id: 'aegis-guardian',
      label: 'Halo Guardian',
      count: 6,
      roles: ['guardian', 'guardian', 'guardian', 'guardian', 'guardian', 'guardian'],
      maxHealth: 145,
      collisionRadiusPixels: 14,
      widthPixels: 32,
      heightPixels: 32,
      assetId: 'aegis-guardian-body',
      damageable: true
    })
  ]),
  assets: Object.freeze([
    generatedAnimatedBodyAsset('aegis-core-body', 'aegis-brood-core', [
      'aegis-brood-core-neutral.png',
      'aegis-brood-core-idle.png',
      'aegis-brood-core-charge.png',
      'aegis-brood-core-attack-a.png',
      'aegis-brood-core-attack-b.png',
      'aegis-brood-core-damage.png',
      'aegis-brood-core-critical.png'
    ]),
    linkedAsset('aegis-guardian-body', stage20Enemy('ring-sentinel')),
    generatedProjectileAsset('aegis-pulse', 'aegis-brood-core', [
      'aegis-pulse-01.png', 'aegis-pulse-02.png', 'aegis-pulse-03.png', 'aegis-pulse-04.png'
    ], { widthPixels: 30, heightPixels: 34 }),
    telegraphAsset('aegis-warning', 'warning-ring-amber'),
    sharedDeath
  ]),
  signature: attack('aegis-brood-core:guardian-halo', 'Guardian Halo', 'Guardians rotate around the core while preserving one announced passage.', {
    telegraphSeconds: 0.9,
    activeSeconds: 3.1,
    recoverySeconds: 0.7,
    emissionIntervalFrames: 28,
    maximumProjectilesPerEmission: 12,
    projectileAssetId: 'aegis-pulse',
    telegraphAssetId: 'aegis-warning'
  }),
  support: attack('aegis-brood-core:aegis-pulse', 'Aegis Pulse', 'Surviving guardians pulse in sequence; the core opens after the halo is thinned.', {
    telegraphSeconds: 0.7,
    activeSeconds: 2.35,
    recoverySeconds: 0.75,
    emissionIntervalFrames: 32,
    maximumProjectilesPerEmission: 8,
    projectileAssetId: 'aegis-pulse',
    telegraphAssetId: 'aegis-warning'
  }),
  safeRoute: safeRoute('rotating-halo-gap', 92, [
    routeVariant('halo-gap-port', 92, [[0.5, 0.9], [0.3, 0.68], [0.32, 0.43], [0.46, 0.31]]),
    routeVariant('halo-gap-starboard', 92, [[0.5, 0.9], [0.7, 0.68], [0.68, 0.43], [0.54, 0.31]])
  ]),
  budgets: Object.freeze({ maximumHostileEntities: 7, maximumProjectiles: 54, maximumBeams: 0, maximumReinforcements: 0, maximumGuardians: 6 }),
  compactHealth: Object.freeze({ mode: 'primary-with-guardians', label: 'AEGIS BROOD CORE', widthPixels: 104, followsMember: true, defaultVisible: true }),
  choreography: Object.freeze({
    kind: 'guardian-halo',
    coreArchetypeId: 'aegis-core',
    guardianArchetypeId: 'aegis-guardian',
    haloRadiusRatio: 0.24,
    gapArcDegrees: 58,
    exposedWhenGuardianCountAtMost: 2
  })
}) satisfies MiniBossEncounterDefinition;

const RAILSPINE_WALLCRAWLER = Object.freeze({
  id: 'railspine-wallcrawler',
  displayName: 'Railspine Wallcrawler',
  eventId: 'sandbox-mini-boss-lab:railspine-wallcrawler:v1',
  primaryCategory: 'wall-encounters',
  categories: categoryList('wall-encounters', 'mini-bosses'),
  encounterKind: 'wall',
  batch: 'A',
  sandboxReady: true,
  campaignAssigned: true,
  expectedDurationSeconds: 23,
  entranceSeconds: 1.2,
  deterministicSeed: 'railspine-wallcrawler-v1',
  memberArchetypes: Object.freeze([
    member({
      id: 'railspine-body',
      label: 'Railspine',
      count: 1,
      roles: ['primary'],
      maxHealth: 1250,
      collisionRadiusPixels: 54,
      widthPixels: 150,
      heightPixels: 150,
      assetId: 'railspine-body-left',
      damageable: true
    })
  ]),
  assets: Object.freeze([
    generatedAnimatedBodyAsset('railspine-body-left', 'railspine-wallcrawler', [
      'railspine-wallcrawler-neutral.png',
      'railspine-wallcrawler-idle.png',
      'railspine-wallcrawler-charge.png',
      'railspine-wallcrawler-attack-a.png',
      'railspine-wallcrawler-attack-b.png',
      'railspine-wallcrawler-damage.png',
      'railspine-wallcrawler-critical.png'
    ]),
    linkedAsset('railspine-body-right', stage20Enemy('wall-sniper-right')),
    generatedProjectileAsset('railspine-needle', 'railspine-wallcrawler', [
      'railspine-needle-01.png', 'railspine-needle-02.png', 'railspine-needle-03.png', 'railspine-needle-04.png'
    ], { widthPixels: 14, heightPixels: 36 }),
    telegraphAsset('railspine-scan', 'rail-scan-red'),
    sharedDeath
  ]),
  signature: attack('railspine-wallcrawler:rail-traverse', 'Railspine Traverse', 'The crawler stays attached to an edge and drags one warned rail across the arena.', {
    telegraphSeconds: 0.85,
    activeSeconds: 2.75,
    recoverySeconds: 0.6,
    emissionIntervalFrames: 45,
    maximumProjectilesPerEmission: 1,
    projectileAssetId: 'railspine-needle',
    telegraphAssetId: 'railspine-scan'
  }),
  support: attack('railspine-wallcrawler:wall-stitch', 'Wall-Burst Stitch', 'A short edge-origin needle sequence closes one lane and leaves the opposite lane open.', {
    telegraphSeconds: 0.55,
    activeSeconds: 2.1,
    recoverySeconds: 0.75,
    emissionIntervalFrames: 20,
    maximumProjectilesPerEmission: 5,
    projectileAssetId: 'railspine-needle',
    telegraphAssetId: 'railspine-scan'
  }),
  safeRoute: safeRoute('moving-rail-lane', 106, [
    routeVariant('rail-opposite-edge', 106, [[0.5, 0.9], [0.72, 0.72], [0.74, 0.5], [0.68, 0.32]]),
    routeVariant('rail-cross-under', 106, [[0.5, 0.9], [0.28, 0.72], [0.26, 0.5], [0.32, 0.32]])
  ]),
  budgets: Object.freeze({ maximumHostileEntities: 1, maximumProjectiles: 28, maximumBeams: 1, maximumReinforcements: 0, maximumGuardians: 0 }),
  compactHealth: Object.freeze({ mode: 'shared', label: 'RAILSPINE WALLCRAWLER', widthPixels: 108, followsMember: true, defaultVisible: true }),
  choreography: Object.freeze({ kind: 'edge-rail', wallArchetypeId: 'railspine-body', edgeInsetRatio: 0.065, traverseSeconds: 3.4 })
}) satisfies MiniBossEncounterDefinition;

const MAW_CARRIER = Object.freeze({
  id: 'maw-carrier',
  displayName: 'Maw Carrier',
  eventId: 'sandbox-mini-boss-lab:maw-carrier:v1',
  primaryCategory: 'mini-bosses',
  categories: categoryList('mini-bosses', 'guardian-formations'),
  encounterKind: 'carrier',
  batch: 'A',
  sandboxReady: true,
  campaignAssigned: true,
  expectedDurationSeconds: 30,
  entranceSeconds: 1.5,
  deterministicSeed: 'maw-carrier-v1',
  memberArchetypes: Object.freeze([
    member({ id: 'maw-body', label: 'Maw Carrier', count: 1, roles: ['primary'], maxHealth: 1700, collisionRadiusPixels: 68, widthPixels: 180, heightPixels: 180, assetId: 'maw-body-art', damageable: true })
  ]),
  assets: Object.freeze([
    generatedAnimatedBodyAsset('maw-body-art', 'maw-carrier', [
      'maw-carrier-neutral.png',
      'maw-carrier-idle.png',
      'maw-carrier-charge.png',
      'maw-carrier-attack-a.png',
      'maw-carrier-attack-b.png',
      'maw-carrier-damage.png',
      'maw-carrier-critical.png'
    ]),
    linkedAsset('maw-spawn-art', stage20Enemy('crescent-minelayer')),
    generatedProjectileAsset('maw-seed', 'maw-carrier', [
      'maw-seed-01.png', 'maw-seed-02.png', 'maw-seed-03.png', 'maw-seed-04.png'
    ], { widthPixels: 28, heightPixels: 32 }),
    telegraphAsset('maw-warning', 'warning-ring-amber'),
    sharedDeath
  ]),
  signature: attack('maw-carrier:maw-release', 'Maw Release', 'The carrier opens once and releases a bounded wedge that approaches the player.', {
    telegraphSeconds: 1,
    activeSeconds: 2.75,
    recoverySeconds: 0.85,
    emissionIntervalFrames: 72,
    maximumProjectilesPerEmission: 6,
    projectileAssetId: 'maw-seed',
    telegraphAssetId: 'maw-warning'
  }),
  support: attack('maw-carrier:hatchline-volley', 'Hatchline Volley', 'Mouth sockets fire a staggered lane pair rather than a full-screen wall.', {
    telegraphSeconds: 0.65,
    activeSeconds: 2.4,
    recoverySeconds: 0.8,
    emissionIntervalFrames: 24,
    maximumProjectilesPerEmission: 4,
    projectileAssetId: 'maw-seed',
    telegraphAssetId: 'maw-warning'
  }),
  safeRoute: safeRoute('carrier-release-lanes', 100, [
    routeVariant('maw-center-slip', 100, [[0.5, 0.9], [0.5, 0.72], [0.42, 0.52], [0.47, 0.34]]),
    routeVariant('maw-side-slip', 100, [[0.5, 0.9], [0.7, 0.7], [0.65, 0.5], [0.56, 0.34]])
  ]),
  budgets: Object.freeze({ maximumHostileEntities: 7, maximumProjectiles: 42, maximumBeams: 0, maximumReinforcements: 6, maximumGuardians: 0 }),
  compactHealth: Object.freeze({ mode: 'shared', label: 'MAW CARRIER', widthPixels: 106, followsMember: true, defaultVisible: true }),
  choreography: Object.freeze({ kind: 'carrier-release', carrierArchetypeId: 'maw-body', releaseCount: 3, approachSpeedPixelsPerSecond: 112 })
}) satisfies MiniBossEncounterDefinition;

const TWIN_MERIDIAN_SENTINELS = Object.freeze({
  id: 'twin-meridian-sentinels',
  displayName: 'Twin Meridian Sentinels',
  eventId: 'sandbox-mini-boss-lab:twin-meridian-sentinels:v1',
  primaryCategory: 'paired-encounters',
  categories: categoryList('paired-encounters', 'mini-bosses'),
  encounterKind: 'paired',
  batch: 'B',
  sandboxReady: true,
  campaignAssigned: true,
  expectedDurationSeconds: 26,
  entranceSeconds: 1.35,
  deterministicSeed: 'twin-meridian-sentinels-v1',
  memberArchetypes: Object.freeze([
    member({ id: 'meridian-sentinel', label: 'Meridian Sentinel', count: 2, roles: ['leader', 'partner'], maxHealth: 820, collisionRadiusPixels: 50, widthPixels: 160, heightPixels: 160, assetId: 'meridian-sentinel-body', damageable: true })
  ]),
  assets: Object.freeze([
    generatedAnimatedBodyAsset('meridian-sentinel-body', 'twin-meridian-sentinels', [
      'twin-meridian-sentinels-neutral.png',
      'twin-meridian-sentinels-idle.png',
      'twin-meridian-sentinels-charge.png',
      'twin-meridian-sentinels-attack-a.png',
      'twin-meridian-sentinels-attack-b.png',
      'twin-meridian-sentinels-damage.png',
      'twin-meridian-sentinels-critical.png'
    ]),
    generatedProjectileAsset('meridian-bolt', 'twin-meridian-sentinels', [
      'meridian-bolt-01.png', 'meridian-bolt-02.png', 'meridian-bolt-03.png', 'meridian-bolt-04.png'
    ], { widthPixels: 16, heightPixels: 36 }),
    telegraphAsset('meridian-scan', 'rail-scan-cyan'),
    sharedDeath
  ]),
  signature: attack('twin-meridian-sentinels:role-exchange', 'Meridian Role Exchange', 'One twin attacks while the other guards, then both exchange roles on a clear beat.', {
    telegraphSeconds: 0.75,
    activeSeconds: 2.9,
    recoverySeconds: 0.65,
    emissionIntervalFrames: 22,
    maximumProjectilesPerEmission: 4,
    projectileAssetId: 'meridian-bolt',
    telegraphAssetId: 'meridian-scan'
  }),
  support: attack('twin-meridian-sentinels:sentinel-relay', 'Sentinel Relay', 'The attacking twin relays a single aimed rail through the guarded twin.', {
    telegraphSeconds: 0.85,
    activeSeconds: 2.1,
    recoverySeconds: 0.8,
    emissionIntervalFrames: 48,
    maximumProjectilesPerEmission: 1,
    projectileAssetId: 'meridian-bolt',
    telegraphAssetId: 'meridian-scan'
  }),
  safeRoute: safeRoute('paired-role-lanes', 98, [
    routeVariant('meridian-port', 98, [[0.5, 0.9], [0.34, 0.7], [0.35, 0.5], [0.48, 0.32]]),
    routeVariant('meridian-starboard', 98, [[0.5, 0.9], [0.66, 0.7], [0.65, 0.5], [0.52, 0.32]])
  ]),
  budgets: Object.freeze({ maximumHostileEntities: 2, maximumProjectiles: 34, maximumBeams: 1, maximumReinforcements: 0, maximumGuardians: 1 }),
  compactHealth: Object.freeze({ mode: 'per-member', label: 'MERIDIAN SENTINELS', widthPixels: 94, followsMember: true, defaultVisible: true }),
  choreography: Object.freeze({ kind: 'mirror-exchange', sentinelArchetypeId: 'meridian-sentinel', exchangeSeconds: 2.5, survivorCadenceMultiplier: 1.5 })
}) satisfies MiniBossEncounterDefinition;

const PRISM_BLOOM = Object.freeze({
  id: 'prism-bloom',
  displayName: 'Prism Bloom',
  eventId: 'sandbox-mini-boss-lab:prism-bloom:v1',
  primaryCategory: 'elite-enemies',
  categories: categoryList('elite-enemies', 'mini-bosses'),
  encounterKind: 'solo',
  batch: 'B',
  sandboxReady: true,
  campaignAssigned: true,
  expectedDurationSeconds: 24,
  entranceSeconds: 1.3,
  deterministicSeed: 'prism-bloom-v1',
  memberArchetypes: Object.freeze([
    member({ id: 'prism-core', label: 'Prism Bloom', count: 1, roles: ['primary'], maxHealth: 1450, collisionRadiusPixels: 62, widthPixels: 168, heightPixels: 168, assetId: 'prism-core-body', damageable: true })
  ]),
  assets: Object.freeze([
    generatedAnimatedBodyAsset('prism-core-body', 'prism-bloom', [
      'prism-bloom-neutral.png',
      'prism-bloom-idle.png',
      'prism-bloom-charge.png',
      'prism-bloom-attack-a.png',
      'prism-bloom-attack-b.png',
      'prism-bloom-damage.png',
      'prism-bloom-critical.png'
    ]),
    generatedProjectileAsset('prism-petal', 'prism-bloom', [
      'prism-petal-01.png', 'prism-petal-02.png', 'prism-petal-03.png', 'prism-petal-04.png'
    ], { widthPixels: 18, heightPixels: 34 }),
    telegraphAsset('prism-warning', 'warning-ring-violet'),
    sharedDeath
  ]),
  signature: attack('prism-bloom:gap-ring', 'Prism Bloom Gap Ring', 'An incomplete projectile flower opens one rotating passage instead of sealing the screen.', {
    telegraphSeconds: 0.8,
    activeSeconds: 3,
    recoverySeconds: 0.65,
    emissionIntervalFrames: 34,
    maximumProjectilesPerEmission: 18,
    projectileAssetId: 'prism-petal',
    telegraphAssetId: 'prism-warning'
  }),
  support: attack('prism-bloom:petal-reversal', 'Petal Reversal', 'The bloom reverses its next ring direction after a readable core flash.', {
    telegraphSeconds: 0.7,
    activeSeconds: 2.5,
    recoverySeconds: 0.75,
    emissionIntervalFrames: 38,
    maximumProjectilesPerEmission: 14,
    projectileAssetId: 'prism-petal',
    telegraphAssetId: 'prism-warning'
  }),
  safeRoute: safeRoute('incomplete-ring-gap', 94, [
    routeVariant('prism-gap-clockwise', 94, [[0.5, 0.9], [0.68, 0.69], [0.62, 0.5], [0.5, 0.34]]),
    routeVariant('prism-gap-counter', 94, [[0.5, 0.9], [0.32, 0.69], [0.38, 0.5], [0.5, 0.34]])
  ]),
  budgets: Object.freeze({ maximumHostileEntities: 1, maximumProjectiles: 52, maximumBeams: 0, maximumReinforcements: 0, maximumGuardians: 0 }),
  compactHealth: Object.freeze({ mode: 'shared', label: 'PRISM BLOOM', widthPixels: 102, followsMember: true, defaultVisible: true }),
  choreography: Object.freeze({ kind: 'rotating-gap', coreArchetypeId: 'prism-core', projectileCount: 18, gapSlots: 4, clockwiseFirst: true })
}) satisfies MiniBossEncounterDefinition;

const AEGIS_CONVOY_CAPTAIN = Object.freeze({
  id: 'aegis-convoy-captain',
  displayName: 'Aegis Convoy Captain',
  eventId: 'sandbox-mini-boss-lab:aegis-convoy-captain:v1',
  primaryCategory: 'guardian-formations',
  categories: categoryList('guardian-formations', 'mini-bosses'),
  encounterKind: 'convoy',
  batch: 'B',
  sandboxReady: true,
  campaignAssigned: true,
  expectedDurationSeconds: 29,
  entranceSeconds: 1.55,
  deterministicSeed: 'aegis-convoy-captain-v1',
  memberArchetypes: Object.freeze([
    member({ id: 'convoy-captain', label: 'Convoy Captain', count: 1, roles: ['primary'], maxHealth: 1550, collisionRadiusPixels: 64, widthPixels: 170, heightPixels: 170, assetId: 'convoy-captain-body', damageable: true }),
    member({ id: 'convoy-escort', label: 'Aegis Escort', count: 4, roles: ['escort', 'escort', 'escort', 'escort'], maxHealth: 180, collisionRadiusPixels: 16, widthPixels: 36, heightPixels: 36, assetId: 'convoy-escort-body', damageable: true })
  ]),
  assets: Object.freeze([
    generatedAnimatedBodyAsset('convoy-captain-body', 'aegis-convoy-captain', [
      'aegis-convoy-captain-neutral.png',
      'aegis-convoy-captain-idle.png',
      'aegis-convoy-captain-charge.png',
      'aegis-convoy-captain-attack-a.png',
      'aegis-convoy-captain-attack-b.png',
      'aegis-convoy-captain-damage.png',
      'aegis-convoy-captain-critical.png'
    ]),
    linkedAsset('convoy-escort-body', stage20Enemy('orbit-disc')),
    generatedProjectileAsset('convoy-command-bolt', 'aegis-convoy-captain', [
      'convoy-command-bolt-01.png', 'convoy-command-bolt-02.png', 'convoy-command-bolt-03.png', 'convoy-command-bolt-04.png'
    ], { widthPixels: 14, heightPixels: 36 }),
    telegraphAsset('convoy-warning', 'warning-ring-amber'),
    sharedDeath
  ]),
  signature: attack('aegis-convoy-captain:shield-transform', 'Convoy Shield Transform', 'Escorts move between wedge and pocket formations while keeping one deterministic exit.', {
    telegraphSeconds: 0.8,
    activeSeconds: 3.25,
    recoverySeconds: 0.7,
    emissionIntervalFrames: 30,
    maximumProjectilesPerEmission: 4,
    projectileAssetId: 'convoy-command-bolt',
    telegraphAssetId: 'convoy-warning'
  }),
  support: attack('aegis-convoy-captain:command-burst', 'Captain Command Burst', 'The captain marks one lane and orders surviving escorts to fire sequentially.', {
    telegraphSeconds: 0.75,
    activeSeconds: 2.5,
    recoverySeconds: 0.8,
    emissionIntervalFrames: 28,
    maximumProjectilesPerEmission: 4,
    projectileAssetId: 'convoy-command-bolt',
    telegraphAssetId: 'convoy-warning'
  }),
  safeRoute: safeRoute('convoy-pocket', 100, [
    routeVariant('convoy-pocket-left', 100, [[0.5, 0.9], [0.34, 0.72], [0.38, 0.5], [0.45, 0.32]]),
    routeVariant('convoy-pocket-right', 100, [[0.5, 0.9], [0.66, 0.72], [0.62, 0.5], [0.55, 0.32]])
  ]),
  budgets: Object.freeze({ maximumHostileEntities: 5, maximumProjectiles: 44, maximumBeams: 0, maximumReinforcements: 0, maximumGuardians: 4 }),
  compactHealth: Object.freeze({ mode: 'primary-with-guardians', label: 'AEGIS CONVOY', widthPixels: 106, followsMember: true, defaultVisible: true }),
  choreography: Object.freeze({ kind: 'convoy-command', captainArchetypeId: 'convoy-captain', escortArchetypeId: 'convoy-escort', formationWidthRatio: 0.62, exposeCaptainWhenEscortsAtMost: 1 })
}) satisfies MiniBossEncounterDefinition;

const GRIDLINE_SENTRIES = Object.freeze({
  id: 'gridline-sentries',
  displayName: 'Gridline Sentries',
  eventId: 'sandbox-mini-boss-lab:gridline-sentries:v1',
  primaryCategory: 'wall-encounters',
  categories: categoryList('wall-encounters', 'paired-encounters'),
  encounterKind: 'grid',
  batch: 'B',
  sandboxReady: true,
  campaignAssigned: true,
  expectedDurationSeconds: 25,
  entranceSeconds: 1.15,
  deterministicSeed: 'gridline-sentries-v1',
  memberArchetypes: Object.freeze([
    member({ id: 'gridline-sentry', label: 'Gridline Sentry', count: 2, roles: ['sentry-west', 'sentry-north'], maxHealth: 430, collisionRadiusPixels: 44, widthPixels: 112, heightPixels: 112, assetId: 'gridline-sentry-body', damageable: true })
  ]),
  assets: Object.freeze([
    generatedAnimatedBodyAsset('gridline-sentry-body', 'gridline-sentries', [
      'gridline-sentries-neutral.png',
      'gridline-sentries-idle.png',
      'gridline-sentries-charge.png',
      'gridline-sentries-attack-a.png',
      'gridline-sentries-attack-b.png',
      'gridline-sentries-damage.png',
      'gridline-sentries-critical.png'
    ]),
    linkedAsset('gridline-sentry-mirror', stage20Enemy('wall-sniper-right')),
    generatedProjectileAsset('gridline-bolt', 'gridline-sentries', [
      'gridline-bolt-01.png', 'gridline-bolt-02.png', 'gridline-bolt-03.png', 'gridline-bolt-04.png'
    ], { widthPixels: 14, heightPixels: 36 }),
    telegraphAsset('gridline-scan', 'rail-scan-cyan'),
    sharedDeath
  ]),
  signature: attack('gridline-sentries:safe-quadrant', 'Safe-Quadrant Grid', 'Two warned boundaries intersect while one full player-sized quadrant remains clear.', {
    telegraphSeconds: 0.95,
    activeSeconds: 2.75,
    recoverySeconds: 0.7,
    emissionIntervalFrames: 50,
    maximumProjectilesPerEmission: 2,
    projectileAssetId: 'gridline-bolt',
    telegraphAssetId: 'gridline-scan'
  }),
  support: attack('gridline-sentries:boundary-shift', 'Sentry Boundary Shift', 'The sentries shift the safe quadrant one axis at a time with separate warnings.', {
    telegraphSeconds: 0.75,
    activeSeconds: 2.4,
    recoverySeconds: 0.8,
    emissionIntervalFrames: 42,
    maximumProjectilesPerEmission: 2,
    projectileAssetId: 'gridline-bolt',
    telegraphAssetId: 'gridline-scan'
  }),
  safeRoute: safeRoute('safe-quadrant', 118, [
    routeVariant('grid-southwest', 118, [[0.5, 0.9], [0.28, 0.75], [0.25, 0.56], [0.27, 0.38]]),
    routeVariant('grid-southeast', 118, [[0.5, 0.9], [0.72, 0.75], [0.75, 0.56], [0.73, 0.38]]),
    routeVariant('grid-northwest', 118, [[0.5, 0.9], [0.45, 0.7], [0.27, 0.5], [0.25, 0.3]]),
    routeVariant('grid-northeast', 118, [[0.5, 0.9], [0.55, 0.7], [0.73, 0.5], [0.75, 0.3]])
  ]),
  budgets: Object.freeze({ maximumHostileEntities: 2, maximumProjectiles: 24, maximumBeams: 2, maximumReinforcements: 0, maximumGuardians: 0 }),
  compactHealth: Object.freeze({ mode: 'per-member', label: 'GRIDLINE SENTRIES', widthPixels: 88, followsMember: true, defaultVisible: true }),
  choreography: Object.freeze({ kind: 'quadrant-grid', sentryArchetypeId: 'gridline-sentry', boundaryInsetRatio: 0.07, shiftSeconds: 2.8 })
}) satisfies MiniBossEncounterDefinition;

const REGISTRY_LIST = Object.freeze([
  FRACTURE_ENGINE_ELITE,
  AEGIS_BROOD_CORE,
  RAILSPINE_WALLCRAWLER,
  MAW_CARRIER,
  TWIN_MERIDIAN_SENTINELS,
  PRISM_BLOOM,
  AEGIS_CONVOY_CAPTAIN,
  GRIDLINE_SENTRIES
]) satisfies readonly MiniBossEncounterDefinition[];

export const MINI_BOSS_ENCOUNTER_REGISTRY = Object.freeze(
  Object.fromEntries(REGISTRY_LIST.map((definition) => [definition.id, definition]))
) as Readonly<Record<MiniBossEncounterId, MiniBossEncounterDefinition>>;

export const MINI_BOSS_ENCOUNTER_DEFINITIONS: readonly MiniBossEncounterDefinition[] = Object.freeze(
  MINI_BOSS_LAB_ENCOUNTER_IDS.map((id) => MINI_BOSS_ENCOUNTER_REGISTRY[id])
);

const EVENT_ID_TO_ENCOUNTER = Object.freeze(
  Object.fromEntries(REGISTRY_LIST.flatMap((definition) => [
    [definition.eventId, definition],
    [`sandbox-${definition.id}`, definition]
  ]))
) as Readonly<Record<string, MiniBossEncounterDefinition>>;

export const getMiniBossEncounterDefinition = (
  id: MiniBossEncounterId | string
): MiniBossEncounterDefinition | undefined => (
  MINI_BOSS_ENCOUNTER_REGISTRY[id as MiniBossEncounterId]
);

export const getMiniBossEncounterByEventId = (
  eventId: string | null | undefined
): MiniBossEncounterDefinition | undefined => (
  eventId ? EVENT_ID_TO_ENCOUNTER[eventId] : undefined
);

export const isMiniBossLabEventId = (eventId: string | null | undefined): boolean => (
  getMiniBossEncounterByEventId(eventId) !== undefined
);

export const listMiniBossEncountersByCategory = (
  category: MiniBossLabCategoryId
): readonly MiniBossEncounterDefinition[] => (
  MINI_BOSS_ENCOUNTER_DEFINITIONS.filter((definition) => definition.categories.includes(category))
);

export const MINI_BOSS_LAB_ASSET_INVENTORY = Object.freeze(
  MINI_BOSS_ENCOUNTER_DEFINITIONS.flatMap((definition) => (
    definition.assets.map((binding) => Object.freeze({
      encounterId: definition.id,
      encounterName: definition.displayName,
      ...binding
    }))
  ))
);
