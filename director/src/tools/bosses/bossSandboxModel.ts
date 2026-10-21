import type { AssetKey, BossEvent, GameCampaignConfig } from '@game/game-config/types';
import { getBossEncounterClass } from '@game/game-config/catalog';
import { isDamagingBossTimelinePrimitive } from '@game/game-config/bossTimeline';
import { validateGameCampaign } from '@game/game-config/validate';
import {
  getGeneratedBossPreviewAttacks,
  resolveGeneratedBossArchetype
} from '@game/services/generatedBossArchetypes';
import {
  WEEKLY_RUN_INITIAL_STAGE_COUNT,
  planWeeklyRunStages
} from '@game/services/weeklyRunGenerator';
import type {
  ArticulatedPincerPartId,
  PreviewBossArtwork,
  RotatingEmitterCorePartId,
  SegmentedCrescentPartId,
  TransformingOrbiterPartId
} from '@game/services/pixi/PixiGameRenderer';
import type {
  PreviewBossVfxAtlas,
  PreviewBossVfxFrameId
} from '@game/services/pixi/boss-rigs/PreviewBossVfxContracts';
import type {
  PreviewBossModularPoseSampler
} from '@game/services/pixi/boss-rigs/PreviewBossRigContracts';
import type { PreviewBossAttackSnapshot } from '@game/services/gameplay/previewSession';
import { getMiniBossEncounterDefinition } from '@game/services/gameplay/mini-bosses';
import {
  MODULAR_BOSS_REFERENCE_COMPARISON_KIND
} from '@game/services/pixi/boss-rigs/PreviewBossReferenceComparison';
import {
  FIXED_FRAME_ANIMATION_KIND,
  MODULAR_BOSS_RIG_KIND,
  registerModularBossRig,
  type ModularBossPartRole,
  type ModularBossRigManifest,
  type ModularBossSocketRole
} from '@game/services/pixi/boss-rigs/ModularHierarchyRig';
import { sampleGloamforgeModularPose } from '@game/services/pixi/boss-rigs/GloamforgeModularPose';
import {
  sampleFrontierCrownclawSandboxPose,
  validateFrontierCrownclawRigCompatibility
} from '@game/services/pixi/boss-rigs/FrontierCrownclawModularPose';
import { sampleHeliosModularPose } from '@game/services/pixi/boss-rigs/HeliosModularPose';
import { sampleNullwakeModularPose } from '@game/services/pixi/boss-rigs/NullwakeModularPose';
import {
  samplePrismMothSandboxPose,
  validatePrismMothRigCompatibility
} from '@game/services/pixi/boss-rigs/PrismMothModularPose';
import {
  UMBRA_NEEDLEWING_ARTWORK_PACKAGE,
  UMBRA_NEEDLEWING_ATLAS_SHA256,
  UMBRA_NEEDLEWING_ATLAS_URL,
  UMBRA_NEEDLEWING_MODULAR_RIG,
  UMBRA_NEEDLEWING_NEUTRAL_SHA256,
  UMBRA_NEEDLEWING_NEUTRAL_SIZE,
  UMBRA_NEEDLEWING_NEUTRAL_URL,
  UMBRA_NEEDLEWING_REFERENCE_COMPARISON,
  UMBRA_NEEDLEWING_REFERENCE_SHA256,
  UMBRA_NEEDLEWING_REFERENCE_URL
} from '@game/services/pixi/boss-rigs/UmbraNeedlewingArtwork';
import {
  ABYSSAL_OCTARCH_ARTWORK_PACKAGE,
  ABYSSAL_OCTARCH_ATLAS_SHA256,
  ABYSSAL_OCTARCH_ATLAS_URL,
  ABYSSAL_OCTARCH_DESIGN_SIZE,
  ABYSSAL_OCTARCH_MODULAR_RIG,
  ABYSSAL_OCTARCH_NEUTRAL_SHA256,
  ABYSSAL_OCTARCH_NEUTRAL_URL,
  ABYSSAL_OCTARCH_REFERENCE_COMPARISON
} from '@game/services/pixi/boss-rigs/AbyssalOctarchArtwork';
import { getSandboxBossCollisionMask } from './generatedSandboxBossCollisionMasks';
import {
  createFocusedPreviewCampaign,
  type CombatLabPreviewResult
} from '@director/combat-lab/experimentModel';
import {
  buildSandboxBossPrototypePreview,
  SANDBOX_BOSS_PROTOTYPES,
  type SandboxEncounterCategoryId,
  type SandboxBossPrototypeId,
  type SandboxMiniBossEncounterMetadata,
  type SandboxBossPrototypePreview
} from '@director/combat-lab/sandboxBossPrototypes';
import gloamforgeAtlasSource from '../../../../director-data/prototype-assets/gloamforge-mantis/gloamforge-mantis-atlas.json';
import gloamforgeRigSource from '../../../../director-data/prototype-assets/gloamforge-mantis/gloamforge-mantis.rig.json';
import frontierCrownclawAtlasSource from '../../../../director-data/prototype-assets/frontier-crownclaw/frontier-crownclaw-atlas.json';
import frontierCrownclawRigSource from '../../../../director-data/prototype-assets/frontier-crownclaw/frontier-crownclaw.rig.json';
import heliosAtlasSource from '../../../../director-data/prototype-assets/helios-clawcarrier-v2/helios-clawcarrier-v2-atlas.json';
import heliosRigSource from '../../../../director-data/prototype-assets/helios-clawcarrier-v2/helios-clawcarrier-v2.rig.json';
import prismMothAtlasSource from '../../../../director-data/prototype-assets/prism-moth-broodkeeper/prism-moth-broodkeeper-atlas.json';
import prismMothRigSource from '../../../../director-data/prototype-assets/prism-moth-broodkeeper/prism-moth-broodkeeper.rig.json';

export const BOSS_SANDBOX_VERSION = 'V 0.34' as const;

export const BOSS_SANDBOX_RAIL_MIN_WIDTH = 236;
export const BOSS_SANDBOX_RAIL_MAX_WIDTH = 420;
export const BOSS_SANDBOX_GAME_VIEWPORT_WIDTH = 390;

export interface BossSandboxRailWidths {
  readonly left: number;
  readonly right: number;
}

export const normalizeBossSandboxRailWidths = (
  value: unknown
): BossSandboxRailWidths => {
  const candidate = value && typeof value === 'object'
    ? value as Partial<Record<keyof BossSandboxRailWidths, unknown>>
    : {};
  const normalizeWidth = (width: unknown) => {
    const numeric = typeof width === 'number' ? width : Number.NaN;
    return Number.isFinite(numeric)
      ? Math.round(Math.min(
          BOSS_SANDBOX_RAIL_MAX_WIDTH,
          Math.max(BOSS_SANDBOX_RAIL_MIN_WIDTH, numeric)
        ))
      : BOSS_SANDBOX_RAIL_MIN_WIDTH;
  };
  return Object.freeze({
    left: normalizeWidth(candidate.left),
    right: normalizeWidth(candidate.right)
  });
};

export const clampBossSandboxRailWidth = ({
  requestedWidth,
  otherRailWidth,
  workspaceWidth
}: {
  requestedWidth: number;
  otherRailWidth: number;
  workspaceWidth: number;
}): number => {
  const availableMaximum = Math.max(
    BOSS_SANDBOX_RAIL_MIN_WIDTH,
    Math.floor(workspaceWidth - otherRailWidth - BOSS_SANDBOX_GAME_VIEWPORT_WIDTH)
  );
  return Math.round(Math.min(
    BOSS_SANDBOX_RAIL_MAX_WIDTH,
    availableMaximum,
    Math.max(BOSS_SANDBOX_RAIL_MIN_WIDTH, requestedWidth)
  ));
};

export const fitBossSandboxRailWidths = (
  value: unknown,
  workspaceWidth: number
): BossSandboxRailWidths => {
  const normalized = normalizeBossSandboxRailWidths(value);
  const availableRailWidth = Math.max(
    BOSS_SANDBOX_RAIL_MIN_WIDTH * 2,
    Math.floor(workspaceWidth - BOSS_SANDBOX_GAME_VIEWPORT_WIDTH)
  );
  let left = normalized.left;
  let right = normalized.right;
  let overflow = Math.max(0, left + right - availableRailWidth);
  if (overflow > 0) {
    const leftReduction = Math.min(
      left - BOSS_SANDBOX_RAIL_MIN_WIDTH,
      Math.ceil(overflow / 2)
    );
    left -= leftReduction;
    overflow -= leftReduction;
  }
  if (overflow > 0) {
    const rightReduction = Math.min(
      right - BOSS_SANDBOX_RAIL_MIN_WIDTH,
      overflow
    );
    right -= rightReduction;
    overflow -= rightReduction;
  }
  if (overflow > 0) {
    left = Math.max(BOSS_SANDBOX_RAIL_MIN_WIDTH, left - overflow);
  }
  return Object.freeze({ left, right });
};

export const getBossSandboxPerformingAttackId = (
  activeAttack: PreviewBossAttackSnapshot | null | undefined
): string | null => activeAttack && activeAttack.stage !== 'recovery'
  ? activeAttack.id
  : null;

export const MERIDIAN_HARROWER_ART_SHA256 =
  '1f55d59ef09ade50b9ec35465208b687c8fb8830047592bfae3daec67bfd28c5';
export const MERIDIAN_HARROWER_SHEET_SHA256 =
  '640d5fb62390fa8cb5c0644f780cf87c341b7c253564a5af710b7b3dffc569f4';
export const MERIDIAN_HARROWER_ART_URL =
  `/__director/api/v1/prototype-assets/meridian-harrower/${MERIDIAN_HARROWER_ART_SHA256}/assembled.png`;
export const MERIDIAN_HARROWER_SHEET_URL =
  `/__director/api/v1/prototype-assets/meridian-harrower/${MERIDIAN_HARROWER_SHEET_SHA256}/sheet.png`;
export const HELIOS_CLAWCARRIER_ART_SHA256 =
  '08fcc15404f57aecb70b35d9498b267bd4c2f313e84dc142becf190d7a9f7f57';
export const HELIOS_CLAWCARRIER_SHEET_SHA256 =
  'a686d39293f096e21adee7e7c85b78d1e2f3eb10d644f47b16235362eb7e9c11';
export const HELIOS_CLAWCARRIER_REFERENCE_SHA256 =
  '8d6ce675283e1bb3dfd684247c13efaf80f1230400b529032dea3467f9177cb4';
export const HELIOS_CLAWCARRIER_ART_URL =
  `/__director/api/v1/prototype-assets/helios-clawcarrier/${HELIOS_CLAWCARRIER_ART_SHA256}/assembled.png`;
export const HELIOS_CLAWCARRIER_SHEET_URL =
  `/__director/api/v1/prototype-assets/helios-clawcarrier/${HELIOS_CLAWCARRIER_SHEET_SHA256}/sheet.png`;
export const HELIOS_CLAWCARRIER_REFERENCE_URL =
  `/__director/api/v1/prototype-assets/helios-clawcarrier/${HELIOS_CLAWCARRIER_REFERENCE_SHA256}/reference.png`;
export const FRONTIER_CROWNCLAW_ART_SHA256 =
  '3fe62b12ade41026f74c334e3272f28261a60c8a0935b003e536bcff9d33e342';
export const FRONTIER_CROWNCLAW_SHEET_SHA256 =
  '8da50a881b5ad2425c294e7b9f382172c7fadbff70b8b52f4d2206d793e980fb';
export const FRONTIER_CROWNCLAW_REFERENCE_SHA256 =
  'a3c2e6853d192b45d996ee50b3432fd61d20513a2ea468695670d8df5957f4a5';
export const FRONTIER_CROWNCLAW_ART_URL =
  `/__director/api/v1/prototype-assets/frontier-crownclaw/${FRONTIER_CROWNCLAW_ART_SHA256}/assembled.png`;
export const FRONTIER_CROWNCLAW_SHEET_URL =
  `/__director/api/v1/prototype-assets/frontier-crownclaw/${FRONTIER_CROWNCLAW_SHEET_SHA256}/sheet.png`;
export const FRONTIER_CROWNCLAW_REFERENCE_URL =
  `/__director/api/v1/prototype-assets/frontier-crownclaw/${FRONTIER_CROWNCLAW_REFERENCE_SHA256}/reference.png`;
export const PRISM_MOTH_BROODKEEPER_ART_SHA256 =
  'cd0381398cbfb5003822f126192dc0d18af3fe874eff11defec9d57202109f39';
export const PRISM_MOTH_BROODKEEPER_SHEET_SHA256 =
  '5ef8ca7e395c94b3777d4f85808b5701f8bc952d96a335438e8353dcc82b6292';
export const PRISM_MOTH_BROODKEEPER_REFERENCE_SHA256 =
  'b006c73ab1b027d5dce5ac2dc5cf841a2b2e30a202da264b91c00f8f93b77ade';
export const PRISM_MOTH_BROODKEEPER_ART_URL =
  `/__director/api/v1/prototype-assets/prism-moth-broodkeeper/${PRISM_MOTH_BROODKEEPER_ART_SHA256}/assembled.png`;
export const PRISM_MOTH_BROODKEEPER_SHEET_URL =
  `/__director/api/v1/prototype-assets/prism-moth-broodkeeper/${PRISM_MOTH_BROODKEEPER_SHEET_SHA256}/sheet.png`;
export const PRISM_MOTH_BROODKEEPER_REFERENCE_URL =
  `/__director/api/v1/prototype-assets/prism-moth-broodkeeper/${PRISM_MOTH_BROODKEEPER_REFERENCE_SHA256}/reference.png`;
export const PRISM_MOTH_FEATHER_SHEET_SHA256 =
  '87b88c95cdc29dfee7df974f9e7aa4ff359aeda50aa9630e7012d7427f64ba56';
export const PRISM_MOTH_FEATHER_SHEET_URL =
  '/game-art/generated/ui/scicon-simple-arcade-kit-v1/projectiles/prism-shard/cyan/projectile-prism-shard-cyan-sprite-sheet.png';
export const AURORA_STORM_ENGINE_ART_SHA256 =
  '4b0db8c860f6813b60375241c4cbca710633bf1ea98677f3ab2d66d7b04925e3';
export const AURORA_STORM_ENGINE_SHEET_SHA256 =
  'e2132ed3b90a78a64bea25350ed19477aa3a94a312beaffa258f1ba691351f5e';
export const AURORA_STORM_ENGINE_ART_URL =
  `/__director/api/v1/prototype-assets/aurora-storm-engine/${AURORA_STORM_ENGINE_ART_SHA256}/assembled.png`;
export const AURORA_STORM_ENGINE_SHEET_URL =
  `/__director/api/v1/prototype-assets/aurora-storm-engine/${AURORA_STORM_ENGINE_SHEET_SHA256}/sheet.png`;
export const UMBRA_NEEDLEWING_ART_SHA256 =
  UMBRA_NEEDLEWING_NEUTRAL_SHA256;
export const UMBRA_NEEDLEWING_SHEET_SHA256 =
  UMBRA_NEEDLEWING_ATLAS_SHA256;
export const UMBRA_NEEDLEWING_REFERENCE_ART_SHA256 =
  UMBRA_NEEDLEWING_REFERENCE_SHA256;
export const UMBRA_NEEDLEWING_ART_URL =
  UMBRA_NEEDLEWING_NEUTRAL_URL;
export const UMBRA_NEEDLEWING_SHEET_URL =
  UMBRA_NEEDLEWING_ATLAS_URL;
