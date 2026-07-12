const { fetchSupabaseJson, supabaseHeaders } = require('./_lib/supabase');
const { getRecordPresentation } = require('./_lib/recordPresentation');
const gameCampaign = require('../game-config/campaign.json');
const generatedAssetsManifest = require('../game-config/generated-assets.json');

const RECEIPTS_TABLE = process.env.SUPABASE_RUN_RECEIPTS_TABLE || 'scicon_run_receipts';
const LEADERBOARD_TABLE = process.env.SUPABASE_LEADERBOARD_TABLE || 'scicon_leaderboard';
const recordCardRenderer = import('../shared/record-card/renderRecordCardSvg.mjs');
const BUILT_IN_CARD_ASSET_PATHS = {
  PLAYER_SHIP: '/game-art/branding/researchhub-ship.png',
  RSC_TOKEN: '/game-art/tokens/rsc-coin.svg',
  REAL_RSC_ICON: '/game-art/tokens/rsc-bottle.png',
  GAME_BG_BACK: '/game-art/backgrounds/bg-back.png',
  GAME_BG_STARS: '/game-art/backgrounds/bg-stars.png',
  GAME_BG_PLANET: '/game-art/backgrounds/bg-planet.png',
  GAME_PARALLAX_BACK: '/game-art/backgrounds/parallax-back.png',
  GAME_PARALLAX_STARS: '/game-art/backgrounds/parallax-stars.png',
  GAME_PARALLAX_FAR_PLANETS: '/game-art/backgrounds/parallax-far-planets.png',
  GAME_PARALLAX_BIG_PLANET: '/game-art/backgrounds/parallax-big-planet.png',
  GAME_PARALLAX_RING_PLANET: '/game-art/backgrounds/parallax-ring-planet.png',
  ENEMY_DRONE_FRAMES: '/game-art/enemies/enemy-drone-1.png',
  ENEMY_SWARM_FRAMES: '/game-art/enemies/swarm-1.png',
  ENEMY_BRICK_FRAMES: '/game-art/enemies/asteroid-1.png',
  ENEMY_JOURNAL: '/game-art/enemies/journal-ace.png',
  MINI_BOSS: '/game-art/bosses/mini-boss-drone.png',
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
      fetchSupabaseJson(`${RECEIPTS_TABLE}?select=game_version,integrity_status,finished_at,duration_ms,score,wave,enemies_defeated,coins_collected&run_id=eq.${encodeURIComponent(runId)}&limit=1`, { headers: supabaseHeaders() }),
      fetchSupabaseJson(`${LEADERBOARD_TABLE}?select=name,score,wave,date&run_id=eq.${encodeURIComponent(runId)}&limit=1`, { headers: supabaseHeaders() })
    ]);
    const receipt = Array.isArray(receiptRows) ? receiptRows[0] : null;
    const scoreRow = Array.isArray(scoreRows) ? scoreRows[0] : null;
    if (!receipt) { res.statusCode = 404; return res.end('Record not found'); }

    const record = getRecordPresentation(receipt, scoreRow);
    const assetOrigin = resolveAssetOrigin(req);
    const cardConfig = gameCampaign.recordCard || {};
    const {
      formatRecordCardCompletedLabel,
      renderRecordCardSvg,
      resolveRecordCardEncounterAssetKey
    } = await recordCardRenderer;
    const completed = formatRecordCardCompletedLabel(record.finishedAt);
    const automaticEncounterKey = resolveRecordCardEncounterAssetKey(gameCampaign, record.wave);
    const automaticEncounterPath = CARD_ASSET_PATHS[automaticEncounterKey] || CARD_ASSET_PATHS.FINAL_BOSS;
    const encounterPath = cardConfig.encounterAssetKey === 'AUTO'
      ? automaticEncounterPath
      : CARD_ASSET_PATHS[cardConfig.encounterAssetKey] || automaticEncounterPath;
    const shipPath = CARD_ASSET_PATHS[cardConfig.shipAssetKey] || CARD_ASSET_PATHS.PLAYER_SHIP;
    const [bossImage, shipImage, frameImage] = await Promise.all([
      embedImage(`${assetOrigin}${encounterPath}`),
      embedImage(`${assetOrigin}${shipPath}`),
      embedImage(`${assetOrigin}${RECORD_CARD_FRAME_PATH}`)
    ]);

    const svg = renderRecordCardSvg({
      record: { ...record, completedLabel: completed },
      encounterImage: bossImage,
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
