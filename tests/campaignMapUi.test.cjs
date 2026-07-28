const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const mapSource = read('components/CampaignMap.tsx');
const mapStyles = read('components/campaign-map.css');
const startScreenSource = read('components/StartScreen.tsx');
const homeStyles = read('styles/tailwind.input.css');
const campaign = JSON.parse(read('game-config/campaign.json'));

test('Campaign Map reveals configured boss and environment details without generic substitutions', () => {
  assert.match(mapSource, /selectedMission\.bossName \?\? 'Boss encounter'/);
  assert.match(mapSource, /Environment \/ \{formatTheme\(selectedMission\.backgroundId\)\}/);
});

test('Campaign Map polls a connected gamepad for navigation and close controls', () => {
  assert.match(mapSource, /typeof navigator\.getGamepads !== 'function'/);
  assert.match(mapSource, /Array\.from\(navigator\.getGamepads\(\)\)\.find\(Boolean\)/);
  assert.match(mapSource, /pad\?\.buttons\[12\]\?\.pressed \|\| pad\?\.buttons\[15\]\?\.pressed/);
  assert.match(mapSource, /pad\?\.buttons\[13\]\?\.pressed \|\| pad\?\.buttons\[14\]\?\.pressed/);
  assert.match(mapSource, /pad\?\.buttons\[1\]\?\.pressed/);
});

test('Campaign Map respects mobile safe areas at the shell, header, and scrolling detail panel', () => {
  assert.match(mapStyles, /\.campaign-map-overlay[\s\S]*?env\(safe-area-inset-top\)[\s\S]*?env\(safe-area-inset-right\)[\s\S]*?env\(safe-area-inset-bottom\)[\s\S]*?env\(safe-area-inset-left\)/);
  assert.match(mapStyles, /\.campaign-map-header[\s\S]*?env\(safe-area-inset-top\)[\s\S]*?env\(safe-area-inset-right\)[\s\S]*?env\(safe-area-inset-left\)/);
  assert.match(mapStyles, /\.campaign-map-selection[\s\S]*?env\(safe-area-inset-bottom\)/);
});

test('Campaign Map offers a one-tap return after manual route exploration', () => {
  assert.match(mapSource, /onScroll=\{refreshCurrentMissionDistance\}/);
  assert.match(mapSource, /selectedMission\.id !== progress\.recommendedMissionId \|\| routeAwayFromCurrent/);
  assert.match(mapSource, /requestAnimationFrame\(\(\) => centerMissionNode\(progress\.recommendedMissionId\)\)/);
});

test('Campaign Map launches the real saved wave checkpoint while replay Missions start from Wave 1', () => {
  assert.match(mapSource, /selectedMission\.id === progress\.recommendedMissionId/);
  assert.match(mapSource, /selectedMission\.waveIds\.includes\(progress\.recommendedWaveId\)/);
  assert.match(mapSource, /waveId: selectedLaunchWaveId \?\? selectedMission\.waveIds\[0\]/);
  assert.match(mapSource, /Current Mission/);
});

