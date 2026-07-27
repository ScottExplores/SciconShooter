const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const mapSource = read('components/CampaignMap.tsx');
const mapStyles = read('components/campaign-map.css');

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

test('Campaign developer controls expose Wave, Mission, and full-map result previews', () => {
  assert.match(mapSource, /onPreviewResult: \(missionId: string, waveId: string, stageComplete: boolean\) => void/);
  assert.match(mapSource, />Preview Wave result<\/button>/);
  assert.match(mapSource, />Preview Mission result<\/button>/);
  assert.match(mapSource, />Simulate 20-Mission map<\/button>/);
});
