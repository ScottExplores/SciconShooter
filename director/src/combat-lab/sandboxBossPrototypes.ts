import type { GameCampaignConfig } from '@game/game-config/types';
import type { CombatLabPreviewResult } from './experimentModel';
import {
  SANDBOX_BOSS_ROSTER,
  type SandboxBossPrototypeId,
  type SandboxBossEncounterPreview,
  type SandboxEncounterCategoryId,
  type SandboxMiniBossEncounterMetadata
} from '@game/services/gameplay/sandboxBossRoster';

export type {
  SandboxBossPrototypeId,
  SandboxEncounterCategoryId,
  SandboxMiniBossEncounterMetadata
};

export interface SandboxBossPrototypeProvenance {
  readonly schemaVersion: 1;
  readonly source: 'director-sandbox-prototype';
  readonly sandboxOnly: true;
  readonly promotionAllowed: false;
  readonly prototypeId: SandboxBossPrototypeId;
  readonly prototypeHash: string;
  readonly previewHash: string;
}

export interface SandboxBossPrototypePreview extends CombatLabPreviewResult {
  readonly sandboxPrototype: SandboxBossPrototypeProvenance;
}

export interface SandboxBossPrototypeDescriptor {
  readonly id: SandboxBossPrototypeId;
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
  readonly designIntent: readonly string[];
  readonly sandboxOnly: true;
  readonly encounterClass: 'full-boss' | 'mini-boss';
  readonly miniBoss?: SandboxMiniBossEncounterMetadata;
  readonly prototypeHash: string;
  buildPreview(sourceCampaign: GameCampaignConfig): SandboxBossPrototypePreview;
}

const DIRECTOR_SANDBOX_LIMITATIONS = Object.freeze([
  'Director Sandbox fixture only; it cannot be promoted or applied to the Mission Builder workspace.',
  'The preview reuses a source wave ID only as an in-memory host for the canonical GameEditorCanvas path.'
]);

const toDirectorPreview = (
  preview: SandboxBossEncounterPreview,
  prototypeId: SandboxBossPrototypeId,
  prototypeHash: string
): SandboxBossPrototypePreview => ({
  campaign: preview.campaign,
  focus: preview.focus,
  levelId: preview.levelId,
  waveId: preview.waveId,
  eventId: preview.eventId,
  previewWave: preview.previewWave,
  limitations: DIRECTOR_SANDBOX_LIMITATIONS,
  sandboxPrototype: Object.freeze({
    schemaVersion: 1,
    source: 'director-sandbox-prototype',
    sandboxOnly: true,
    promotionAllowed: false,
    prototypeId,
    prototypeHash,
    previewHash: preview.previewHash
  })
});

export const SANDBOX_BOSS_PROTOTYPES: readonly SandboxBossPrototypeDescriptor[] = Object.freeze(
  SANDBOX_BOSS_ROSTER.map((entry) => Object.freeze({
    id: entry.id,
    label: entry.label,
    shortLabel: entry.shortLabel,
    description: entry.description,
    designIntent: entry.designIntent,
    sandboxOnly: entry.sandboxOnly,
    encounterClass: entry.encounterClass,
    ...(entry.miniBoss ? { miniBoss: entry.miniBoss } : {}),
    prototypeHash: entry.prototypeHash,
    buildPreview: (sourceCampaign: GameCampaignConfig) => (
      toDirectorPreview(entry.buildEncounter(sourceCampaign), entry.id, entry.prototypeHash)
    )
  }))
);

export const SANDBOX_BOSS_PROTOTYPE_BY_ID = Object.freeze(
  Object.fromEntries(SANDBOX_BOSS_PROTOTYPES.map((prototype) => [prototype.id, prototype]))
) as Readonly<Record<SandboxBossPrototypeId, SandboxBossPrototypeDescriptor>>;

export const buildSandboxBossPrototypePreview = (
  sourceCampaign: GameCampaignConfig,
  prototypeId: SandboxBossPrototypeId
): SandboxBossPrototypePreview => (
  SANDBOX_BOSS_PROTOTYPE_BY_ID[prototypeId].buildPreview(sourceCampaign)
);
