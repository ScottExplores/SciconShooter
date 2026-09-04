import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const toolDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(toolDirectory, '..');

const SOURCE_DIGEST_PATHS = Object.freeze([
  'game-config/campaign.json',
  'services/gameLogic.ts',
  'services/campaignEnemyFiring.ts',
  'services/campaignFormationBudget.ts',
  // Both own time-to-kill: characteristics decide which hulls ever close
  // distance, and Overdrive scales the player's damage. Leaving either out of
  // the digest let balance change under an unchanged proof.
  'services/enemyCharacteristics.ts',
  'services/weaponOverdrive.ts',
  // Hull primary profiles set player damage per lane, and sector aggression
  // sets how often formations peel off -- both move time-to-kill.
  'services/playerShipWeapons.ts',
  'services/sectorEscalation.ts',
  // Owns when a Wave is allowed to finish, so it changes every pacing number
  // this matrix reports.
  'services/waveCompletion.ts',
  'services/gameplay/formations/FormationRuntime.ts',
  'services/gameplay/formations/FormationFlight.ts',
  'services/gameplay/mini-bosses/MiniBossEncounterRegistry.ts',
  'services/gameplay/mini-bosses/MiniBossEncounterRuntime.ts',
  'services/gameplay/mini-bosses/types.ts',
  'services/weeklyCampaignRuntimeAdapter.ts',
  'services/weeklyCampaignStreak.ts',
  'services/weaponTierProgression.ts',
  'director/src/combat-lab/experimentModel.ts',
  'tools/campaign-mini-boss-authoring.mjs',
  'tools/simulate-campaign-nonboss-balance.mjs'
]);

const DEFAULT_ARTIFACT_PATH = 'artifacts/campaign-balance/nonboss-runtime-matrix.json';
const DEFAULT_REPORT_PATH = 'docs/CAMPAIGN_NONBOSS_BALANCE_MATRIX.md';
const FIRST_VISIBLE_THREAT_DELAY_CEILING_SECONDS = 1.25;
const VISIBLE_COMBAT_DEAD_AIR_CEILING_SECONDS = 1;
// Guards the inversion comparisons against float noise in the clear-rate ratio.
const INVERSION_EPSILON = 1e-9;

globalThis.Image ??= class ImageStub {
  complete = true;
  naturalWidth = 1;
  naturalHeight = 1;
  crossOrigin = 'anonymous';
  src = '';
};
globalThis.document ??= {
  hidden: false,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return true; }
};
globalThis.CustomEvent ??= class CustomEventStub {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
};
globalThis.window ??= {
  AudioContext: undefined,
  webkitAudioContext: undefined,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return true; },
  setInterval,
  clearInterval,
  localStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  }
};

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const rounded = (value, digits = 1) => Number(Number(value).toFixed(digits));
const median = (values) => {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};

const readArgument = (argv, name) => {
  const prefix = `--${name}=`;
  return argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
};

const readSetArgument = (argv, name) => {
  const raw = readArgument(argv, name);
  return raw
    ? new Set(raw.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean))
    : null;
};

export const computeCampaignNonBossSourceDigest = (root = repositoryRoot) => {
  const hash = crypto.createHash('sha256');
  for (const relativePath of SOURCE_DIGEST_PATHS) {
    hash.update(relativePath.replaceAll('\\', '/'));
    hash.update('\0');
    // Git may materialize text with CRLF on Windows. Hash normalized source so
    // a gameplay-identical checkout carries the same proof on every runner.
    hash.update(
      fs.readFileSync(path.join(root, relativePath), 'utf8').replaceAll('\r\n', '\n')
    );
    hash.update('\0');
  }
  return hash.digest('hex');
};

const pointToRotatedRectangleDistance = (pointX, pointY, entity) => {
  const centerX = entity.x + entity.width / 2;
  const centerY = entity.y + entity.height / 2;
  const angle = Number(entity.beamAngleRadians) || 0;
  const cosine = Math.cos(-angle);
  const sine = Math.sin(-angle);
  const dx = pointX - centerX;
  const dy = pointY - centerY;
  const localX = dx * cosine - dy * sine;
  const localY = dx * sine + dy * cosine;
  const outsideX = Math.max(0, Math.abs(localX) - entity.width / 2);
  const outsideY = Math.max(0, Math.abs(localY) - entity.height / 2);
  return Math.hypot(outsideX, outsideY);
};

const pointToSegmentDistance = (pointX, pointY, startX, startY, endX, endY) => {
  const dx = endX - startX;
  const dy = endY - startY;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0.0001) return Math.hypot(pointX - startX, pointY - startY);
  const progress = clamp(
    ((pointX - startX) * dx + (pointY - startY) * dy) / lengthSquared,
    0,
    1
  );
  return Math.hypot(
    pointX - (startX + dx * progress),
    pointY - (startY + dy * progress)
  );
};

const summarizeRows = (rows) => {
  const clears = rows.filter(({ outcome }) => outcome === 'clear');
  const damageRows = rows.map(({ damage }) => damage);
  const coinRows = rows.map(({ coinsCollected }) => coinsCollected);
  const weeklyRows = rows.map(({ weeklyPoints }) => weeklyPoints);
  return {
    attempts: rows.length,
    clears: clears.length,
    deaths: rows.filter(({ outcome }) => outcome === 'death').length,
    timeouts: rows.filter(({ outcome }) => outcome === 'timeout').length,
    clearRate: rounded(clears.length / Math.max(1, rows.length), 3),
    medianClearSeconds: median(clears.map(({ elapsedSeconds }) => elapsedSeconds)),
    medianDamage: median(damageRows),
    maximumDamage: Math.max(0, ...damageRows),
    medianCoins: median(coinRows),
    medianWeeklyPoints: median(weeklyRows),
    maximumHostileProjectiles: Math.max(0, ...rows.map(({ maximumHostileProjectiles }) => maximumHostileProjectiles)),
    maximumActiveEntities: Math.max(0, ...rows.map(({ maximumActiveEntities }) => maximumActiveEntities)),
    maximumActiveFiringEnemies: Math.max(0, ...rows.map(({ maximumActiveFiringEnemies }) => maximumActiveFiringEnemies)),
    maximumPerformanceBudgetRatio: Math.max(0, ...rows.map(({ maximumPerformanceBudgetRatio }) => maximumPerformanceBudgetRatio)),
    maximumFirstVisibleThreatDelaySeconds: Math.max(
      0,
      ...rows.map(({ maximumFirstVisibleThreatDelaySeconds }) => maximumFirstVisibleThreatDelaySeconds)
    ),
    maximumVisibleCombatDeadAirSeconds: Math.max(
      0,
      ...rows.map(({ maximumVisibleCombatDeadAirSeconds }) => maximumVisibleCombatDeadAirSeconds)
    )
  };
};

const markdownValue = (value, suffix = '') => value === null ? '-' : `${value}${suffix}`;
const matrixCell = (summary) => (
  `${summary.clears}/${summary.deaths}/${summary.timeouts}; `
  + `D${markdownValue(summary.medianDamage)}; `
  + `C${markdownValue(summary.medianCoins)}; `
  + `W${markdownValue(summary.medianWeeklyPoints)}; `
  + `P${summary.maximumHostileProjectiles}; E${summary.maximumActiveEntities}`
);

