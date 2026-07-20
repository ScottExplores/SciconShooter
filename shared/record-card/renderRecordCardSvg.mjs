const XML_ENTITIES = Object.freeze({
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  "'": '&apos;',
  '"': '&quot;'
});

export const RECORD_CARD_RENDER_VERSION = '2026-07-20-1';

const buildShipQuery = (playerShipId) => (
  playerShipId ? `&ship=${encodeURIComponent(String(playerShipId))}` : ''
);

export const buildMissionRecordCardPath = (runId, playerShipId) => (
  `/api/record-card?runId=${encodeURIComponent(String(runId ?? ''))}${buildShipQuery(playerShipId)}&v=${encodeURIComponent(RECORD_CARD_RENDER_VERSION)}`
);

export const buildMissionRecordMetadataPath = (runId, playerShipId) => (
  `/api/record-metadata?type=mission&runId=${encodeURIComponent(String(runId ?? ''))}${buildShipQuery(playerShipId)}&v=${encodeURIComponent(RECORD_CARD_RENDER_VERSION)}`
);

export const formatRecordCardCompletedLabel = (value) => {
  const completed = new Date(value);
  if (!Number.isFinite(completed.getTime())) return 'VERIFIED RUN';
  const date = completed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
  const time = completed.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC'
  });
  return `${date} - ${time} UTC`.toUpperCase();
};

const DEFAULT_COPY = Object.freeze({
  title: 'MISSION RECORD',
  subtitle: 'SCICON SHOOTER',
  callsignLabel: 'CALLSIGN',
  scoreLabel: 'FINAL SCORE',
  verifiedLabel: '',
  reviewLabel: 'REVIEWED RUN',
  metricLabels: Object.freeze({
    wave: 'WAVE',
    targets: 'TARGETS',
    coins: 'COINS',
    flight: 'FLIGHT'
  })
});

const DEFAULT_COLORS = Object.freeze({
  background: '#020617',
  panel: '#07152a',
  primary: '#67e8f9',
  secondary: '#2563eb',
  success: '#6ee7b7',
  warning: '#facc15',
  text: '#ffffff',
  muted: '#94a3b8'
});

const DEFAULT_FRAME_IMAGE = '/game-art/record-card/mission-record-frame.png';

const RECORD_CARD_ENCOUNTER_ART = Object.freeze({
  PIXI_BOSS_OPEN_ORBIT_FRAMES: Object.freeze([
    Object.freeze({ path: '/game-art/pixi/bosses/open-orbit/frame-1.png', x: 0.25, y: 0.13, width: 0.5, height: 0.72 }),
    Object.freeze({ path: '/game-art/generated/boss-weapons/open-orbit-railgun-arm-left.png', x: 0.01, y: 0.2, width: 0.36, height: 0.6 }),
    Object.freeze({ path: '/game-art/generated/boss-weapons/open-orbit-railgun-arm-right.png', x: 0.63, y: 0.2, width: 0.36, height: 0.6 })
  ]),
  PIXI_BOSS_CITATION_FRAMES: Object.freeze([
    Object.freeze({ path: '/game-art/pixi/bosses/citation-storm/frame-1.png', x: 0.25, y: 0.12, width: 0.5, height: 0.74 }),
    Object.freeze({ path: '/game-art/generated/boss-weapons/citation-storm-plasma-claw-left.png', x: 0.01, y: 0.16, width: 0.37, height: 0.68 }),
    Object.freeze({ path: '/game-art/generated/boss-weapons/citation-storm-plasma-claw-right.png', x: 0.62, y: 0.16, width: 0.37, height: 0.68 })
  ]),
  PIXI_BOSS_PAYWALL_FRAMES: Object.freeze([
    Object.freeze({ path: '/game-art/pixi/bosses/paywall-decimator/body/frame-1.png', x: 0.16, y: 0.18, width: 0.68, height: 0.58 }),
    Object.freeze({ path: '/game-art/pixi/bosses/paywall-decimator/cannon-left.png', x: 0.12, y: 0.52, width: 0.28, height: 0.32 }),
    Object.freeze({ path: '/game-art/pixi/bosses/paywall-decimator/cannon-right.png', x: 0.6, y: 0.52, width: 0.28, height: 0.32 }),
    Object.freeze({ path: '/game-art/pixi/bosses/paywall-decimator/helmet.png', x: 0.35, y: 0.13, width: 0.3, height: 0.3 })
  ]),
  PIXI_BOSS_CROWNCLAW_FRAMES: Object.freeze([
    Object.freeze({ path: '/game-art/generated/bosses/astral-crownclaw/astral-crownclaw-intact.png', x: 0.03, y: 0.08, width: 0.94, height: 0.84 })
  ]),
  PIXI_BOSS_OPEN_GALAXY_FRAMES: Object.freeze([
    Object.freeze({ path: '/game-art/pixi/bosses/open-galaxy/frame-1.png', x: 0.08, y: 0.08, width: 0.84, height: 0.84 }),
    Object.freeze({ path: '/game-art/generated/boss-weapons/open-galaxy-launch-cannon-left.png', x: 0, y: 0.2, width: 0.34, height: 0.62 }),
    Object.freeze({ path: '/game-art/generated/boss-weapons/open-galaxy-launch-cannon-right.png', x: 0.66, y: 0.2, width: 0.34, height: 0.62 })
  ])
});

