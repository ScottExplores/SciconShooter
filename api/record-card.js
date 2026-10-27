const { fetchSupabaseJson, supabaseHeaders } = require('./_lib/supabase');
const { getPlayerShipId, getRecordPresentation } = require('./_lib/recordPresentation');
const gameCampaign = require('../game-config/campaign.json');
const generatedAssetsManifest = require('../game-config/generated-assets.json');

const RECEIPTS_TABLE = process.env.SUPABASE_RUN_RECEIPTS_TABLE || 'scicon_run_receipts';
const LEADERBOARD_TABLE = process.env.SUPABASE_LEADERBOARD_TABLE || 'scicon_leaderboard';
const recordCardRenderer = import('../shared/record-card/renderRecordCardSvg.mjs');
const BUILT_IN_CARD_ASSET_PATHS = {
  PLAYER_SHIP: '/game-art/branding/researchhub-ship.png',
  BIO_SHIP: '/game-art/generated/scicon-flight-motion-pack-v1/ships/bio/frames/bio-03-neutral.png',
  ETH_SHIP: '/game-art/branding/eth-ship.png',
  BTC_SHIP: '/game-art/generated/scicon-flight-motion-pack-v1/ships/btc-token-ship/frames/btc-token-ship-03-neutral.png',
  RSC_TOKEN: '/game-art/tokens/rsc-coin-pixel.png',
  REAL_RSC_ICON: '/game-art/tokens/rsc-bottle.png',
  GAME_BG_BACK: '/game-art/backgrounds/bg-back.png',
  GAME_BG_STARS: '/game-art/backgrounds/bg-stars.png',
  GAME_BG_PLANET: '/game-art/backgrounds/bg-planet.png',
  GAME_PARALLAX_BACK: '/game-art/backgrounds/parallax-back.png',
  GAME_PARALLAX_STARS: '/game-art/backgrounds/parallax-stars.png',
  GAME_PARALLAX_FAR_PLANETS: '/game-art/backgrounds/parallax-far-planets.png',
  GAME_PARALLAX_BIG_PLANET: '/game-art/backgrounds/parallax-big-planet.png',
  GAME_PARALLAX_RING_PLANET: '/game-art/backgrounds/parallax-ring-planet.png',
  ENEMY_DRONE_FRAMES: '/game-art/enemies/paywall-interceptor.png',
  ENEMY_SWARM_FRAMES: '/game-art/enemies/citation-wraith.png',
  ENEMY_BRICK_FRAMES: '/game-art/enemies/peer-review-bulwark.png',
  ASTEROID_BELT_FRAMES: '/game-art/enemies/asteroid-1.png',
  ENEMY_JOURNAL: '/game-art/enemies/predatory-journal-raider.png',
  ENEMY_JOURNAL_FRAMES: '/game-art/enemies/predatory-journal-raider.png',
  CAMPAIGN_BOSS_ECLIPSE_ENGINE: '/game-art/generated/scicon-stage20-expansion-v1/bosses/frames/eclipse-engine.png',
  CAMPAIGN_BOSS_HAMMERHEAD_SIEGE: '/game-art/generated/bosses/campaign-packages/hammerhead-siege/assembled.png',
  CAMPAIGN_BOSS_HELIX_LEVIATHAN: '/game-art/generated/scicon-stage20-expansion-v1/bosses/frames/helix-leviathan.png',
  CAMPAIGN_BOSS_FRONTIER_CROWNCLAW: '/game-art/generated/bosses/astral-crownclaw/astral-crownclaw-intact.png',
  CAMPAIGN_BOSS_HELIOS_CLAWCARRIER: '/game-art/generated/bosses/campaign-packages/helios-clawcarrier/assembled.png',
  CAMPAIGN_BOSS_ORBIT_GYROSCOPE: '/game-art/generated/bosses/campaign-packages/orbit-gyroscope/assembled.png',
  CAMPAIGN_BOSS_NULLWAKE_REVENANT: '/game-art/generated/bosses/campaign-packages/nullwake-revenant/assembled.png',
  CAMPAIGN_BOSS_UMBRA_NEEDLEWING: '/game-art/generated/bosses/campaign-packages/umbra-needlewing/assembled.png',
  CAMPAIGN_BOSS_PRISM_MOTH: '/game-art/generated/bosses/campaign-packages/prism-moth/assembled.png',
  CAMPAIGN_BOSS_RAIL_SERPENT: '/game-art/generated/scicon-stage20-expansion-v1/bosses/frames/rail-serpent.png',
  CAMPAIGN_BOSS_SINGULARITY_CRAB: '/game-art/generated/scicon-stage20-expansion-v1/bosses/frames/singularity-crab.png',
  CAMPAIGN_BOSS_TRIBUNAL_DREADNOUGHT: '/game-art/generated/scicon-stage20-expansion-v1/bosses/frames/tribunal-dreadnought.png',
  CAMPAIGN_ENEMY_BULLET_RING_EMITTER: '/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/bullet-ring-emitter.png',
  CAMPAIGN_ENEMY_CRESCENT_MINELAYER: '/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/crescent-minelayer.png',
  CAMPAIGN_ENEMY_DARK_ASTEROID_SENTINEL: '/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/dark-asteroid-sentinel.png',
  CAMPAIGN_ENEMY_DNA_CONDUCTOR: '/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/dna-conductor.png',
  CAMPAIGN_ENEMY_LASER_HUNTER: '/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/laser-hunter.png',
  CAMPAIGN_ENEMY_LASER_STALKER: '/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/laser-stalker.png',
  CAMPAIGN_ENEMY_ORBIT_DISC: '/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/orbit-disc.png',
  CAMPAIGN_ENEMY_PRISM_ARTILLERY: '/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/prism-artillery.png',
  CAMPAIGN_ENEMY_RING_SENTINEL: '/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/ring-sentinel.png',
  CAMPAIGN_ENEMY_SHIELD_RAMMER: '/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/shield-rammer.png',
  CAMPAIGN_ENEMY_WALL_SNIPER_LEFT: '/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/wall-sniper-left.png',
  CAMPAIGN_ENEMY_WALL_SNIPER_RIGHT: '/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/wall-sniper-right.png',
  SCICON_ENEMY_REDLINE_SKIRMISHER_FRAMES: '/game-art/generated/scicon-retraction-fleet-v2/enemies/redline-skirmisher/frames/redline-skirmisher-01-neutral.png',
  SCICON_ENEMY_CROSSCUT_RAIDER_FRAMES: '/game-art/generated/scicon-retraction-fleet-v2/enemies/crosscut-raider/frames/crosscut-raider-01-neutral.png',
  SCICON_ENEMY_AUDIT_BULWARK_FRAMES: '/game-art/generated/scicon-retraction-fleet-v2/enemies/audit-bulwark/frames/audit-bulwark-01-neutral.png',
  SCICON_ENEMY_QUASAR_LANCER_V2_FRAMES: '/game-art/generated/scicon-retraction-fleet-v2/enemies/quasar-lancer-v2/frames/quasar-lancer-v2-01-neutral.png',
  SCICON_ENEMY_VECTOR_REAVER_V2_FRAMES: '/game-art/generated/scicon-retraction-fleet-v2/enemies/vector-reaver-v2/frames/vector-reaver-v2-01-neutral.png',
  SCICON_ENEMY_QUASAR_LANCER_FRAMES: '/game-art/generated/scicon-advanced-enemy-pack-v1/enemies/quasar-lancer/frames/quasar-lancer-01-neutral.png',
  SCICON_ENEMY_NULL_BASTION_FRAMES: '/game-art/generated/scicon-advanced-enemy-pack-v1/enemies/null-bastion/frames/null-bastion-01-neutral.png',
  SCICON_ENEMY_VECTOR_REAVER_FRAMES: '/game-art/generated/scicon-advanced-enemy-pack-v1/enemies/vector-reaver/frames/vector-reaver-01-neutral.png',
  SCICON_ENEMY_RIFT_WEAVER_FRAMES: '/game-art/generated/scicon-advanced-enemy-pack-v1/enemies/rift-weaver/frames/rift-weaver-01-neutral.png',
  SCICON_ENEMY_PULSE_HERALD_FRAMES: '/game-art/generated/scicon-advanced-enemy-pack-v1/enemies/pulse-herald/frames/pulse-herald-01-neutral.png',
  SCICON_ENEMY_ORBIT_SCOUT_FRAMES: '/game-art/generated/scicon-enemy-squadron-v1/frames/orbit-scout-02.png',
  SCICON_ENEMY_CITATION_DART_FRAMES: '/game-art/generated/scicon-enemy-squadron-v1/frames/citation-dart-02.png',
  SCICON_ENEMY_RESEARCH_SENTRY_FRAMES: '/game-art/generated/scicon-enemy-squadron-v1/frames/research-sentry-02.png',
  SCICON_ENEMY_PEER_BULWARK_FRAMES: '/game-art/generated/scicon-enemy-squadron-v1/frames/peer-bulwark-02.png',
  SCICON_ENEMY_JOURNAL_RAIDER_FRAMES: '/game-art/generated/scicon-enemy-squadron-v1/frames/journal-raider-02.png',
  SCICON_ENEMY_HELIX_CONDUCTOR_FRAMES: '/game-art/generated/scicon-enemy-squadron-v1/frames/rift-skimmer-02.png',
  SCICON_ENEMY_PRISM_ARTILLERY_FRAMES: '/game-art/generated/scicon-enemy-squadron-v1/frames/pulse-interceptor-02.png',
  MINI_BOSS: '/game-art/generated/elite-enemies/bottleneck-drone-v3/frames/bottleneck-drone-01-neutral.png',
  WALL_BOSS_SEGMENT: '/game-art/bosses/wall-segment.png',
  FINAL_BOSS: '/game-art/bosses/final-boss-sentinel.png'
};
const GENERATED_CARD_ASSET_PATHS = Object.fromEntries(
  (Array.isArray(generatedAssetsManifest.assets) ? generatedAssetsManifest.assets : [])
    .filter((entry) => (
      entry
      && typeof entry.id === 'string'
      && /^GENERATED_[A-Z0-9]+(?:_[A-Z0-9]+)*$/.test(entry.id)
      && typeof entry.path === 'string'
      && /^\/game-art\/generated\/[a-z0-9]+(?:-[a-z0-9]+)*\.png$/.test(entry.path)
      && Array.isArray(entry.roles)
      && entry.roles.includes('scorecard')
    ))
    .map((entry) => [entry.id, entry.path])
);
const CARD_ASSET_PATHS = Object.freeze({
  ...BUILT_IN_CARD_ASSET_PATHS,
  ...GENERATED_CARD_ASSET_PATHS
});
const RECORD_CARD_FRAME_PATH = '/game-art/record-card/mission-record-frame.png';
const LOOPBACK_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;
const PLAYER_SHIP_ASSET_KEYS = Object.freeze({
  researchhub: 'PLAYER_SHIP',
  bio: 'BIO_SHIP',
  eth: 'ETH_SHIP',
  btc: 'BTC_SHIP'
});