export const renderCampaignNonBossBalanceMarkdown = (artifact) => {
  const { metadata, coverage, summary, missionSummaries, axisSummaries, detailedCheckpoints, findings } = artifact;
  const lines = [
    '# Campaign Non-Boss Runtime Balance Matrix',
    '',
    `Generated deterministically from Campaign revision ${metadata.campaignRevision} and the real \`GameEngine\` runtime.`,
    '',
    '## Result',
    '',
    `The bounded autonomous sweep ran **${summary.attempts} trials** across **${coverage.nonBossMissionCount} non-boss graph Missions**: ${coverage.mainPathMissionCount} main-path Missions and ${coverage.routeAlternativeCount} route alternatives. It produced **${summary.clears} clears**, **${summary.deaths} deaths**, and **${summary.timeouts} timeouts** (${rounded(summary.clearRate * 100, 1)}% clear rate).`,
    '',
    findings.balanceDecision,
    '',
    '## Method',
    '',
    'Command:',
    '',
    '```text',
    'node tools/simulate-campaign-nonboss-balance.mjs --write',
    '```',
    '',
    '- Runtime: production `GameEngine`, normal Campaign mode, real collisions, non-invincible player, passive primary fire, and authored internal-Wave transitions.',
    '- Viewports: mobile `390x844` and desktop `1280x720`.',
    '- Loadouts: low/minimum, expected, and upgraded/comfortable recommended power converted with the same deterministic allocation used by the boss matrix.',
    '- Supports: no companions or level-5 Prism Skimmer + Beacon Kite.',
    '- Controller: deterministic eight-frame lane planner that prioritizes shooters/elites, projects hostile travel lanes, balances projectile/body risk against capped vertical-shot alignment cost, collects nearby coins, uses Research Charge when aligned, and reserves bombs for dense or imminent-danger states.',
    '- Acceleration boundary: presentation-only background, particle-burst, floating-text, ring, explosion-art, and afterimage pools are disabled; scheduling, movement, collision, damage, drops, companions, and fixed-step gameplay remain the production engine paths.',
    `- Maximum simulated Mission time: ${metadata.maximumSeconds} seconds.`,
    '- Weekly points: the same current App adaptation used for a completed Weekly node (regular kills from the Mission summary, authored mini-boss count, no inferred accuracy, mastery-objective quality), evaluated as a standalone node with no previous-node streak bonus.',
    '- Rendering/FPS: Pixi rendering is intentionally absent. Entity, hostile-projectile, active-firing-enemy, performance-budget, and engine performance-mode peaks are recorded instead.',
    `- Source digest: \`${metadata.sourceDigest}\`.`,
    '',
    'Each table cell below is `clears/deaths/timeouts; median damage; median coins; median Weekly points; peak hostile projectiles; peak active entities`.',
    '',
    '## Coverage',
    '',
    '| Axis | Values |',
    '| --- | --- |',
    `| Graph Missions | ${coverage.nonBossMissionCount} (${coverage.mainPathMissionCount} main + ${coverage.routeAlternativeCount} alternatives) |`,
    `| Sectors | ${coverage.sectorCount}/10 |`,
    `| Power tiers | ${coverage.tierIds.join(', ')} |`,
    `| Support states | ${coverage.supportIds.join(', ')} |`,
    `| Viewports | ${coverage.viewportIds.join(', ')} |`,
    `| Trials | ${summary.attempts} |`,
    '',
    '## Mission summary',
    '',
    '| Mission | Route | Role | Attempts | C/D/T | Median clear | Damage | Coins | Weekly | First visible | Max dead air | Peak hostile | Peak entities | Peak firing |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'
  ];

  for (const row of missionSummaries) {
    lines.push(
      `| ${row.missionLabel} ${row.missionName} | ${row.routeKind} | ${row.missionRole} | ${row.attempts} | ${row.clears}/${row.deaths}/${row.timeouts} | ${markdownValue(row.medianClearSeconds, 's')} | ${markdownValue(row.medianDamage)} | ${markdownValue(row.medianCoins)} | ${markdownValue(row.medianWeeklyPoints)} | ${row.maximumFirstVisibleThreatDelaySeconds}s | ${row.maximumVisibleCombatDeadAirSeconds}s | ${row.maximumHostileProjectiles} | ${row.maximumActiveEntities} | ${row.maximumActiveFiringEnemies} |`
    );
  }

  lines.push(
    '',
    '## M2 and M7 detailed checkpoints',
    '',
    'These early formation-remix Missions are expanded cell-by-cell because the Campaign brief calls them out as dedicated balance checkpoints.',
    '',
    '| Mission | Power | Supports | Viewport | Outcome | Death Wave | Time | Damage | Coins | Weekly | Bombs | Ability | Peak hostile | Peak entities | Budget peak |',
    '| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'
  );
  for (const row of detailedCheckpoints) {
    lines.push(
      `| ${row.missionLabel} | ${row.tier} | ${row.support} | ${row.viewport} | ${row.outcome} | ${row.deathWave ?? '-'} | ${row.elapsedSeconds}s | ${row.damage} | ${row.coinsCollected} | ${row.weeklyPoints} | ${row.bombsUsed} | ${row.abilitiesUsed} | ${row.maximumHostileProjectiles} | ${row.maximumActiveEntities} | ${row.maximumPerformanceBudgetRatio}x |`
    );
  }

  lines.push(
    '',
    '## Axis summary',
    '',
    '| Axis | Value | Cell |',
    '| --- | --- | --- |'
  );
  for (const axis of ['tier', 'support', 'viewport']) {
    for (const row of axisSummaries[axis]) {
      lines.push(`| ${axis} | ${row.id} | ${matrixCell(row)} |`);
    }
  }

  lines.push(
    '',
    '## Findings',
    '',
    `- Cells over the provisional 80-hostile-projectile readability ceiling: ${findings.projectileCeilingBreaches}.`,
    `- Cells over the ${metadata.firstVisibleThreatDelayCeilingSeconds}s first-visible-threat ceiling: ${findings.firstVisibleThreatDelayBreaches}.`,
    `- Cells over the ${metadata.visibleCombatDeadAirCeilingSeconds}s in-Wave visible-combat dead-air ceiling: ${findings.visibleCombatDeadAirBreaches}.`,
    `- Cells that entered engine performance mode: ${findings.performanceModeCells}.`,
    `- Cells that entered heavy-scene mode: ${findings.heavySceneCells}.`,
    `- Missions with no clears across the matrix: ${findings.zeroClearMissionLabels.length > 0 ? findings.zeroClearMissionLabels.join(', ') : 'none'}.`,
    `- Missions where upgraded clear rate was below low-power clear rate: ${findings.powerInversionMissionLabels.length > 0 ? findings.powerInversionMissionLabels.join(', ') : 'none'}.`,
    `- Missions where paired supports cleared less often than no supports: ${findings.supportInversionMissionLabels.length > 0 ? findings.supportInversionMissionLabels.join(', ') : 'none'}.`,
    '',
    '## Exact-cell evidence',
    '',
    `All ${summary.attempts} individual trial rows, including death Wave, damage source diagnostics, bombs and abilities used, coins, projected Weekly points, first-visible-threat delay, visible-combat dead air, entity peaks, and performance-mode frames, are stored in \`${DEFAULT_ARTIFACT_PATH}\`.`,
    '',
    '## Honest limitations',
    '',
    '- This is one shared deterministic random stream per Mission, not a distribution of randomized human attempts.',
    '- The autonomous controller can align, dodge immediate threats, use its finite bombs and cooldown ability, and collect nearby coins, but it does not understand every authored formation as a human strategy problem.',
    '- Recommended power is converted to a consistent upgrade mix; it is not an exact player inventory.',
    '- The Weekly score is a projection from the actual runtime Mission result through the current client score adapter. Accuracy remains `null`, elites remain folded into regular kills, and route/consecutive bonuses are intentionally excluded.',
    '- A visible threat is an on-screen live hostile body, an on-screen hostile projectile, or an active encounter warning. First-visible delay excludes the Mission takeoff; in-Wave dead air begins only after the first visible threat and excludes completion/takeoff.',
    '- Headless engine entity peaks and visibility timing are useful readability/performance proxies, not a physical-device FPS measurement or human mobile/desktop playtest.',
    '- This report does not change Campaign tuning. It records evidence for a separate balance decision.'
  );
  return `${lines.join('\n')}\n`;
};

