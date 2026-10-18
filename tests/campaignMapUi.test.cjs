const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const mapSource = read('components/CampaignMap.tsx');
const mapStyles = read('components/campaign-map.css');
const appSource = read('App.tsx');
const startScreenSource = read('components/StartScreen.tsx');
const homeStyles = read('styles/tailwind.input.css');
const campaign = JSON.parse(read('game-config/campaign.json'));

const compiled = esbuild.buildSync({
  stdin: {
    contents: "export { formatCampaignObjectiveLabel } from './components/CampaignMap.tsx';",
    resolveDir: root,
    sourcefile: 'campaign-map-objective-test.ts'
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  external: ['react', 'react-dom'],
  loader: { '.css': 'empty' },
  logLevel: 'silent'
});
const mapModule = { exports: {} };
Function('require', 'module', 'exports', compiled.outputFiles[0].text)(require, mapModule, mapModule.exports);
const { formatCampaignObjectiveLabel } = mapModule.exports;

test('Campaign Map labels configured bosses and elite enemies without restoring the removed environment briefing', () => {
  assert.match(mapSource, /selectedEncounter\.encounterClass === 'boss' \? 'BOSS' : 'ELITE ENEMY'/);
  assert.match(mapSource, /data-encounter-class=\{encounter\?\.encounterClass\}/);
  assert.match(mapSource, /data-encounter-class=\{selectedEncounter\.encounterClass\}/);
  assert.match(mapSource, /selectedEncounter\.name/);
  assert.match(mapStyles, /\.campaign-map-node--elite \.campaign-map-node-core img[\s\S]*?transform: none/);
  assert.match(mapStyles, /\.campaign-map-boss-tag\[data-encounter-class='elite-enemy'\]/);
  assert.doesNotMatch(mapSource, /Environment \/ \{formatTheme\(selectedMission\.backgroundId\)\}/);
});

test('Campaign Map polls a connected gamepad for navigation and close controls', () => {
  assert.match(mapSource, /typeof navigator\.getGamepads !== 'function'/);
  assert.match(mapSource, /Array\.from\(navigator\.getGamepads\(\)\)\.find\(Boolean\)/);
  assert.match(mapSource, /pad\?\.buttons\[12\]\?\.pressed \|\| pad\?\.buttons\[15\]\?\.pressed/);
  assert.match(mapSource, /pad\?\.buttons\[13\]\?\.pressed \|\| pad\?\.buttons\[14\]\?\.pressed/);
  assert.match(mapSource, /pad\?\.buttons\[1\]\?\.pressed/);
});

test('Campaign Map respects mobile safe areas at the shell, header, and scrolling detail panel', () => {
  assert.match(mapStyles, /\.campaign-map-screen[\s\S]*?env\(safe-area-inset-top\)[\s\S]*?env\(safe-area-inset-right\)[\s\S]*?env\(safe-area-inset-bottom\)[\s\S]*?env\(safe-area-inset-left\)/);
  assert.match(mapStyles, /\.campaign-map-screen[\s\S]*?background: #010412;[\s\S]*?isolation: isolate/);
  assert.match(mapStyles, /\.campaign-map-header[\s\S]*?env\(safe-area-inset-top\)[\s\S]*?env\(safe-area-inset-right\)[\s\S]*?env\(safe-area-inset-left\)/);
  assert.match(mapStyles, /\.campaign-map-selection[\s\S]*?env\(safe-area-inset-bottom\)/);
});

test('Campaign Map offers a one-tap return after manual route exploration', () => {
  assert.match(mapSource, /onScroll=\{refreshCurrentMissionDistance\}/);
  assert.match(mapSource, /selectedMission\.id !== progress\.recommendedMissionId \|\| routeAwayFromCurrent/);
  assert.match(mapSource, /requestAnimationFrame\(\(\) => centerMissionNode\(progress\.recommendedMissionId\)\)/);
});

test('an unlocked route selection immediately becomes the visual current node without committing progression', () => {
  assert.match(mapSource, /const mapCurrentMissionId = \([\s\S]*?!selectedBranch[\s\S]*?selectedState\?\.unlocked[\s\S]*?selectedMission\.id : progress\.recommendedMissionId/);
  assert.match(mapSource, /const selectedMapCurrent = Boolean\([\s\S]*?selectedMission\.id === mapCurrentMissionId/);
  assert.match(mapSource, /const mapCurrent = mission\.id === mapCurrentMissionId/);
  assert.match(mapSource, /data-map-current=\{mapCurrent \? 'true' : undefined\}/);
  assert.match(mapSource, /\{mapCurrent \? \([\s\S]*?className="campaign-map-ship-marker"/);
  assert.match(mapSource, /aria-current=\{mapCurrent \? 'step' : undefined\}/);
  assert.match(mapSource, /campaign-map-selection-state--\$\{selectedMapCurrent \? 'current'/);
  assert.match(mapSource, /if \(routeSelectionRequest\) onSelectRoute\?\.\(routeSelectionRequest\)/);
});

test('Campaign Map always starts or retries a Mission from Wave 1', () => {
  assert.match(mapSource, /const selectedLaunchWaveId = selectedMission\?\.waveIds\[0\] \?\? null/);
  assert.match(mapSource, /waveId: selectedLaunchWaveId \?\? selectedMission\.waveIds\[0\]/);
  assert.match(mapSource, /Current Mission/);
});

test('Campaign Map derives all ten five-depth sectors and themes from authored data', () => {
  assert.equal(campaign.sectors.length, 10);
  campaign.sectors.forEach((sector) => {
    assert.equal(sector.missionIds.length, 5);
    assert.equal(sector.mainNodeIds.length, 5);
    assert.equal(sector.routeNodeIds.length, 1);
  });
  assert.match(mapSource, /DEFAULT_GAME_CAMPAIGN\.sectors/);
  // REVAMP(R): Authored sector IDs now resolve through N's shared world palette.
  assert.match(mapSource, /const theme = getSectorTheme\(sector\.id\)/);
  assert.match(mapSource, /accent: worldColorHex\(theme\.accent\)/);
  assert.doesNotMatch(mapSource, /\{ id: 'sector-open-orbit'/);
  assert.match(mapSource, /data-sector-id=\{sector\.id\}/);
  assert.match(mapSource, /data-mission-role=\{missionRole\}/);
  assert.match(mapSource, /campaign-map-node--role-\$\{missionRole\}/);
  assert.match(mapStyles, /\.campaign-map-sector[\s\S]*?--campaign-sector-accent/);
  assert.match(mapStyles, /\.campaign-map-node--role-elite-checkpoint/);
  assert.match(mapStyles, /\.campaign-map-node--role-major-boss/);
});

test('each authored sector places a left and right route on one tier before they rejoin', () => {
  const graphNodesById = new Map(campaign.campaignGraph.nodes.map((node) => [node.nodeId, node]));
  campaign.sectors.forEach((sector) => {
    const entry = graphNodesById.get(sector.mainNodeIds[0]);
    const left = graphNodesById.get(sector.mainNodeIds[1]);
    const right = graphNodesById.get(sector.routeNodeIds[0]);
    const merge = graphNodesById.get(sector.mainNodeIds[2]);
    assert.deepEqual(new Set(entry.outgoingEdges.map((edge) => edge.toNodeId)), new Set([left.nodeId, right.nodeId]));
    assert.equal(left.depth, right.depth);
    assert.ok(left.mapPosition.x < 0.5);
    assert.ok(right.mapPosition.x > 0.5);
    assert.equal(left.rejoinNodeId, merge.nodeId);
    assert.equal(right.rejoinNodeId, merge.nodeId);
    assert.ok(merge.depth > left.depth);
  });
});

test('Campaign Map treats waves as one Mission lineup instead of durable checkpoints', () => {
  assert.match(mapSource, /const completedWaveIds = new Set\(completed \? mission\.waveIds : \[\]\)/);
  assert.match(mapSource, /const unlockedWaveIds = new Set\(unlocked \? mission\.waveIds : \[\]\)/);
  assert.doesNotMatch(mapSource, /progress\.recommendedWaveId === wave\.id/);
  assert.doesNotMatch(mapSource, /campaign-map-node-progress/);
});

test('Campaign Map keeps only personal best score and time beside its three-star reward list', () => {
  assert.doesNotMatch(mapSource, /campaign-map-role-line/);
  assert.doesNotMatch(mapSource, /campaign-map-wave-list/);
  assert.doesNotMatch(mapSource, /campaign-map-loadout-guide/);
  assert.doesNotMatch(mapSource, /campaign-map-power-guide/);
  assert.doesNotMatch(mapSource, /campaign-map-support-tags/);
  const personalRecords = mapSource.match(/<div className="campaign-map-records campaign-map-records--personal">([\s\S]*?)<\/div>/)?.[1];
  assert.ok(personalRecords, 'selected Mission includes a personal-records panel');
  assert.deepEqual(
    [...personalRecords.matchAll(/<small>([^<]+)<\/small>/g)].map((match) => match[1]),
    ['Best score', 'Best time']
  );
  assert.match(mapSource, /campaign-map-selection-stars/);
  assert.match(mapSource, /className="campaign-map-objectives" role="list" aria-label="Mission star rewards"/);
  assert.match(mapSource, /role="listitem" className=\{`campaign-map-objective \$\{earned \? 'is-earned' : ''\}`\}/);
  assert.ok(
    mapSource.indexOf('className="campaign-map-objectives"') < mapSource.indexOf('campaign-map-records--personal'),
    'three-star rewards should precede the compact personal records'
  );
  assert.doesNotMatch(mapSource, /<span><small>Stars<\/small><strong>/);
  assert.doesNotMatch(mapSource, /Base clear|Replay total|First-clear bonus|Boss first-clear|3-star mastery set/);
});

test('each star reward has a visible star, token payout, and accessible full objective', () => {
  assert.match(mapSource, /CAMPAIGN_TOKEN_ICON_URL = '\/game-art\/generated\/rsc-coin-flip-v1\/rsc-coin-pixel-front\.png'/);
  assert.match(mapSource, /className="campaign-map-objective__star" aria-hidden="true"/);
  assert.match(mapSource, /aria-label=\{`Star \$\{index \+ 1\}: \$\{toTokenTerminology\(objective\.label\)\}/);
  assert.match(mapSource, /aria-label=\{`\$\{formatTokenAmount\(objective\.rewardCoins\)\} reward`\}/);
  assert.match(mapSource, /<img src=\{CAMPAIGN_TOKEN_ICON_URL\} alt="" aria-hidden="true" draggable=\{false\} \/>/);
  assert.match(mapSource, /className="campaign-map-objective__label">\{formatCampaignObjectiveLabel\(objective\)\}/);
  assert.match(mapStyles, /\.campaign-map-objective__star\s*\{/);
  assert.match(mapStyles, /\.campaign-map-objectives em img\s*\{[^}]*width: 1\.35rem;[^}]*image-rendering: pixelated/);
});

test('compact objective labels preserve every authored kind and its exact threshold without mutating input', () => {
  const cases = [
    ['complete', 1, 'Clear mission'],
    ['damage-at-most', 0, 'No damage'],
    ['damage-at-most', 1, '≤ 1 damage'],
    ['damage-at-most', 2.5, '≤ 2.5 damage'],
    ['coins-at-least', 0, 'Collect 0 Tokens'],
    ['coins-at-least', 12500, `Collect ${(12500).toLocaleString()} Tokens`],
    ['score-at-least', 0, 'Score 0'],
    ['score-at-least', 27500, `Score ${(27500).toLocaleString()}`],
    ['time-at-most', 0, 'Clear in ≤ 0s'],
    ['time-at-most', 75, 'Clear in ≤ 75s'],
    ['time-at-most', 45.5, 'Clear in ≤ 45.5s']
  ];
  for (const [kind, target, expected] of cases) {
    const objective = {
      id: `test:${kind}:${target}`,
      kind,
      target,
      label: 'The original detailed Mission objective',
      rewardCoins: 60
    };
    const original = { ...objective };
    assert.equal(formatCampaignObjectiveLabel(Object.freeze(objective)), expected, `${kind} with target ${target}`);
    assert.deepEqual(objective, original, 'display formatting must not change the persisted objective or reward');
  }
});

test('unknown future objective kinds retain authored copy with current Token terminology', () => {
  const objective = Object.freeze({
    id: 'test:future', kind: 'future-objective', target: 3,
    label: 'Recover 3 research coins without using a bomb', rewardCoins: 75
  });
  assert.equal(formatCampaignObjectiveLabel(objective), 'Recover 3 Tokens without using a bomb');
  assert.equal(objective.label, 'Recover 3 research coins without using a bomb');
});

test('locked boss and elite nodes preserve encounter class while encrypting their identity', () => {
  assert.match(mapSource, /const bossPreviewUrl = mission\.bossPreview\?\.previewUrl \?\? null/);
  assert.match(mapSource, /const encounterRevealed = nodeState\.unlocked \|\| previewLocked/);
  assert.match(mapSource, /!encounterRevealed[\s\S]*?&& encounter[\s\S]*?&& encounterPreviewUrl/);
  assert.match(mapSource, /!selectedState\?\.unlocked[\s\S]*?&& !previewLocked/);
  assert.match(mapSource, /className=\{showLockedBossSilhouette \? 'campaign-map-node-boss-silhouette'/);
  assert.match(mapSource, /src=\{selectedEncounter\.previewUrl\}/);
  assert.match(mapSource, /selectedLockedBossSilhouette/);
  assert.match(mapSource, /selectedRevealed && selectedEncounter/);
  assert.match(mapSource, /encounterRevealed \? encounter\.name : 'ENCRYPTED'/);
  assert.doesNotMatch(mapSource, /final-boss-sentinel/);
  assert.doesNotMatch(mapSource, /bosses\/.*\?\?/);
});

test('regular nodes use numbered celestial buttons, completed nodes are distinct, and sector routes split then rejoin', () => {
  assert.match(mapSource, /CampaignMapCelestial/);
  assert.match(mapSource, /missionLabel=\{missionDisplayLabel\}/);
  assert.match(mapSource, /className="campaign-map-celestial--selection"/);
  assert.match(mapSource, /campaign-map-node-cleared/);
  assert.doesNotMatch(mapSource, /src=\{mission\.previewUrl\}|src=\{selectedMission\.previewUrl\}/);
  assert.match(mapSource, /entry\.id, toMissionId: leftRoute\.id/);
  assert.match(mapSource, /entry\.id, toMissionId: rightRoute\.id/);
  assert.match(mapSource, /leftRoute\.id, toMissionId: merge\.id/);
  assert.match(mapSource, /rightRoute\.id, toMissionId: merge\.id/);
  assert.match(mapSource, /merge\.id, toMissionId: boss\.id/);
  assert.match(mapSource, /data-campaign-route-edge/);
  assert.match(mapStyles, /\.campaign-map-node--completed:not\(\.campaign-map-node--boss\) \.campaign-map-node-core/);
  assert.match(mapStyles, /\.campaign-map-node-cleared/);
  assert.match(mapStyles, /\.campaign-map-node\.is-selected:not\(\.campaign-map-node--boss\) \.campaign-map-node-core[\s\S]*?background: transparent;[\s\S]*?box-shadow: none/);
  assert.match(mapStyles, /\.campaign-map-node--completed:not\(\.campaign-map-node--boss\) \.campaign-map-node-core,[\s\S]*?background: transparent/);
  assert.match(mapStyles, /\.campaign-map-node:focus-visible[\s\S]*?outline: none;[\s\S]*?\.campaign-map-node:focus-visible \.campaign-map-node-ring/);
  assert.match(mapStyles, /\.campaign-map-selection-art--celestial[\s\S]*?background: transparent;[\s\S]*?border: 0;[\s\S]*?clip-path: none/);
});

test('Campaign Map centers the initial long route before paint and reserves smooth motion for later navigation', () => {
  assert.match(mapSource, /initialRouteCenterPendingRef/);
  assert.match(mapSource, /target\.getBoundingClientRect\(\)/);
  assert.match(mapSource, /scroller\.getBoundingClientRect\(\)/);
  assert.match(mapSource, /if \(behavior === 'auto'\) scroller\.scrollTop = clampedTop/);
  assert.match(mapSource, /centerSelected\('auto'\)/);
  assert.match(mapSource, /window\.cancelAnimationFrame\(layoutFrame\)/);
  assert.match(mapSource, /window\.cancelAnimationFrame\(settleFrame\)/);
  assert.match(mapStyles, /\.campaign-map-route-scroll[\s\S]*?overflow-anchor: none/);
});

test('Campaign celestial motion is limited to selected, current, and hovered nodes with reduced-motion protection', () => {
  const baseCelestialSpriteRule = mapStyles.match(/^\.campaign-map-celestial__sprite\s*\{[^}]*\}/m)?.[0] ?? '';
  assert.match(mapStyles, /\.campaign-map-node--current \.campaign-map-celestial__sprite/);
  assert.match(mapStyles, /\.campaign-map-node\.is-selected \.campaign-map-celestial__sprite/);
  assert.match(mapStyles, /@media \(hover: hover\) and \(pointer: fine\)/);
  assert.doesNotMatch(baseCelestialSpriteRule, /animation:/);
  assert.match(mapStyles, /\.campaign-map-selection-art--celestial \.campaign-map-celestial__sprite[\s\S]*?campaign-map-selection-celestial-spin 18s linear infinite/);
  assert.match(mapStyles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.campaign-map-celestial__sprite[\s\S]*?animation: none !important/);
});

test('Campaign Map is an opaque routed screen with a real Back-to-Home transition', () => {
  assert.match(mapSource, /<main className="campaign-map-screen"[^>]*data-world-theme=\{selectedWorldTheme\.id\}[^>]*>/);
  assert.match(mapSource, /aria-label="Back to Home"/);
  assert.doesNotMatch(mapSource, /<main[^>]*aria-modal="true"|campaign-map-overlay/);
  assert.match(appSource, /get\('view'\) === 'campaign-map'/);
  assert.match(appSource, /window\.history\.pushState\([\s\S]*?sciconCampaignMap: true/);
  assert.match(appSource, /window\.addEventListener\('popstate', syncCampaignMapRoute\)/);
  assert.match(appSource, /if \(requested\) \{\s*openCampaignMapRef\.current\(\);/);
  assert.match(appSource, /syncCampaignMapRoute\(\);\s*window\.addEventListener\('popstate', syncCampaignMapRoute\)/);
  assert.match(appSource, /openCampaignMapRef\.current = openCampaignMap/);
  assert.match(appSource, /gameState === GameState\.MENU && !campaignMapOpen/);
  assert.match(appSource, /gameState === GameState\.MENU && campaignMapOpen/);
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
  const mapCommandStart = startScreenSource.indexOf('data-campaign-map-trigger="true"');
  const mapCommandEnd = startScreenSource.indexOf('</button>', mapCommandStart);
  assert.ok(mapCommandStart >= 0 && mapCommandEnd > mapCommandStart);
  assert.doesNotMatch(
    startScreenSource.slice(mapCommandStart, mapCommandEnd),
    /sci-home-command-icon__badge|>\s*9\+?\s*</,
    'Campaign Map may pulse for new content but must not show an unexplained numeric badge'
  );
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

test('short and narrow mobile Campaign details keep all three rewards side by side', () => {
  const objectiveRules = [...mapStyles.matchAll(/(?:^|\n)\s*\.campaign-map-objectives\s*\{([^}]*)\}/g)];
  assert.ok(objectiveRules.length > 0, 'three-star reward layout is styled');
  assert.ok(objectiveRules.some(([, rule]) => /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/.test(rule)));
  for (const [, rule] of objectiveRules) {
    assert.doesNotMatch(rule, /display:\s*none/);
    const columns = rule.match(/grid-template-columns:\s*([^;]+)/)?.[1];
    if (columns) assert.equal(columns, 'repeat(3, minmax(0, 1fr))', 'viewport overrides must not stack star rewards');
  }
  assert.doesNotMatch(mapStyles, /campaign-map-objectives--compact/);
  assert.doesNotMatch(mapStyles, /\.campaign-map-loadout-guide|\.campaign-map-power-guide|\.campaign-map-support-tags/);
  assert.match(mapStyles, /\.campaign-map-selection--mission \.campaign-map-selection-topline\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) auto auto/);
  assert.match(mapStyles, /\.campaign-map-selection--mission \.campaign-map-selection-topline > :last-child\s*\{[^}]*grid-column: auto/);
});

test('Campaign route allows vertical exploration without enabling horizontal scrolling', () => {
  const routeScrollStyles = mapStyles.match(/\.campaign-map-route-scroll\s*\{([^}]*)\}/)?.[1];
  assert.ok(routeScrollStyles);
  assert.match(routeScrollStyles, /min-width:\s*0/);
  assert.match(routeScrollStyles, /overflow-x:\s*hidden/);
  assert.match(routeScrollStyles, /overflow-y:\s*auto/);
  assert.match(routeScrollStyles, /touch-action:\s*pan-y/);
  assert.doesNotMatch(routeScrollStyles, /(?:^|;)\s*overflow:\s*auto/);
  assert.match(mapSource, /onPointerDown=\{beginDrag\}[\s\S]*?onPointerMove=\{moveDrag\}/);
  assert.match(mapSource, /\['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'\]/);
  assert.match(mapSource, /focus\(\{ preventScroll: true \}\)/);
});

test('Campaign developer controls expose Mission and full-map result previews without Wave checkpoints', () => {
  assert.match(mapSource, /onPreviewResult: \(missionId: string\) => void/);
  assert.doesNotMatch(mapSource, />Preview Wave result<\/button>|>Set checkpoint<\/button>|>Complete wave<\/button>/);
  assert.match(mapSource, />Preview Mission result<\/button>/);
  assert.match(mapSource, />Simulate full Campaign map<\/button>/);
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
  assert.match(mapSource, />Start Weekly Streak<\/button>/);
  assert.match(mapSource, />Simulate route choice<\/button>/);
  assert.match(mapSource, />Simulate backward selection<\/button>/);
  assert.match(mapSource, />Preview guest flow<\/button>/);
  assert.match(mapSource, />Preview wallet flow<\/button>/);
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
  assert.match(appSource, /onStartWeeklyStreak: \(request\) => \{\s*if \(!founderAuthorizationRef\.current\) return;/);
  assert.match(appSource, /onSimulateRouteChoice: \(sourceNodeId, targetNodeId\) => \{\s*if \(!founderAuthorizationRef\.current\) return;/);
  assert.match(appSource, /onSimulateBackwardSelection: \(targetNodeId\) => \{\s*if \(!founderAuthorizationRef\.current\) return;/);
  assert.match(appSource, /onPreviewAuthenticationFlow: \(flow\) => \{\s*if \(!founderAuthorizationRef\.current\) return;/);
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
  assert.match(mapSource, />Tokens earned<\/small>/);
  assert.match(mapSource, />Weekly points earned<\/small>/);
  assert.match(mapSource, />Player DPS<\/small>/);
  assert.match(mapSource, />Enemy average TTK<\/small>/);
  assert.match(mapSource, />FPS \/ frame<\/small>/);
  assert.match(mapSource, /\['No performance flags'\]/);
  assert.match(mapStyles, /\.campaign-map-devtools__telemetry/);
  assert.match(mapStyles, /@media \(max-width: 520px\)[\s\S]*?\.campaign-map-devtools__grid,[\s\S]*?\.campaign-map-devtools__telemetry/);
});