export const UMBRA_NEEDLEWING_REFERENCE_ART_URL =
  UMBRA_NEEDLEWING_REFERENCE_URL;
export const CINDERJAW_SIEGE_BEETLE_ART_SHA256 =
  '133b11009ad6ccb6f1b31252d10ee90554a31aaa56f0a6769e51f47f31744611';
export const CINDERJAW_SIEGE_BEETLE_SHEET_SHA256 =
  '62900c5d0aaa386b6c8c9b5ab84d0c91d22a55d3dcc99d0a3f4ea4ea2b142055';
export const CINDERJAW_SIEGE_BEETLE_ART_URL =
  `/__director/api/v1/prototype-assets/cinderjaw-siege-beetle/${CINDERJAW_SIEGE_BEETLE_ART_SHA256}/assembled.png`;
export const CINDERJAW_SIEGE_BEETLE_SHEET_URL =
  `/__director/api/v1/prototype-assets/cinderjaw-siege-beetle/${CINDERJAW_SIEGE_BEETLE_SHEET_SHA256}/sheet.png`;
export const VESPERGLASS_MOTHMOTHER_ART_SHA256 =
  '66ceb0d68b16951b054cb28dcc11d585f01813d6b8d63e94ec3ba8a94d6ab5ee';
export const VESPERGLASS_MOTHMOTHER_SHEET_SHA256 =
  '6e425e4faf5c1daefc7a8c16a7052e6dee407f02225b6ddf7c206fdf46398a67';
export const VESPERGLASS_MOTHMOTHER_ART_URL =
  `/__director/api/v1/prototype-assets/vesperglass-mothmother/${VESPERGLASS_MOTHMOTHER_ART_SHA256}/assembled.png`;
export const VESPERGLASS_MOTHMOTHER_SHEET_URL =
  `/__director/api/v1/prototype-assets/vesperglass-mothmother/${VESPERGLASS_MOTHMOTHER_SHEET_SHA256}/sheet.png`;
export const TWIN_HALO_WARDENS_ART_SHA256 =
  '9982182d70ef8e8fe1e9c852377d5f1251719573211b49c172ec78d9ff90e170';
export const TWIN_HALO_WARDENS_SHEET_SHA256 =
  'e386d8f70308b7f648b8f7480185913675fd9b1b1564ff9f9d66278d617b1030';
export const TWIN_HALO_WARDENS_ART_URL =
  `/__director/api/v1/prototype-assets/twin-halo-wardens/${TWIN_HALO_WARDENS_ART_SHA256}/assembled.png`;
export const TWIN_HALO_WARDENS_SHEET_URL =
  `/__director/api/v1/prototype-assets/twin-halo-wardens/${TWIN_HALO_WARDENS_SHEET_SHA256}/sheet.png`;
export const RIFTCOIL_WYRM_ART_SHA256 =
  '8656a9ae41084c118ceffbe192b7ff0d9c4bd7d3eb3ad4e63de64e4fc8f12cf2';
export const RIFTCOIL_WYRM_SHEET_SHA256 =
  '75f380b04706bf46fbaeb2b428c409549da55321359a36e7692aa7a6842f455e';
export const RIFTCOIL_WYRM_ART_URL =
  `/__director/api/v1/prototype-assets/riftcoil-wyrm/${RIFTCOIL_WYRM_ART_SHA256}/assembled.png`;
export const RIFTCOIL_WYRM_SHEET_URL =
  `/__director/api/v1/prototype-assets/riftcoil-wyrm/${RIFTCOIL_WYRM_SHEET_SHA256}/sheet.png`;
export const NULLWAKE_REVENANT_ART_SHA256 =
  '5ee76a64cc5207e85be611744ada5784dd5c95776cc0e3262d3fbf888d3f5407';
export const NULLWAKE_REVENANT_SHEET_SHA256 =
  '4b6fd55cac26b66b3c3705789e1e6ee6a91d87258d19aaff97f284457ba5a53f';
export const NULLWAKE_REVENANT_FACTORY_ATLAS_V3_SHA256 =
  'a0d29566c3e925c764267f48202ce1a18247f28007b43ad7fdcba7c8573da2cd';
export const NULLWAKE_REVENANT_ART_URL =
  `/__director/api/v1/prototype-assets/nullwake-revenant/${NULLWAKE_REVENANT_ART_SHA256}/assembled.png`;
export const NULLWAKE_REVENANT_SHEET_URL =
  `/__director/api/v1/prototype-assets/nullwake-revenant/${NULLWAKE_REVENANT_SHEET_SHA256}/sheet.png`;
export const NULLWAKE_REVENANT_FACTORY_ATLAS_V3_URL =
  `/__director/api/v1/prototype-assets/nullwake-revenant/${NULLWAKE_REVENANT_FACTORY_ATLAS_V3_SHA256}/factory-atlas-v3.png`;
export const GLOAMFORGE_MANTIS_ART_SHA256 =
  '1f120a336cbd05bce0955b657964e35fb724ed59664b2301540a39b7c2c9bca8';
export const GLOAMFORGE_MANTIS_SHEET_SHA256 =
  'eb08e5b68bdbc6cc999f8d1e45d293628248308d338004d86be6d4f2e6857f60';
export const GLOAMFORGE_MANTIS_ART_URL =
  `/__director/api/v1/prototype-assets/gloamforge-mantis/${GLOAMFORGE_MANTIS_ART_SHA256}/assembled.png`;
export const GLOAMFORGE_MANTIS_SHEET_URL =
  `/__director/api/v1/prototype-assets/gloamforge-mantis/${GLOAMFORGE_MANTIS_SHEET_SHA256}/sheet.png`;
export const SANDBOX_BOSS_VFX_SHEET_SHA256 =
  '09bcf6e00e0a3d6d96b4a64f73f09a3b7a59b890219169bcf433ebfea2b7e8b1';
export const SANDBOX_BOSS_VFX_SHEET_URL =
  `/__director/api/v1/prototype-assets/sandbox-boss-vfx/${SANDBOX_BOSS_VFX_SHEET_SHA256}/sheet.png`;

const getGloamforgePartRole = (partId: string): ModularBossPartRole => {
  if (partId === 'root' || partId.endsWith('.mount')) return 'joint';
  if (partId === 'body') return 'body';
  if (partId.startsWith('baffle.')) return 'armor';
  if (partId.startsWith('arm.')) return 'arm';
  if (partId.startsWith('cannon.')) return 'weapon';
  if (partId.startsWith('pod.')) return 'pod';
  if (partId.startsWith('leg.')) return 'stabilizer';
  if (partId === 'exhaust') return 'exhaust';
  if (partId.startsWith('muzzle.')) return 'effect';
  if (partId === 'cleaver') return 'phase-attachment';
  return 'decorative';
};

const getGloamforgeSocketRole = (socketId: string): ModularBossSocketRole => {
  if (socketId.startsWith('muzzle-')) return 'projectile-muzzle';
  if (socketId.startsWith('pod-')) return 'detachable-pod';
  if (socketId === 'crucible-core') return 'core-origin';
  if (socketId === 'cleaver-root') return 'melee-root';
  return 'effect-origin';
};

const normalizeGloamforgeRigManifest = (): ModularBossRigManifest => {
  if (gloamforgeAtlasSource.image.sha256 !== GLOAMFORGE_MANTIS_SHEET_SHA256) {
    throw new Error('Gloamforge atlas metadata does not match its fixed content hash.');
  }
  if (gloamforgeRigSource.atlas.sha256 !== GLOAMFORGE_MANTIS_SHEET_SHA256) {
    throw new Error('Gloamforge rig does not reference the registered atlas.');
  }

  const designSize = Object.freeze({
    width: gloamforgeRigSource.canvas.width,
    height: gloamforgeRigSource.canvas.height
  });
  const frames = Object.freeze(Object.fromEntries(
    Object.entries(gloamforgeAtlasSource.frames).map(([frameId, frame]) => [
      frameId,
      Object.freeze({
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height
      })
    ])
  ));
  const parts = Object.freeze(gloamforgeRigSource.parts.map((part) => {
    const isRoot = part.parentId === null;
    return Object.freeze({
      id: part.id,
      role: getGloamforgePartRole(part.id),
      parentId: part.parentId,
      frameId: part.frameId,
      transform: Object.freeze({
        // The source rig is authored in a top-left canvas. Runtime rigs are
        // centered on the gameplay entity while child offsets stay local.
        x: isRoot ? part.transform.x - designSize.width / 2 : part.transform.x,
        y: isRoot ? part.transform.y - designSize.height / 2 : part.transform.y,
        rotation: part.transform.rotationDegrees * Math.PI / 180,
        scaleX: part.transform.scaleX,
        scaleY: part.transform.scaleY
      }),
      anchor: part.anchor
        ? Object.freeze({ x: part.anchor.x, y: part.anchor.y })
        : null,
      layer: part.layer,
      visible: part.neutralVisible
    });
  }));
  const animations = Object.freeze(gloamforgeRigSource.animations.map((animation) => (
    Object.freeze({
      kind: FIXED_FRAME_ANIMATION_KIND,
      id: animation.id,
      partId: animation.partId,
      frameIds: Object.freeze([...animation.frameIds]),
      frameHold: Math.max(1, Math.round(60 / animation.fps)),
      loop: animation.loop
    })
  )));
  const sockets = Object.freeze(gloamforgeRigSource.sockets.map((socket) => (
    Object.freeze({
      id: socket.id,
      role: getGloamforgeSocketRole(socket.id),
      partId: socket.partId,
      x: socket.x,
      y: socket.y,
      rotation: 0
    })
  )));

  return Object.freeze({
    kind: MODULAR_BOSS_RIG_KIND,
    id: gloamforgeRigSource.bossId,
    designSize,
    atlas: Object.freeze({
      url: GLOAMFORGE_MANTIS_SHEET_URL,
      contentHash: GLOAMFORGE_MANTIS_SHEET_SHA256,
      width: gloamforgeAtlasSource.image.width,
      height: gloamforgeAtlasSource.image.height,
      frames
    }),
    parts,
    animations,
    sockets
  });
};

export const GLOAMFORGE_MANTIS_MODULAR_RIG = registerModularBossRig(
  normalizeGloamforgeRigManifest()
);

const sampleGloamforgeSandboxPose: PreviewBossModularPoseSampler = (input) => (
  sampleGloamforgeModularPose(input).partOverrides
);

const getHeliosPartRole = (partId: string): ModularBossPartRole => {
  if (partId === 'root' || partId.endsWith('.mount')) return 'joint';
  if (partId === 'body') return 'body';
  if (partId === 'reactor') return 'phase-attachment';
  if (partId.startsWith('claw.') || partId.startsWith('mandible.')) return 'arm';
  if (partId.startsWith('rotary.')) return 'weapon';
  if (partId.startsWith('pod.')) return 'pod';
  if (partId.startsWith('leg.')) return 'stabilizer';
  if (partId === 'exhaust') return 'exhaust';
  if (partId.startsWith('muzzle.')) return 'effect';
  return 'decorative';
};

const getHeliosSocketRole = (socketId: string): ModularBossSocketRole => {
  if (socketId.startsWith('heavy-muzzle-') || socketId.startsWith('rotary-muzzle-')) {
    return 'projectile-muzzle';
  }
  if (socketId.startsWith('mine-')) return 'detachable-pod';
  if (socketId === 'reactor-core') return 'core-origin';
  if (socketId.startsWith('claw-joint-') || socketId.startsWith('claw-tip-')) {
    return 'melee-root';
  }
  return 'effect-origin';
};

const normalizeHeliosRigManifest = (): ModularBossRigManifest => {
  if (heliosAtlasSource.image.sha256 !== HELIOS_CLAWCARRIER_SHEET_SHA256) {
    throw new Error('Helios V2 atlas metadata does not match its fixed content hash.');
  }
  if (heliosRigSource.atlas.sha256 !== HELIOS_CLAWCARRIER_SHEET_SHA256) {
    throw new Error('Helios V2 rig does not reference the registered atlas.');
  }

  const designSize = Object.freeze({
    width: heliosRigSource.canvas.width,
    height: heliosRigSource.canvas.height
  });
  const frames = Object.freeze(Object.fromEntries(
    Object.entries(heliosAtlasSource.frames).map(([frameId, frame]) => [
      frameId,
      Object.freeze({
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height
      })
    ])
  ));
  const parts = Object.freeze(heliosRigSource.parts.map((part) => {
    const isRoot = part.parentId === null;
    return Object.freeze({
      id: part.id,
      role: getHeliosPartRole(part.id),
      parentId: part.parentId,
      frameId: part.frameId,
      transform: Object.freeze({
        x: isRoot ? part.transform.x - designSize.width / 2 : part.transform.x,
        y: isRoot ? part.transform.y - designSize.height / 2 : part.transform.y,
        rotation: part.transform.rotationDegrees * Math.PI / 180,
        scaleX: part.transform.scaleX,
        scaleY: part.transform.scaleY
      }),
      anchor: part.anchor
        ? Object.freeze({ x: part.anchor.x, y: part.anchor.y })
        : null,
      layer: part.layer,
      visible: part.neutralVisible
    });
  }));
  const animations = Object.freeze(heliosRigSource.animations.map((animation) => (
    Object.freeze({
      kind: FIXED_FRAME_ANIMATION_KIND,
      id: animation.id,
      partId: animation.partId,
      frameIds: Object.freeze([...animation.frameIds]),
      frameHold: Math.max(1, Math.round(60 / animation.fps)),
      loop: animation.loop
    })
  )));
  const sockets = Object.freeze(heliosRigSource.sockets.map((socket) => (
    Object.freeze({
      id: socket.id,
      role: getHeliosSocketRole(socket.id),
      partId: socket.partId,
      x: socket.x,
      y: socket.y,
      rotation: 0
    })
  )));

  return Object.freeze({
    kind: MODULAR_BOSS_RIG_KIND,
    id: heliosRigSource.bossId,
    designSize,
    atlas: Object.freeze({
      url: HELIOS_CLAWCARRIER_SHEET_URL,
      contentHash: HELIOS_CLAWCARRIER_SHEET_SHA256,
      width: heliosAtlasSource.image.width,
      height: heliosAtlasSource.image.height,
      frames
    }),
    parts,
    animations,
    sockets,
    destruction: Object.freeze({
      durationFrames: 90,
      fragments: Object.freeze([
        Object.freeze({
          partId: 'claw.port',
          delayFrames: 0,
          travelX: -150,
          travelY: 150,
          rotationRadians: -1.6
        }),
        Object.freeze({
          partId: 'claw.starboard',
          delayFrames: 0,
          travelX: 150,
          travelY: 150,
          rotationRadians: 1.6
        }),
        Object.freeze({
          partId: 'rotary.port',
          delayFrames: 8,
          travelX: -72,
          travelY: 190,
          rotationRadians: -2.4
        }),
        Object.freeze({
          partId: 'rotary.starboard',
          delayFrames: 8,
          travelX: 72,
          travelY: 190,
          rotationRadians: 2.4
        }),
        Object.freeze({
          partId: 'mandible.port',
          delayFrames: 12,
          travelX: -118,
          travelY: 220,
          rotationRadians: -2.8
        }),
        Object.freeze({
          partId: 'mandible.starboard',
          delayFrames: 12,
          travelX: 118,
          travelY: 220,
          rotationRadians: 2.8
        }),
        Object.freeze({
          partId: 'reactor',
          delayFrames: 18,
          travelX: 18,
          travelY: 180,
          rotationRadians: 1.8
        }),
        Object.freeze({
          partId: 'body',
          delayFrames: 22,
          travelX: 0,
          travelY: 210,
          rotationRadians: 0.45
        }),
        Object.freeze({
          partId: 'leg.outer-port',
          delayFrames: 26,
          travelX: -54,
          travelY: 250,
          rotationRadians: -1.4
        }),
        Object.freeze({
          partId: 'leg.outer-starboard',
          delayFrames: 26,
          travelX: 54,
          travelY: 250,
          rotationRadians: 1.4
        })
      ])
    })
  });
};