const createArtifact = ({
  campaign,
  sourceDigest,
  missionDescriptors,
  results,
  viewports,
  tiers,
  supportSets,
  maximumSeconds
}) => {
  const missionSummaries = missionDescriptors.map((descriptor) => ({
    missionId: descriptor.level.id,
    nodeId: descriptor.node.nodeId,
    missionLabel: descriptor.missionLabel,
    missionName: descriptor.level.name,
    missionRole: descriptor.level.campaignProgression.missionRole,
    routeKind: descriptor.isRouteAlternative ? 'alternative' : 'main',
    sectorIndex: descriptor.sectorIndex,
    ...summarizeRows(results.filter(({ missionId }) => missionId === descriptor.level.id))
  }));
  const summarizeAxis = (key, ids) => ids.map((id) => ({
    id,
    ...summarizeRows(results.filter((result) => result[key] === id))
  }));
  const tierRows = summarizeAxis('tier', tiers);
  const supportRows = summarizeAxis('support', supportSets);
  const viewportRows = summarizeAxis('viewport', viewports);
  const zeroClearMissionLabels = missionSummaries
    .filter(({ clears }) => clears === 0)
    .map(({ missionLabel }) => missionLabel);
  // Each Mission runs only a handful of trials per axis value, so a single
  // death is worth a large slice of the clear rate. The deterministic
  // controller also re-plans as loadout power changes, which legitimately
  // shifts its route. Only report an inversion when the stronger side loses by
  // more than one trial, otherwise the finding just reports sampling noise.
  const isInverted = (weaker, stronger) => {
    const trials = Math.max(stronger.attempts, 1);
    // Compare EXACT ratios. clearRate is rounded to three decimals for the
    // report, and that rounding defeated the one-trial noise floor: 5/6 stored
    // as 0.833 made a single-trial difference read as 0.167 > 1/6. A mission
    // is only inverted when the gap exceeds one whole trial.
    const weakerRate = weaker.clears / Math.max(1, weaker.attempts);
    const strongerRate = stronger.clears / Math.max(1, stronger.attempts);
    return (weakerRate - strongerRate) > (1 / trials) + INVERSION_EPSILON;
  };
  const powerInversionMissionLabels = missionSummaries.filter((mission) => {
    const rows = results.filter(({ missionId }) => missionId === mission.missionId);
    const low = summarizeRows(rows.filter(({ tier }) => tier === 'low'));
    const upgraded = summarizeRows(rows.filter(({ tier }) => tier === 'upgraded'));
    return isInverted(low, upgraded);
  }).map(({ missionLabel }) => missionLabel);
  const supportInversionMissionLabels = missionSummaries.filter((mission) => {
    const rows = results.filter(({ missionId }) => missionId === mission.missionId);
    const none = summarizeRows(rows.filter(({ support }) => support === 'none'));
    const paired = summarizeRows(rows.filter(({ support }) => support === 'paired'));
    return isInverted(none, paired);
  }).map(({ missionLabel }) => missionLabel);
  const summary = summarizeRows(results);
  const balanceDecision = zeroClearMissionLabels.length === 0
    ? 'The deterministic non-boss matrix found at least one clear route for every covered Mission. This is automated evidence only; human mobile/desktop approval is still required.'
    : `The non-boss curve is **not balance-approved** by this harness because ${zeroClearMissionLabels.join(', ')} produced no clears in the requested matrix. Human reproduction and targeted tuning are required before approval.`;
  return {
    metadata: {
      schemaVersion: 2,
      campaignId: campaign.id,
      campaignRevision: campaign.revision,
      campaignUpdatedAt: campaign.updatedAt,
      sourceDigest,
      runtime: 'GameEngine',
      controllerRevision: 'nonboss-lane-planner-v3',
      maximumSeconds,
      firstVisibleThreatDelayCeilingSeconds: FIRST_VISIBLE_THREAT_DELAY_CEILING_SECONDS,
      visibleCombatDeadAirCeilingSeconds: VISIBLE_COMBAT_DEAD_AIR_CEILING_SECONDS
    },
    coverage: {
      sectorCount: new Set(missionDescriptors.map(({ sectorIndex }) => sectorIndex)).size,
      nonBossMissionCount: missionDescriptors.length,
      mainPathMissionCount: missionDescriptors.filter(({ isRouteAlternative }) => !isRouteAlternative).length,
      routeAlternativeCount: missionDescriptors.filter(({ isRouteAlternative }) => isRouteAlternative).length,
      tierIds: tiers,
      supportIds: supportSets,
      viewportIds: viewports
    },
    summary,
    missionSummaries,
    axisSummaries: {
      tier: tierRows,
      support: supportRows,
      viewport: viewportRows
    },
    detailedCheckpoints: results.filter(({ missionLabel }) => missionLabel === 'M2' || missionLabel === 'M7'),
    findings: {
      balanceDecision,
      projectileCeilingBreaches: results.filter(({ maximumHostileProjectiles }) => maximumHostileProjectiles > 80).length,
      firstVisibleThreatDelayBreaches: results.filter(({ maximumFirstVisibleThreatDelaySeconds }) => (
        maximumFirstVisibleThreatDelaySeconds > FIRST_VISIBLE_THREAT_DELAY_CEILING_SECONDS
      )).length,
      visibleCombatDeadAirBreaches: results.filter(({ maximumVisibleCombatDeadAirSeconds }) => (
        maximumVisibleCombatDeadAirSeconds > VISIBLE_COMBAT_DEAD_AIR_CEILING_SECONDS
      )).length,
      performanceModeCells: results.filter(({ performanceModeFrames }) => performanceModeFrames > 0).length,
      heavySceneCells: results.filter(({ heavySceneFrames }) => heavySceneFrames > 0).length,
      zeroClearMissionLabels,
      powerInversionMissionLabels,
      supportInversionMissionLabels
    },
    results
  };
};

