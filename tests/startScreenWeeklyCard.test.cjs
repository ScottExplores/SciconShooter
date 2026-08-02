const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'StartScreen.tsx'),
  'utf8'
);
const leaderboardServiceSource = fs.readFileSync(
  path.join(__dirname, '..', 'services', 'leaderboardService.ts'),
  'utf8'
);
const htmlSource = fs.readFileSync(
  path.join(__dirname, '..', 'index.html'),
  'utf8'
);
const stylesSource = fs.readFileSync(
  path.join(__dirname, '..', 'styles', 'tailwind.input.css'),
  'utf8'
);
const appSource = fs.readFileSync(
  path.join(__dirname, '..', 'App.tsx'),
  'utf8'
);

test('Home offers the Campaign entry point and the Weekly Run as separate controls', () => {
  // The Weekly board is its own competition, so it gets its own entry rather
  // than being buried in Campaign Map route selection.
  assert.match(source, /onStartWeeklyRun/);
  assert.match(appSource, /startWeeklyRunFromHome/);
  assert.match(source, /weeklyRunAttemptsRemaining/);
  assert.match(source, /disabled=\{!weeklyRunActive && weeklyRunAttemptsRemaining <= 0\}/);
  assert.match(source, /WEEKLY_RUN_STARTING_LIVES\} Lives · \$\{weeklyRunAttemptsRemaining\}\/2 Attempts/);
  assert.match(appSource, /weeklyRunAttemptsRemaining=\{getWeeklyRunAttemptsRemaining\(weeklySquadState\)\}/);
  assert.match(source, /onClick=\{onStart\}/);
  assert.match(source, /\{campaignCheckpoint\.waveTotal\} WAVES/);
});

