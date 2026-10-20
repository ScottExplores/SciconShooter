import { getBossEncounterClass } from '../../game-config/catalog';
import type { BossEvent, GameCampaignConfig } from '../../game-config/types';
import { assertValidGameCampaign } from '../../game-config/validate';
import {
  buildSandboxBossPrototypePreview,
  SANDBOX_BOSS_PROTOTYPES
} from '../../director/src/combat-lab/sandboxBossPrototypes';
import {
  cloneGameCampaign,
  DEFAULT_GAME_CAMPAIGN,
  flattenLevels
} from '../levelConfig';
import {
  ABYSSAL_OCTARCH_ARTWORK_PACKAGE,
  ABYSSAL_OCTARCH_MODULAR_RIG
} from '../pixi/boss-rigs/AbyssalOctarchArtwork';
import type { PreviewBossArtwork } from '../pixi/boss-rigs/PreviewBossRigContracts';

export const BOSS_LAB_PREVIEW_SEED = 'scicon-boss-lab';

export interface BossLabEncounter {
  readonly id: string;
  readonly group: 'campaign' | 'sandbox';
  readonly label: string;
  readonly campaign: GameCampaignConfig;
  readonly levelId: string;
  readonly waveId: string;
  readonly artwork?: PreviewBossArtwork;
}

const classLabel = (bossId: string) => (
  getBossEncounterClass(bossId) === 'elite-enemy' ? 'ELITE' : 'BOSS'
);

const isolateCampaignBoss = (
  levelId: string,
  waveId: string,
  eventId: string
): GameCampaignConfig => {
  const campaign = cloneGameCampaign();
  const level = campaign.levels.find((entry) => entry.id === levelId);
  const wave = level?.waves.find((entry) => entry.id === waveId);
  const boss = wave?.events.find((event): event is BossEvent => (
    event.kind === 'boss' && event.id === eventId
  ));
  if (!level || !wave || !boss) {
    throw new Error(`Boss lab could not isolate campaign encounter ${eventId}`);
  }

  boss.startSeconds = 0;
  wave.name = boss.label;
  wave.completionRule = getBossEncounterClass(boss.bossId) === 'boss'
    ? 'boss-defeat'
    : 'clear-after-duration';
  wave.introSeconds = 0;
  wave.delayAfterSeconds = 0;
  wave.formationPackIds = [];
  wave.events = [boss];
  wave.durationSeconds = Math.max(wave.durationSeconds, boss.durationSeconds);
  assertValidGameCampaign(campaign);
  return campaign;
};

const abyssalArtwork = (eventId: string): PreviewBossArtwork => {
  const {
    modularRigManifest: _modularRigManifest,
    encounterCamera,
    ...artwork
  } = ABYSSAL_OCTARCH_ARTWORK_PACKAGE.artwork;
  return {
    ...artwork,
    eventId,
    modularRig: ABYSSAL_OCTARCH_MODULAR_RIG,
    ...(encounterCamera ? { encounterCamera: { ...encounterCamera, eventId } } : {})
  };
};

const campaignEncounters = (): BossLabEncounter[] => {
  const encounters: BossLabEncounter[] = [];
  for (const level of flattenLevels()) {
    const mission = String(level.order).padStart(2, '0');
    for (const wave of [...level.waves].sort((left, right) => left.order - right.order)) {
      for (const event of wave.events) {
        if (event.kind !== 'boss') continue;
        encounters.push({
          id: `campaign:${level.id}:${wave.id}:${event.id}`,
          group: 'campaign',
          label: `M${mission} · ${classLabel(event.bossId)} · ${event.label}`,
          campaign: isolateCampaignBoss(level.id, wave.id, event.id),
          levelId: level.id,
          waveId: wave.id
        });
      }
    }
  }
  return encounters;
};

const sandboxEncounters = (): BossLabEncounter[] => (
  SANDBOX_BOSS_PROTOTYPES.map((prototype) => {
    const preview = buildSandboxBossPrototypePreview(DEFAULT_GAME_CAMPAIGN, prototype.id);
    const kind = prototype.encounterClass === 'mini-boss' ? 'MINI' : 'BOSS';
    return {
      id: `sandbox:${prototype.id}`,
      group: 'sandbox',
      label: `${kind} · ${prototype.label}`,
      campaign: preview.campaign,
      levelId: preview.levelId,
      waveId: preview.waveId,
      ...(prototype.id === 'abyssal-octarch'
        ? { artwork: abyssalArtwork(preview.eventId) }
        : {})
    };
  })
);

let cachedEncounters: readonly BossLabEncounter[] | null = null;

/** Every current campaign boss plus every live sandbox encounter, including abyssal-octarch. */
export const listBossLabEncounters = (): readonly BossLabEncounter[] => {
  if (!cachedEncounters) {
    cachedEncounters = Object.freeze([...campaignEncounters(), ...sandboxEncounters()]);
  }
  return cachedEncounters;
};