export const HELIOS_CLAWCARRIER_MODULAR_RIG = registerModularBossRig(
  normalizeHeliosRigManifest()
);

const sampleHeliosSandboxPose: PreviewBossModularPoseSampler = (input) => (
  sampleHeliosModularPose(input).partOverrides
);

const getFrontierCrownclawPartRole = (partId: string): ModularBossPartRole => {
  if (partId === 'root' || partId.endsWith('.mount')) return 'joint';
  if (partId === 'body') return 'body';
  if (partId.startsWith('shell.')) return 'armor';
  if (
    partId === 'crown'
    || partId === 'reactor'
    || partId.startsWith('rear-appendage.')
  ) {
    return 'phase-attachment';
  }
  if (partId.startsWith('claw.') || partId.startsWith('mandible.')) return 'arm';
  if (partId.startsWith('spool.') || partId.startsWith('bastion.')) return 'weapon';
  if (partId.startsWith('leg.')) return 'stabilizer';
  if (
    partId === 'beam'
    || partId === 'chain-contact'
    || partId === 'damage-vfx'
  ) {
    return 'effect';
  }
  return 'decorative';
};

const getFrontierCrownclawSocketRole = (
  socketId: string
): ModularBossSocketRole => {
  if (
    socketId.startsWith('claw-socket-')
    || socketId.startsWith('claw-tip-')
  ) {
    return 'melee-root';
  }
  if (socketId.startsWith('chain-spool-')) return 'effect-origin';
  if (socketId === 'crown-reactor') return 'beam-origin';
  if (
    socketId.startsWith('bastion-port-')
    || socketId.startsWith('rear-bastion-')
  ) {
    return 'projectile-muzzle';
  }
  return 'effect-origin';
};

const normalizeFrontierCrownclawRigManifest = (): ModularBossRigManifest => {
  if (
    frontierCrownclawAtlasSource.image.sha256
    !== FRONTIER_CROWNCLAW_SHEET_SHA256
  ) {
    throw new Error('Frontier Crownclaw atlas metadata does not match its fixed content hash.');
  }
  if (
    frontierCrownclawRigSource.atlas.sha256
    !== FRONTIER_CROWNCLAW_SHEET_SHA256
  ) {
    throw new Error('Frontier Crownclaw rig does not reference the registered atlas.');
  }

  const designSize = Object.freeze({
    width: frontierCrownclawRigSource.canvas.width,
    height: frontierCrownclawRigSource.canvas.height
  });
  const frames = Object.freeze(Object.fromEntries(
    Object.entries(frontierCrownclawAtlasSource.frames).map(([frameId, frame]) => [
      frameId,
      Object.freeze({
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height
      })
    ])
  ));
  const parts = Object.freeze(frontierCrownclawRigSource.parts.map((part) => {
    const isRoot = part.parentId === null;
    return Object.freeze({
      id: part.id,
      role: getFrontierCrownclawPartRole(part.id),
      parentId: part.parentId,
      frameId: part.frameId,
      transform: Object.freeze({
        x: isRoot ? part.transform.x - designSize.width / 2 : part.transform.x,
        y: isRoot ? part.transform.y - designSize.height / 2 : part.transform.y,
        rotation: part.transform.rotationDegrees * Math.PI / 180,
        scaleX: part.transform.scaleX,
        scaleY: part.transform.scaleY
      }),
      anchor: part.anchor
        ? Object.freeze({ x: part.anchor.x, y: part.anchor.y })
        : null,
      layer: part.layer,
      visible: part.neutralVisible
    });
  }));
  const animations = Object.freeze(frontierCrownclawRigSource.animations.map((animation) => (
    Object.freeze({
      kind: FIXED_FRAME_ANIMATION_KIND,
      id: animation.id,
      partId: animation.partId,
      frameIds: Object.freeze([...animation.frameIds]),
      frameHold: Math.max(1, Math.round(60 / animation.fps)),
      loop: animation.loop
    })
  )));
  const sockets = Object.freeze(frontierCrownclawRigSource.sockets.map((socket) => (
    Object.freeze({
      id: socket.id,
      role: getFrontierCrownclawSocketRole(socket.id),
      partId: socket.partId,
      x: socket.x,
      y: socket.y,
      rotation: 0
    })
  )));

  return Object.freeze({
    kind: MODULAR_BOSS_RIG_KIND,
    id: frontierCrownclawRigSource.bossId,
    designSize,
    atlas: Object.freeze({
      url: FRONTIER_CROWNCLAW_SHEET_URL,
      contentHash: FRONTIER_CROWNCLAW_SHEET_SHA256,
      width: frontierCrownclawAtlasSource.image.width,
      height: frontierCrownclawAtlasSource.image.height,
      frames
    }),
    parts,
    animations,
    sockets,
    destruction: Object.freeze({
      durationFrames: 112,
      fragments: Object.freeze([
        Object.freeze({
          partId: 'claw.port.palm',
          delayFrames: 0,
          travelX: -148,
          travelY: 174,
          rotationRadians: -2.2
        }),
        Object.freeze({
          partId: 'claw.starboard.palm',
          delayFrames: 0,
          travelX: 148,
          travelY: 174,
          rotationRadians: 2.2
        }),
        Object.freeze({
          partId: 'rear-appendage.port',
          delayFrames: 10,
          travelX: -112,
          travelY: 142,
          rotationRadians: -2.6
        }),
        Object.freeze({
          partId: 'rear-appendage.starboard',
          delayFrames: 10,
          travelX: 112,
          travelY: 142,
          rotationRadians: 2.6
        }),
        Object.freeze({
          partId: 'reactor',
          delayFrames: 22,
          travelX: 12,
          travelY: 132,
          rotationRadians: 1.7
        }),
        Object.freeze({
          partId: 'mandible.port',
          delayFrames: 26,
          travelX: -74,
          travelY: 202,
          rotationRadians: -2.9
        }),
        Object.freeze({
          partId: 'mandible.starboard',
          delayFrames: 26,
          travelX: 74,
          travelY: 202,
          rotationRadians: 2.9
        }),
        Object.freeze({
          partId: 'body',
          delayFrames: 38,
          travelX: 0,
          travelY: 220,
          rotationRadians: 0.38
        })
      ])
    })
  });
};

export const FRONTIER_CROWNCLAW_MODULAR_RIG = registerModularBossRig(
  normalizeFrontierCrownclawRigManifest()
);

const frontierCrownclawRigIssues = validateFrontierCrownclawRigCompatibility(
  FRONTIER_CROWNCLAW_MODULAR_RIG
);
if (frontierCrownclawRigIssues.length > 0) {
  throw new Error(
    `Frontier Crownclaw modular rig is incompatible: ${frontierCrownclawRigIssues
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join('; ')}`
  );
}

const getPrismMothPartRole = (partId: string): ModularBossPartRole => {
  if (partId === 'root' || partId.startsWith('shoulder.')) return 'joint';
  if (partId === 'body' || partId === 'abdomen') return 'body';
  if (partId === 'core') return 'phase-attachment';
  if (partId === 'crest' || partId.startsWith('wing.')) return 'armor';
  if (partId.startsWith('brood-pod.')) return 'pod';
  return 'decorative';
};

const getPrismMothSocketRole = (socketId: string): ModularBossSocketRole => {
  if (socketId.startsWith('wing-')) return 'projectile-muzzle';
  if (socketId.startsWith('brood-release-')) return 'detachable-pod';
  if (socketId === 'prism-core') return 'core-origin';
  return 'effect-origin';
};

const normalizePrismMothRigManifest = (): ModularBossRigManifest => {
  if (prismMothAtlasSource.image.sha256 !== PRISM_MOTH_BROODKEEPER_SHEET_SHA256) {
    throw new Error('Prism Moth atlas metadata does not match its fixed content hash.');
  }
  if (prismMothRigSource.atlas.sha256 !== PRISM_MOTH_BROODKEEPER_SHEET_SHA256) {
    throw new Error('Prism Moth rig does not reference the registered atlas.');
  }

  const designSize = Object.freeze({
    width: prismMothRigSource.canvas.width,
    height: prismMothRigSource.canvas.height
  });
  const frames = Object.freeze(Object.fromEntries(
    Object.entries(prismMothAtlasSource.frames).map(([frameId, frame]) => [
      frameId,
      Object.freeze({
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height
      })
    ])
  ));
  const parts = Object.freeze(prismMothRigSource.parts.map((part) => {
    const isRoot = part.parentId === null;
    return Object.freeze({
      id: part.id,
      role: getPrismMothPartRole(part.id),
      parentId: part.parentId,
      frameId: part.frameId,
      transform: Object.freeze({
        x: isRoot ? part.transform.x - designSize.width / 2 : part.transform.x,
        y: isRoot ? part.transform.y - designSize.height / 2 : part.transform.y,
        rotation: part.transform.rotationDegrees * Math.PI / 180,
        scaleX: part.transform.scaleX,
        scaleY: part.transform.scaleY
      }),
      anchor: part.anchor
        ? Object.freeze({ x: part.anchor.x, y: part.anchor.y })
        : null,
      layer: part.layer,
      visible: part.neutralVisible
    });
  }));
  const sockets = Object.freeze(prismMothRigSource.sockets.map((socket) => (
    Object.freeze({
      id: socket.id,
      role: getPrismMothSocketRole(socket.id),
      partId: socket.partId,
      x: socket.x,
      y: socket.y,
      rotation: socket.rotationDegrees * Math.PI / 180
    })
  )));
  const featherFrames = Object.freeze(Object.fromEntries(
    Array.from({ length: 4 }, (_, index) => [
      `prism-feather.${index}`,
      Object.freeze({
        x: index * 128,
        y: 0,
        width: 128,
        height: 128
      })
    ])
  ));

  return Object.freeze({
    kind: MODULAR_BOSS_RIG_KIND,
    id: prismMothRigSource.bossId,
    designSize,
    atlas: Object.freeze({
      url: PRISM_MOTH_BROODKEEPER_SHEET_URL,
      contentHash: PRISM_MOTH_BROODKEEPER_SHEET_SHA256,
      width: prismMothAtlasSource.image.width,
      height: prismMothAtlasSource.image.height,
      frames
    }),
    supplementalAtlases: Object.freeze([
      Object.freeze({
        url: PRISM_MOTH_FEATHER_SHEET_URL,
        contentHash: PRISM_MOTH_FEATHER_SHEET_SHA256,
        width: 512,
        height: 128,
        frames: featherFrames
      })
    ]),
    parts,
    animations: Object.freeze([]),
    sockets,
    destruction: Object.freeze({
      durationFrames: 104,
      fragments: Object.freeze([
        Object.freeze({
          partId: 'wing.left.lower-outer',
          delayFrames: 0,
          travelX: -128,
          travelY: 152,
          rotationRadians: -1.8
        }),
        Object.freeze({
          partId: 'wing.right.lower-outer',
          delayFrames: 0,
          travelX: 128,
          travelY: 152,
          rotationRadians: 1.8
        }),
        Object.freeze({
          partId: 'wing.left.upper',
          delayFrames: 8,
          travelX: -170,
          travelY: 118,
          rotationRadians: -2.2
        }),
        Object.freeze({
          partId: 'wing.right.upper',
          delayFrames: 8,
          travelX: 170,
          travelY: 118,
          rotationRadians: 2.2
        }),
        Object.freeze({
          partId: 'wing.left.mid',
          delayFrames: 14,
          travelX: -106,
          travelY: 184,
          rotationRadians: -1.45
        }),
        Object.freeze({
          partId: 'wing.right.mid',
          delayFrames: 14,
          travelX: 106,
          travelY: 184,
          rotationRadians: 1.45
        }),
        Object.freeze({
          partId: 'brood-pod.left',
          delayFrames: 20,
          travelX: -76,
          travelY: 222,
          rotationRadians: -2.7
        }),
        Object.freeze({
          partId: 'brood-pod.right',
          delayFrames: 20,
          travelX: 76,
          travelY: 222,
          rotationRadians: 2.7
        }),
        Object.freeze({
          partId: 'crest',
          delayFrames: 28,
          travelX: -24,
          travelY: 176,
          rotationRadians: -0.9
        }),
        Object.freeze({
          partId: 'core',
          delayFrames: 40,
          travelX: 8,
          travelY: 126,
          rotationRadians: 1.4
        }),
        Object.freeze({
          partId: 'body',
          delayFrames: 48,
          travelX: 0,
          travelY: 228,
          rotationRadians: -0.42
        })
      ])
    })
  });
};

export const PRISM_MOTH_BROODKEEPER_MODULAR_RIG = registerModularBossRig(
  normalizePrismMothRigManifest()
);

const prismMothRigIssues = validatePrismMothRigCompatibility(
  PRISM_MOTH_BROODKEEPER_MODULAR_RIG
);
if (prismMothRigIssues.length > 0) {
  throw new Error(
    `Prism Moth modular rig is incompatible: ${prismMothRigIssues
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join('; ')}`
  );
}

const MERIDIAN_HARROWER_ATLAS_FRAMES = Object.freeze({
  coreBody: Object.freeze({ x: 552, y: 93, width: 202, height: 223 }),
  coreClosed: Object.freeze({ x: 476, y: 555, width: 128, height: 130 }),
  coreOpen: Object.freeze({ x: 664, y: 547, width: 146, height: 145 }),
  leftOuter: Object.freeze({ x: 838, y: 70, width: 122, height: 111 }),
  rightOuter: Object.freeze({ x: 1036, y: 71, width: 123, height: 109 }),
  leftMidA: Object.freeze({ x: 877, y: 183, width: 83, height: 92 }),
  rightMidA: Object.freeze({ x: 1034, y: 183, width: 83, height: 92 }),
  leftMidB: Object.freeze({ x: 886, y: 279, width: 69, height: 105 }),
  rightMidB: Object.freeze({ x: 1037, y: 279, width: 70, height: 105 }),
  leftBase: Object.freeze({ x: 849, y: 385, width: 97, height: 220 }),
  rightBase: Object.freeze({ x: 1046, y: 385, width: 96, height: 220 }),
  leftPod: Object.freeze({ x: 543, y: 376, width: 59, height: 89 }),
  rightPod: Object.freeze({ x: 699, y: 378, width: 57, height: 87 }),
  ring: Object.freeze({ x: 904, y: 696, width: 234, height: 236 }),
  tailA: Object.freeze({ x: 239, y: 745, width: 61, height: 146 }),
  tailB: Object.freeze({ x: 370, y: 745, width: 61, height: 147 }),
  tailC: Object.freeze({ x: 493, y: 767, width: 61, height: 146 })
}) satisfies Readonly<Record<SegmentedCrescentPartId, Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>>>;

