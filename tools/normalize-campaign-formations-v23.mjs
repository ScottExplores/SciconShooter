import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeCampaignFormationAuthoring } from './campaign-formation-authoring.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const campaignPath = path.join(repositoryRoot, 'game-config', 'campaign.json');
const campaign = JSON.parse(await readFile(campaignPath, 'utf8'));
const summary = normalizeCampaignFormationAuthoring(campaign);

await writeFile(campaignPath, `${JSON.stringify(campaign, null, 2)}\n`, 'utf8');

console.log(
  `Normalized ${summary.groupedSpawnCount} grouped Campaign spawns: `
  + `${summary.declarationChanges.length} Wave declarations and `
  + `${summary.cooldownChanges.length} role cooldowns updated.`
);