export const resolveRecordCardEncounterArt = (assetKey, fallbackPath = '') => {
  const configured = RECORD_CARD_ENCOUNTER_ART[String(assetKey || '')];
  if (configured) return configured.map((layer) => ({ ...layer }));
  return fallbackPath
    ? [{ path: String(fallbackPath), x: 0, y: 0, width: 1, height: 1 }]
    : [];
};

const DEFAULT_ART_REGION = Object.freeze({
  x: 0,
  y: 0,
  width: 260,
  height: 260,
  rotation: 0,
  opacity: 1,
  visible: true
});

const DEFAULT_ART_LAYOUT = Object.freeze({
  ship: Object.freeze({
    ...DEFAULT_ART_REGION,
    x: 290,
    y: 370
  }),
  encounter: Object.freeze({
    ...DEFAULT_ART_REGION,
    x: 805,
    y: 365,
    width: 210,
    height: 210,
    opacity: 0.88
  })
});

export const DEFAULT_RECORD_CARD_PRESENTATION = Object.freeze({
  copy: DEFAULT_COPY,
  colors: DEFAULT_COLORS,
  showGrid: true,
  art: DEFAULT_ART_LAYOUT
});

/**
 * Resolves AUTO encounter art from the same ordered campaign wave data used by
 * gameplay. Numeric runtime waves wrap through the configured wave sequence.
 */
export const resolveRecordCardEncounterAssetKey = (campaign, waveRef) => {
  const waves = (Array.isArray(campaign?.levels) ? campaign.levels : [])
    .slice()
    .sort((left, right) => Number(left?.order) - Number(right?.order))
    .flatMap((level) => (Array.isArray(level?.waves) ? level.waves : [])
      .slice()
      .sort((left, right) => Number(left?.order) - Number(right?.order)));
  let wave = waveRef && typeof waveRef === 'object' && Array.isArray(waveRef.events)
    ? waveRef
    : typeof waveRef === 'string'
      ? waves.find((candidate) => candidate?.id === waveRef)
      : null;
  if (!wave && waves.length > 0) {
    const waveNumber = Math.max(1, Math.floor(Number(waveRef) || 1));
    wave = waves[(waveNumber - 1) % waves.length];
  }
  const event = (Array.isArray(wave?.events) ? wave.events : [])
    .slice()
    .reverse()
    .find((candidate) => (
      candidate?.kind === 'boss'
      || candidate?.kind === 'asteroid-belt'
      || candidate?.kind === 'spawn'
    ));
  if (event?.kind === 'boss' || event?.kind === 'asteroid-belt') return event.spriteKey || 'FINAL_BOSS';
  if (event?.kind === 'spawn') return event.enemies?.[0]?.spriteKey || 'FINAL_BOSS';
  return 'FINAL_BOSS';
};

export const escapeRecordCardXml = (value) => String(value ?? '').replace(
  /[<>&'"]/g,
  (character) => XML_ENTITIES[character]
);

const optionalString = (value, fallback) => typeof value === 'string' ? value : fallback;

const finiteNumber = (value, fallback, minimum, maximum) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
};

const nonNegativeInteger = (value, fallback = 0) => Math.max(
  0,
  Math.floor(finiteNumber(value, fallback, 0, Number.MAX_SAFE_INTEGER))
);

const color = (value, fallback) => (
  typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback
);

