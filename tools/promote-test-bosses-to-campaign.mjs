import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const toolDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(toolDirectory, '..');
const campaignPath = path.join(repositoryRoot, 'game-config', 'campaign.json');
const checkOnly = process.argv.includes('--check');

const promotionTargets = Object.freeze([
  Object.freeze({
    missionOrder: 15,
    prototypeId: 'prism-moth-brood',
    spriteKey: 'CAMPAIGN_BOSS_PRISM_MOTH'
  }),
  Object.freeze({
    missionOrder: 20,
    prototypeId: 'frontier-crownclaw',
    spriteKey: 'CAMPAIGN_BOSS_FRONTIER_CROWNCLAW'
  }),
  Object.freeze({
    missionOrder: 25,
    prototypeId: 'helios-clawcarrier',
    spriteKey: 'CAMPAIGN_BOSS_HELIOS_CLAWCARRIER'
  }),
  Object.freeze({
    missionOrder: 30,
    prototypeId: 'nullwake-revenant',
    spriteKey: 'CAMPAIGN_BOSS_NULLWAKE_REVENANT'
  }),
  Object.freeze({
    missionOrder: 40,
    prototypeId: 'aurora-storm-engine',
    spriteKey: 'CAMPAIGN_BOSS_ORBIT_GYROSCOPE'
  }),
  Object.freeze({
    missionOrder: 45,
    prototypeId: 'gloamforge-mantis',
    spriteKey: 'CAMPAIGN_BOSS_HAMMERHEAD_SIEGE'
  }),
  Object.freeze({
    missionOrder: 50,
    prototypeId: 'umbra-needlewing',
    spriteKey: 'CAMPAIGN_BOSS_UMBRA_NEEDLEWING'
  })
]);

const stableCampaignEventKeys = Object.freeze([
  'id',
  'startSeconds',
  'durationSeconds',
  'delayAfterSeconds',
  'blocksWaveClock',
  'scoreReward',
  'powerupDropChance'
]);

const clone = (value) => JSON.parse(JSON.stringify(value));

const findCampaignBoss = (campaign, missionOrder) => {
  const level = campaign.levels.find((candidate) => candidate.order === missionOrder);
  if (!level) throw new Error(`Campaign Mission ${missionOrder} is missing.`);

  let located = null;
  for (const wave of level.waves) {
    const eventIndex = wave.events.findIndex((event) => event.kind === 'boss');
    if (eventIndex < 0) continue;
    if (located) {
      throw new Error(`Campaign Mission ${missionOrder} contains multiple boss events.`);
    }
    located = { level, wave, eventIndex, event: wave.events[eventIndex] };
  }
  if (!located) throw new Error(`Campaign Mission ${missionOrder} has no boss event.`);
  return located;
};

const synchronizeCampaignRosterReferences = (campaign, level, bossId) => {
  const sector = campaign.sectors.find((candidate) => (
    candidate.missionIds.includes(level.id)
  ));
  if (!sector || sector.missionIds.at(-1) !== level.id) {
    throw new Error(`${level.id} is not a sector-finale Mission.`);
  }
  sector.majorBossId = bossId;

  const graphNode = campaign.campaignGraph.nodes.find((candidate) => (
    candidate.missionDefinitionId === level.id
  ));
  if (!graphNode) throw new Error(`${level.id} is missing its Campaign graph node.`);
  graphNode.bossId = bossId;
};

const buildPromotedCampaign = async (sourceCampaign) => {
  const campaign = clone(sourceCampaign);
  const vite = await createServer({
    root: repositoryRoot,
    configFile: false,
    resolve: {
      alias: {
        '@game': repositoryRoot,
        '@director': path.join(repositoryRoot, 'director', 'src')
      }
    },
    server: { middlewareMode: true, hmr: false },
    appType: 'custom'
  });

  try {
    const prototypeModule = await vite.ssrLoadModule(
      '/director/src/combat-lab/sandboxBossPrototypes.ts'
    );
    const economyModule = await vite.ssrLoadModule(
      '/services/campaignBossEconomy.ts'
    );
    const economyByMission = economyModule.CAMPAIGN_BOSS_ECONOMY_BY_MISSION;

    // These encounters keep their existing authored behavior while receiving
    // the same monotonic Mission-economy hull treatment as promoted Test Bosses.
    for (const missionOrder of [5, 10, 35]) {
      const economy = economyByMission[missionOrder];
      const located = findCampaignBoss(campaign, missionOrder);
      if (located.event.bossId !== economy.bossId) {
        throw new Error(
          `M${missionOrder} expected ${economy.bossId}, found ${located.event.bossId}.`
        );
      }
      located.event.health = economy.hullHealth;
      if (economy.componentHealth) {
        located.event.componentHealth = clone(economy.componentHealth);
      } else {
        delete located.event.componentHealth;
      }
    }

    for (const target of promotionTargets) {
      const economy = economyByMission[target.missionOrder];
      const located = findCampaignBoss(campaign, target.missionOrder);
      const preview = prototypeModule.buildSandboxBossPrototypePreview(
        sourceCampaign,
        target.prototypeId
      );
      const prototypeEvent = preview.previewWave.events.find(
        (event) => event.kind === 'boss'
      );
      if (!prototypeEvent) {
        throw new Error(`${target.prototypeId} did not produce a Test Boss event.`);
      }
      if (prototypeEvent.bossId !== economy.bossId) {
        throw new Error(
          `${target.prototypeId} uses ${prototypeEvent.bossId}; expected ${economy.bossId}.`
        );
      }

      const preservedCampaignValues = Object.fromEntries(
        stableCampaignEventKeys
          .filter((key) => Object.prototype.hasOwnProperty.call(located.event, key))
          .map((key) => [key, located.event[key]])
      );
      const promotedEvent = {
        ...clone(prototypeEvent),
        ...preservedCampaignValues,
        bossId: economy.bossId,
        spriteKey: target.spriteKey,
        health: economy.hullHealth
      };

      if (economy.componentHealth) {
        promotedEvent.componentHealth = clone(economy.componentHealth);
        delete promotedEvent.componentMode;
      } else {
        promotedEvent.componentMode = 'hull-only';
        delete promotedEvent.componentHealth;
      }

      located.wave.events[located.eventIndex] = promotedEvent;
      located.level.scorecard.encounterAssetKey = target.spriteKey;
      synchronizeCampaignRosterReferences(campaign, located.level, economy.bossId);
    }

    return campaign;
  } finally {
    await vite.close();
  }
};

const sourceCampaign = JSON.parse(await readFile(campaignPath, 'utf8'));
const promotedCampaign = await buildPromotedCampaign(sourceCampaign);
const sourceComparable = JSON.stringify(sourceCampaign);
const promotedComparable = JSON.stringify(promotedCampaign);

if (checkOnly) {
  if (sourceComparable !== promotedComparable) {
    throw new Error(
      'campaign.json is stale. Run node tools/promote-test-bosses-to-campaign.mjs.'
    );
  }
  console.log('Campaign Test Boss promotion is current.');
} else {
  await writeFile(
    campaignPath,
    `${JSON.stringify(promotedCampaign, null, 2)}\n`,
    'utf8'
  );
  console.log('Promoted Test Boss packages into Campaign Missions 15, 20, 25, 30, 40, 45, and 50.');
}
