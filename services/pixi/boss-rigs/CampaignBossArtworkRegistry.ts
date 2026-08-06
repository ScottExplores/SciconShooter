import registryJson from '../../../game-config/generated/campaign-boss-artwork.json' with { type: 'json' };
import type {
  BossEvent,
  GameCampaignConfig,
  LevelDefinition
} from '../../../game-config/types';
import {
  registerModularBossRig,
  type ModularBossRigManifest
} from './ModularHierarchyRig';
import {
  sampleFrontierCrownclawSandboxPose
} from './FrontierCrownclawModularPose';
import { sampleGloamforgeModularPose } from './GloamforgeModularPose';
import { sampleHeliosModularPose } from './HeliosModularPose';
import { sampleNullwakeModularPose } from './NullwakeModularPose';
import { samplePrismMothSandboxPose } from './PrismMothModularPose';
import {
  SINGULARITY_COMMANDER_ARTWORK_PACKAGE
} from './SingularityCommanderArtwork';
import {
  sampleSingularityCommanderModularPose
} from './SingularityCommanderModularPose';
import type {
  PreviewBossArtwork,
  PreviewBossModularPoseSampler
} from './PreviewBossRigContracts';

type CampaignBossPoseKey =
  | 'aurora-storm-engine'
  | 'frontier-crownclaw'
  | 'gloamforge-mantis'
  | 'helios-clawcarrier'
  | 'nullwake-revenant'
  | 'prism-moth'
  | 'singularity-reach-commander';

type CompiledCampaignBossArtwork = Omit<
  PreviewBossArtwork,
  'eventId' | 'modularRig' | 'sampleModularPose'
> & {
  readonly modularRigManifest?: ModularBossRigManifest;
};

type CompiledCampaignBossArtworkPackage = Readonly<{
  bossId: string;
  prototypeId: string;
  prototypeHash: string;
  poseKey: CampaignBossPoseKey;
  artwork: CompiledCampaignBossArtwork;
}>;

type CompiledCampaignBossArtworkRegistry = Readonly<{
  schemaVersion: 1;
  source: 'director-test-boss-packages';
  packages: Readonly<Record<string, CompiledCampaignBossArtworkPackage>>;
}>;

const registry = registryJson as CompiledCampaignBossArtworkRegistry;
const packages: Readonly<Record<string, CompiledCampaignBossArtworkPackage>> = Object.freeze({
  ...registry.packages,
  [SINGULARITY_COMMANDER_ARTWORK_PACKAGE.bossId]: SINGULARITY_COMMANDER_ARTWORK_PACKAGE
});
const registrationByBossId = new Map<
  string,
  ReturnType<typeof registerModularBossRig>
>();

const poseSamplers: Readonly<
  Partial<Record<CampaignBossPoseKey, PreviewBossModularPoseSampler>>
> = Object.freeze({
  'frontier-crownclaw': sampleFrontierCrownclawSandboxPose,
  'gloamforge-mantis': (input) => sampleGloamforgeModularPose(input).partOverrides,
  'helios-clawcarrier': (input) => sampleHeliosModularPose(input).partOverrides,
  'nullwake-revenant': (input) => sampleNullwakeModularPose(input).partOverrides,
  'prism-moth': samplePrismMothSandboxPose,
  'singularity-reach-commander': sampleSingularityCommanderModularPose
});

const findBossEvent = (
  level: LevelDefinition,
  preferredWaveId?: string
): BossEvent | undefined => {
  const preferredWave = preferredWaveId
    ? level.waves.find((wave) => wave.id === preferredWaveId)
    : undefined;
  const preferredBoss = preferredWave?.events.find(
    (event): event is BossEvent => event.kind === 'boss'
  );
  if (preferredBoss) return preferredBoss;

  for (const wave of level.waves) {
    const boss = wave.events.find(
      (event): event is BossEvent => event.kind === 'boss'
    );
    if (boss) return boss;
  }
  return undefined;
};

export const getCampaignBossArtworkPackage = (
  bossId: string | undefined
): CompiledCampaignBossArtworkPackage | undefined => (
  bossId ? packages[bossId] : undefined
);

export const resolveCampaignBossArtwork = (
  campaign: GameCampaignConfig,
  levelId?: string,
  waveId?: string
): PreviewBossArtwork | undefined => {
  const level = levelId
    ? campaign.levels.find((candidate) => candidate.id === levelId)
    : waveId
      ? campaign.levels.find((candidate) => (
          candidate.waves.some((wave) => wave.id === waveId)
        ))
      : undefined;
  if (!level) return undefined;

  const boss = findBossEvent(level, waveId);
  if (!boss) return undefined;
  const packageDefinition = getCampaignBossArtworkPackage(boss.bossId);
  if (!packageDefinition) return undefined;

  let modularRig = registrationByBossId.get(packageDefinition.bossId);
  if (!modularRig && packageDefinition.artwork.modularRigManifest) {
    modularRig = registerModularBossRig(
      packageDefinition.artwork.modularRigManifest
    );
    registrationByBossId.set(packageDefinition.bossId, modularRig);
  }

  const {
    modularRigManifest: _modularRigManifest,
    ...artwork
  } = packageDefinition.artwork;
  const sampleModularPose = poseSamplers[packageDefinition.poseKey];
  return Object.freeze({
    eventId: boss.id,
    ...artwork,
    ...(modularRig ? { modularRig } : {}),
    ...(sampleModularPose ? { sampleModularPose } : {})
  });
};

export const CAMPAIGN_BOSS_ARTWORK_PACKAGE_IDS = Object.freeze(
  Object.keys(packages)
);
