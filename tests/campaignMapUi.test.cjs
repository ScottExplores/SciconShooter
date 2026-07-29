const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const mapSource = read('components/CampaignMap.tsx');
const mapStyles = read('components/campaign-map.css');
const appSource = read('App.tsx');
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
  assert.match(mapSource, /DEFAULT_GAME_CAMPAIGN\.visualThemes\.find/);
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

test('Campaign Map exposes power guidance, support roles, rewards, and a separate mastery set bonus', () => {
  assert.match(mapSource, /campaign-map-power-guide/);
  assert.match(mapSource, />Minimum</);
  assert.match(mapSource, />Expected</);
  assert.match(mapSource, />Comfortable</);
  assert.match(mapSource, /campaign-map-support-tags/);
  assert.match(mapSource, /3-star mastery set/);
});

test('locked boss nodes use their canonical preview only as a silhouette and never substitute another boss', () => {
  assert.match(mapSource, /const bossPreviewUrl = mission\.bossPreview\?\.previewUrl \?\? null/);
  assert.match(mapSource, /missionRole === 'major-boss'[\s\S]*?mission\.bossId[\s\S]*?bossPreviewUrl/);
  assert.match(mapSource, /!nodeState\.completed[\s\S]*?missionRole === 'major-boss'/);
  assert.match(mapSource, /!selectedState\?\.completed[\s\S]*?getCampaignMissionRole\(selectedMission\) === 'major-boss'/);
  assert.match(mapSource, /className=\{showLockedBossSilhouette \? 'campaign-map-node-boss-silhouette'/);
  assert.match(mapSource, /src=\{selectedMission\.bossPreview\.previewUrl\}/);
  assert.match(mapSource, /selectedLockedBossSilhouette/);
  assert.match(mapSource, /selectedMission\.bossEventId && selectedState\.completed/);
  assert.doesNotMatch(mapSource, /final-boss-sentinel/);
  assert.doesNotMatch(mapSource, /bosses\/.*\?\?/);
});

test('regular nodes are numbered, completed nodes are distinct, and sector routes split then rejoin', () => {
  assert.match(mapSource, /campaign-map-node-stage-number/);
  assert.match(mapSource, /campaign-map-selection-mission-number/);
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
});

test('Campaign Map is an opaque routed screen with a real Back-to-Home transition', () => {
  assert.match(mapSource, /<main className="campaign-map-screen">/);
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
  assert.match(mapSource, />Coins earned<\/small>/);
  assert.match(mapSource, />Weekly points earned<\/small>/);
  assert.match(mapSource, />Player DPS<\/small>/);
  assert.match(mapSource, />Enemy average TTK<\/small>/);
  assert.match(mapSource, />FPS \/ frame<\/small>/);
  assert.match(mapSource, /\['No performance flags'\]/);
  assert.match(mapStyles, /\.campaign-map-devtools__telemetry/);
  assert.match(mapStyles, /@media \(max-width: 520px\)[\s\S]*?\.campaign-map-devtools__grid,[\s\S]*?\.campaign-map-devtools__telemetry/);
});
