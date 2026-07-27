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

test('Campaign Map launches whole Missions from Wave 1 without a saved-Wave CTA', () => {
  assert.match(mapSource, /waveId: selectedMission\.waveIds\[0\]/);
  assert.doesNotMatch(mapSource, /Continue Wave/);
  assert.doesNotMatch(mapSource, /waveId: selectedMission\.waveIds\[checkpointWaveIndex\]/);
  assert.match(mapSource, /Current Mission/);
});

test('Home map and boss commands use icon-only buttons with shared new-item attention', () => {
  assert.match(startScreenSource, /data-campaign-map-trigger="true"[\s\S]*?data-attention=\{campaignNotificationCount > 0 \? 'true' : 'false'\}/);
  assert.match(startScreenSource, /sci-home-command-icon__art--map/);
  assert.doesNotMatch(startScreenSource, />\s*Map\s*<\/span>/);
  assert.match(homeStyles, /\.sci-home-command-icon \{[\s\S]*?border: 0;[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;/);
  assert.match(homeStyles, /\.sci-home-command-icon\[data-attention='true'\] \.sci-home-command-icon__art \{[\s\S]*?sci-home-command-attention-art/);
  assert.match(homeStyles, /drop-shadow\(0 0 0\.72rem rgb\(250 204 21 \/ 0\.96\)\)/);
  assert.match(homeStyles, /prefers-reduced-motion: reduce[\s\S]*?\.sci-home-command-icon\[data-attention='true'\] \.sci-home-command-icon__art[\s\S]*?animation: none !important/);
});

test('Campaign developer controls expose Wave, Mission, and full-map result previews', () => {
  assert.match(mapSource, /onPreviewResult: \(missionId: string, waveId: string, stageComplete: boolean\) => void/);
  assert.match(mapSource, />Preview Wave result<\/button>/);
  assert.match(mapSource, />Preview Mission result<\/button>/);
  assert.match(mapSource, />Simulate 20-Mission map<\/button>/);
});