const resolveAssetOrigin = (req) => {
  const host = String(req.headers?.host || '');
  if (LOOPBACK_HOST.test(host)) return `http://${host}`;
  return (process.env.PUBLIC_APP_URL || 'https://www.sciconshooter.xyz').replace(/\/$/, '');
};

const embedImage = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return url;
    const mimeType = response.headers.get('content-type') || 'image/png';
    const encoded = Buffer.from(await response.arrayBuffer()).toString('base64');
    return `data:${mimeType};base64,${encoded}`;
  } catch {
    return url;
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.statusCode = 405; return res.end('Method not allowed'); }
  const runId = String(req.query?.runId || '');
  if (!/^[0-9a-f-]{36}$/i.test(runId)) { res.statusCode = 400; return res.end('Invalid run ID'); }

  try {
    const [receiptRows, scoreRows] = await Promise.all([
      fetchSupabaseJson(`${RECEIPTS_TABLE}?select=*&run_id=eq.${encodeURIComponent(runId)}&limit=1`, { headers: supabaseHeaders() }),
      fetchSupabaseJson(`${LEADERBOARD_TABLE}?select=name,score,wave,date&run_id=eq.${encodeURIComponent(runId)}&limit=1`, { headers: supabaseHeaders() })
    ]);
    const receipt = Array.isArray(receiptRows) ? receiptRows[0] : null;
    const scoreRow = Array.isArray(scoreRows) ? scoreRows[0] : null;
    if (!receipt) { res.statusCode = 404; return res.end('Record not found'); }

    const requestedPlayerShipId = getPlayerShipId(req.query?.ship || receipt.player_ship_id);
    const record = {
      ...getRecordPresentation(receipt, scoreRow),
      playerShipId: requestedPlayerShipId
    };
    const assetOrigin = resolveAssetOrigin(req);
    const cardConfig = gameCampaign.recordCard || {};
    const {
      formatRecordCardCompletedLabel,
      renderRecordCardSvg,
      resolveRecordCardEncounterArt,
      resolveRecordCardEncounterAssetKey
    } = await recordCardRenderer;
    const completed = formatRecordCardCompletedLabel(record.finishedAt);
    const automaticEncounterKey = resolveRecordCardEncounterAssetKey(gameCampaign, record.wave);
    const encounterAssetKey = cardConfig.encounterAssetKey === 'AUTO'
      ? automaticEncounterKey
      : cardConfig.encounterAssetKey || automaticEncounterKey;
    const encounterFallbackPath = CARD_ASSET_PATHS[encounterAssetKey]
      || CARD_ASSET_PATHS[automaticEncounterKey]
      || CARD_ASSET_PATHS.FINAL_BOSS;
    const encounterLayers = resolveRecordCardEncounterArt(encounterAssetKey, encounterFallbackPath);
    const shipAssetKey = PLAYER_SHIP_ASSET_KEYS[record.playerShipId] || cardConfig.shipAssetKey || 'PLAYER_SHIP';
    const shipPath = CARD_ASSET_PATHS[shipAssetKey] || CARD_ASSET_PATHS.PLAYER_SHIP;
    const [encounterImages, shipImage, frameImage] = await Promise.all([
      Promise.all(encounterLayers.map(async (layer) => ({
        ...layer,
        image: await embedImage(`${assetOrigin}${layer.path}`)
      }))),
      embedImage(`${assetOrigin}${shipPath}`),
      embedImage(`${assetOrigin}${RECORD_CARD_FRAME_PATH}`)
    ]);

    const svg = renderRecordCardSvg({
      record: { ...record, completedLabel: completed },
      encounterImages,
      shipImage,
      frameImage,
      presentation: cardConfig
    });

    res.statusCode = 200;
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=86400');
    return res.end(svg);
  } catch (error) {
    console.error('Record card failed:', error);
    res.statusCode = 500;
    return res.end('Record card unavailable');
  }
};
