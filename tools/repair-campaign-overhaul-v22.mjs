import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repairCampaignOverhaulV22 } from './lib/campaign-overhaul-v22-normalizer.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const campaignPath = path.join(repositoryRoot, 'game-config', 'campaign.json');
const campaign = JSON.parse(await readFile(campaignPath, 'utf8'));

repairCampaignOverhaulV22(campaign);
await writeFile(campaignPath, `${JSON.stringify(campaign, null, 2)}\n`, 'utf8');

console.log(`Repaired Campaign revision ${campaign.revision}: ${campaign.levels.length} Missions.`);
