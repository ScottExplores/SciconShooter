import { getBossEncounterClass } from '../../game-config/catalog';
import type { BossEvent, GameCampaignConfig } from '../../game-config/types';
import { assertValidGameCampaign } from '../../game-config/validate';
import {
  cloneGameCampaign,
  DEFAULT_GAME_CAMPAIGN,
  flattenLevels
} from '../levelConfig';
import {
  buildSandboxBossEncounter,
  SANDBOX_BOSS_ROSTER,
  type SandboxBossPrototypeId
} from './sandboxBossRoster';
import {
  ABYSSAL_OCTARCH_ARTWORK_PACKAGE,
  ABYSSAL_OCTARCH_MODULAR_RIG
} from '../pixi/boss-rigs/AbyssalOctarchArtwork';
import type { PreviewBossArtwork } from '../pixi/boss-rigs/PreviewBossRigContracts';

export const BOSS_LAB_PREVIEW_SEED = 'scicon-boss-lab';

export interface BossLabEncounterChoice {
  readonly id: string;
  readonly group: 'campaign' | 'sandbox';
  readonly label: string;
}

export interface BossLabFight {
  readonly id: string;
  readonly campaign: GameCampaignConfig;
  readonly levelId: string;
  readonly waveId: string;
  readonly artwork?: PreviewBossArtwork;
}

interface CampaignBossRef {
  readonly levelId: string;
  readonly waveId: string;
  readonly eventId: string;
}

const classLabel = (bossId: string) => (
  getBossEncounterClass(bossId) === 'elite-enemy' ? 'ELITE' : 'BOSS'
);

const campaignChoices = (): BossLabEncounterChoice[] => {
  const choices: BossLabEncounterChoice[] = [];
  for (const level of flattenLevels()) {
    const mission = String(level.order).padStart(2, '0');
    for (const wave of [...level.waves].sort((left, right) => left.order - right.order)) {
      for (const event of wave.events) {
        if (event.kind !== 'boss') continue;
        choices.push({
          id: `campaign:${level.id}:${wave.id}:${event.id}`,
          group: 'campaign',
          label: `M${mission} · ${classLabel(event.bossId)} · ${event.label}`
        });
      }
    }
  }
  return choices;
};

const sandboxChoices = (): BossLabEncounterChoice[] => (
  SANDBOX_BOSS_ROSTER.map((prototype) => ({
    id: `sandbox:${prototype.id}`,
    group: 'sandbox' as const,
    label: `${prototype.encounterClass === 'mini-boss' ? 'MINI' : 'BOSS'} · ${prototype.label}`
  }))
);

let cachedChoices: readonly BossLabEncounterChoice[] | null = null;

/** Labels for every current campaign boss and sandbox encounter. No fight is built here. */
export const listBossLabEncounterChoices = (): readonly BossLabEncounterChoice[] => {
  if (!cachedChoices) {
    cachedChoices = Object.freeze([...campaignChoices(), ...sandboxChoices()]);
  }
  return cachedChoices;
};

const parseCampaignRef = (id: string): CampaignBossRef | null => {
  const match = /^campaign:([^:]+):([^:]+):(.+)$/.exec(id);
  if (!match) return null;
  return { levelId: match[1], waveId: match[2], eventId: match[3] };
};

const isolateCampaignBoss = ({
  levelId,
  waveId,
  eventId
}: CampaignBossRef): GameCampaignConfig => {
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

const buildCampaignFight = (id: string, ref: CampaignBossRef): BossLabFight => {
  const campaign = isolateCampaignBoss(ref);
  return { id, campaign, levelId: ref.levelId, waveId: ref.waveId };
};

const buildSandboxFight = (id: string, prototypeId: SandboxBossPrototypeId): BossLabFight => {
  const preview = buildSandboxBossEncounter(DEFAULT_GAME_CAMPAIGN, prototypeId);
  return {
    id,
    campaign: preview.campaign,
    levelId: preview.levelId,
    waveId: preview.waveId,
    ...(prototypeId === 'abyssal-octarch'
      ? { artwork: abyssalArtwork(preview.eventId) }
      : {})
  };
};

let activeFight: BossLabFight | null = null;

/** Builds one selected fight. A later selection replaces the previous campaign clone. */
export const buildBossLabFight = (id: string): BossLabFight => {
  if (activeFight?.id === id) return activeFight;
  const campaignRef = parseCampaignRef(id);
  if (campaignRef) {
    activeFight = buildCampaignFight(id, campaignRef);
    return activeFight;
  }
  const prototypeId = id.startsWith('sandbox:')
    ? id.slice('sandbox:'.length) as SandboxBossPrototypeId
    : null;
  if (prototypeId && SANDBOX_BOSS_ROSTER.some((entry) => entry.id === prototypeId)) {
    activeFight = buildSandboxFight(id, prototypeId);
    return activeFight;
  }
  throw new Error(`Boss lab has no encounter ${id}`);
};
