export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface RuntimeEventV1 extends JsonObject {
  id: string;
  kind: string;
}

export interface RuntimeWaveV1 extends JsonObject {
  id: string;
  events: RuntimeEventV1[];
}

export interface RuntimeMissionV1 extends JsonObject {
  id: string;
  waves: RuntimeWaveV1[];
}

export interface RuntimeCampaignV1 extends JsonObject {
  schemaVersion: 1;
  revision: number;
  id: string;
  levels: RuntimeMissionV1[];
}

export interface ContentPackageManifestV1 {
  schemaVersion: 1;
  kind: 'scicon-game-content-package';
  sourceCampaignSchemaVersion: 1;
  sourceCampaignId: string;
  sourceCampaignRevision: number;
  sourceCampaignHash: `sha256:${string}`;
  missionIds: string[];
}

export interface MissionResourceV1 {
  schemaVersion: 1;
  kind: 'mission';
  id: string;
  payload: Omit<RuntimeMissionV1, 'waves'>;
  waveIds: string[];
}

export interface WaveResourceV1 {
  schemaVersion: 1;
  kind: 'wave';
  id: string;
  missionId: string;
  payload: Omit<RuntimeWaveV1, 'events'>;
  eventIds: string[];
  events: RuntimeEventV1[];
}

export interface BossResourceV1 {
  schemaVersion: 1;
  kind: 'boss-event';
  id: string;
  missionId: string;
  waveId: string;
  payload: RuntimeEventV1 & { kind: 'boss' };
}

export interface GameContentPackageV1 {
  manifest: ContentPackageManifestV1;
  campaign: Omit<RuntimeCampaignV1, 'levels'>;
  missions: MissionResourceV1[];
  waves: WaveResourceV1[];
  bosses: BossResourceV1[];
}

export type ContentPackageDiagnosticSeverity = 'error';

export interface ContentPackageDiagnostic {
  severity: ContentPackageDiagnosticSeverity;
  code:
    | 'invalid-package'
    | 'unsupported-schema'
    | 'duplicate-resource-id'
    | 'duplicate-runtime-id'
    | 'payload-id-mismatch'
    | 'forbidden-runtime-field'
    | 'invalid-resource'
    | 'missing-resource-reference'
    | 'duplicate-resource-reference'
    | 'orphan-resource'
    | 'parent-mismatch'
    | 'boss-kind-required';
  path: string;
  message: string;
}

export interface FilesystemContentPackageManifestV1 {
  schemaVersion: 1;
  kind: 'scicon-game-content-package';
  status: 'inactive-foundation';
  authority: 'game-config/campaign.json';
  sourceCampaign: {
    path: 'game-config/campaign.json';
    schemaVersion: 1;
  };
  resources: {
    missions: 'missions';
    waves: 'waves';
    bosses: 'bosses';
  };
  compiler: 'game-config/compiler/index.mjs';
}