const AURORA_STORM_ENGINE_ATLAS_FRAMES = Object.freeze({
  chassisClosed: Object.freeze({ x: 667, y: 120, width: 254, height: 262 }),
  chassisOpen: Object.freeze({ x: 971, y: 122, width: 255, height: 264 }),
  perimeterRing: Object.freeze({ x: 53, y: 904, width: 329, height: 314 }),
  rotorHub: Object.freeze({ x: 409, y: 925, width: 313, height: 301 }),
  arm0: Object.freeze({ x: 528, y: 464, width: 87, height: 129 }),
  arm1: Object.freeze({ x: 528, y: 464, width: 87, height: 129 }),
  arm2: Object.freeze({ x: 528, y: 464, width: 87, height: 129 }),
  arm3: Object.freeze({ x: 528, y: 464, width: 87, height: 129 }),
  arm4: Object.freeze({ x: 528, y: 464, width: 87, height: 129 }),
  arm5: Object.freeze({ x: 528, y: 464, width: 87, height: 129 }),
  arm6: Object.freeze({ x: 528, y: 464, width: 87, height: 129 }),
  arm7: Object.freeze({ x: 528, y: 464, width: 87, height: 129 }),
  muzzle0: Object.freeze({ x: 398, y: 842, width: 68, height: 72 }),
  muzzle1: Object.freeze({ x: 491, y: 842, width: 69, height: 72 }),
  muzzle2: Object.freeze({ x: 398, y: 842, width: 68, height: 72 }),
  muzzle3: Object.freeze({ x: 491, y: 842, width: 69, height: 72 }),
  muzzle4: Object.freeze({ x: 398, y: 842, width: 68, height: 72 }),
  muzzle5: Object.freeze({ x: 491, y: 842, width: 69, height: 72 }),
  muzzle6: Object.freeze({ x: 398, y: 842, width: 68, height: 72 }),
  muzzle7: Object.freeze({ x: 491, y: 842, width: 69, height: 72 }),
  relayNorthWest: Object.freeze({ x: 398, y: 842, width: 68, height: 72 }),
  relayNorthEast: Object.freeze({ x: 491, y: 842, width: 69, height: 72 }),
  relaySouthEast: Object.freeze({ x: 585, y: 842, width: 69, height: 72 }),
  relaySouthWest: Object.freeze({ x: 677, y: 843, width: 68, height: 71 }),
  portal0: Object.freeze({ x: 877, y: 839, width: 87, height: 110 }),
  portal1: Object.freeze({ x: 877, y: 839, width: 87, height: 110 }),
  portal2: Object.freeze({ x: 877, y: 839, width: 87, height: 110 }),
  portal3: Object.freeze({ x: 877, y: 839, width: 87, height: 110 }),
  pulseSmall: Object.freeze({ x: 741, y: 1047, width: 122, height: 119 }),
  pulseMedium: Object.freeze({ x: 899, y: 1045, width: 141, height: 122 }),
  pulseLarge: Object.freeze({ x: 1069, y: 1024, width: 169, height: 157 }),
  eyeCometLeft: Object.freeze({ x: 398, y: 842, width: 68, height: 72 }),
  eyeCometRight: Object.freeze({ x: 585, y: 842, width: 69, height: 72 })
}) satisfies Readonly<Record<RotatingEmitterCorePartId, Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>>>;

const NULLWAKE_REVENANT_ATLAS_FRAMES = Object.freeze({
  coreClosed: Object.freeze({ x: 456, y: 38, width: 166, height: 275 }),
  coreOpen: Object.freeze({ x: 669, y: 73, width: 143, height: 227 }),
  leftWing: Object.freeze({ x: 847, y: 21, width: 127, height: 317 }),
  rightWing: Object.freeze({ x: 1074, y: 20, width: 127, height: 318 }),
  leftEmitter: Object.freeze({ x: 14, y: 372, width: 143, height: 158 }),
  rightEmitter: Object.freeze({ x: 237, y: 372, width: 144, height: 158 }),
  finTop: Object.freeze({ x: 422, y: 322, width: 169, height: 249 }),
  finRight: Object.freeze({ x: 623, y: 366, width: 127, height: 173 }),
  finBottom: Object.freeze({ x: 859, y: 366, width: 126, height: 172 }),
  finLeft: Object.freeze({ x: 1059, y: 357, width: 153, height: 200 }),
  nodeA: Object.freeze({ x: 62, y: 597, width: 139, height: 155 }),
  nodeB: Object.freeze({ x: 383, y: 597, width: 142, height: 155 }),
  nodeC: Object.freeze({ x: 703, y: 597, width: 141, height: 154 }),
  nodeD: Object.freeze({ x: 1018, y: 601, width: 133, height: 143 }),
  haloSmall: Object.freeze({ x: 65, y: 835, width: 102, height: 103 }),
  haloMedium: Object.freeze({ x: 272, y: 810, width: 154, height: 154 }),
  haloLarge: Object.freeze({ x: 493, y: 796, width: 181, height: 179 }),
  haloXL: Object.freeze({ x: 716, y: 777, width: 215, height: 214 }),
  perimeterRing: Object.freeze({ x: 974, y: 762, width: 245, height: 245 }),
  laserHub: Object.freeze({ x: 27, y: 1009, width: 202, height: 203 }),
  pulseSmall: Object.freeze({ x: 327, y: 1052, width: 133, height: 133 }),
  pulseMedium: Object.freeze({ x: 594, y: 1034, width: 168, height: 168 }),
  pulseLarge: Object.freeze({ x: 889, y: 1015, width: 205, height: 202 })
}) satisfies Readonly<Record<TransformingOrbiterPartId, Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>>>;

/**
 * Generated V3 32-color animation cells. Body sequences deliberately use equal padded
 * regions so changing frames never moves the body's registered center pivot.
 * Muzzle cells keep a stable transparent leading edge so their emitter origin
 * remains fixed while the plume grows.
 */
const NULLWAKE_REVENANT_FACTORY_ATLAS_V3_FRAMES = Object.freeze({
  'body.core.0': Object.freeze({ x: 39, y: 431, width: 162, height: 258 }),
  'body.core.1': Object.freeze({ x: 213, y: 431, width: 162, height: 258 }),
  'body.core.2': Object.freeze({ x: 389, y: 431, width: 162, height: 258 }),
  'body.core.3': Object.freeze({ x: 555, y: 431, width: 162, height: 258 }),
  'effect.core-muzzle.0': Object.freeze({ x: 857, y: 511, width: 90, height: 64 }),
  'effect.core-muzzle.1': Object.freeze({ x: 1012, y: 495, width: 157, height: 92 }),
  'effect.core-muzzle.2': Object.freeze({ x: 1226, y: 482, width: 232, height: 120 }),
  'body.damage.0': Object.freeze({ x: 68, y: 691, width: 162, height: 258 }),
  'body.damage.1': Object.freeze({ x: 260, y: 691, width: 162, height: 258 }),
  'body.damage.2': Object.freeze({ x: 462, y: 691, width: 162, height: 258 }),
  'destruction.fragment.0': Object.freeze({ x: 741, y: 765, width: 75, height: 95 }),
  'destruction.fragment.1': Object.freeze({ x: 877, y: 761, width: 105, height: 121 }),
  'destruction.fragment.2': Object.freeze({ x: 1041, y: 778, width: 91, height: 89 }),
  'destruction.fragment.3': Object.freeze({ x: 1215, y: 767, width: 107, height: 105 }),
  'destruction.fragment.4': Object.freeze({ x: 1392, y: 757, width: 74, height: 129 })
});

/**
 * Nullwake's assembled PNG is reused as a deliberately overlapping five-frame
 * atlas. In the neutral pose the four arm crops plus the center hull reproduce
 * the original RGBA pixels exactly; animation then rotates those exact limbs
 * around anatomy-owned pivots without redesigning the boss.
 */
const NULLWAKE_REVENANT_MODULAR_RIG_MANIFEST = Object.freeze({
  kind: MODULAR_BOSS_RIG_KIND,
  id: 'nullwake-revenant-articulated',
  designSize: Object.freeze({ width: 370, height: 311 }),
  atlas: Object.freeze({
    url: NULLWAKE_REVENANT_ART_URL,
    contentHash: NULLWAKE_REVENANT_ART_SHA256,
    width: 370,
    height: 311,
    frames: Object.freeze({
      'body.shell': Object.freeze({ x: 104, y: 30, width: 162, height: 258 }),
      'arm.upper-port': Object.freeze({ x: 14, y: 14, width: 138, height: 136 }),
      'arm.upper-starboard': Object.freeze({ x: 219, y: 14, width: 138, height: 136 }),
      'arm.lower-port': Object.freeze({ x: 14, y: 146, width: 140, height: 152 }),
      'arm.lower-starboard': Object.freeze({ x: 217, y: 146, width: 140, height: 152 })
    })
  }),
  supplementalAtlases: Object.freeze([
    Object.freeze({
      url: NULLWAKE_REVENANT_FACTORY_ATLAS_V3_URL,
      contentHash: NULLWAKE_REVENANT_FACTORY_ATLAS_V3_SHA256,
      width: 1536,
      height: 1024,
      frames: NULLWAKE_REVENANT_FACTORY_ATLAS_V3_FRAMES
    })
  ]),
  parts: Object.freeze([
    Object.freeze({
      id: 'root', role: 'joint', parentId: null, frameId: null,
      transform: Object.freeze({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }),
      anchor: null, layer: 0, visible: false
    }),
    Object.freeze({
      id: 'arm.upper-port.mount', role: 'joint', parentId: 'root', frameId: null,
      transform: Object.freeze({ x: -48, y: -50.5, rotation: 0, scaleX: 1, scaleY: 1 }),
      anchor: null, layer: 4, visible: false
    }),
    Object.freeze({
      id: 'arm.upper-port', role: 'arm', parentId: 'arm.upper-port.mount', frameId: 'arm.upper-port',
      transform: Object.freeze({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }),
      anchor: Object.freeze({ x: 123 / 138, y: 91 / 136 }), layer: 5, visible: true
    }),
    Object.freeze({
      id: 'arm.upper-starboard.mount', role: 'joint', parentId: 'root', frameId: null,
      transform: Object.freeze({ x: 48, y: -50.5, rotation: 0, scaleX: 1, scaleY: 1 }),
      anchor: null, layer: 4, visible: false
    }),
    Object.freeze({
      id: 'arm.upper-starboard', role: 'arm', parentId: 'arm.upper-starboard.mount', frameId: 'arm.upper-starboard',
      transform: Object.freeze({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }),
      anchor: Object.freeze({ x: 14 / 138, y: 91 / 136 }), layer: 5, visible: true
    }),
    Object.freeze({
      id: 'arm.lower-port.mount', role: 'joint', parentId: 'root', frameId: null,
      transform: Object.freeze({ x: -51, y: 31.5, rotation: 0, scaleX: 1, scaleY: 1 }),
      anchor: null, layer: 6, visible: false
    }),
    Object.freeze({
      id: 'arm.lower-port', role: 'arm', parentId: 'arm.lower-port.mount', frameId: 'arm.lower-port',
      transform: Object.freeze({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }),
      anchor: Object.freeze({ x: 120 / 140, y: 41 / 152 }), layer: 7, visible: true
    }),
    Object.freeze({
      id: 'arm.lower-starboard.mount', role: 'joint', parentId: 'root', frameId: null,
      transform: Object.freeze({ x: 51, y: 31.5, rotation: 0, scaleX: 1, scaleY: 1 }),
      anchor: null, layer: 6, visible: false
    }),
    Object.freeze({
      id: 'arm.lower-starboard', role: 'arm', parentId: 'arm.lower-starboard.mount', frameId: 'arm.lower-starboard',
      transform: Object.freeze({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }),
      anchor: Object.freeze({ x: 19 / 140, y: 41 / 152 }), layer: 7, visible: true
    }),
    Object.freeze({
      id: 'body', role: 'body', parentId: 'root', frameId: 'body.shell',
      transform: Object.freeze({ x: 0, y: 3.5, rotation: 0, scaleX: 1, scaleY: 1 }),
      anchor: Object.freeze({ x: 0.5, y: 0.5 }), layer: 20, visible: true
    }),
    Object.freeze({
      id: 'effect.core-muzzle', role: 'effect', parentId: 'body', frameId: 'effect.core-muzzle.0',
      transform: Object.freeze({ x: 0, y: 8.94, rotation: Math.PI / 2, scaleX: 0.42, scaleY: 0.42 }),
      anchor: Object.freeze({ x: 0, y: 0.5 }), layer: 30, visible: false
    }),
    Object.freeze({
      id: 'destruction.fragment.0', role: 'effect', parentId: 'root', frameId: 'destruction.fragment.0',
      transform: Object.freeze({ x: -66, y: -62, rotation: 0, scaleX: 1, scaleY: 1 }),
      anchor: Object.freeze({ x: 0.5, y: 0.5 }), layer: 40, visible: false
    }),
    Object.freeze({
      id: 'destruction.fragment.1', role: 'effect', parentId: 'root', frameId: 'destruction.fragment.1',
      transform: Object.freeze({ x: -38, y: 12, rotation: 0, scaleX: 1, scaleY: 1 }),
      anchor: Object.freeze({ x: 0.5, y: 0.5 }), layer: 41, visible: false
    }),
    Object.freeze({
      id: 'destruction.fragment.2', role: 'effect', parentId: 'root', frameId: 'destruction.fragment.2',
      transform: Object.freeze({ x: 64, y: -54, rotation: 0, scaleX: 1, scaleY: 1 }),
      anchor: Object.freeze({ x: 0.5, y: 0.5 }), layer: 42, visible: false
    }),
    Object.freeze({
      id: 'destruction.fragment.3', role: 'effect', parentId: 'root', frameId: 'destruction.fragment.3',
      transform: Object.freeze({ x: -58, y: 68, rotation: 0, scaleX: 1, scaleY: 1 }),
      anchor: Object.freeze({ x: 0.5, y: 0.5 }), layer: 43, visible: false
    }),
    Object.freeze({
      id: 'destruction.fragment.4', role: 'effect', parentId: 'root', frameId: 'destruction.fragment.4',
      transform: Object.freeze({ x: 67, y: 66, rotation: 0, scaleX: 1, scaleY: 1 }),
      anchor: Object.freeze({ x: 0.5, y: 0.5 }), layer: 44, visible: false
    })
  ]),
  animations: Object.freeze([
    Object.freeze({
      kind: FIXED_FRAME_ANIMATION_KIND,
      id: 'body-core-charge',
      partId: 'body',
      frameIds: Object.freeze(['body.core.0', 'body.core.1', 'body.core.2', 'body.core.3']),
      frameHold: 4,
      loop: false
    }),
    Object.freeze({
      kind: FIXED_FRAME_ANIMATION_KIND,
      id: 'body-damage-cycle',
      partId: 'body',
      frameIds: Object.freeze(['body.damage.0', 'body.damage.1', 'body.damage.2']),
      frameHold: 8,
      loop: false
    }),
    Object.freeze({
      kind: FIXED_FRAME_ANIMATION_KIND,
      id: 'core-muzzle-cycle',
      partId: 'effect.core-muzzle',
      frameIds: Object.freeze([
        'effect.core-muzzle.0',
        'effect.core-muzzle.1',
        'effect.core-muzzle.2'
      ]),
      frameHold: 3,
      loop: false
    })
  ]),
  sockets: Object.freeze([
    Object.freeze({
      id: 'muzzle-upper-port', role: 'projectile-muzzle', partId: 'arm.upper-port',
      x: -74.1, y: -5.5, rotation: 0
    }),
    Object.freeze({
      id: 'muzzle-lower-port', role: 'projectile-muzzle', partId: 'arm.lower-port',
      x: -74.8, y: 49.4, rotation: 0
    }),
    Object.freeze({
      id: 'muzzle-upper-starboard', role: 'projectile-muzzle', partId: 'arm.upper-starboard',
      x: 74.1, y: -5.5, rotation: 0
    }),
    Object.freeze({
      id: 'muzzle-lower-starboard', role: 'projectile-muzzle', partId: 'arm.lower-starboard',
      x: 74.8, y: 49.4, rotation: 0
    }),
    Object.freeze({
      id: 'revenant-core', role: 'core-origin', partId: 'body',
      x: 0, y: 8.94, rotation: 0
    })
  ]),
  destruction: Object.freeze({
    durationFrames: 72,
    fragments: Object.freeze([
      Object.freeze({
        partId: 'destruction.fragment.0', delayFrames: 0,
        travelX: -168, travelY: -118, rotationRadians: -2.7
      }),
      Object.freeze({
        partId: 'destruction.fragment.1', delayFrames: 4,
        travelX: -116, travelY: 154, rotationRadians: -3.4
      }),
      Object.freeze({
        partId: 'destruction.fragment.2', delayFrames: 2,
        travelX: 162, travelY: -124, rotationRadians: 2.9
      }),
      Object.freeze({
        partId: 'destruction.fragment.3', delayFrames: 6,
        travelX: -152, travelY: 142, rotationRadians: -2.3
      }),
      Object.freeze({
        partId: 'destruction.fragment.4', delayFrames: 8,
        travelX: 176, travelY: 158, rotationRadians: 3.2
      })
    ])
  })
}) satisfies ModularBossRigManifest;