const runSimulation = async (argv = process.argv.slice(2), root = repositoryRoot) => {
  const selectedMissionIds = readSetArgument(argv, 'missions');
  const selectedTierIds = readSetArgument(argv, 'tiers');
  const selectedSupportIds = readSetArgument(argv, 'supports');
  const selectedViewportIds = readSetArgument(argv, 'viewports');
  const maximumSeconds = Math.max(60, Number(readArgument(argv, 'max-seconds')) || 180);
  // The full matrix can run for several minutes. Capture the exact source
  // snapshot before Vite loads the runtime, then refuse to publish mixed-state
  // results if Campaign or simulation sources change while trials are running.
  const sourceDigestAtStart = computeCampaignNonBossSourceDigest(root);
  const vite = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    resolve: {
      alias: {
        '@game': root,
        '@director': path.join(root, 'director', 'src')
      }
    },
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom'
  });

  try {
    const [
      levelConfig,
      gameLogic,
      entityTypes,
      combatLab,
      weaponProgression,
      weeklyScoring,
      weeklyRuntimeAdapter
    ] = await Promise.all([
      vite.ssrLoadModule('/services/levelConfig.ts'),
      vite.ssrLoadModule('/services/gameLogic.ts'),
      vite.ssrLoadModule('/types.ts'),
      vite.ssrLoadModule('/director/src/combat-lab/experimentModel.ts'),
      vite.ssrLoadModule('/services/weaponTierProgression.ts'),
      vite.ssrLoadModule('/services/weeklyCampaignStreak.ts'),
      vite.ssrLoadModule('/services/weeklyCampaignRuntimeAdapter.ts')
    ]);
    const { DEFAULT_GAME_CAMPAIGN } = levelConfig;
    const { GameEngine } = gameLogic;
    const { EntityType } = entityTypes;
    const { buildCombatLabRuntimeSquadLoadout } = combatLab;
    const { FIRE_RATE_MAX_LEVEL } = weaponProgression;
    const { calculateWeeklyCampaignNodeScore } = weeklyScoring;
    const { buildWeeklyCampaignRuntimeOutcome } = weeklyRuntimeAdapter;

    const viewports = [
      Object.freeze({ id: 'mobile', width: 390, height: 844 }),
      Object.freeze({ id: 'desktop', width: 1280, height: 720 })
    ].filter(({ id }) => !selectedViewportIds || selectedViewportIds.has(id));
    const supportSets = [
      Object.freeze({ id: 'none', companions: Object.freeze([]) }),
      Object.freeze({
        id: 'paired',
        companions: Object.freeze([
          Object.freeze({ slot: 'left', miniShipId: 'prism-skimmer', level: 5 }),
          Object.freeze({ slot: 'right', miniShipId: 'beacon-kite', level: 5 })
        ])
      })
    ].filter(({ id }) => !selectedSupportIds || selectedSupportIds.has(id));
    const tierIds = ['low', 'expected', 'upgraded']
      .filter((id) => !selectedTierIds || selectedTierIds.has(id));
    if (viewports.length === 0 || supportSets.length === 0 || tierIds.length === 0) {
      throw new Error('The selected matrix axes produced no trials.');
    }

    const graph = DEFAULT_GAME_CAMPAIGN.campaignGraph;
    if (!graph) throw new Error('Campaign non-boss matrix requires the authored Campaign graph.');
    const levelById = new Map(DEFAULT_GAME_CAMPAIGN.levels.map((level) => [level.id, level]));
    const routeNodeIds = new Set(DEFAULT_GAME_CAMPAIGN.sectors.flatMap((sector) => sector.routeNodeIds));
    const sectorIndexByNodeId = new Map(DEFAULT_GAME_CAMPAIGN.sectors.flatMap((sector, index) => (
      [...sector.mainNodeIds, ...sector.routeNodeIds].map((nodeId) => [nodeId, index + 1])
    )));
    const missionDescriptors = graph.nodes.map((node) => {
      const level = levelById.get(node.missionDefinitionId);
      if (!level) throw new Error(`Campaign graph node ${node.nodeId} references an unknown Mission.`);
      const isRouteAlternative = routeNodeIds.has(node.nodeId);
      return {
        node,
        level,
        isRouteAlternative,
        sectorIndex: sectorIndexByNodeId.get(node.nodeId) ?? 0,
        missionLabel: `M${node.depth}${isRouteAlternative ? 'B' : ''}`
      };
    }).filter(({ node, level }) => (
      !node.bossId && level.campaignProgression.missionRole !== 'major-boss'
    )).filter(({ level, missionLabel }) => {
      if (!selectedMissionIds) return true;
      const tokens = [
        level.id.toLowerCase(),
        String(level.order),
        missionLabel.toLowerCase(),
        missionLabel.slice(1).toLowerCase()
      ];
      return tokens.some((token) => selectedMissionIds.has(token));
    }).sort((left, right) => (
      left.node.depth - right.node.depth
      || Number(left.isRouteAlternative) - Number(right.isRouteAlternative)
      || left.level.order - right.level.order
    ));
    if (missionDescriptors.length === 0) throw new Error('No non-boss Missions matched the selection.');

    const allocateMainUpgrades = (total) => {
      const bounded = clamp(Math.round(total), 0, FIRE_RATE_MAX_LEVEL + 14);
      const speed = Math.min(7, Math.round(bounded * 0.2));
      const startingHearts = Math.min(7, Math.round(bounded * 0.2));
      const fireRate = Math.min(FIRE_RATE_MAX_LEVEL, bounded - speed - startingHearts);
      const assigned = fireRate + speed + startingHearts;
      return {
        fireRate: Math.min(FIRE_RATE_MAX_LEVEL, fireRate + Math.max(0, bounded - assigned)),
        speed,
        startingHearts
      };
    };
    const loadoutTiersFor = (descriptor) => {
      const guidance = descriptor.level.campaignProgression.recommendedPower;
      return [
        ['low', guidance.minimum],
        ['expected', guidance.expected],
        ['upgraded', guidance.comfortable]
      ].filter(([id]) => tierIds.includes(id)).map(([id, power]) => ({
        id,
        power,
        upgrades: allocateMainUpgrades((power - 1000) / 160)
      }));
    };
    const createStats = (upgrades) => ({
      score: 0,
      highScore: 0,
      wave: 1,
      coins: 0,
      totalCoins: 0,
      enemiesDefeated: 0,
      bombs: 0,
      bombCharge: 0,
      bombChargeMax: 100,
      shipAbilityCooldown: 0,
      shipAbilityCooldownMax: 960,
      lives: 3 + upgrades.startingHearts,
      repairsCount: 0,
      upgrades: { fireRate: upgrades.fireRate, speed: upgrades.speed },
      powerupUses: {},
      bossProgress: 0,
      isBossActive: false,
      bossHp: 0,
      bossMaxHp: 100
    });
    const hostileBodyTypes = new Set([
      EntityType.ENEMY_DRONE,
      EntityType.ENEMY_JOURNAL,
      EntityType.ENEMY_BRICK,
      EntityType.ENEMY_SWARM,
      EntityType.ENEMY_INVADER,
      EntityType.MINI_BOSS,
      EntityType.BOSS
    ]);
    const isHostileBody = (entity) => hostileBodyTypes.has(entity.type);
    const isHostileProjectile = (entity) => (
      entity.type === EntityType.PROJECTILE && !entity.isPlayerShot && !entity.isTelegraph
    );
    const collectThreats = (engine) => engine.entities.filter((entity) => (
      !entity.markedForDeletion
      && !entity.isPlayerShot
      && (entity.type === EntityType.PROJECTILE || isHostileBody(entity))
    ));
    const hostileRiskAt = (engine, x, y, threats = collectThreats(engine)) => {
      let risk = 0;
      const playerRadius = Math.max(18, Math.min(engine.player.width, engine.player.height) * 0.28);
      for (const entity of threats) {
        if (entity.markedForDeletion || entity.isPlayerShot) continue;
        const projectile = entity.type === EntityType.PROJECTILE;
        const hostileBody = isHostileBody(entity);
        if (!projectile && !hostileBody) continue;
        const telegraphWeight = entity.isTelegraph ? 0.56 : 1;
        if (entity.isBeam) {
          const distance = pointToRotatedRectangleDistance(x, y, entity);
          const margin = playerRadius + (entity.isTelegraph ? 52 : 34);
          if (distance < margin) {
            risk += (entity.isTelegraph ? 480 : 1700)
              * telegraphWeight
              * (1 - distance / margin) ** 2;
          }
          continue;
        }
        const entityRadius = Math.max(7, Math.min(56, Math.hypot(entity.width, entity.height) * 0.25));
        const margin = playerRadius + entityRadius + (projectile ? 70 : 96);
        if (projectile) {
          const startX = entity.x + entity.width / 2;
          const startY = entity.y + entity.height / 2;
          const currentDistance = Math.hypot(x - startX, y - startY);
          if (currentDistance < margin) {
            risk += 880 * telegraphWeight * (1 - currentDistance / margin) ** 2;
          }
          const pathDistance = pointToSegmentDistance(
            x,
            y,
            startX,
            startY,
            startX + entity.vx * 60,
            startY + entity.vy * 60
          );
          if (pathDistance < margin) {
            risk += 960 * telegraphWeight * (1 - pathDistance / margin) ** 2;
          }
        } else {
          for (const lookahead of [0, 8, 16, 24]) {
            const centerX = entity.x + entity.width / 2 + entity.vx * lookahead;
            const centerY = entity.y + entity.height / 2 + entity.vy * lookahead;
            const distance = Math.hypot(x - centerX, y - centerY);
            if (distance >= margin) continue;
            risk += 3200 * telegraphWeight * (1 - distance / margin) ** 2;
          }
        }
      }
      return risk;
    };
    const hostileTransitRisk = (engine, fromX, fromY, toX, toY, threats = collectThreats(engine)) => {
      let risk = 0;
      const playerRadius = Math.max(18, Math.min(engine.player.width, engine.player.height) * 0.28);
      const travelDistance = Math.hypot(toX - fromX, toY - fromY);
      const estimatedPlayerSpeed = 7.2 + Math.max(0, Number(engine.stats?.upgrades?.speed) || 0) * 0.62;
      const arrivalFrames = Math.max(4, travelDistance / estimatedPlayerSpeed);
      for (const entity of threats) {
        if (entity.markedForDeletion || entity.isPlayerShot || entity.isTelegraph) continue;
        const projectile = entity.type === EntityType.PROJECTILE;
        const hostileBody = isHostileBody(entity);
        if (!projectile && !hostileBody) continue;
        if (entity.isBeam) continue;
        const entityRadius = Math.max(7, Math.min(56, Math.hypot(entity.width, entity.height) * 0.25));
        const margin = playerRadius + entityRadius + (projectile ? 40 : 82);
        const horizon = projectile ? 48 : 24;
        const arrival = Math.min(horizon, arrivalFrames);
        const entityStartX = entity.x + entity.width / 2;
        const entityStartY = entity.y + entity.height / 2;
        const playerArrivalProgress = Math.min(1, arrival / arrivalFrames);
        const relativeStartX = entityStartX - fromX;
        const relativeStartY = entityStartY - fromY;
        const relativeArrivalX = entityStartX + entity.vx * arrival
          - (fromX + (toX - fromX) * playerArrivalProgress);
        const relativeArrivalY = entityStartY + entity.vy * arrival
          - (fromY + (toY - fromY) * playerArrivalProgress);
        const transitDistance = pointToSegmentDistance(
          0,
          0,
          relativeStartX,
          relativeStartY,
          relativeArrivalX,
          relativeArrivalY
        );
        const settledDistance = arrival < horizon
          ? pointToSegmentDistance(
            toX,
            toY,
            entityStartX + entity.vx * arrival,
            entityStartY + entity.vy * arrival,
            entityStartX + entity.vx * horizon,
            entityStartY + entity.vy * horizon
          )
          : Number.POSITIVE_INFINITY;
        const distance = Math.min(transitDistance, settledDistance);
        if (distance < margin) {
          risk += (projectile ? 1640 : 3600) * (1 - distance / margin) ** 2;
        }
      }
      return risk;
    };
    const targetPriority = (entity, height) => {
      const elite = entity.isElite ? 900 : 0;
      const boss = entity.type === EntityType.MINI_BOSS || entity.type === EntityType.BOSS ? 2200 : 0;
      const invader = entity.type === EntityType.ENEMY_INVADER ? 700 : 0;
      const shooter = entity.campaignFireBehavior && entity.campaignFireBehavior !== 'none' ? 620 : 0;
      const onScreen = entity.y > -entity.height && entity.y < height ? 500 : 0;
      return boss + elite + invader + shooter + onScreen + clamp(entity.y, -100, height) * 1.6 - Math.max(0, entity.hp) * 0.04;
    };
    const chooseTouchTarget = (engine, width, height) => {
      const playerCenterX = engine.player.x + engine.player.width / 2;
      const playerCenterY = engine.player.y + engine.player.height / 2;
      const threats = collectThreats(engine);
      const targets = engine.entities
        .filter((entity) => !entity.markedForDeletion && entity.hp > 0 && isHostileBody(entity))
        .sort((left, right) => targetPriority(right, height) - targetPriority(left, height));
      const target = targets[0] ?? null;
      const travelFrames = target
        ? clamp((playerCenterY - (target.y + target.height)) / 12, 5, 44)
        : 0;
      const targetCenterX = target
        ? clamp(target.x + target.width / 2 + target.vx * travelFrames, 12, width - 12)
        : width / 2;
      const aimWindow = Math.max(32, Math.min(90, Number(target?.width || 72) * 0.55));
      const coins = engine.entities.filter((entity) => (
        !entity.markedForDeletion && entity.type === EntityType.COIN
      ));
      const immediateThreats = threats.filter((entity) => (
        entity.type === EntityType.PROJECTILE
        || entity.y + entity.height >= height * 0.48
      ));
      if (immediateThreats.length === 0) {
        const touchLead = width < 520 ? 82 : 64;
        return {
          x: clamp(targetCenterX, 2, width - 2),
          y: clamp(height * 0.8 + touchLead, 2, height - 2)
        };
      }
      const candidateRatios = width < 520
        ? [0.08, 0.22, 0.38, 0.5, 0.62, 0.78, 0.92]
        : [0.07, 0.2, 0.36, 0.5, 0.64, 0.8, 0.93];
      const xCandidates = [...new Set([
        ...candidateRatios.map((ratio) => width * ratio),
        playerCenterX,
        playerCenterX - 36,
        playerCenterX + 36,
        targetCenterX,
        ...coins.slice(0, 1).map((entity) => entity.x + entity.width / 2)
      ].map((value) => Math.round(clamp(value, width * 0.05, width * 0.95))))];
      const yCandidates = [...new Set([
        ...[0.62, 0.76, 0.89].map((ratio) => height * ratio),
        playerCenterY - 40,
        playerCenterY,
        playerCenterY + 40
      ].map((value) => Math.round(clamp(value, height * 0.56, height - 72))))];
      let best = { x: playerCenterX, y: playerCenterY, score: Number.POSITIVE_INFINITY };
      for (const x of xCandidates) {
        for (const y of yCandidates) {
          const destinationRisk = hostileRiskAt(engine, x, y, immediateThreats);
          const transitRisk = hostileTransitRisk(engine, playerCenterX, playerCenterY, x, y, immediateThreats);
          const risk = destinationRisk * 0.58 + transitRisk;
          const aimDistance = target ? Math.abs(x - targetCenterX) : 0;
          const aimCost = target ? Math.min(140, (aimDistance / aimWindow) ** 1.28 * 48) : 0;
          const movementCost = Math.hypot(x - playerCenterX, y - playerCenterY) / width * 22;
          const verticalCost = Math.abs(y - height * 0.8) / height * 8;
          const nearestCoinDistance = coins.reduce((minimum, coin) => Math.min(
            minimum,
            Math.hypot(x - (coin.x + coin.width / 2), y - (coin.y + coin.height / 2))
          ), Number.POSITIVE_INFINITY);
          const coinBenefit = Number.isFinite(nearestCoinDistance)
            ? Math.max(0, 15 * (1 - nearestCoinDistance / 150))
            : 0;
          const score = risk + aimCost + movementCost + verticalCost - coinBenefit;
          if (score < best.score) best = { x, y, score };
        }
      }
      const touchLead = width < 520 ? 82 : 64;
      return {
        x: clamp(best.x, 2, width - 2),
        y: clamp(best.y + touchLead, 2, height - 2)
      };
    };
    const performanceStarsFor = (level, summary) => Math.min(3,
      level.campaignProgression.masteryObjectives.filter((objective) => {
        if (objective.kind === 'complete') return true;
        if (objective.kind === 'damage-at-most') return summary.damageTaken <= objective.target;
        if (objective.kind === 'coins-at-least') return summary.coinsCollected >= objective.target;
        if (objective.kind === 'score-at-least') return summary.scoreEarned >= objective.target;
        if (objective.kind === 'time-at-most') return summary.elapsedSeconds <= objective.target;
        return false;
      }).length
    );
    const projectedWeeklyPoints = (descriptor, summary) => {
      const parTimeSeconds = descriptor.level.campaignProgression.masteryObjectives.find((objective) => (
        objective.kind === 'time-at-most'
      ))?.target;
      const outcome = buildWeeklyCampaignRuntimeOutcome(summary, {
        parTimeSeconds,
        performanceStars: performanceStarsFor(descriptor.level, summary)
      });
      return calculateWeeklyCampaignNodeScore(
        descriptor.node,
        null,
        outcome,
        0
      ).totalPoints;
    };
    const runTrial = ({ descriptor, tier, supportSet, viewport }) => {
      const stats = createStats(tier.upgrades);
      const squadLoadout = buildCombatLabRuntimeSquadLoadout({
        mainShipId: 'researchhub',
        upgrades: tier.upgrades,
        companions: supportSet.companions
      });
      const seed = `campaign-nonboss:${descriptor.level.id}:shared-v1`;
      const engine = new GameEngine(stats, {
        campaign: DEFAULT_GAME_CAMPAIGN,
        previewMode: false,
        previewInvincible: false,
        audioEnabled: false,
        playerShipId: 'researchhub',
        initialLevelId: descriptor.level.id,
        initialWaveId: descriptor.level.waves[0].id,
        squadLoadout,
        randomSeed: seed
      });
      engine.init(viewport.width, viewport.height);
      // The balance runner owns no renderer. Disable presentation-only pools
      // while preserving scheduling, movement, collision, damage, drops,
      // companions, and every fixed-step gameplay rule in GameEngine.
      engine.bgEntities = [];
      engine.stars = [];
      engine.spawnThrusterParticles = () => {};
      engine.spawnBurst = () => {};
      engine.spawnExplosion = () => {};
      engine.spawnFloatingText = () => {};
      engine.spawnRingEffect = () => {};
      engine.addPlayerAfterimage = () => {};
      const startingLives = stats.lives;
      let maximumHostileProjectiles = 0;
      let maximumPlayerProjectiles = 0;
      let maximumActiveEntities = 0;
      let maximumActiveFiringEnemies = 0;
      let maximumActiveThreatCost = 0;
      let maximumActivePerformanceCost = 0;
      let maximumPerformanceBudgetRatio = 0;
      let performanceModeFrames = 0;
      let heavySceneFrames = 0;
      let latestRuntime = engine.getRuntimeState();
      let maximumFirstVisibleThreatDelayFrames = 0;
      let maximumFirstVisibleThreatDelayWaveId = latestRuntime.waveId;
      let maximumFirstVisibleThreatDelayWaveNumber = latestRuntime.waveNumber;
      let maximumFirstVisibleThreatDelayContext = {};
      let maximumVisibleCombatDeadAirFrames = 0;
      let maximumVisibleCombatDeadAirWaveId = latestRuntime.waveId;
      let maximumVisibleCombatDeadAirWaveNumber = latestRuntime.waveNumber;
      let maximumVisibleCombatDeadAirEndSeconds = 0;
      let maximumVisibleCombatDeadAirContext = {};
      let currentVisibleCombatDeadAirFrames = 0;
      let currentWaveEligibleFrames = 0;
      let currentWaveHasVisibleThreat = false;
      let bombsUsed = 0;
      let abilitiesUsed = 0;
      const damageSourceCounts = {};
      const damageEvents = [];
      let deathWave = null;
      let pacingWaveId = latestRuntime.waveId;
      const isVisibleInViewport = (entity) => (
        entity.x < viewport.width
        && entity.x + Math.max(0, Number(entity.width) || 0) > 0
        && entity.y < viewport.height
        && entity.y + Math.max(0, Number(entity.height) || 0) > 0
      );
      const recordFirstVisibleThreatDelay = (frames) => {
        if (frames <= maximumFirstVisibleThreatDelayFrames) return;
        maximumFirstVisibleThreatDelayFrames = frames;
        maximumFirstVisibleThreatDelayWaveId = latestRuntime.waveId;
        maximumFirstVisibleThreatDelayWaveNumber = latestRuntime.waveNumber;
        const offscreenThreats = engine.entities.filter((entity) => (
          !entity.markedForDeletion
          && isHostileBody(entity)
          && !isVisibleInViewport(entity)
        ));
        maximumFirstVisibleThreatDelayContext = {
          activeThreatCount: engine.getActiveThreatCount(),
          visibleThreatCount: engine.getVisibleActiveThreatCount(),
          activePerformanceCost: rounded(engine.getActiveCampaignPerformanceCost(), 2),
          mobilePerformanceBudget: engine.getCurrentMobilePerformanceBudget(),
          scheduledSpawnsComplete: engine.getConfiguredSpawnsComplete(),
          waveProgressFrames: engine.waveProgressFrames,
          offscreenStates: Object.fromEntries([...offscreenThreats.reduce((counts, entity) => {
            const key = `${entity.type}:${entity.formationState || 'loose'}`;
            counts.set(key, (counts.get(key) ?? 0) + 1);
            return counts;
          }, new Map())].sort(([left], [right]) => left.localeCompare(right)))
        };
      };
      const recordPacingFrame = () => {
        if (latestRuntime.waveId !== pacingWaveId) {
          pacingWaveId = latestRuntime.waveId;
          currentWaveEligibleFrames = 0;
          currentWaveHasVisibleThreat = false;
          currentVisibleCombatDeadAirFrames = 0;
        }
        const combatWindowActive = engine.gameActive
          && engine.introFlightFrames <= 0
          && engine.stageRewardCollectionFrames <= 0
          && engine.waveDepartureFrames <= 0
          && engine.deathSequenceFrames <= 0
          && !engine.waveTransitionPending;
        if (!combatWindowActive) return;

        currentWaveEligibleFrames++;
        const visibleThreat = engine.inBossWarningSequence || engine.entities.some((entity) => (
          !entity.markedForDeletion
          && (isHostileBody(entity) || isHostileProjectile(entity))
          && isVisibleInViewport(entity)
        ));
        if (visibleThreat) {
          if (!currentWaveHasVisibleThreat) {
            recordFirstVisibleThreatDelay(currentWaveEligibleFrames - 1);
          }
          currentWaveHasVisibleThreat = true;
          currentVisibleCombatDeadAirFrames = 0;
          return;
        }
        if (!currentWaveHasVisibleThreat) {
          recordFirstVisibleThreatDelay(currentWaveEligibleFrames);
          return;
        }
        currentVisibleCombatDeadAirFrames++;
        if (currentVisibleCombatDeadAirFrames > maximumVisibleCombatDeadAirFrames) {
          maximumVisibleCombatDeadAirFrames = currentVisibleCombatDeadAirFrames;
          maximumVisibleCombatDeadAirWaveId = latestRuntime.waveId;
          maximumVisibleCombatDeadAirWaveNumber = latestRuntime.waveNumber;
          maximumVisibleCombatDeadAirEndSeconds = latestRuntime.elapsedSeconds;
          const offscreenThreats = engine.entities.filter((entity) => (
            !entity.markedForDeletion
            && isHostileBody(entity)
            && !isVisibleInViewport(entity)
          ));
          maximumVisibleCombatDeadAirContext = {
            activeThreatCount: engine.getActiveThreatCount(),
            visibleThreatCount: engine.getVisibleActiveThreatCount(),
            activePerformanceCost: rounded(engine.getActiveCampaignPerformanceCost(), 2),
            mobilePerformanceBudget: engine.getCurrentMobilePerformanceBudget(),
            scheduledSpawnsComplete: engine.getConfiguredSpawnsComplete(),
            waveProgressFrames: engine.waveProgressFrames,
            offscreenStates: Object.fromEntries([...offscreenThreats.reduce((counts, entity) => {
              const key = `${entity.type}:${entity.formationState || 'loose'}`;
              counts.set(key, (counts.get(key) ?? 0) + 1);
              return counts;
            }, new Map())].sort(([left], [right]) => left.localeCompare(right)))
          };
        }
      };
      const pacingSnapshot = () => ({
        maximumFirstVisibleThreatDelaySeconds: rounded(maximumFirstVisibleThreatDelayFrames / 60, 2),
        maximumFirstVisibleThreatDelayWaveId,
        maximumFirstVisibleThreatDelayWaveNumber,
        maximumFirstVisibleThreatDelayContext,
        maximumVisibleCombatDeadAirSeconds: rounded(maximumVisibleCombatDeadAirFrames / 60, 2),
        maximumVisibleCombatDeadAirWaveId,
        maximumVisibleCombatDeadAirWaveNumber,
        maximumVisibleCombatDeadAirStartSeconds: rounded(
          maximumVisibleCombatDeadAirEndSeconds - maximumVisibleCombatDeadAirFrames / 60,
          2
        ),
        maximumVisibleCombatDeadAirEndSeconds: rounded(maximumVisibleCombatDeadAirEndSeconds, 2),
        maximumVisibleCombatDeadAirContext
      });
      const describeDamageSource = (entity, prefix) => {
        const suffix = entity?.isBeam
          ? 'beam'
          : String(entity?.campaignRoleId || entity?.campaignFireBehavior || entity?.type || 'unknown');
        return `${prefix}:${suffix}`;
      };
      const recordDamageSource = (key, beforeLives) => {
        const damage = Math.max(0, beforeLives - stats.lives);
        if (damage > 0) damageSourceCounts[key] = (damageSourceCounts[key] ?? 0) + damage;
      };
      const originalProjectileFeedback = engine.registerPlayerProjectileHitFeedback.bind(engine);
      engine.registerPlayerProjectileHitFeedback = (entity, blocked) => {
        if (!blocked) {
          const key = describeDamageSource(entity, 'projectile');
          damageSourceCounts[key] = (damageSourceCounts[key] ?? 0) + Math.max(1, Math.round(Number(entity?.damage) || 1));
          if (damageEvents.length < 12) {
            damageEvents.push({
              frame: engine.frameCount,
              wave: engine.getRuntimeState().waveNumber,
              kind: key,
              playerX: rounded(engine.player.x + engine.player.width / 2, 1),
              playerY: rounded(engine.player.y + engine.player.height / 2, 1),
              sourceX: rounded(entity.x + entity.width / 2, 1),
              sourceY: rounded(entity.y + entity.height / 2, 1),
              sourceVx: rounded(entity.vx, 2),
              sourceVy: rounded(entity.vy, 2),
              sourceWidth: rounded(entity.width, 1),
              sourceHeight: rounded(entity.height, 1)
            });
          }
        }
        return originalProjectileFeedback(entity, blocked);
      };
      const originalRamCollision = engine.resolvePlayerRamCollision.bind(engine);
      engine.resolvePlayerRamCollision = (entity, invincible) => {
        const beforeLives = stats.lives;
        const result = originalRamCollision(entity, invincible);
        if (!invincible) recordDamageSource(describeDamageSource(entity, 'ram'), beforeLives);
        return result;
      };
      const frameLimit = Math.round(maximumSeconds * 60);
      for (let frame = 0; frame < frameLimit; frame += 1) {
        if (frame % 8 === 0) {
          engine.handleInput({}, chooseTouchTarget(engine, viewport.width, viewport.height));
        }
        if (frame % 6 === 0 && engine.introFlightFrames <= 0 && engine.waveDepartureFrames <= 0) {
          const activeHostiles = engine.entities.filter((entity) => (
            !entity.markedForDeletion && entity.hp > 0 && isHostileBody(entity)
          ));
          const activeHostileProjectiles = engine.entities.filter((entity) => (
            !entity.markedForDeletion && isHostileProjectile(entity)
          )).length;
          const playerCenterX = engine.player.x + engine.player.width / 2;
          const playerCenterY = engine.player.y + engine.player.height / 2;
          const priorityTarget = activeHostiles
            .slice()
            .sort((left, right) => targetPriority(right, viewport.height) - targetPriority(left, viewport.height))[0];
          const abilityAligned = priorityTarget
            && Math.abs((priorityTarget.x + priorityTarget.width / 2) - playerCenterX)
              <= Math.max(88, priorityTarget.width * 0.6)
            && priorityTarget.y < playerCenterY;
          if (
            stats.shipAbilityCooldown <= 0
            && abilityAligned
            && (
              priorityTarget.type === EntityType.MINI_BOSS
              || priorityTarget.isElite
              || activeHostiles.length >= 5
            )
            && engine.triggerShipAbility()
          ) abilitiesUsed++;

          const localRisk = hostileRiskAt(engine, playerCenterX, playerCenterY);
          const denseThreat = activeHostiles.length >= 10 || activeHostileProjectiles >= 7;
          const emergency = localRisk >= 180 || (engine.lives <= 2 && localRisk >= 90);
          if (
            stats.bombs > 0
            && frame - engine.lastBombFrame >= 300
            && (denseThreat || emergency)
            && engine.triggerBomb()
          ) bombsUsed++;
        }
        engine.update();
        latestRuntime = engine.getRuntimeState();
        recordPacingFrame();
        if (frame % 3 !== 0) {
          if (engine.waveVictoryReady || !engine.gameActive) {
            // Completion/death is handled below on its exact fixed step.
          } else {
            continue;
          }
        }
        const activeEntities = engine.entities.filter((entity) => !entity.markedForDeletion);
        const hostileProjectiles = activeEntities.filter(isHostileProjectile).length;
        const playerProjectiles = activeEntities.filter((entity) => (
          (entity.type === EntityType.PROJECTILE || entity.type === EntityType.MISSILE)
          && entity.isPlayerShot
        )).length;
        const activeFiringEnemies = engine.getActiveCampaignShooterCount();
        const activeThreatCost = activeEntities.reduce((total, entity) => (
          isHostileBody(entity) ? total + Math.max(0, Number(entity.campaignThreatCost) || 0) : total
        ), 0);
        const activePerformanceCost = activeEntities.reduce((total, entity) => (
          isHostileBody(entity) ? total + Math.max(0, Number(entity.campaignPerformanceCost) || 0) : total
        ), 0);
        const performanceBudget = Math.max(1, engine.getCurrentMobilePerformanceBudget());
        maximumHostileProjectiles = Math.max(maximumHostileProjectiles, hostileProjectiles);
        maximumPlayerProjectiles = Math.max(maximumPlayerProjectiles, playerProjectiles);
        maximumActiveEntities = Math.max(maximumActiveEntities, activeEntities.length);
        maximumActiveFiringEnemies = Math.max(maximumActiveFiringEnemies, activeFiringEnemies);
        maximumActiveThreatCost = Math.max(maximumActiveThreatCost, activeThreatCost);
        maximumActivePerformanceCost = Math.max(maximumActivePerformanceCost, activePerformanceCost);
        maximumPerformanceBudgetRatio = Math.max(
          maximumPerformanceBudgetRatio,
          activePerformanceCost / performanceBudget
        );
        if (engine.performanceMode) performanceModeFrames++;
        if (engine.heavySceneLoad) heavySceneFrames++;

        if (engine.waveVictoryReady) {
          const summary = engine.getWaveVictorySummary();
          if (!summary?.stageComplete) throw new Error(`${descriptor.level.id} exposed a non-stage victory.`);
          return {
            missionId: descriptor.level.id,
            nodeId: descriptor.node.nodeId,
            missionLabel: descriptor.missionLabel,
            missionRole: descriptor.level.campaignProgression.missionRole,
            routeKind: descriptor.isRouteAlternative ? 'alternative' : 'main',
            sectorIndex: descriptor.sectorIndex,
            tier: tier.id,
            support: supportSet.id,
            viewport: viewport.id,
            seed,
            outcome: 'clear',
            deathWave: null,
            elapsedSeconds: rounded(summary.elapsedSeconds, 1),
            damage: Math.max(summary.damageTaken, startingLives - summary.remainingLives),
            livesRemaining: summary.remainingLives,
            coinsCollected: summary.coinsCollected,
            enemiesDefeated: summary.enemiesDefeated,
            wavesCleared: summary.waveTotal,
            weeklyPoints: projectedWeeklyPoints(descriptor, summary),
            bombsUsed,
            abilitiesUsed,
            damageSourceCounts,
            damageEvents,
            maximumHostileProjectiles,
            maximumPlayerProjectiles,
            maximumActiveEntities,
            maximumActiveFiringEnemies,
            maximumActiveThreatCost: rounded(maximumActiveThreatCost, 2),
            maximumActivePerformanceCost: rounded(maximumActivePerformanceCost, 2),
            maximumPerformanceBudgetRatio: rounded(maximumPerformanceBudgetRatio, 2),
            ...pacingSnapshot(),
            performanceModeFrames,
            heavySceneFrames
          };
        }
        if (!engine.gameActive) {
          deathWave = latestRuntime.waveNumber;
          return {
            missionId: descriptor.level.id,
            nodeId: descriptor.node.nodeId,
            missionLabel: descriptor.missionLabel,
            missionRole: descriptor.level.campaignProgression.missionRole,
            routeKind: descriptor.isRouteAlternative ? 'alternative' : 'main',
            sectorIndex: descriptor.sectorIndex,
            tier: tier.id,
            support: supportSet.id,
            viewport: viewport.id,
            seed,
            outcome: 'death',
            deathWave,
            elapsedSeconds: rounded(frame / 60, 1),
            damage: Math.max(0, startingLives - stats.lives),
            livesRemaining: stats.lives,
            coinsCollected: stats.totalCoins,
            enemiesDefeated: stats.enemiesDefeated,
            wavesCleared: Math.max(0, latestRuntime.waveNumber - 1),
            weeklyPoints: 0,
            bombsUsed,
            abilitiesUsed,
            damageSourceCounts,
            damageEvents,
            maximumHostileProjectiles,
            maximumPlayerProjectiles,
            maximumActiveEntities,
            maximumActiveFiringEnemies,
            maximumActiveThreatCost: rounded(maximumActiveThreatCost, 2),
            maximumActivePerformanceCost: rounded(maximumActivePerformanceCost, 2),
            maximumPerformanceBudgetRatio: rounded(maximumPerformanceBudgetRatio, 2),
            ...pacingSnapshot(),
            performanceModeFrames,
            heavySceneFrames
          };
        }
      }
      return {
        missionId: descriptor.level.id,
        nodeId: descriptor.node.nodeId,
        missionLabel: descriptor.missionLabel,
        missionRole: descriptor.level.campaignProgression.missionRole,
        routeKind: descriptor.isRouteAlternative ? 'alternative' : 'main',
        sectorIndex: descriptor.sectorIndex,
        tier: tier.id,
        support: supportSet.id,
        viewport: viewport.id,
        seed,
        outcome: 'timeout',
        deathWave,
        elapsedSeconds: maximumSeconds,
        damage: Math.max(0, startingLives - stats.lives),
        livesRemaining: stats.lives,
        coinsCollected: stats.totalCoins,
        enemiesDefeated: stats.enemiesDefeated,
        wavesCleared: Math.max(0, latestRuntime.waveNumber - 1),
        weeklyPoints: 0,
        bombsUsed,
        abilitiesUsed,
        damageSourceCounts,
        damageEvents,
        maximumHostileProjectiles,
        maximumPlayerProjectiles,
        maximumActiveEntities,
        maximumActiveFiringEnemies,
        maximumActiveThreatCost: rounded(maximumActiveThreatCost, 2),
        maximumActivePerformanceCost: rounded(maximumActivePerformanceCost, 2),
        maximumPerformanceBudgetRatio: rounded(maximumPerformanceBudgetRatio, 2),
        ...pacingSnapshot(),
        performanceModeFrames,
        heavySceneFrames
      };
    };

    const results = [];
    for (const descriptor of missionDescriptors) {
      for (const tier of loadoutTiersFor(descriptor)) {
        for (const supportSet of supportSets) {
          for (const viewport of viewports) {
            results.push(runTrial({ descriptor, tier, supportSet, viewport }));
          }
        }
      }
    }
    const sourceDigestAtEnd = computeCampaignNonBossSourceDigest(root);
    if (sourceDigestAtEnd !== sourceDigestAtStart) {
      throw new Error(
        'Campaign non-boss simulation sources changed during the run. '
        + 'Discarding mixed-state results; rerun after source edits finish.'
      );
    }
    return createArtifact({
      campaign: DEFAULT_GAME_CAMPAIGN,
      sourceDigest: sourceDigestAtStart,
      missionDescriptors,
      results,
      viewports: viewports.map(({ id }) => id),
      tiers: tierIds,
      supportSets: supportSets.map(({ id }) => id),
      maximumSeconds
    });
  } finally {
    await vite.close();
  }
};

