const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mapSource = fs.readFileSync(path.join(root, 'components/CampaignMap.tsx'), 'utf8');
const mapStyles = fs.readFileSync(path.join(root, 'components/campaign-map.css'), 'utf8');

test('Campaign Map accepts optional branch definitions and progress without changing existing callers', () => {
  assert.match(mapSource, /branches\?: CampaignMapBranchDefinition\[\]/);
  assert.match(mapSource, /branchProgressById\?: Record<string, CampaignMapBranchProgress>/);
  assert.match(mapSource, /onLaunchBranch\?: \(request: CampaignMapBranchLaunchRequest\) => void/);
  assert.match(mapSource, /branches = EMPTY_CAMPAIGN_BRANCHES/);
  assert.match(mapSource, /branchProgressById = EMPTY_CAMPAIGN_BRANCH_PROGRESS/);
});

test('branch presentation consumes authoritative discovery progress instead of deriving unlocks from stars', () => {
  assert.match(mapSource, /const discoveryState = progress\?\.discoveryState \?\? branch\.discoveryState \?\? 'locked'/);
  assert.match(mapSource, /progress\?\.unlocked[\s\S]*?discoveryState === 'unlocked'[\s\S]*?discoveryState === 'new'/);
  assert.match(mapSource, /const sourceStars = getMissionState\(sourceMission, progress\)\.stars/);
  assert.match(mapSource, /Earn \$\{requiredStars\} stars on Mission \$\{sourceMission\.number\} to unlock/);
});

test('configured branches render dormant and energized routes plus distinct bonus nodes', () => {
  assert.match(mapSource, /data-campaign-branch-route=\{branch\.branchId\}/);
  assert.match(mapSource, /campaign-map-branch-line--active/);
  assert.match(mapSource, /campaign-map-branch-line--dormant/);
  assert.match(mapSource, /campaign-map-branch-line--energy/);
  assert.match(mapSource, /campaign-map-branch-node--\$\{branch\.missionType\}/);
  assert.match(mapSource, /data-branch-type=\{branch\.missionType\}/);
  assert.match(mapSource, /resolveCampaignBranchIconUrl/);
  assert.match(mapSource, /research-supply-golden-de501f4a437d\.png/);
  assert.match(mapStyles, /\.campaign-map-branch-glyph[\s\S]*?background: linear-gradient/);
});

test('authored branch routes consume their validated endpoint-inclusive control points exactly once', () => {
  assert.match(mapSource, /const routePoints = controlPoints\.length >= 2\s*\? controlPoints\s*:\s*\[sourcePoint, branchPoint\]/);
  assert.doesNotMatch(mapSource, /\[sourcePoint, \.\.\.controlPoints, branchPoint\]/);
});

test('new and claimed one-time routes have clear, non-replayable states', () => {
  assert.match(mapSource, /branchState\.new \? <span className="campaign-map-branch-new">New<\/span>/);
  assert.match(mapSource, /branchState\.claimed \? <span className="campaign-map-branch-claimed">Claimed<\/span>/);
  assert.match(mapSource, /selectedBranchState\.claimed[\s\S]*?'Reward Secured'/);
  assert.match(mapSource, /selectedBranchState\?\.completed && selectedBranchOneTime/);
  assert.match(mapSource, /disabled=\{!selectedBranchState\.unlocked \|\| selectedBranchConsumed/);
  assert.match(mapStyles, /\.campaign-map-branch-node--claimed \.campaign-map-branch-node-frame/);
  assert.match(mapSource, /Recovered cache result/);
  assert.match(mapSource, /selectedBranchProgress\.lastResult\.presentsDestroyed/);
  assert.match(mapSource, /Total secured \+\{formatTokenAmount\(selectedBranchProgress\.lastResult\.totalCoins\)\}/);
});

test('claimed copy remains valid for every optional branch type', () => {
  assert.match(mapSource, /selectedBranchState\.claimed \? 'Reward secured'/);
  assert.doesNotMatch(mapSource, /selectedBranchState\.claimed \? 'Cache recovered'/);
});

test('branch selection explains the three-star mastery relationship and previews rewards', () => {
  assert.match(mapSource, /Earn all 3 stars to reveal this bonus route/);
  assert.match(mapSource, /Your main campaign checkpoint will not change/);
  assert.match(mapSource, /Mastery route available/);
  assert.match(mapSource, /selectedBranch\.rewardPreview \?\? formatBranchType/);
});

test('branch unlock motion is brief, skippable, and reduced-motion safe', () => {
  assert.match(mapSource, />Skip animation<\/button>/);
  assert.match(mapSource, /window\.setTimeout\(\(\) => setDismissedUnlockAnimationId\(unlockingBranchId\), 1600\)/);
  assert.match(mapStyles, /campaign-map-branch-reveal 1\.4s/);
  assert.match(mapStyles, /campaign-map-branch-notice 1\.4s/);
  assert.match(mapStyles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.campaign-map-branch-line--energy[\s\S]*?\.campaign-map-branch-node[\s\S]*?animation: none !important/);
});

test('branch geometry remains inside mobile-safe map gutters', () => {
  assert.match(mapSource, /clampMapCoordinate\(branch\.mapPosition\?\.x \?\? fallbackX, 0\.13, 0\.87\)/);
  assert.match(mapStyles, /@media \(max-width: 430px\)[\s\S]*?\.campaign-map-branch-node[\s\S]*?--campaign-branch-size: 62px/);
  assert.match(mapStyles, /\.campaign-map-branch-node-label[\s\S]*?max-width: 5\.9rem/);
});