export const NULLWAKE_REVENANT_MODULAR_RIG = registerModularBossRig(
  NULLWAKE_REVENANT_MODULAR_RIG_MANIFEST
);

const sampleNullwakeSandboxPose: PreviewBossModularPoseSampler = (input) => (
  sampleNullwakeModularPose(input).partOverrides
);

const CINDERJAW_SIEGE_BEETLE_ATLAS_FRAMES = Object.freeze({
  bodyClosed: Object.freeze({ x: 394, y: 43, width: 203, height: 256 }),
  bodyOpen: Object.freeze({ x: 637, y: 43, width: 204, height: 256 }),
  leftClaw: Object.freeze({ x: 860, y: 89, width: 174, height: 177 }),
  rightClaw: Object.freeze({ x: 1066, y: 89, width: 173, height: 178 }),
  leftMandible: Object.freeze({ x: 53, y: 341, width: 109, height: 177 }),
  rightMandible: Object.freeze({ x: 204, y: 341, width: 108, height: 178 }),
  legOuterLeft: Object.freeze({ x: 395, y: 309, width: 183, height: 227 }),
  legInnerLeft: Object.freeze({ x: 650, y: 323, width: 163, height: 208 }),
  legInnerRight: Object.freeze({ x: 872, y: 349, width: 137, height: 182 }),
  legOuterRight: Object.freeze({ x: 1061, y: 349, width: 138, height: 182 }),
  gatlingLeft: Object.freeze({ x: 334, y: 593, width: 171, height: 130 }),
  gatlingRight: Object.freeze({ x: 595, y: 593, width: 171, height: 130 }),
  mineLeft: Object.freeze({ x: 859, y: 566, width: 155, height: 180 }),
  mineRight: Object.freeze({ x: 1053, y: 573, width: 145, height: 171 }),
  shieldLeft: Object.freeze({ x: 50, y: 772, width: 156, height: 202 }),
  shieldRight: Object.freeze({ x: 287, y: 772, width: 157, height: 202 }),
  shockBlade: Object.freeze({ x: 566, y: 745, width: 134, height: 270 }),
  flameSmall: Object.freeze({ x: 804, y: 840, width: 77, height: 112 }),
  flameMedium: Object.freeze({ x: 997, y: 781, width: 116, height: 192 }),
  flameLarge: Object.freeze({ x: 68, y: 979, width: 155, height: 249 })
}) satisfies Readonly<Record<ArticulatedPincerPartId, Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>>>;

const VESPERGLASS_MOTHMOTHER_ATLAS_FRAMES = Object.freeze({
  coreBody: Object.freeze({ x: 458, y: 50, width: 196, height: 269 }),
  coreClosed: Object.freeze({ x: 738, y: 50, width: 196, height: 269 }),
  coreOpen: Object.freeze({ x: 1019, y: 52, width: 197, height: 268 }),
  leftOuter: Object.freeze({ x: 1276, y: 31, width: 151, height: 288 }),
  rightOuter: Object.freeze({ x: 88, y: 325, width: 128, height: 230 }),
  leftMidA: Object.freeze({ x: 324, y: 356, width: 229, height: 179 }),
  rightMidA: Object.freeze({ x: 649, y: 352, width: 206, height: 183 }),
  leftMidB: Object.freeze({ x: 936, y: 359, width: 208, height: 176 }),
  rightMidB: Object.freeze({ x: 1257, y: 362, width: 192, height: 173 }),
  leftBase: Object.freeze({ x: 44, y: 571, width: 201, height: 173 }),
  rightBase: Object.freeze({ x: 365, y: 568, width: 193, height: 176 }),
  leftPod: Object.freeze({ x: 649, y: 580, width: 168, height: 144 }),
  rightPod: Object.freeze({ x: 960, y: 580, width: 166, height: 144 }),
  ring: Object.freeze({ x: 1230, y: 550, width: 207, height: 204 }),
  tailA: Object.freeze({ x: 117, y: 758, width: 83, height: 235 }),
  tailB: Object.freeze({ x: 369, y: 754, width: 111, height: 235 }),
  tailC: Object.freeze({ x: 627, y: 755, width: 112, height: 235 })
}) satisfies Readonly<Record<SegmentedCrescentPartId, Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>>>;

const TWIN_HALO_WARDENS_ATLAS_FRAMES = Object.freeze({
  coreClosed: Object.freeze({ x: 378, y: 99, width: 132, height: 146 }),
  coreOpen: Object.freeze({ x: 589, y: 99, width: 146, height: 146 }),
  leftWing: Object.freeze({ x: 800, y: 42, width: 173, height: 248 }),
  rightWing: Object.freeze({ x: 1034, y: 42, width: 173, height: 248 }),
  leftEmitter: Object.freeze({ x: 67, y: 361, width: 122, height: 123 }),
  rightEmitter: Object.freeze({ x: 315, y: 361, width: 123, height: 123 }),
  finTop: Object.freeze({ x: 571, y: 320, width: 117, height: 177 }),
  finRight: Object.freeze({ x: 802, y: 370, width: 145, height: 114 }),
  finBottom: Object.freeze({ x: 1040, y: 356, width: 120, height: 171 }),
  finLeft: Object.freeze({ x: 53, y: 586, width: 146, height: 116 }),
  nodeA: Object.freeze({ x: 308, y: 571, width: 149, height: 151 }),
  nodeB: Object.freeze({ x: 559, y: 570, width: 149, height: 152 }),
  nodeC: Object.freeze({ x: 797, y: 571, width: 150, height: 151 }),
  nodeD: Object.freeze({ x: 1027, y: 571, width: 150, height: 151 }),
  haloSmall: Object.freeze({ x: 75, y: 803, width: 109, height: 109 }),
  haloMedium: Object.freeze({ x: 287, y: 781, width: 156, height: 156 }),
  haloLarge: Object.freeze({ x: 518, y: 770, width: 180, height: 182 }),
  haloXL: Object.freeze({ x: 753, y: 744, width: 234, height: 238 }),
  perimeterRing: Object.freeze({ x: 1015, y: 763, width: 196, height: 199 }),
  laserHub: Object.freeze({ x: 72, y: 1035, width: 121, height: 129 }),
  pulseSmall: Object.freeze({ x: 334, y: 1071, width: 60, height: 58 }),
  pulseMedium: Object.freeze({ x: 539, y: 1030, width: 137, height: 136 }),
  pulseLarge: Object.freeze({ x: 770, y: 999, width: 191, height: 202 })
}) satisfies Readonly<Record<TransformingOrbiterPartId, Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>>>;

const RIFTCOIL_WYRM_ATLAS_FRAMES = Object.freeze({
  coreBody: Object.freeze({ x: 374, y: 76, width: 175, height: 276 }),
  coreClosed: Object.freeze({ x: 626, y: 127, width: 152, height: 210 }),
  coreOpen: Object.freeze({ x: 836, y: 127, width: 152, height: 210 }),
  leftOuter: Object.freeze({ x: 1026, y: 59, width: 135, height: 274 }),
  rightOuter: Object.freeze({ x: 35, y: 420, width: 128, height: 254 }),
  leftMidA: Object.freeze({ x: 256, y: 452, width: 135, height: 211 }),
  rightMidA: Object.freeze({ x: 500, y: 452, width: 134, height: 211 }),
  leftMidB: Object.freeze({ x: 724, y: 453, width: 135, height: 212 }),
  rightMidB: Object.freeze({ x: 965, y: 453, width: 135, height: 211 }),
  leftBase: Object.freeze({ x: 49, y: 738, width: 136, height: 164 }),
  rightBase: Object.freeze({ x: 240, y: 738, width: 137, height: 164 }),
  leftPod: Object.freeze({ x: 443, y: 749, width: 143, height: 154 }),
  rightPod: Object.freeze({ x: 656, y: 751, width: 143, height: 152 }),
  ring: Object.freeze({ x: 869, y: 706, width: 250, height: 244 }),
  tailA: Object.freeze({ x: 76, y: 956, width: 85, height: 261 }),
  tailB: Object.freeze({ x: 263, y: 977, width: 148, height: 244 }),
  tailC: Object.freeze({ x: 544, y: 977, width: 149, height: 244 })
}) satisfies Readonly<Record<SegmentedCrescentPartId, Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>>>;

const SANDBOX_BOSS_VFX_ATLAS_FRAMES = Object.freeze({
  pinkDrop0: Object.freeze({ x: 130, y: 110, width: 100, height: 198 }),
  pinkDrop1: Object.freeze({ x: 436, y: 56, width: 89, height: 252 }),
  pinkDrop2: Object.freeze({ x: 735, y: 51, width: 78, height: 257 }),
  pinkDrop3: Object.freeze({ x: 1039, y: 48, width: 72, height: 260 }),
  goldDrop0: Object.freeze({ x: 121, y: 403, width: 117, height: 198 }),
  goldDrop1: Object.freeze({ x: 424, y: 369, width: 114, height: 232 }),
  goldDrop2: Object.freeze({ x: 718, y: 352, width: 112, height: 250 }),
  goldDrop3: Object.freeze({ x: 1020, y: 340, width: 110, height: 262 }),
  prismDrop0: Object.freeze({ x: 135, y: 703, width: 92, height: 186 }),
  prismDrop1: Object.freeze({ x: 436, y: 667, width: 91, height: 273 }),
  prismDrop2: Object.freeze({ x: 729, y: 658, width: 91, height: 239 }),
  prismDrop3: Object.freeze({ x: 1033, y: 653, width: 89, height: 244 }),
  orbCharge: Object.freeze({ x: 99, y: 1021, width: 160, height: 159 }),
  orbMuzzle: Object.freeze({ x: 408, y: 940, width: 146, height: 244 }),
  beamLive: Object.freeze({ x: 743, y: 940, width: 64, height: 265 }),
  beamImpact: Object.freeze({ x: 977, y: 1013, width: 191, height: 184 })
}) satisfies Readonly<Record<PreviewBossVfxFrameId, Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>>>;

export interface SandboxBossArtworkAsset {
  readonly url: string;
  readonly contentHash: string;
  readonly width: number;
  readonly height: number;
}

export interface SandboxBossArtworkRegistration {
  readonly prototypeId: SandboxBossPrototypeId;
  readonly assembled: SandboxBossArtworkAsset;
  readonly sheet: SandboxBossArtworkAsset;
  readonly renderMode?: PreviewBossArtwork['renderMode'];
  readonly assembledMotionProfile?: PreviewBossArtwork['assembledMotionProfile'];
  readonly weaponSockets?: PreviewBossArtwork['weaponSockets'];
  readonly articulatedAtlas?: NonNullable<PreviewBossArtwork['articulatedAtlas']>;
  readonly modularRig?: NonNullable<PreviewBossArtwork['modularRig']>;
  readonly sampleModularPose?: NonNullable<PreviewBossArtwork['sampleModularPose']>;
  readonly modularReferenceComparison?: NonNullable<
    PreviewBossArtwork['modularReferenceComparison']
  >;
  readonly projectileAnimations?: NonNullable<PreviewBossArtwork['projectileAnimations']>;
  readonly encounterCamera?: NonNullable<PreviewBossArtwork['encounterCamera']>;
  readonly vfxAtlas?: PreviewBossVfxAtlas;
}

const MERIDIAN_HARROWER_ASSEMBLED_ASSET = Object.freeze({
  url: MERIDIAN_HARROWER_ART_URL,
  contentHash: MERIDIAN_HARROWER_ART_SHA256,
  width: 606,
  height: 606
}) satisfies SandboxBossArtworkAsset;

const MERIDIAN_HARROWER_SHEET_ASSET = Object.freeze({
  url: MERIDIAN_HARROWER_SHEET_URL,
  contentHash: MERIDIAN_HARROWER_SHEET_SHA256,
  width: 1254,
  height: 1254
}) satisfies SandboxBossArtworkAsset;

const HELIOS_CLAWCARRIER_ASSEMBLED_ASSET = Object.freeze({
  url: HELIOS_CLAWCARRIER_ART_URL,
  contentHash: HELIOS_CLAWCARRIER_ART_SHA256,
  width: 460,
  height: 330
}) satisfies SandboxBossArtworkAsset;

const HELIOS_CLAWCARRIER_SHEET_ASSET = Object.freeze({
  url: HELIOS_CLAWCARRIER_SHEET_URL,
  contentHash: HELIOS_CLAWCARRIER_SHEET_SHA256,
  width: 2048,
  height: 1024
}) satisfies SandboxBossArtworkAsset;

const HELIOS_CLAWCARRIER_REFERENCE_ASSET = Object.freeze({
  url: HELIOS_CLAWCARRIER_REFERENCE_URL,
  contentHash: HELIOS_CLAWCARRIER_REFERENCE_SHA256,
  width: 394,
  height: 271
}) satisfies SandboxBossArtworkAsset;

const FRONTIER_CROWNCLAW_ASSEMBLED_ASSET = Object.freeze({
  url: FRONTIER_CROWNCLAW_ART_URL,
  contentHash: FRONTIER_CROWNCLAW_ART_SHA256,
  width: 260,
  height: 210
}) satisfies SandboxBossArtworkAsset;

const FRONTIER_CROWNCLAW_SHEET_ASSET = Object.freeze({
  url: FRONTIER_CROWNCLAW_SHEET_URL,
  contentHash: FRONTIER_CROWNCLAW_SHEET_SHA256,
  width: 2048,
  height: 256
}) satisfies SandboxBossArtworkAsset;

const FRONTIER_CROWNCLAW_REFERENCE_ASSET = Object.freeze({
  url: FRONTIER_CROWNCLAW_REFERENCE_URL,
  contentHash: FRONTIER_CROWNCLAW_REFERENCE_SHA256,
  width: 640,
  height: 512
}) satisfies SandboxBossArtworkAsset;