export const runCampaignNonBossBalanceSimulation = runSimulation;

const printSummary = (artifact) => {
  console.log('Campaign non-boss deterministic real-engine balance matrix');
  console.log(`Coverage: ${artifact.coverage.nonBossMissionCount} Missions, ${artifact.summary.attempts} trials`);
  console.log(`Outcomes: ${artifact.summary.clears} clears, ${artifact.summary.deaths} deaths, ${artifact.summary.timeouts} timeouts`);
  for (const row of artifact.missionSummaries) {
    console.log(
      `${row.missionLabel}: ${row.clears}/${row.attempts} clears, ${row.deaths} deaths, ${row.timeouts} timeouts, `
      + `median damage ${row.medianDamage ?? '-'}, coins ${row.medianCoins ?? '-'}, Weekly ${row.medianWeeklyPoints ?? '-'}, `
      + `peak hostile ${row.maximumHostileProjectiles}, entities ${row.maximumActiveEntities}`
    );
  }
};

const main = async () => {
  const argv = process.argv.slice(2);
  const artifact = await runSimulation(argv, repositoryRoot);
  if (argv.includes('--write')) {
    const artifactPath = path.resolve(repositoryRoot, readArgument(argv, 'artifact') || DEFAULT_ARTIFACT_PATH);
    const reportPath = path.resolve(repositoryRoot, readArgument(argv, 'report') || DEFAULT_REPORT_PATH);
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    fs.writeFileSync(reportPath, renderCampaignNonBossBalanceMarkdown(artifact), 'utf8');
  }
  if (argv.includes('--json')) {
    console.log(JSON.stringify(artifact));
  } else {
    printSummary(artifact);
  }
};

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