test('the Weekly Run drawer is a distinct sibling connected to the funding frame', () => {
  // The controls remain semantic siblings inside one dock, while distinct
  // artwork prevents the lower launcher from reading as a shrunken duplicate.
  assert.match(source, /const renderWeeklyRunEntry = \(\) => \(/);
  assert.match(source, /const renderWeeklyCompetitionStack =/);
  const stack = source.slice(
    source.indexOf('const renderWeeklyCompetitionStack'),
    source.indexOf('const DashboardNav')
  );
  assert.match(stack, /sci-weekly-competition-stack[\s\S]*renderWeeklyFundingCard\(\{ compact \}\)[\s\S]*renderWeeklyRunEntry\(\)/);
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles', 'tailwind.input.css'), 'utf8');
  const entryRule = css.slice(css.indexOf('.sci-weekly-run-entry {'), css.indexOf('.sci-weekly-run-entry:hover'));
  assert.match(entryRule, /align-self: start;/);
  assert.match(css, /\.sci-weekly-competition-stack \{/);
  assert.match(entryRule, /border-image-source:[\s\S]*scicon-weekly-run-frame-v1\/weekly-run-lower-frame\.png/);
  assert.match(entryRule, /border-image-slice: 48 66 64 66 fill/);
  assert.doesNotMatch(entryRule, /start-mission-panel\.png/);
  assert.doesNotMatch(entryRule, /information-card\.png/);
});

test('the phone flight deck drops the wordmark to buy vertical space', () => {
  // Branding is the least useful pixel on a 390px screen; the document title
  // still names the game for assistive tech.
  assert.match(source, /\{compact \? null : \(\s*<div className="sci-hero-brand/);
});

test('home winner card uses only the proposal saved on the current weekly leader', () => {
  assert.match(source, /proposalReferences\.forEach\(\(proposal\) => references\.set\(proposal\.id, proposal\)\)/);
  assert.match(source, /resolveProposalSelection\(weeklyLeader, proposalReferencePool\)/);
  assert.doesNotMatch(source, /weeklyProposalPreview\s*=\s*sortedProposals\[0\]/);
  assert.match(source, /weeklyProposalSelection\?\.liveProposal[\s\S]*getProposalFundingMetrics\(weeklyProposalSelection\.liveProposal\)/);
  assert.match(source, /formatFundingPercent\(weeklyFunding\.progressPercent\)/);
  assert.match(source, /isProposalExplicitlyCompleted\(weeklyProposalSelection\.liveProposal\)/);
  assert.match(source, /weeklyProposalCompleted[\s\S]*Goal reached/);
  assert.doesNotMatch(source, /getProposalProgress|weeklyFundingProgress/);
});

test('an open weekly pilot slot renders no proposal title, image, or progress', () => {
  assert.match(source, /const weeklyLeader = activeWeeklyLeaderboard\[0\]/);
  assert.match(source, /\{weeklyProposalSelection \? \([\s\S]*weeklyProposalSelection\.imageUrl[\s\S]*weeklyProposalSelection\.title/);
  assert.match(source, /key=\{`\$\{weeklyProposalSelection\.id\}:\$\{weeklyProposalSelection\.imageUrl\}`\}/);
});

test('home winner image has no trophy overlay', () => {
  const imageStart = source.indexOf('sci-weekly-project-image');
  const imageEnd = source.indexOf('<span className="min-w-0 self-center">', imageStart);
  assert.ok(imageStart >= 0 && imageEnd > imageStart);
  assert.doesNotMatch(source.slice(imageStart, imageEnd), /name="trophy"/);
});

test('home winner card slides between the pilot score and the exact selected proposal', () => {
  assert.match(source, /useState<'pilot' \| 'proposal'>\('pilot'\)/);
  assert.match(source, /setInterval\([\s\S]*5_800/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /data-active-slide=\{weeklyProposalSelection \? weeklyWinnerSlide : 'pilot'\}/);
  assert.match(source, /aria-label="Show weekly leader"/);
  assert.match(source, /aria-label="Show selected proposal"/);
  assert.match(source, /weeklyProposalSelection\.imageUrl[\s\S]*weeklyProposalSelection\.title/);
  assert.match(stylesSource, /sci-weekly-winner-card__track\[data-active-slide='proposal'\][\s\S]*translate3d\(-50%, 0, 0\)/);
  assert.match(stylesSource, /transition: transform 520ms cubic-bezier/);
});

test('mobile home lets its mission panel fill the available space above navigation', () => {
  assert.match(source, /className="scicon-mobile-home flex min-h-full flex-col gap-2"/);
  assert.match(source, /renderHeroPanel\(\{ compact: true, fill: true \}\)/);
  assert.match(source, /fill \? 'flex-1' : ''/);
  assert.match(source, /sci-hero-content--compact/);
  assert.match(source, /data-dashboard-tab=\{dashboardTab\}/);
  assert.match(source, /scicon-home-backdrop__nebula--a/);
  assert.match(source, /scicon-home-backdrop__nebula--b/);
  assert.match(source, /ASSETS\.HOME_SPARSE_STARFIELD/);
  assert.match(source, /ASSETS\.HOME_SPARSE_STARFIELD_BASE/);
  assert.match(source, /ASSETS\.HOME_ASTEROID_FIELD/);
  assert.match(source, /ASSETS\.GAME_PARALLAX_BIG_PLANET/);
  assert.match(source, /ASSETS\.GAME_PARALLAX_RING_PLANET/);
  assert.match(source, /scicon-home-backdrop__stars/);
  assert.match(source, /scicon-home-backdrop__pixel-fade/);
  assert.match(source, /sci-home-hero-surface--compact/);
  assert.doesNotMatch(source, /<img src=\{ASSETS\.MENU_HERO\}/);
  assert.doesNotMatch(stylesSource, /url\(['"]\/game-art\/backgrounds\/menu-hero\.png['"]\)/);
  // Two declared rows: the connected weekly stack, then hero/Start Mission.
  // Treating the lower drawer as its own layout row used to let it stretch and
  // push Start Mission off the bottom of the phone screen.
  assert.match(htmlSource, /#root \.scicon-mobile-home[\s\S]*grid-template-rows: auto minmax\(17\.5rem, 1fr\)/);
  // Two rows, because the phone deck drops the wordmark: ship stage in the
  // flexible track, launch block hugging the bottom. The old three-row
  // template left an empty trailing track that floated Start Mission upward.
  assert.match(htmlSource, /#root \.sci-hero-content--compact[\s\S]*grid-template-rows: minmax\(6rem, 1fr\) auto/);
  assert.doesNotMatch(htmlSource, /#root \.sci-hero-content--compact[\s\S]{0,400}grid-template-rows: auto minmax/);
  assert.match(htmlSource, /max-height: 720px/);
  assert.match(stylesSource, /data-dashboard-tab='home'[\s\S]*\.scicon-start-shell \{[\s\S]*padding-inline: 0/);
  assert.match(stylesSource, /data-dashboard-tab='home'[\s\S]*\.scicon-mobile-scroll \{[\s\S]*overflow-x: clip/);
  assert.match(stylesSource, /data-dashboard-tab='home'[\s\S]*\.scicon-mobile-home \{[\s\S]*max-width: 100%[\s\S]*overflow: clip/);
  assert.match(stylesSource, /\.sci-home-hero-surface--compact \{[\s\S]*border: 0/);
  assert.match(stylesSource, /\.scicon-hero-title--compact \{[\s\S]*width: 100%[\s\S]*margin-inline: 0[\s\S]*perspective\(360px\)/);
  assert.match(stylesSource, /@keyframes sci-hero-backdrop-drift/);
  assert.match(stylesSource, /@keyframes sci-ship-orbit-breathe/);
  assert.match(stylesSource, /@keyframes sci-home-nebula-drift-a/);
  assert.match(stylesSource, /@keyframes sci-home-nebula-drift-b/);
  assert.match(stylesSource, /@keyframes sci-home-stars-drift/);
  assert.match(stylesSource, /@keyframes sci-home-sparse-flight/);
  assert.match(stylesSource, /@keyframes sci-home-asteroid-flight/);
  assert.match(stylesSource, /@keyframes sci-home-planet-drift-red/);
  assert.match(stylesSource, /\.scicon-home-backdrop__planet \{[\s\S]*?z-index: 1/);
  assert.match(stylesSource, /\.scicon-home-backdrop__asteroids \{[\s\S]*?z-index: 3/);
  assert.match(stylesSource, /@keyframes sci-home-pixel-drift/);
  assert.match(stylesSource, /\.sci-dashboard-nav-button\[data-active='true'\] \.sci-dashboard-nav-icon \{[\s\S]*?translate3d\(0, -0\.68rem, 0\) scale\(1\.46\)/);
  assert.match(stylesSource, /\.sci-dashboard-nav-shell \{[\s\S]*?z-index: 30/);
  assert.match(stylesSource, /\.sci-dashboard-nav \{[\s\S]*?overflow: visible/);
});

test('compact weekly carousel preserves its pager while fitting short Base app viewports', () => {
  assert.match(source, /sci-weekly-winner-card--compact/);
  assert.match(source, /sci-weekly-winner-card__pager/);
  assert.match(source, /aria-label="Show weekly leader"/);
  assert.match(source, /aria-label="Show selected proposal"/);
  assert.match(stylesSource, /\.sci-weekly-winner-card--compact \{[\s\S]*?min-height: 5rem;/);
  assert.match(stylesSource, /\.sci-weekly-funding-content--compact \.sci-weekly-funding-summary \{[\s\S]*?padding-bottom: 0\.375rem;/);
  assert.match(stylesSource, /\.sci-weekly-winner-card--compact \.sci-weekly-winner-card__slide \{[\s\S]*?padding-bottom: 0\.5rem;/);
  assert.match(stylesSource, /\.sci-weekly-winner-card--compact \.sci-weekly-proposal-title \{[\s\S]*?-webkit-line-clamp: 1;/);
});

test('weekly funding and high score share the exact Start Mission chrome with safe insets', () => {
  const framePath = path.join(
    __dirname,
    '..',
    'public',
    'game-art',
    'generated',
    'ui',
    'scicon-pixel-action-buttons-v1',
    'start-mission-panel.png'
  );

  assert.ok(fs.existsSync(framePath));
  assert.match(source, /<HudPanel className="sci-weekly-funding-shell">/);
  assert.match(source, /const renderWeeklyFundingCard =/);
  assert.match(source, /sci-weekly-funding-summary/);
  assert.match(source, /Weekly Funding[\s\S]*Weekly high score/);
  assert.match(stylesSource, /scicon-pixel-action-buttons-v1\/start-mission-panel\.png/);
  assert.match(stylesSource, /border-image-slice: 54 68 54 68 fill/);
  assert.match(stylesSource, /border-image-repeat: stretch/);
  assert.match(stylesSource, /\.sci-weekly-funding-shell::before/);
  assert.match(stylesSource, /@keyframes sci-weekly-fixture-pulse-a/);
  assert.match(stylesSource, /@keyframes sci-weekly-fixture-pulse-b/);
  assert.doesNotMatch(stylesSource, /@keyframes sci-weekly-interior-breathe/);
  assert.match(stylesSource, /\.sci-weekly-funding-content \{[\s\S]*?animation: none/);
  assert.match(stylesSource, /\.sci-weekly-funding-shell::before,[\s\S]*?inset: -1\.45rem -1\.3rem -1\.32rem/);
  assert.match(stylesSource, /\.sci-weekly-funding-shell \{[\s\S]*?filter: none[\s\S]*?backdrop-filter: none/);
  assert.match(stylesSource, /sci-weekly-funding-content[\s\S]*?image-rendering: auto/);
  assert.doesNotMatch(source, /sci-weekly-funding-frame-sprite/);
  assert.doesNotMatch(stylesSource, /sci-weekly-funding-frame-sprite/);
  assert.doesNotMatch(stylesSource, /weekly-funding-frame-spritesheet\.png/);
  assert.match(stylesSource, /prefers-reduced-motion: reduce[\s\S]*sci-weekly-funding-shell::before/);
  assert.match(stylesSource, /prefers-reduced-motion: reduce[\s\S]*scicon-home-backdrop__nebula/);
});

test('Home keeps only transform-based parallax moving while large lighting surfaces stay stable', () => {
  assert.match(stylesSource, /data-dashboard-tab='home'[\s\S]*\.scicon-home-backdrop__image \{[\s\S]*?animation: none/);
  assert.match(stylesSource, /data-dashboard-tab='home'[\s\S]*\.scicon-home-backdrop__nebula--a \{[\s\S]*?display: none[\s\S]*?animation: none/);
  assert.match(stylesSource, /\.sci-home-hero-surface--compact \.sci-hero-backdrop__image \{[\s\S]*?animation: none/);
  assert.match(stylesSource, /\.sci-ship-orbit \{[\s\S]*?animation: none/);
  assert.match(stylesSource, /\.scicon-home-backdrop__sparse-track \{[\s\S]*?sci-home-sparse-flight/);
  assert.match(stylesSource, /\.scicon-home-backdrop__asteroid-track \{[\s\S]*?sci-home-asteroid-flight/);
  assert.match(htmlSource, /\.sci-rh-ship--compact \{[\s\S]*?width: min\(60vw, 266px\)[\s\S]*?height: 146px/);
});

test('weekly and all-time Trophy Deck views retain and render up to 100 scores', () => {
  assert.match(leaderboardServiceSource, /export const ALL_TIME_SCORE_LIMIT = 100/);
  assert.match(leaderboardServiceSource, /export const WEEKLY_SCORE_LIMIT = 100/);
  assert.match(source, /visibleLeaderboard\.slice\(0, WEEKLY_SCORE_LIMIT\)/);
  assert.match(source, /visibleLeaderboard\.slice\(0, ALL_TIME_SCORE_LIMIT\)/);
  assert.match(source, /displayedLeaderboard\.slice\(1\)/);
  assert.match(source, /rankedEntries\.map/);
  assert.match(source, /const rank = index \+ 2/);
  assert.match(source, /max-h-\[min\(42vh,34rem\)\].*overflow-y-auto.*custom-scrollbar/);
  assert.doesNotMatch(source, /visibleLeaderboard\.slice\(0, 8\)/);
});

test('Weekly and All-time leaders keep animated first place and connect silver and bronze runners to the score list', () => {
  assert.match(source, /first-place-row\.png/);
  assert.doesNotMatch(source, /second-place-row\.png/);
  assert.doesNotMatch(source, /third-place-row\.png/);
  assert.match(source, /first-place-turbine-blades\.png/);
  assert.match(source, /first-place-crown-diamond-\$\{state\}\.png/);
  assert.match(source, /<FirstPlaceLivingRow entry=\{firstPlace\}/);
  assert.doesNotMatch(source, /PodiumRunnerRow/);
  assert.match(source, /rank === 2 \? 'silver' : rank === 3 \? 'bronze' : null/);
  assert.match(source, /sci-leaderboard-row--\$\{podiumTone\}/);
  assert.match(source, /sci-leaderboard-rank--\$\{podiumTone\}/);
  assert.match(htmlSource, /\.sci-first-place-turbine-blades/);
  assert.match(htmlSource, /@keyframes sci-first-place-turbine-spin/);
  assert.match(htmlSource, /\.sci-leaderboard-row--silver/);
  assert.match(htmlSource, /\.sci-leaderboard-row--bronze/);
});

test('leaderboard names open the canonical Mission Record in a read-only viewer', () => {
  assert.match(source, /hasViewableMissionRecord\(entry\)/);
  assert.match(source, /onClick=\{\(\) => openLeaderboardRecord\(entry\)\}/);
  assert.match(source, /View \$\{entry\.name\}'s Mission Record/);

  const viewerStart = source.indexOf('selectedLeaderboardRecord?.runId');
  const viewerEnd = source.indexOf('{showFeedback &&', viewerStart);
  assert.ok(viewerStart >= 0 && viewerEnd > viewerStart);
  const viewerSource = source.slice(viewerStart, viewerEnd);

  assert.match(viewerSource, /role="dialog"/);
  assert.match(viewerSource, /buildMissionRecordCardPath\(selectedLeaderboardRecord\.runId\)/);
  assert.doesNotMatch(viewerSource, /onMint|shareRecord|Share Image|Mint/);
});

test('client leaderboard filtering uses the same Sunday noon-Pacific boundary as finalization', () => {
  assert.match(leaderboardServiceSource, /weeklyCompetitionBoundary\.browser/);
  assert.match(leaderboardServiceSource, /boundary\.startsAt\.getTime\(\)/);
  assert.match(leaderboardServiceSource, /boundary\.endsAt\.getTime\(\)/);
  assert.doesNotMatch(leaderboardServiceSource, /dayOffsetFromMonday/);
  assert.match(source, /scoreTime >= weeklyStartTime && scoreTime < weeklyEndTime/);
  assert.match(source, /\? activeWeeklyLeaderboard/);
});

test('Past Picks renders the complete framed winner archive without trophy thumbnails', () => {
  const archiveStart = source.indexOf("leaderboardView === 'pastPicks'");
  const archiveEnd = source.indexOf("leaderboardView === 'records'", archiveStart);
  assert.ok(archiveStart >= 0 && archiveEnd > archiveStart);
  const archiveSource = source.slice(archiveStart, archiveEnd);

  assert.match(archiveSource, /sortedPastPicks\.map/);
  assert.doesNotMatch(archiveSource, /sortedPastPicks\.slice/);
  assert.match(archiveSource, /sci-past-pick-card/);
  assert.match(archiveSource, /Final allocation/);
  assert.match(archiveSource, /winner\.allocationRsc \?\? weeklyAllocation\.allocationRsc/);
  assert.match(archiveSource, /Proposal selected/);
  assert.match(archiveSource, /resolveProposalSelection\(winner, proposalReferencePool\)/);
  assert.match(archiveSource, /proposalSelection\?\.imageUrl/);
  assert.match(archiveSource, /key=\{`\$\{proposalSelection\.id\}:\$\{proposalSelection\.imageUrl\}`\}/);
  assert.doesNotMatch(archiveSource, /name="trophy"/);
});