const PRISM_MOTH_BROODKEEPER_ASSEMBLED_ASSET = Object.freeze({
  url: PRISM_MOTH_BROODKEEPER_ART_URL,
  contentHash: PRISM_MOTH_BROODKEEPER_ART_SHA256,
  width: 512,
  height: 512
}) satisfies SandboxBossArtworkAsset;

const PRISM_MOTH_BROODKEEPER_SHEET_ASSET = Object.freeze({
  url: PRISM_MOTH_BROODKEEPER_SHEET_URL,
  contentHash: PRISM_MOTH_BROODKEEPER_SHEET_SHA256,
  width: 2048,
  height: 2048
}) satisfies SandboxBossArtworkAsset;

const PRISM_MOTH_BROODKEEPER_REFERENCE_ASSET = Object.freeze({
  url: PRISM_MOTH_BROODKEEPER_REFERENCE_URL,
  contentHash: PRISM_MOTH_BROODKEEPER_REFERENCE_SHA256,
  width: 384,
  height: 384
}) satisfies SandboxBossArtworkAsset;

const AURORA_STORM_ENGINE_ASSEMBLED_ASSET = Object.freeze({
  url: AURORA_STORM_ENGINE_ART_URL,
  contentHash: AURORA_STORM_ENGINE_ART_SHA256,
  width: 662,
  height: 503
}) satisfies SandboxBossArtworkAsset;

const AURORA_STORM_ENGINE_SHEET_ASSET = Object.freeze({
  url: AURORA_STORM_ENGINE_SHEET_URL,
  contentHash: AURORA_STORM_ENGINE_SHEET_SHA256,
  width: 1254,
  height: 1254
}) satisfies SandboxBossArtworkAsset;

const UMBRA_NEEDLEWING_ASSEMBLED_ASSET = Object.freeze({
  url: UMBRA_NEEDLEWING_ART_URL,
  contentHash: UMBRA_NEEDLEWING_ART_SHA256,
  width: UMBRA_NEEDLEWING_NEUTRAL_SIZE.width,
  height: UMBRA_NEEDLEWING_NEUTRAL_SIZE.height
}) satisfies SandboxBossArtworkAsset;

const UMBRA_NEEDLEWING_SHEET_ASSET = Object.freeze({
  url: UMBRA_NEEDLEWING_SHEET_URL,
  contentHash: UMBRA_NEEDLEWING_SHEET_SHA256,
  width: UMBRA_NEEDLEWING_MODULAR_RIG.manifest.atlas.width,
  height: UMBRA_NEEDLEWING_MODULAR_RIG.manifest.atlas.height
}) satisfies SandboxBossArtworkAsset;

const ABYSSAL_OCTARCH_ASSEMBLED_ASSET = Object.freeze({
  url: ABYSSAL_OCTARCH_NEUTRAL_URL,
  contentHash: ABYSSAL_OCTARCH_NEUTRAL_SHA256,
  width: ABYSSAL_OCTARCH_DESIGN_SIZE.width,
  height: ABYSSAL_OCTARCH_DESIGN_SIZE.height
}) satisfies SandboxBossArtworkAsset;

const ABYSSAL_OCTARCH_SHEET_ASSET = Object.freeze({
  url: ABYSSAL_OCTARCH_ATLAS_URL,
  contentHash: ABYSSAL_OCTARCH_ATLAS_SHA256,
  width: ABYSSAL_OCTARCH_MODULAR_RIG.manifest.atlas.width,
  height: ABYSSAL_OCTARCH_MODULAR_RIG.manifest.atlas.height
}) satisfies SandboxBossArtworkAsset;

const CINDERJAW_SIEGE_BEETLE_ASSEMBLED_ASSET = Object.freeze({
  url: CINDERJAW_SIEGE_BEETLE_ART_URL,
  contentHash: CINDERJAW_SIEGE_BEETLE_ART_SHA256,
  width: 351,
  height: 256
}) satisfies SandboxBossArtworkAsset;

const CINDERJAW_SIEGE_BEETLE_SHEET_ASSET = Object.freeze({
  url: CINDERJAW_SIEGE_BEETLE_SHEET_URL,
  contentHash: CINDERJAW_SIEGE_BEETLE_SHEET_SHA256,
  width: 1254,
  height: 1254
}) satisfies SandboxBossArtworkAsset;

const VESPERGLASS_MOTHMOTHER_ASSEMBLED_ASSET = Object.freeze({
  url: VESPERGLASS_MOTHMOTHER_ART_URL,
  contentHash: VESPERGLASS_MOTHMOTHER_ART_SHA256,
  width: 376,
  height: 306
}) satisfies SandboxBossArtworkAsset;

const VESPERGLASS_MOTHMOTHER_SHEET_ASSET = Object.freeze({
  url: VESPERGLASS_MOTHMOTHER_SHEET_URL,
  contentHash: VESPERGLASS_MOTHMOTHER_SHEET_SHA256,
  width: 1536,
  height: 1024
}) satisfies SandboxBossArtworkAsset;

const TWIN_HALO_WARDENS_ASSEMBLED_ASSET = Object.freeze({
  url: TWIN_HALO_WARDENS_ART_URL,
  contentHash: TWIN_HALO_WARDENS_ART_SHA256,
  width: 322,
  height: 219
}) satisfies SandboxBossArtworkAsset;

const TWIN_HALO_WARDENS_SHEET_ASSET = Object.freeze({
  url: TWIN_HALO_WARDENS_SHEET_URL,
  contentHash: TWIN_HALO_WARDENS_SHEET_SHA256,
  width: 1254,
  height: 1254
}) satisfies SandboxBossArtworkAsset;

const RIFTCOIL_WYRM_ASSEMBLED_ASSET = Object.freeze({
  url: RIFTCOIL_WYRM_ART_URL,
  contentHash: RIFTCOIL_WYRM_ART_SHA256,
  width: 287,
  height: 370
}) satisfies SandboxBossArtworkAsset;

const RIFTCOIL_WYRM_SHEET_ASSET = Object.freeze({
  url: RIFTCOIL_WYRM_SHEET_URL,
  contentHash: RIFTCOIL_WYRM_SHEET_SHA256,
  width: 1183,
  height: 1329
}) satisfies SandboxBossArtworkAsset;

const NULLWAKE_REVENANT_ASSEMBLED_ASSET = Object.freeze({
  url: NULLWAKE_REVENANT_ART_URL,
  contentHash: NULLWAKE_REVENANT_ART_SHA256,
  width: 370,
  height: 311
}) satisfies SandboxBossArtworkAsset;

const NULLWAKE_REVENANT_SHEET_ASSET = Object.freeze({
  url: NULLWAKE_REVENANT_SHEET_URL,
  contentHash: NULLWAKE_REVENANT_SHEET_SHA256,
  width: 1254,
  height: 1254
}) satisfies SandboxBossArtworkAsset;

const GLOAMFORGE_MANTIS_ASSEMBLED_ASSET = Object.freeze({
  url: GLOAMFORGE_MANTIS_ART_URL,
  contentHash: GLOAMFORGE_MANTIS_ART_SHA256,
  width: 720,
  height: 620
}) satisfies SandboxBossArtworkAsset;

const GLOAMFORGE_MANTIS_SHEET_ASSET = Object.freeze({
  url: GLOAMFORGE_MANTIS_SHEET_URL,
  contentHash: GLOAMFORGE_MANTIS_SHEET_SHA256,
  width: 2048,
  height: 2048
}) satisfies SandboxBossArtworkAsset;

const SANDBOX_BOSS_VFX_SHEET_ASSET = Object.freeze({
  url: SANDBOX_BOSS_VFX_SHEET_URL,
  contentHash: SANDBOX_BOSS_VFX_SHEET_SHA256,
  width: 1254,
  height: 1254
}) satisfies SandboxBossArtworkAsset;

export const SANDBOX_BOSS_ARTWORK_REGISTRATIONS: Readonly<
  Partial<Record<SandboxBossPrototypeId, SandboxBossArtworkRegistration>>
