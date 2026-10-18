#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
const root = resolve(import.meta.dirname, '..');
const bundled = await build({ entryPoints: [resolve(root, 'game-config/validate.ts')], bundle: true, platform: 'node', format: 'esm', write: false });
const { validateGameCampaign } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const campaign = JSON.parse(await readFile(resolve(root, process.argv[2] ?? 'game-config/campaign.json'), 'utf8'));
const result = validateGameCampaign(campaign);
if (!result.valid) {
  console.error(JSON.stringify(result.issues, null, 2));
  process.exitCode = 1;
} else console.log(`Campaign valid: ${campaign.levels.length} missions, ${campaign.enemyRoles.length} roles, ${campaign.formationPacks.length} packs.`);