const resolveArtRegion = (input, fallback) => ({
  x: finiteNumber(input?.x, fallback.x, -1200, 2400),
  y: finiteNumber(input?.y, fallback.y, -1200, 2400),
  width: finiteNumber(input?.width, fallback.width, 1, 2400),
  height: finiteNumber(input?.height, fallback.height, 1, 2400),
  rotation: finiteNumber(input?.rotation, fallback.rotation, -360, 360),
  opacity: finiteNumber(input?.opacity, fallback.opacity, 0, 1),
  visible: typeof input?.visible === 'boolean' ? input.visible : fallback.visible
});

export const resolveRecordCardPresentation = (presentation = {}) => ({
  copy: {
    title: optionalString(presentation.copy?.title, DEFAULT_COPY.title),
    subtitle: optionalString(presentation.copy?.subtitle, DEFAULT_COPY.subtitle),
    callsignLabel: optionalString(presentation.copy?.callsignLabel, DEFAULT_COPY.callsignLabel),
    scoreLabel: optionalString(presentation.copy?.scoreLabel, DEFAULT_COPY.scoreLabel),
    verifiedLabel: optionalString(presentation.copy?.verifiedLabel, DEFAULT_COPY.verifiedLabel),
    reviewLabel: optionalString(presentation.copy?.reviewLabel, DEFAULT_COPY.reviewLabel),
    metricLabels: {
      wave: optionalString(presentation.copy?.metricLabels?.wave, DEFAULT_COPY.metricLabels.wave),
      targets: optionalString(presentation.copy?.metricLabels?.targets, DEFAULT_COPY.metricLabels.targets),
      coins: optionalString(presentation.copy?.metricLabels?.coins, DEFAULT_COPY.metricLabels.coins),
      flight: optionalString(presentation.copy?.metricLabels?.flight, DEFAULT_COPY.metricLabels.flight)
    }
  },
  colors: {
    background: color(presentation.colors?.background, DEFAULT_COLORS.background),
    panel: color(presentation.colors?.panel, DEFAULT_COLORS.panel),
    primary: color(presentation.colors?.primary, DEFAULT_COLORS.primary),
    secondary: color(presentation.colors?.secondary, DEFAULT_COLORS.secondary),
    success: color(presentation.colors?.success, DEFAULT_COLORS.success),
    warning: color(presentation.colors?.warning, DEFAULT_COLORS.warning),
    text: color(presentation.colors?.text, DEFAULT_COLORS.text),
    muted: color(presentation.colors?.muted, DEFAULT_COLORS.muted)
  },
  showGrid: typeof presentation.showGrid === 'boolean'
    ? presentation.showGrid
    : DEFAULT_RECORD_CARD_PRESENTATION.showGrid,
  art: {
    ship: resolveArtRegion(presentation.art?.ship, DEFAULT_ART_LAYOUT.ship),
    encounter: resolveArtRegion(presentation.art?.encounter, DEFAULT_ART_LAYOUT.encounter)
  }
});

const imageTransform = (region) => {
  if (region.rotation === 0) return '';
  const centerX = region.x + region.width / 2;
  const centerY = region.y + region.height / 2;
  return ` transform="rotate(${region.rotation} ${centerX} ${centerY})"`;
};

/**
 * Produces the canonical Scicon mission-record SVG with no I/O or runtime state.
 * Callers resolve/embed image URLs before invoking this function.
 */
