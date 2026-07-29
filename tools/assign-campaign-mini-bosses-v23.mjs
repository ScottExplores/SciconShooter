import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyCampaignMiniBossAssignments } from './campaign-mini-boss-authoring.mjs';

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const campaignPath = path.resolve(toolsDir, '..', 'game-config', 'campaign.json');
const campaign = JSON.parse(await fs.readFile(campaignPath, 'utf8'));

applyCampaignMiniBossAssignments(campaign);
await fs.writeFile(campaignPath, `${JSON.stringify(campaign, null, 2)}\n`, 'utf8');

console.log(`Assigned ${campaign.miniBosses.length} Campaign mini-bosses across ${campaign.sectors.length} sectors.`);
