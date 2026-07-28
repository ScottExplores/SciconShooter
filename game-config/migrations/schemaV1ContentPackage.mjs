import { hashJson } from '../compiler/contentPackage.mjs';

const isRecord = (value) => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const cloneJson = (value) => JSON.parse(JSON.stringify(value));

const assertSchemaV1CampaignShape = (campaign) => {
  const errors = [];
  if (!isRecord(campaign)) errors.push('campaign must be an object');
  else {
    if (campaign.schemaVersion !== 1) errors.push('campaign schemaVersion must be 1');
    if (typeof campaign.id !== 'string' || !campaign.id) errors.push('campaign id is required');
    if (!Number.isInteger(campaign.revision)) errors.push('campaign revision must be an integer');
    if (!Array.isArray(campaign.levels)) errors.push('campaign levels must be an array');
    else campaign.levels.forEach((mission, missionIndex) => {
      if (!isRecord(mission) || typeof mission.id !== 'string' || !mission.id) {
        errors.push(`levels/${missionIndex} must have an id`);
        return;
      }
      if (!Array.isArray(mission.waves)) {
        errors.push(`levels/${missionIndex}/waves must be an array`);
        return;
      }
      mission.waves.forEach((wave, waveIndex) => {
        if (!isRecord(wave) || typeof wave.id !== 'string' || !wave.id) {
          errors.push(`levels/${missionIndex}/waves/${waveIndex} must have an id`);
          return;
        }
        if (!Array.isArray(wave.events)) {
          errors.push(`levels/${missionIndex}/waves/${waveIndex}/events must be an array`);
          return;
        }
        wave.events.forEach((event, eventIndex) => {
          if (!isRecord(event) || typeof event.id !== 'string' || !event.id) {
            errors.push(
              `levels/${missionIndex}/waves/${waveIndex}/events/${eventIndex} must have an id`
            );
          }
        });
      });
    });
  }
  if (errors.length) {
    const error = new TypeError(`Cannot decompile schema-v1 campaign: ${errors.join('; ')}`);
    error.errors = errors;
    throw error;
  }
};

export const decompileSchemaV1Campaign = (campaign) => {
  assertSchemaV1CampaignShape(campaign);
  const source = cloneJson(campaign);
  const campaignFieldOrder = Object.keys(source);
  const { levels, ...campaignMetadata } = source;
  const missions = [];
  const waves = [];
  const bosses = [];

  levels.forEach((mission) => {
    const { waves: missionWaves, ...missionPayload } = mission;
    missions.push({
      schemaVersion: 1,
      kind: 'mission',
      id: mission.id,
      payload: missionPayload,
      waveIds: missionWaves.map((wave) => wave.id)
    });

    missionWaves.forEach((wave) => {
      const { events: waveEvents, ...wavePayload } = wave;
      waves.push({
        schemaVersion: 1,
        kind: 'wave',
        id: wave.id,
        missionId: mission.id,
        payload: wavePayload,
        eventIds: waveEvents.map((event) => event.id),
        events: waveEvents.filter((event) => event.kind !== 'boss')
      });
      waveEvents.filter((event) => event.kind === 'boss').forEach((event) => {
        bosses.push({
          schemaVersion: 1,
          kind: 'boss-event',
          id: event.id,
          missionId: mission.id,
          waveId: wave.id,
          payload: event
        });
      });
    });
  });

  return {
    manifest: {
      schemaVersion: 1,
      kind: 'scicon-game-content-package',
      sourceCampaignSchemaVersion: 1,
      sourceCampaignId: campaign.id,
      sourceCampaignRevision: campaign.revision,
      sourceCampaignHash: hashJson(campaign),
      campaignFieldOrder,
      missionIds: levels.map((mission) => mission.id)
    },
    campaign: campaignMetadata,
    missions,
    waves,
    bosses
  };
};

export const migrateSchemaV1CampaignToContentPackage = decompileSchemaV1Campaign;