export const renderRecordCardSvg = ({
  record = {},
  shipImage = '',
  encounterImage = '',
  encounterImages = [],
  frameImage = DEFAULT_FRAME_IMAGE,
  presentation = {}
} = {}) => {
  const resolved = resolveRecordCardPresentation(presentation);
  const { copy, colors, art } = resolved;
  const score = nonNegativeInteger(record.score);
  const wave = Math.max(1, nonNegativeInteger(record.wave, 1));
  const targetsDefeated = nonNegativeInteger(record.targetsDefeated);
  const coinsCollected = nonNegativeInteger(record.coinsCollected);
  const pilotName = String(record.pilotName || 'PILOT').slice(0, 15);
  const encounterLabel = String(record.encounter || 'UNKNOWN SECTOR').slice(0, 24);
  const pilotFontSize = pilotName.length > 12 ? 42 : pilotName.length > 9 ? 48 : 54;
  const encounterFontSize = encounterLabel.length > 20 ? 30 : encounterLabel.length > 16 ? 34 : 38;
  const durationLabel = String(record.durationLabel || '0:00').slice(0, 8);
  const completedLabel = String(record.completedLabel || 'VERIFIED RUN').slice(0, 34);
  const gameVersion = String(record.gameVersion || 'UNKNOWN').slice(0, 12);
  const integrityLabel = record.integrity === 'server-verified'
    ? copy.verifiedLabel
    : copy.reviewLabel;
  const requestedEncounterLayers = Array.isArray(encounterImages) && encounterImages.length > 0
    ? encounterImages
    : encounterImage
      ? [{ image: encounterImage, x: 0, y: 0, width: 1, height: 1 }]
      : [];
  const encounterArt = art.encounter.visible
    ? requestedEncounterLayers.map((layer) => {
        const image = String(layer?.image || layer?.path || '');
        if (!image) return '';
        const x = art.encounter.x + finiteNumber(layer?.x, 0, -1, 2) * art.encounter.width;
        const y = art.encounter.y + finiteNumber(layer?.y, 0, -1, 2) * art.encounter.height;
        const width = finiteNumber(layer?.width, 1, 0.01, 3) * art.encounter.width;
        const height = finiteNumber(layer?.height, 1, 0.01, 3) * art.encounter.height;
        const opacity = finiteNumber(layer?.opacity, 1, 0, 1) * art.encounter.opacity;
        return `<image href="${escapeRecordCardXml(image)}" x="${x}" y="${y}" width="${width}" height="${height}" opacity="${opacity}" style="image-rendering:pixelated"/>`;
      }).join('')
    : '';
  const shipArt = art.ship.visible
    ? `<circle cx="420" cy="510" r="150" fill="#22d3ee" opacity=".08"/><ellipse cx="420" cy="648" rx="200" ry="40" fill="none" stroke="${colors.primary}" stroke-width="4" opacity=".6"/>
      <ellipse cx="420" cy="648" rx="142" ry="24" fill="none" stroke="${colors.success}" stroke-width="3" opacity=".6"/>
      <image href="${escapeRecordCardXml(shipImage)}" x="${art.ship.x}" y="${art.ship.y}" width="${art.ship.width}" height="${art.ship.height}" opacity="${art.ship.opacity}"${imageTransform(art.ship)} filter="url(#glow)"/>`
    : '';
  const frameArt = frameImage
    ? `<image href="${escapeRecordCardXml(frameImage)}" x="0" y="0" width="1200" height="1200" preserveAspectRatio="none" style="image-rendering:pixelated"/>`
    : '';
  const grid = resolved.showGrid ? '<rect width="1200" height="1200" fill="url(#grid)"/>' : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200" role="img" aria-label="${escapeRecordCardXml(`${pilotName} mission record, score ${score}`)}" style="display:block;width:100%;height:auto;max-width:1200px;background:${colors.background}">
      <defs>
        <radialGradient id="space" cx="70%" cy="30%"><stop stop-color="#123c52"/><stop offset=".52" stop-color="${colors.panel}"/><stop offset="1" stop-color="${colors.background}"/></radialGradient>
        <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0b2038"/><stop offset="1" stop-color="#020817"/></linearGradient>
        <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0"><stop stop-color="${colors.warning}"/><stop offset=".5" stop-color="#fff4a3"/><stop offset="1" stop-color="#ca8a04"/></linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="12" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M80 0H0V80" fill="none" stroke="${colors.primary}" stroke-opacity=".045" stroke-width="2"/></pattern>
      </defs>
      <rect width="1200" height="1200" fill="url(#space)"/>${grid}
      <circle cx="940" cy="250" r="260" fill="${colors.secondary}" opacity=".08"/><circle cx="220" cy="1040" r="300" fill="#14b8a6" opacity=".07"/>

      <path d="M150 190H1050L1070 210V1000L1050 1020H150L130 1000V210Z" fill="url(#panel)" stroke="${colors.primary}" stroke-opacity=".48" stroke-width="4"/>
      <path d="M168 218H1032" stroke="${colors.warning}" stroke-opacity=".55" stroke-width="4"/>

      <text x="600" y="274" text-anchor="middle" fill="${colors.text}" font-family="Arial, sans-serif" font-size="58" font-weight="900" letter-spacing="7">${escapeRecordCardXml(copy.title)}</text>
      <text x="600" y="312" text-anchor="middle" fill="${colors.primary}" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="6">${escapeRecordCardXml(copy.subtitle)}</text>

      <rect x="170" y="338" width="860" height="368" rx="10" fill="#020817" fill-opacity=".88" stroke="${colors.primary}" stroke-opacity=".55" stroke-width="3"/>
      <path d="M170 408L240 338H170ZM1030 408L960 338H1030Z" fill="${colors.warning}" opacity=".72"/>
      ${encounterArt}
      ${shipArt}
      <text x="650" y="578" fill="${colors.muted}" font-family="Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="4">ENCOUNTER</text>
      <text x="650" y="628" fill="${colors.text}" font-family="Arial, sans-serif" font-size="${encounterFontSize}" font-weight="900">${escapeRecordCardXml(encounterLabel)}</text>
      ${integrityLabel ? `<text x="650" y="674" fill="${colors.success}" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="3">${escapeRecordCardXml(integrityLabel)}</text>` : ''}

      <path d="M170 734H1030" stroke="${colors.primary}" stroke-opacity=".25" stroke-width="2"/>
      <text x="190" y="775" fill="${colors.muted}" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="4">${escapeRecordCardXml(copy.callsignLabel)}</text>
      <text x="190" y="832" fill="${colors.text}" font-family="Arial, sans-serif" font-size="${pilotFontSize}" font-weight="900">${escapeRecordCardXml(pilotName)}</text>
      <text x="1010" y="775" text-anchor="end" fill="${colors.muted}" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="4">${escapeRecordCardXml(copy.scoreLabel)}</text>
      <text x="1010" y="836" text-anchor="end" fill="#fef08a" font-family="Arial, sans-serif" font-size="66" font-weight="900">${escapeRecordCardXml(score.toLocaleString('en-US'))}</text>

      <g font-family="Arial, sans-serif">
        <rect x="190" y="856" width="190" height="112" rx="8" fill="${colors.background}" fill-opacity=".7" stroke="${colors.primary}" stroke-opacity=".4"/><text x="285" y="899" text-anchor="middle" fill="${colors.muted}" font-size="20" font-weight="700" letter-spacing="3">${escapeRecordCardXml(copy.metricLabels.wave)}</text><text x="285" y="949" text-anchor="middle" fill="${colors.primary}" font-size="40" font-weight="900">${wave}</text>
        <rect x="400" y="856" width="190" height="112" rx="8" fill="${colors.background}" fill-opacity=".7" stroke="${colors.success}" stroke-opacity=".4"/><text x="495" y="899" text-anchor="middle" fill="${colors.muted}" font-size="20" font-weight="700" letter-spacing="3">${escapeRecordCardXml(copy.metricLabels.targets)}</text><text x="495" y="949" text-anchor="middle" fill="${colors.success}" font-size="40" font-weight="900">${targetsDefeated}</text>
        <rect x="610" y="856" width="190" height="112" rx="8" fill="${colors.background}" fill-opacity=".7" stroke="${colors.warning}" stroke-opacity=".4"/><text x="705" y="899" text-anchor="middle" fill="${colors.muted}" font-size="20" font-weight="700" letter-spacing="3">${escapeRecordCardXml(copy.metricLabels.coins)}</text><text x="705" y="949" text-anchor="middle" fill="#fef08a" font-size="40" font-weight="900">${coinsCollected}</text>
        <rect x="820" y="856" width="190" height="112" rx="8" fill="${colors.background}" fill-opacity=".7" stroke="${colors.text}" stroke-opacity=".28"/><text x="915" y="899" text-anchor="middle" fill="${colors.muted}" font-size="20" font-weight="700" letter-spacing="3">${escapeRecordCardXml(copy.metricLabels.flight)}</text><text x="915" y="949" text-anchor="middle" fill="${colors.text}" font-size="40" font-weight="900">${escapeRecordCardXml(durationLabel)}</text>
      </g>
      <text x="600" y="1005" text-anchor="middle" fill="${colors.muted}" font-family="Arial, sans-serif" font-size="17" font-weight="700" letter-spacing="1.5">${escapeRecordCardXml(completedLabel)}  //  SCICON V${escapeRecordCardXml(gameVersion)}</text>
      ${frameArt}
    </svg>`;
};

export default renderRecordCardSvg;