> = Object.freeze({
  'abyssal-octarch': Object.freeze({
    prototypeId: 'abyssal-octarch',
    assembled: ABYSSAL_OCTARCH_ASSEMBLED_ASSET,
    sheet: ABYSSAL_OCTARCH_SHEET_ASSET,
    renderMode: 'articulated',
    weaponSockets: ABYSSAL_OCTARCH_ARTWORK_PACKAGE.artwork.weaponSockets!,
    modularRig: ABYSSAL_OCTARCH_MODULAR_RIG,
    sampleModularPose: ABYSSAL_OCTARCH_ARTWORK_PACKAGE.artwork.sampleModularPose!,
    modularReferenceComparison: ABYSSAL_OCTARCH_REFERENCE_COMPARISON,
    projectileAnimations: ABYSSAL_OCTARCH_ARTWORK_PACKAGE.artwork.projectileAnimations!,
    encounterCamera: ABYSSAL_OCTARCH_ARTWORK_PACKAGE.artwork.encounterCamera!
  }),
  'meridian-harrower': Object.freeze({
    prototypeId: 'meridian-harrower',
    assembled: MERIDIAN_HARROWER_ASSEMBLED_ASSET,
    sheet: MERIDIAN_HARROWER_SHEET_ASSET,
    articulatedAtlas: Object.freeze({
      kind: 'segmented-crescent-v1',
      ...MERIDIAN_HARROWER_SHEET_ASSET,
      frames: MERIDIAN_HARROWER_ATLAS_FRAMES
    }),
    vfxAtlas: Object.freeze({
      ...SANDBOX_BOSS_VFX_SHEET_ASSET,
      frames: SANDBOX_BOSS_VFX_ATLAS_FRAMES
    })
  }),
  'helios-clawcarrier': Object.freeze({
    prototypeId: 'helios-clawcarrier',
    assembled: HELIOS_CLAWCARRIER_ASSEMBLED_ASSET,
    sheet: HELIOS_CLAWCARRIER_SHEET_ASSET,
    modularRig: HELIOS_CLAWCARRIER_MODULAR_RIG,
    sampleModularPose: sampleHeliosSandboxPose,
    modularReferenceComparison: Object.freeze({
      kind: MODULAR_BOSS_REFERENCE_COMPARISON_KIND,
      ...HELIOS_CLAWCARRIER_REFERENCE_ASSET,
      provenance: 'Tight x12/y34 394x271 crop of the locked reference-board.png top-left neutral design.',
      landmarks: Object.freeze([
        Object.freeze({
          id: 'reactor-core',
          label: 'Reactor core',
          reference: Object.freeze({ xRatio: 197 / 394, yRatio: 162 / 271 }),
          rig: Object.freeze({ kind: 'socket', socketId: 'reactor-core' })
        }),
        Object.freeze({
          id: 'heavy-muzzle-port',
          label: 'Port heavy muzzle',
          reference: Object.freeze({ xRatio: 145 / 394, yRatio: 247 / 271 }),
          rig: Object.freeze({ kind: 'socket', socketId: 'heavy-muzzle-port' })
        }),
        Object.freeze({
          id: 'heavy-muzzle-starboard',
          label: 'Starboard heavy muzzle',
          reference: Object.freeze({ xRatio: 249 / 394, yRatio: 247 / 271 }),
          rig: Object.freeze({ kind: 'socket', socketId: 'heavy-muzzle-starboard' })
        })
      ])
    }),
    projectileAnimations: Object.freeze({
      'boss-heavy-shell': Object.freeze({
        frameIds: Object.freeze([
          'heavy-shell.0',
          'heavy-shell.1',
          'heavy-shell.2',
          'heavy-shell.3'
        ]),
        frameHoldFrames: 4,
        minimumVisualHeight: 30,
        entityHeightScale: 1.75,
        orientationOffsetRadians: 0
      }),
      'boss-gatling-tracer': Object.freeze({
        frameIds: Object.freeze([
          'gatling-tracer.0',
          'gatling-tracer.1',
          'gatling-tracer.2',
          'gatling-tracer.3'
        ]),
        frameHoldFrames: 2,
        minimumVisualHeight: 14,
        entityHeightScale: 1.7,
        orientationOffsetRadians: Math.PI
      }),
      'boss-reactor-pellet': Object.freeze({
        frameIds: Object.freeze([
          'reactor-pellet.0',
          'reactor-pellet.1',
          'reactor-pellet.2',
          'reactor-pellet.3'
        ]),
        frameHoldFrames: 3,
        minimumVisualHeight: 22,
        entityHeightScale: 1.45,
        orientationOffsetRadians: 0
      }),
      'boss-helios-mine': Object.freeze({
        frameIds: Object.freeze([
          'mine.deploy.0',
          'mine.deploy.1',
          'mine.deploy.2',
          'mine.deploy.3'
        ]),
        frameHoldFrames: 4,
        minimumVisualHeight: 30,
        entityHeightScale: 1.35,
        orientationOffsetRadians: 0
      })
    }),
    vfxAtlas: Object.freeze({
      ...SANDBOX_BOSS_VFX_SHEET_ASSET,
      frames: SANDBOX_BOSS_VFX_ATLAS_FRAMES
    })
  }),
  'frontier-crownclaw': Object.freeze({
    prototypeId: 'frontier-crownclaw',
    assembled: FRONTIER_CROWNCLAW_ASSEMBLED_ASSET,
    sheet: FRONTIER_CROWNCLAW_SHEET_ASSET,
    modularRig: FRONTIER_CROWNCLAW_MODULAR_RIG,
    sampleModularPose: sampleFrontierCrownclawSandboxPose,
    modularReferenceComparison: Object.freeze({
      kind: MODULAR_BOSS_REFERENCE_COMPARISON_KIND,
      ...FRONTIER_CROWNCLAW_REFERENCE_ASSET,
      provenance:
        'Locked complete Astral Crownclaw neutral reference; the clipped Campaign Copy frame is retained separately as evidence only.',
      landmarks: Object.freeze([
        Object.freeze({
          id: 'crown-reactor',
          label: 'Crown reactor',
          reference: Object.freeze({ xRatio: 0.5, yRatio: 0.51 }),
          rig: Object.freeze({ kind: 'socket', socketId: 'crown-reactor' })
        }),
        Object.freeze({
          id: 'claw-tip-port',
          label: 'Port chained claw tip',
          reference: Object.freeze({ xRatio: 0.17, yRatio: 0.83 }),
          rig: Object.freeze({ kind: 'socket', socketId: 'claw-tip-port' })
        }),
        Object.freeze({
          id: 'claw-tip-starboard',
          label: 'Starboard chained claw tip',
          reference: Object.freeze({ xRatio: 0.83, yRatio: 0.83 }),
          rig: Object.freeze({ kind: 'socket', socketId: 'claw-tip-starboard' })
        })
      ])
    }),
    projectileAnimations: Object.freeze({
      'boss-frontier-chainclaw': Object.freeze({
        frameIds: Object.freeze(['claw.open']),
        frameHoldFrames: 3,
        minimumVisualHeight: 70,
        entityHeightScale: 0.65,
        orientationOffsetRadians: Math.PI
      }),
      'boss-frontier-chain-link': Object.freeze({
        frameIds: Object.freeze(['chain.segment']),
        frameHoldFrames: 3,
        minimumVisualHeight: 13,
        entityHeightScale: 0.25,
        orientationOffsetRadians: 0
      }),
      'boss-frontier-reactor-beam': Object.freeze({
        frameIds: Object.freeze(['beam.0', 'beam.1', 'beam.2', 'beam.3']),
        frameHoldFrames: 3,
        minimumVisualHeight: 21,
        entityHeightScale: 1,
        orientationOffsetRadians: 0
      }),
      'boss-frontier-crown-bolt': Object.freeze({
        frameIds: Object.freeze(['crown-bolt.0']),
        frameHoldFrames: 3,
        minimumVisualHeight: 22,
        entityHeightScale: 1.4,
        orientationOffsetRadians: Math.PI / 2
      }),
      'boss-frontier-shell-shard': Object.freeze({
        frameIds: Object.freeze(['shell-shard.0']),
        frameHoldFrames: 4,
        minimumVisualHeight: 18,
        entityHeightScale: 1.35,
        orientationOffsetRadians: 0
      })
    })
  }),
  'prism-moth-brood': Object.freeze({
    prototypeId: 'prism-moth-brood',
    assembled: PRISM_MOTH_BROODKEEPER_ASSEMBLED_ASSET,
    sheet: PRISM_MOTH_BROODKEEPER_SHEET_ASSET,
    modularRig: PRISM_MOTH_BROODKEEPER_MODULAR_RIG,
    sampleModularPose: samplePrismMothSandboxPose,
    modularReferenceComparison: Object.freeze({
      kind: MODULAR_BOSS_REFERENCE_COMPARISON_KIND,
      ...PRISM_MOTH_BROODKEEPER_REFERENCE_ASSET,
      provenance: 'Pinned canonical complete Prism Moth pose from the stage-20 generated expansion art.',
      landmarks: Object.freeze([
        Object.freeze({
          id: 'prism-core',
          label: 'Prism core',
          reference: Object.freeze({ xRatio: 0.5, yRatio: 0.47 }),
          rig: Object.freeze({ kind: 'socket', socketId: 'prism-core' })
        }),
        Object.freeze({
          id: 'wing-tip-left',
          label: 'Left upper wing tip',
          reference: Object.freeze({ xRatio: 0.22, yRatio: 0.25 }),
          rig: Object.freeze({ kind: 'socket', socketId: 'wing-tip-left' })
        }),
        Object.freeze({
          id: 'wing-tip-right',
          label: 'Right upper wing tip',
          reference: Object.freeze({ xRatio: 0.78, yRatio: 0.25 }),
          rig: Object.freeze({ kind: 'socket', socketId: 'wing-tip-right' })
        })
      ])
    }),
    projectileAnimations: Object.freeze({
      'boss-prism-feather': Object.freeze({
        frameIds: Object.freeze([
          'prism-feather.0',
          'prism-feather.1',
          'prism-feather.2',
          'prism-feather.3'
        ]),
        frameHoldFrames: 3,
        minimumVisualHeight: 18,
        entityHeightScale: 1.55,
        orientationOffsetRadians: Math.PI / 2
      }),
      'boss-prism-cocoon': Object.freeze({
        frameIds: Object.freeze([
          'cocoon.lifecycle.0',
          'cocoon.lifecycle.1',
          'cocoon.lifecycle.2',
          'cocoon.lifecycle.3'
        ]),
        frameHoldFrames: 14,
        minimumVisualHeight: 34,
        entityHeightScale: 1.8,
        orientationOffsetRadians: 0
      }),
      'boss-prism-broodling': Object.freeze({
        frameIds: Object.freeze([
          'broodling.flutter.0',
          'broodling.flutter.1',
          'broodling.flutter.2',
          'broodling.flutter.3'
        ]),
        frameHoldFrames: 3,
        minimumVisualHeight: 24,
        entityHeightScale: 1.65,
        orientationOffsetRadians: Math.PI / 2
      })
    }),
    vfxAtlas: Object.freeze({
      ...SANDBOX_BOSS_VFX_SHEET_ASSET,
      frames: SANDBOX_BOSS_VFX_ATLAS_FRAMES
    })
  }),
  'aurora-storm-engine': Object.freeze({
    prototypeId: 'aurora-storm-engine',
    assembled: AURORA_STORM_ENGINE_ASSEMBLED_ASSET,
    sheet: AURORA_STORM_ENGINE_SHEET_ASSET,
    articulatedAtlas: Object.freeze({
      kind: 'rotating-emitter-core-v1',
      ...AURORA_STORM_ENGINE_SHEET_ASSET,
      frames: AURORA_STORM_ENGINE_ATLAS_FRAMES
    }),
    vfxAtlas: Object.freeze({
      ...SANDBOX_BOSS_VFX_SHEET_ASSET,
      frames: SANDBOX_BOSS_VFX_ATLAS_FRAMES
    })
  }),
  'umbra-needlewing': Object.freeze({
    prototypeId: 'umbra-needlewing',
    assembled: UMBRA_NEEDLEWING_ASSEMBLED_ASSET,
    sheet: UMBRA_NEEDLEWING_SHEET_ASSET,
    renderMode: 'articulated',
    weaponSockets: UMBRA_NEEDLEWING_ARTWORK_PACKAGE.artwork.weaponSockets!,
    modularRig: UMBRA_NEEDLEWING_MODULAR_RIG,
    sampleModularPose: UMBRA_NEEDLEWING_ARTWORK_PACKAGE.artwork.sampleModularPose!,
    modularReferenceComparison: UMBRA_NEEDLEWING_REFERENCE_COMPARISON,
    projectileAnimations: UMBRA_NEEDLEWING_ARTWORK_PACKAGE.artwork.projectileAnimations!,
    vfxAtlas: Object.freeze({
      ...SANDBOX_BOSS_VFX_SHEET_ASSET,
      frames: SANDBOX_BOSS_VFX_ATLAS_FRAMES
    })
  }),
  'nullwake-revenant': Object.freeze({
    prototypeId: 'nullwake-revenant',
    assembled: NULLWAKE_REVENANT_ASSEMBLED_ASSET,
    sheet: NULLWAKE_REVENANT_SHEET_ASSET,
    renderMode: 'assembled',
    assembledMotionProfile: 'revival-shell',
    weaponSockets: Object.freeze({
      kind: 'normalized-boss-sockets-v1',
      sockets: Object.freeze([
        Object.freeze({ id: 'upper-port-claw', role: 'port', xRatio: 0.17, yRatio: 0.32 }),
        Object.freeze({ id: 'lower-port-claw', role: 'port', xRatio: 0.16, yRatio: 0.76 }),
        Object.freeze({ id: 'upper-starboard-claw', role: 'starboard', xRatio: 0.83, yRatio: 0.32 }),
        Object.freeze({ id: 'lower-starboard-claw', role: 'starboard', xRatio: 0.84, yRatio: 0.76 }),
        Object.freeze({ id: 'revenant-core', role: 'core', xRatio: 0.5, yRatio: 0.54 })
      ])
    }),
    articulatedAtlas: Object.freeze({
      kind: 'transforming-orbiter-v1',
      ...NULLWAKE_REVENANT_SHEET_ASSET,
      frames: NULLWAKE_REVENANT_ATLAS_FRAMES
    }),
    modularRig: NULLWAKE_REVENANT_MODULAR_RIG,
    sampleModularPose: sampleNullwakeSandboxPose,
    vfxAtlas: Object.freeze({
      ...SANDBOX_BOSS_VFX_SHEET_ASSET,
      frames: SANDBOX_BOSS_VFX_ATLAS_FRAMES
    })
  }),
  'cinderjaw-siege-beetle': Object.freeze({
    prototypeId: 'cinderjaw-siege-beetle',
    assembled: CINDERJAW_SIEGE_BEETLE_ASSEMBLED_ASSET,
    sheet: CINDERJAW_SIEGE_BEETLE_SHEET_ASSET,
    articulatedAtlas: Object.freeze({
      kind: 'articulated-pincer-v1',
      ...CINDERJAW_SIEGE_BEETLE_SHEET_ASSET,
      frames: CINDERJAW_SIEGE_BEETLE_ATLAS_FRAMES
    }),
    vfxAtlas: Object.freeze({
      ...SANDBOX_BOSS_VFX_SHEET_ASSET,
      frames: SANDBOX_BOSS_VFX_ATLAS_FRAMES
    })
  }),
  'vesperglass-mothmother': Object.freeze({
    prototypeId: 'vesperglass-mothmother',
    assembled: VESPERGLASS_MOTHMOTHER_ASSEMBLED_ASSET,
    sheet: VESPERGLASS_MOTHMOTHER_SHEET_ASSET,
    articulatedAtlas: Object.freeze({
      kind: 'segmented-crescent-v1',
      ...VESPERGLASS_MOTHMOTHER_SHEET_ASSET,
      frames: VESPERGLASS_MOTHMOTHER_ATLAS_FRAMES
    }),
    vfxAtlas: Object.freeze({
      ...SANDBOX_BOSS_VFX_SHEET_ASSET,
      frames: SANDBOX_BOSS_VFX_ATLAS_FRAMES
    })
  }),
  'twin-halo-wardens': Object.freeze({
    prototypeId: 'twin-halo-wardens',
    assembled: TWIN_HALO_WARDENS_ASSEMBLED_ASSET,
    sheet: TWIN_HALO_WARDENS_SHEET_ASSET,
    renderMode: 'assembled',
    assembledMotionProfile: 'paired-resonance',
    articulatedAtlas: Object.freeze({
      kind: 'transforming-orbiter-v1',
      ...TWIN_HALO_WARDENS_SHEET_ASSET,
      frames: TWIN_HALO_WARDENS_ATLAS_FRAMES
    }),
    vfxAtlas: Object.freeze({
      ...SANDBOX_BOSS_VFX_SHEET_ASSET,
      frames: SANDBOX_BOSS_VFX_ATLAS_FRAMES
    })
  }),
  'riftcoil-wyrm': Object.freeze({
    prototypeId: 'riftcoil-wyrm',
    assembled: RIFTCOIL_WYRM_ASSEMBLED_ASSET,
    sheet: RIFTCOIL_WYRM_SHEET_ASSET,
    articulatedAtlas: Object.freeze({
      kind: 'segmented-crescent-v1',
      ...RIFTCOIL_WYRM_SHEET_ASSET,
      frames: RIFTCOIL_WYRM_ATLAS_FRAMES
    }),
    vfxAtlas: Object.freeze({
      ...SANDBOX_BOSS_VFX_SHEET_ASSET,
      frames: SANDBOX_BOSS_VFX_ATLAS_FRAMES
    })
  }),
  'gloamforge-mantis': Object.freeze({
    prototypeId: 'gloamforge-mantis',
    assembled: GLOAMFORGE_MANTIS_ASSEMBLED_ASSET,
    sheet: GLOAMFORGE_MANTIS_SHEET_ASSET,
    modularRig: GLOAMFORGE_MANTIS_MODULAR_RIG,
    sampleModularPose: sampleGloamforgeSandboxPose,
    vfxAtlas: Object.freeze({
      ...SANDBOX_BOSS_VFX_SHEET_ASSET,
      frames: SANDBOX_BOSS_VFX_ATLAS_FRAMES
    })
  })
});

export const getSandboxBossArtworkRegistration = (
  prototypeId: SandboxBossPrototypeId | undefined
): SandboxBossArtworkRegistration | undefined => (
  prototypeId ? SANDBOX_BOSS_ARTWORK_REGISTRATIONS[prototypeId] : undefined
);

export const BOSS_SANDBOX_GROUP_IDS = Object.freeze({
  campaign: 'boss-sandbox:main-game',
  test: 'boss-sandbox:test-bosses',
  miniBosses: 'boss-sandbox:mini-boss-lab'
} as const);

export interface BossSandboxCategory {
  readonly id: SandboxEncounterCategoryId;
  readonly label: string;
  readonly selectorLabel: string;
}

export const BOSS_SANDBOX_CATEGORIES: readonly BossSandboxCategory[] = Object.freeze([
  Object.freeze({ id: 'full-bosses', label: 'Bosses', selectorLabel: 'Boss to Test' }),
  Object.freeze({ id: 'mini-bosses', label: 'Elite Enemies', selectorLabel: 'Elite Enemy to Test' }),
  Object.freeze({ id: 'test-bosses', label: 'Test Bosses', selectorLabel: 'Test Boss to Test' }),
  Object.freeze({ id: 'elite-enemies', label: 'Solo Elites', selectorLabel: 'Solo Elite to Test' }),
  Object.freeze({ id: 'paired-encounters', label: 'Paired Encounters', selectorLabel: 'Encounter to Test' }),
  Object.freeze({ id: 'guardian-formations', label: 'Guardian Formations', selectorLabel: 'Formation to Test' }),
  Object.freeze({ id: 'wall-encounters', label: 'Wall Encounters', selectorLabel: 'Encounter to Test' }),
  Object.freeze({ id: 'all-encounters', label: 'All Encounters', selectorLabel: 'Encounter to Test' })
]);

export const DEFAULT_BOSS_SANDBOX_CATEGORY_ID: SandboxEncounterCategoryId =
  'all-encounters';

export const getBossSandboxSelectorLabel = (
  categoryId: SandboxEncounterCategoryId
): string => BOSS_SANDBOX_CATEGORIES.find((category) => category.id === categoryId)
  ?.selectorLabel ?? 'Encounter to Test';

export type BossSandboxHostMode = 'mobile-shell' | 'desktop-shell';

export const BOSS_SANDBOX_HOST_MODES = Object.freeze([
  Object.freeze({ id: 'mobile-shell' as const, label: 'Mobile host' }),
  Object.freeze({ id: 'desktop-shell' as const, label: 'Desktop host' })
]);

export type BossSandboxViewportMode = 'desktop' | 'mobile';