test('Campaign Map derives every five-Mission sector and theme from authored data', () => {
  assert.equal(campaign.sectors.length, 4);
  campaign.sectors.forEach((sector) => assert.equal(sector.missionIds.length, 5));
  assert.match(mapSource, /DEFAULT_GAME_CAMPAIGN\.sectors/);
  assert.match(mapSource, /DEFAULT_GAME_CAMPAIGN\.visualThemes\.find/);
  assert.doesNotMatch(mapSource, /\{ id: 'sector-open-orbit'/);
  assert.match(mapSource, /data-sector-id=\{sector\.id\}/);
  assert.match(mapSource, /data-mission-role=\{missionRole\}/);
  assert.match(mapSource, /campaign-map-node--role-\$\{missionRole\}/);
  assert.match(mapStyles, /\.campaign-map-sector[\s\S]*?--campaign-sector-accent/);
  assert.match(mapStyles, /\.campaign-map-node--role-elite-checkpoint/);
  assert.match(mapStyles, /\.campaign-map-node--role-major-boss/);
});

test('Campaign Map shows real per-wave progress rather than treating an unlocked Mission as complete', () => {
  assert.match(mapSource, /completedWaveIds = new Set/);
  assert.match(mapSource, /selectedState\.completedWaveIds\.has\(wave\.id\)/);
  assert.match(mapSource, /selectedState\.unlockedWaveIds\.has\(wave\.id\)/);
  assert.match(mapSource, /progress\.recommendedWaveId === wave\.id/);
  assert.match(mapSource, /campaign-map-node-progress/);
});

test('Campaign Map exposes power guidance, support roles, rewards, and a separate mastery set bonus', () => {
  assert.match(mapSource, /campaign-map-power-guide/);
  assert.match(mapSource, />Minimum</);
  assert.match(mapSource, />Expected</);
  assert.match(mapSource, />Comfortable</);
  assert.match(mapSource, /campaign-map-support-tags/);
  assert.match(mapSource, /3-star mastery set/);
});

test('locked boss nodes use their canonical preview only as a silhouette and never substitute another boss', () => {
  assert.match(mapSource, /missionRole === 'major-boss'[\s\S]*?mission\.bossId[\s\S]*?mission\.previewUrl/);
  assert.match(mapSource, /!nodeState\.completed[\s\S]*?missionRole === 'major-boss'/);
  assert.match(mapSource, /!selectedState\?\.completed[\s\S]*?getCampaignMissionRole\(selectedMission\) === 'major-boss'/);
  assert.match(mapSource, /className=\{showLockedBossSilhouette \? 'campaign-map-node-boss-silhouette'/);
  assert.match(mapSource, /selectedLockedBossSilhouette/);
  assert.match(mapSource, /selectedMission\.bossEventId && selectedState\.completed/);
  assert.match(mapSource, /campaign-map-encrypted-symbol/);
  assert.doesNotMatch(mapSource, /final-boss-sentinel/);
  assert.doesNotMatch(mapSource, /bosses\/.*\?\?/);
});

test('Home map and boss commands use icon-only buttons with shared new-item attention', () => {
  assert.match(startScreenSource, /data-campaign-map-trigger="true"[\s\S]*?data-attention=\{campaignNotificationCount > 0 \? 'true' : 'false'\}/);
  assert.match(startScreenSource, /sci-home-command-icon__art--map/);
  assert.match(startScreenSource, /grid-cols-\[clamp\(3\.25rem,14vw,3\.6rem\)_minmax\(0,1fr\)_clamp\(3\.25rem,14vw,3\.6rem\)\]/);
  assert.match(startScreenSource, /data-boss-archive-wallet-slot="true"[\s\S]*?col-start-2/);
  assert.match(startScreenSource, /data-campaign-map-trigger="true"[\s\S]*?col-start-3[\s\S]*?justify-self-end/);
  assert.match(startScreenSource, /boss-archive-defeated-emblem-v1\.png/);
  assert.doesNotMatch(startScreenSource, /src="\/game-art\/bosses\/final-boss-sentinel\.png"/);
  assert.doesNotMatch(startScreenSource, /M\{String\(campaignCheckpoint\.missionNumber\)\.padStart\('2', '0'\)\}/);
  assert.doesNotMatch(startScreenSource, />\s*Map\s*<\/span>/);
  assert.match(homeStyles, /\.sci-home-command-icon \{[\s\S]*?border: 0;[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;/);
  assert.match(homeStyles, /\.sci-home-command-icon\[data-attention='true'\] \.sci-home-command-icon__art \{[\s\S]*?sci-home-command-attention-art/);
  assert.match(homeStyles, /drop-shadow\(0 0 0\.72rem rgb\(250 204 21 \/ 0\.96\)\)/);
  assert.match(homeStyles, /prefers-reduced-motion: reduce[\s\S]*?\.sci-home-command-icon\[data-attention='true'\] \.sci-home-command-icon__art[\s\S]*?animation: none !important/);
});

test('Home Campaign calls require an authored dynamic checkpoint and never fall back to three waves', () => {
  assert.match(startScreenSource, /campaignCheckpoint: \{/);
  assert.doesNotMatch(startScreenSource, /campaignCheckpoint\?: \{/);
  assert.doesNotMatch(startScreenSource, /waveTotal:\s*3/);
});

test('short and narrow mobile Campaign details preserve objectives and support guidance', () => {
  const shortViewportStyles = mapStyles.slice(mapStyles.indexOf('@media (max-height: 740px)'));
  assert.doesNotMatch(shortViewportStyles, /\.campaign-map-objectives\s*\{[\s\S]*?display:\s*none/);
  assert.doesNotMatch(shortViewportStyles, /\.campaign-map-support-tags\s*\{[\s\S]*?display:\s*none/);
  assert.match(mapStyles, /@media \(max-width: 350px\)[\s\S]*?\.campaign-map-selection-topline[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(mapStyles, /\.campaign-map-selection-topline > :last-child[\s\S]*?grid-column: 1 \/ -1/);
});

test('Campaign developer controls expose Wave, Mission, and full-map result previews', () => {
  assert.match(mapSource, /onPreviewResult: \(missionId: string, waveId: string, stageComplete: boolean\) => void/);
  assert.match(mapSource, />Preview Wave result<\/button>/);
  assert.match(mapSource, />Preview Mission result<\/button>/);
  assert.match(mapSource, />Simulate 20-Mission map<\/button>/);
});

test('Campaign Lab renders only for an enabled founder control object and guards stale direct actions', () => {
  assert.match(mapSource, /export const runCampaignMapDeveloperAction = \(/);
  assert.match(mapSource, /if \(!controls\?\.enabled\) return false;/);
  assert.match(mapSource, /\{developerControls\?\.enabled \? \([\s\S]*?data-campaign-lab-authorized="true"/);
  const labSource = mapSource.slice(mapSource.indexOf('data-campaign-lab-authorized="true"'));
  assert.doesNotMatch(labSource, /onClick=\{developerControls\./);
  assert.doesNotMatch(labSource, /onChange=\{\(event\) => developerControls\./);
  assert.match(labSource, /onClick=\{\(\) => runCampaignMapDeveloperAction\(developerControls/);
  assert.match(labSource, /onChange=\{\(event\) => runCampaignMapDeveloperAction\(developerControls/);
});

test('Campaign Lab exposes the complete founder route, loadout, runtime, and claim harness', () => {
  assert.match(mapSource, />\s*Sector\s*</);
  assert.match(mapSource, />\s*Mission\s*</);
  assert.match(mapSource, />\s*Internal wave\s*</);
  assert.match(mapSource, />\s*Ship\s*</);
  assert.match(mapSource, />\s*Support\s*</);
  assert.match(mapSource, /CampaignLabUpgradeTrack/);
  assert.match(mapSource, /\['low-power', 'expected-power', 'upgraded'\]/);
  assert.match(mapSource, />Launch selected Mission<\/button>/);
  assert.match(mapSource, />Restart formation<\/button>/);
  assert.match(mapSource, /'Stop formation loop' : 'Loop formation'/);
  assert.match(mapSource, />Skip to mini-boss<\/button>/);
  assert.match(mapSource, />Skip to major boss<\/button>/);
  assert.match(mapSource, />Apply node preview<\/button>/);
  assert.match(mapSource, />Test star claim<\/button>/);
  assert.match(mapSource, />Test reward claim<\/button>/);
  assert.match(mapSource, /<option value="hidden">Hidden<\/option>/);
  assert.match(mapSource, /<option value="completed">Completed<\/option>/);
  assert.match(mapSource, /<option value="claimed">Claimed<\/option>/);
  assert.match(mapSource, /const applyCampaignNodePreview = \(/);
  assert.match(mapSource, /const applyCampaignBranchPreview = \(/);
  assert.match(mapSource, /const nodeState = getDisplayedMissionState\(mission\)/);
  assert.match(mapSource, /const branchState = getDisplayedBranchState\(branch\)/);
});

test('Campaign Lab presents authored encounter and live performance telemetry with safe placeholders', () => {
  assert.match(mapSource, /export interface CampaignLabTelemetry/);
  assert.match(mapSource, />Encounter budget<\/small>/);
  assert.match(mapSource, />Threat cap \/ spent<\/small>/);
  assert.match(mapSource, />Pack \/ active threat<\/small>/);
  assert.match(mapSource, />Enemy roles<\/small>/);
  assert.match(mapSource, />Active wave<\/small>/);
  assert.match(mapSource, />Active formation<\/small>/);
  assert.match(mapSource, />Projectiles P \/ E<\/small>/);
  assert.match(mapSource, />Clear time<\/small>/);
  assert.match(mapSource, />Damage received<\/small>/);
  assert.match(mapSource, />Player DPS<\/small>/);
  assert.match(mapSource, />Enemy average TTK<\/small>/);
  assert.match(mapSource, />FPS \/ frame<\/small>/);
  assert.match(mapSource, /\['No performance flags'\]/);
  assert.match(mapStyles, /\.campaign-map-devtools__telemetry/);
  assert.match(mapStyles, /@media \(max-width: 520px\)[\s\S]*?\.campaign-map-devtools__grid,[\s\S]*?\.campaign-map-devtools__telemetry/);
});