export interface BossSandboxViewport {
  readonly id: BossSandboxViewportMode;
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

export const DEFAULT_BOSS_SANDBOX_VIEWPORT_MODE: BossSandboxViewportMode =
  'mobile';
export const BOSS_SANDBOX_VIEWPORT_ORDER = Object.freeze([
  'mobile',
  'desktop'
] as const);

export const BOSS_SANDBOX_VIEWPORTS: Readonly<
  Record<BossSandboxViewportMode, BossSandboxViewport>
> = Object.freeze({
  mobile: Object.freeze({
    id: 'mobile',
    label: 'Mobile fit',
    width: 390,
    height: 844
  }),
  desktop: Object.freeze({
    id: 'desktop',
    label: 'Desktop fit',
    width: 1280,
    height: 720
  })
});

export const resolveBossSandboxFitScale = (
  host: Readonly<{ width: number; height: number }>,
  viewport: Readonly<{ width: number; height: number }>,
  inset = 24,
  maximumScale = 1
): number => {
  if (host.width <= 0 || host.height <= 0) return 0.5;
  const availableWidth = Math.max(1, host.width - inset);
  const availableHeight = Math.max(1, host.height - inset);
  return Math.max(
    0.2,
    Math.min(
      maximumScale,
      availableWidth / viewport.width,
      availableHeight / viewport.height
    )
  );
};

export interface BossSandboxChoice {
  readonly id: string;
  readonly source: 'campaign' | 'test';
  readonly encounterClass: 'full-boss' | 'mini-boss';
  readonly categories: readonly SandboxEncounterCategoryId[];
  readonly missionId: string;
  readonly missionLabel: string;
  readonly bossLabel: string;
  readonly waveLabel: string;
  readonly missionOrder?: number;
  readonly waveOrder?: number;
  readonly levelId?: string;
  readonly waveId?: string;
  readonly eventId?: string;
  readonly prototypeId?: SandboxBossPrototypeId;
  readonly miniBoss?: SandboxMiniBossEncounterMetadata;
  readonly artworkAssetId?: AssetKey;
  readonly artworkUrl?: string;
}

export interface BossSandboxGroup {
  readonly id: string;
  readonly label: string;
  readonly source: BossSandboxChoice['source'];
  readonly choices: readonly BossSandboxChoice[];
}

export interface BossSandboxWeeklyLineupItem {
  readonly stageNumber: number;
  readonly kind: 'boss' | 'elite-enemy';
  readonly bossId: string;
  readonly label: string;
  readonly missionLabel: string;
  readonly waveCount: number;
}

/**
 * Read-only projection of the same deterministic plan consumed by Weekly Run.
 * Keeping this in the Sandbox model prevents the UI from inventing a second
 * shuffle or drifting from the live weekly encounter order.
 */
export const buildBossSandboxWeeklyLineup = (
  campaign: GameCampaignConfig,
  weekKey: string,
  stageCount = WEEKLY_RUN_INITIAL_STAGE_COUNT
): readonly BossSandboxWeeklyLineupItem[] => {
  const authoredByBossId = new Map<string, {
    event: BossEvent;
    missionLabel: string;
  }>();
  [...campaign.levels]
    .sort((left, right) => left.order - right.order)
    .forEach((level) => {
      [...level.waves]
        .sort((left, right) => left.order - right.order)
        .forEach((wave) => {
          wave.events.forEach((event) => {
            if (event.kind !== 'boss' || authoredByBossId.has(event.bossId)) return;
            authoredByBossId.set(event.bossId, {
              event,
              missionLabel: level.name
            });
          });
        });
    });

  return Object.freeze(planWeeklyRunStages(weekKey, campaign, stageCount)
    .flatMap((stage): BossSandboxWeeklyLineupItem[] => {
      if (!stage.bossId || stage.kind === 'combat') return [];
      const authored = authoredByBossId.get(stage.bossId);
      return [Object.freeze({
        stageNumber: stage.index + 1,
        kind: stage.kind === 'major' ? 'boss' : 'elite-enemy',
        bossId: stage.bossId,
        label: authored?.event.label ?? stage.bossId,
        missionLabel: authored?.missionLabel ?? 'Weekly Run',
        waveCount: stage.waveCount
      })];
    }));
};

export interface BossSandboxAttack {
  readonly id: string;
  readonly phaseId: string;
  /** Stable position in the boss's full attack roster, even in phase-subset views. */
  readonly attackNumber: number;
  /** Diagnostic source name; the player-facing controls remain Attack 1, 2, etc. */
  readonly sourceLabel: string;
  readonly source: 'timeline' | 'generated-runtime' | 'configured-weapon';
}

const productionChoiceId = (levelId: string, waveId: string, eventId: string) => (
  `boss-sandbox:campaign:${levelId}:${waveId}:${eventId}`
);

const prototypeChoiceId = (prototypeId: SandboxBossPrototypeId) => (
  `boss-sandbox:test:${prototypeId}`
);

const getMiniBossPrimaryArtworkUrl = (encounterId: string): string | undefined => {
  const primaryBody = getMiniBossEncounterDefinition(encounterId)
    ?.assets.find((asset) => asset.usage === 'primary-body');
  return primaryBody?.url ?? primaryBody?.frames?.[0];
};

export const getBossSandboxChoiceOptionLabel = (
  choice: BossSandboxChoice
): string => (
  choice.source === 'campaign' && choice.missionOrder !== undefined
    ? `M${String(choice.missionOrder).padStart(2, '0')} · ${choice.encounterClass === 'full-boss' ? 'BOSS' : 'ELITE'} · ${choice.bossLabel}`
    : `${choice.encounterClass === 'full-boss' ? 'BOSS' : 'ELITE'} · ${choice.bossLabel}`
);

export const buildBossSandboxGroups = (
  campaign: GameCampaignConfig
): readonly BossSandboxGroup[] => {
  const validation = validateGameCampaign(campaign);
  if (!validation.valid) {
    throw new Error(validation.issues.map((issue) => issue.message).join('; '));
  }

  const campaignChoices = [...campaign.levels]
    .sort((left, right) => left.order - right.order)
    .flatMap((level) => [...level.waves]
      .sort((left, right) => left.order - right.order)
      .flatMap((wave) => wave.events
        .map((event, eventIndex) => ({ event, eventIndex }))
        .sort((left, right) => (
          left.event.startSeconds - right.event.startSeconds
          || left.eventIndex - right.eventIndex
        ))
        .flatMap(({ event }): BossSandboxChoice[] => {
          if (event.kind !== 'boss') return [];
          const catalogClass = getBossEncounterClass(event.bossId);
          if (!catalogClass) return [];
          const encounterClass = catalogClass === 'boss' ? 'full-boss' : 'mini-boss';
          const matchingPrototype = encounterClass === 'mini-boss'
            ? SANDBOX_BOSS_PROTOTYPES.find((prototype) => prototype.id === event.bossId)
            : undefined;
          const miniBoss = matchingPrototype?.miniBoss;
          const categories: SandboxEncounterCategoryId[] = encounterClass === 'full-boss'
            ? ['full-bosses', 'all-encounters']
            : [...new Set<SandboxEncounterCategoryId>([
                'mini-bosses',
                ...(miniBoss?.categories ?? []),
                'all-encounters'
              ])];
          return [{
            id: productionChoiceId(level.id, wave.id, event.id),
            source: 'campaign',
            encounterClass,
            categories,
            missionId: level.id,
            missionLabel: level.name,
            bossLabel: event.label,
            waveLabel: wave.name,
            missionOrder: level.order,
            waveOrder: wave.order,
            levelId: level.id,
            waveId: wave.id,
            eventId: event.id,
            ...(miniBoss
              ? {
                  miniBoss,
                  artworkAssetId: miniBoss.assetIds[0],
                  artworkUrl: getMiniBossPrimaryArtworkUrl(miniBoss.encounterId)
                }
              : {})
          }];
        })));

  const prototypeChoices = SANDBOX_BOSS_PROTOTYPES.map(
    (prototype): BossSandboxChoice => ({
      id: prototypeChoiceId(prototype.id),
      source: 'test',
      encounterClass: prototype.encounterClass,
      categories: prototype.miniBoss
        ? [...prototype.miniBoss.categories, 'all-encounters']
        : ['full-bosses', 'test-bosses', 'all-encounters'],
      missionId: prototype.miniBoss
        ? BOSS_SANDBOX_GROUP_IDS.miniBosses
        : BOSS_SANDBOX_GROUP_IDS.test,
      missionLabel: 'TEST BOSSES · Never ships',
      ...(prototype.miniBoss
        ? { missionLabel: 'ELITE ENEMY LAB | Campaign preview' }
        : {}),
      bossLabel: prototype.label,
      waveLabel: 'Isolated boss fight',
      prototypeId: prototype.id,
      ...(prototype.miniBoss
        ? {
            miniBoss: prototype.miniBoss,
            artworkAssetId: prototype.miniBoss.assetIds[0],
            artworkUrl: getMiniBossPrimaryArtworkUrl(prototype.miniBoss.encounterId)
          }
        : {})
    })
  );

  const testBossChoices = prototypeChoices.filter((choice) => choice.encounterClass === 'full-boss');
  const miniBossChoices = prototypeChoices.filter((choice) => choice.encounterClass === 'mini-boss');
  const groups: BossSandboxGroup[] = [
    {
      id: BOSS_SANDBOX_GROUP_IDS.campaign,
      label: 'MAIN GAME · Campaign order',
      source: 'campaign',
      choices: campaignChoices
    },
    {
      id: BOSS_SANDBOX_GROUP_IDS.test,
      label: 'TEST BOSSES · Never ships',
      source: 'test',
      choices: testBossChoices
    },
    {
      id: BOSS_SANDBOX_GROUP_IDS.miniBosses,
      label: 'ELITE ENEMIES · Campaign roster',
      source: 'test',
      choices: miniBossChoices
    }
  ];
  return groups.filter((group) => group.choices.length > 0);
};

export const filterBossSandboxGroups = (
  groups: readonly BossSandboxGroup[],
  categoryId: SandboxEncounterCategoryId
): readonly BossSandboxGroup[] => groups
  .map((group) => ({
    ...group,
    choices: group.choices.filter((choice) => choice.categories.includes(categoryId))
  }))
  .filter((group) => group.choices.length > 0);

export const getDefaultBossSandboxChoice = (
  choices: readonly BossSandboxChoice[]
): BossSandboxChoice | undefined => (
  choices.find((choice) => choice.source === 'campaign') ?? choices[0]
);

const getBossEvent = (preview: CombatLabPreviewResult): BossEvent => {
  const event = preview.previewWave.events.find((candidate) => candidate.kind === 'boss');
  if (!event || event.kind !== 'boss') throw new Error('Boss Sandbox preview must contain one boss');
  return event;
};

/**
 * Registers fixed loopback-only concept artwork for its matching locked preview.
 * Campaign content remains validated and untouched.
 */
export const createSandboxOnlyBossArtwork = (
  preview: SandboxBossPrototypePreview
): PreviewBossArtwork => {
  if (!preview.sandboxPrototype.sandboxOnly || preview.sandboxPrototype.promotionAllowed) {
    throw new Error('Preview artwork may only be attached to a locked Sandbox prototype');
  }
  const registration = getSandboxBossArtworkRegistration(
    preview.sandboxPrototype.prototypeId
  );
  if (!registration) {
    throw new Error(
      `No fixed Sandbox artwork is registered for ${preview.sandboxPrototype.prototypeId}`
    );
  }
  const event = preview.previewWave.events.find((candidate) => candidate.id === preview.eventId);
  if (!event || event.kind !== 'boss') {
    throw new Error('Sandbox preview artwork target is missing');
  }
  const collisionMaskAsset = getSandboxBossCollisionMask(
    preview.sandboxPrototype.prototypeId
  );
  if (!collisionMaskAsset) {
    throw new Error(
      `No alpha collision mask is registered for ${preview.sandboxPrototype.prototypeId}`
    );
  }
  if (collisionMaskAsset.contentHash !== registration.assembled.contentHash) {
    throw new Error(
      `Alpha collision mask is stale for ${preview.sandboxPrototype.prototypeId}`
    );
  }
  return Object.freeze({
    eventId: event.id,
    url: registration.assembled.url,
    contentHash: registration.assembled.contentHash,
    collisionMask: collisionMaskAsset.mask,
    ...(registration.weaponSockets
      ? { weaponSockets: registration.weaponSockets }
      : {}),
    ...(registration.renderMode
      ? { renderMode: registration.renderMode }
      : {}),
    ...(registration.assembledMotionProfile
      ? { assembledMotionProfile: registration.assembledMotionProfile }
      : {}),
    ...(registration.articulatedAtlas
      ? { articulatedAtlas: registration.articulatedAtlas }
      : {}),
    ...(registration.modularRig ? { modularRig: registration.modularRig } : {}),
    ...(registration.sampleModularPose
      ? { sampleModularPose: registration.sampleModularPose }
      : {}),
    ...(registration.modularReferenceComparison
      ? { modularReferenceComparison: registration.modularReferenceComparison }
      : {}),
    ...(registration.projectileAnimations
      ? { projectileAnimations: registration.projectileAnimations }
      : {}),
    ...(registration.encounterCamera
      ? { encounterCamera: registration.encounterCamera }
      : {}),
    ...(registration.vfxAtlas ? { vfxAtlas: registration.vfxAtlas } : {})
  });
};

export const buildBossSandboxPreview = (
  campaign: GameCampaignConfig,
  choice: BossSandboxChoice
): CombatLabPreviewResult => {
  if (choice.source === 'campaign') {
    if (!choice.levelId || !choice.waveId || !choice.eventId) {
      throw new Error('Campaign boss choice is incomplete');
    }
    return createFocusedPreviewCampaign(campaign, {
      kind: 'boss',
      levelId: choice.levelId,
      waveId: choice.waveId,
      eventId: choice.eventId
    });
  }

  if (!choice.prototypeId) throw new Error('Sandbox boss choice is incomplete');
  return buildSandboxBossPrototypePreview(campaign, choice.prototypeId);
};

export const isSandboxBossPrototypePreview = (
  preview: CombatLabPreviewResult
): preview is SandboxBossPrototypePreview => {
  const provenance = (preview as Partial<SandboxBossPrototypePreview>).sandboxPrototype;
  return provenance?.source === 'director-sandbox-prototype'
    && provenance.sandboxOnly === true;
};

export const getBossSandboxPhases = (
  preview: CombatLabPreviewResult
): readonly BossEvent['phases'][number][] => getBossEvent(preview).phases;

export const getBossSandboxAttacks = (
  preview: CombatLabPreviewResult,
  requestedPhaseId?: string | null
): readonly BossSandboxAttack[] => {
  const event = getBossEvent(preview);
  const phaseOrder = new Map(
    event.phases.map((phase, index) => [phase.id, index] as const)
  );
  if (event.timeline) {
    if (event.timeline.attacks?.length) {
      const phaseId = event.phases.some((phase) => phase.id === requestedPhaseId)
        ? String(requestedPhaseId)
        : event.phases[0].id;
      return event.timeline.attacks
        .map((attack, index) => ({ attack, attackNumber: index + 1 }))
        .filter(({ attack }) => attack.variants.some((variant) => variant.phaseId === phaseId))
        .map(({ attack, attackNumber }) => Object.freeze({
          id: attack.id,
          phaseId,
          attackNumber,
          sourceLabel: attack.label,
          source: 'timeline' as const
        }));
    }
    return event.timeline.clips
      .map((clip, sourceIndex) => ({ clip, sourceIndex }))
      .filter(({ clip }) => (
        clip.trigger === 'time'
        && isDamagingBossTimelinePrimitive(clip.primitiveId)
      ))
      .sort((left, right) => {
        const leftPhase = left.clip.phaseId
          ? phaseOrder.get(left.clip.phaseId) ?? Number.MAX_SAFE_INTEGER
          : -1;
        const rightPhase = right.clip.phaseId
          ? phaseOrder.get(right.clip.phaseId) ?? Number.MAX_SAFE_INTEGER
          : -1;
        return leftPhase - rightPhase
          || left.clip.startSeconds - right.clip.startSeconds
          || left.sourceIndex - right.sourceIndex;
      })
      .map(({ clip }, index) => Object.freeze({
        id: clip.id,
        phaseId: clip.phaseId ?? event.phases[0].id,
        attackNumber: index + 1,
        sourceLabel: clip.label,
        source: 'timeline' as const
      }));
  }

  const archetype = resolveGeneratedBossArchetype(event.spriteKey);
  if (archetype) {
    return getGeneratedBossPreviewAttacks(archetype).map((attack, index) => Object.freeze({
      id: attack.id,
      phaseId: event.phases[attack.phase - 1]?.id ?? event.phases[0].id,
      attackNumber: index + 1,
      sourceLabel: attack.fireTechnique,
      source: 'generated-runtime' as const
    }));
  }

  return event.weapons.map((weapon, index) => {
    const phase = event.phases.find((candidate) => (
      candidate.weaponSettingIds.includes(weapon.id)
    )) ?? event.phases[0];
    return Object.freeze({
      id: weapon.id,
      phaseId: phase.id,
      attackNumber: index + 1,
      sourceLabel: weapon.weaponId,
      source: 'configured-weapon' as const
    });
  });
};

export const getBossSandboxEventId = (preview: CombatLabPreviewResult): string => (
  getBossEvent(preview).id
);
