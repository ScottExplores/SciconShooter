const XML_ENTITIES = Object.freeze({
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  "'": '&apos;',
  '"': '&quot;'
});

const DEFAULT_COPY = Object.freeze({
  title: 'MISSION RECORD',
  subtitle: 'SCICON SHOOTER',
  callsignLabel: 'CALLSIGN',
  scoreLabel: 'FINAL SCORE',
  verifiedLabel: 'SERVER VERIFIED',
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
    x: 800,
    y: 292,
    opacity: 0.72
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
  presentation = {}
} = {}) => {
  const resolved = resolveRecordCardPresentation(presentation);
  const { copy, colors, art } = resolved;
  const score = nonNegativeInteger(record.score);
  const wave = Math.max(1, nonNegativeInteger(record.wave, 1));
  const targetsDefeated = nonNegativeInteger(record.targetsDefeated);
  const coinsCollected = nonNegativeInteger(record.coinsCollected);
  const integrityLabel = record.integrity === 'server-verified'
    ? copy.verifiedLabel
    : copy.reviewLabel;
  const encounterArt = art.encounter.visible
    ? `<image href="${escapeRecordCardXml(encounterImage)}" x="${art.encounter.x}" y="${art.encounter.y}" width="${art.encounter.width}" height="${art.encounter.height}" opacity="${art.encounter.opacity}"${imageTransform(art.encounter)} style="image-rendering:pixelated"/>`
    : '';
  const shipArt = art.ship.visible
    ? `<circle cx="420" cy="520" r="160" fill="#22d3ee" opacity=".08"/><ellipse cx="420" cy="650" rx="210" ry="44" fill="none" stroke="${colors.primary}" stroke-width="4" opacity=".6"/>
      <ellipse cx="420" cy="650" rx="150" ry="26" fill="none" stroke="${colors.success}" stroke-width="3" opacity=".6"/>
      <image href="${escapeRecordCardXml(shipImage)}" x="${art.ship.x}" y="${art.ship.y}" width="${art.ship.width}" height="${art.ship.height}" opacity="${art.ship.opacity}"${imageTransform(art.ship)} filter="url(#glow)"/>`
    : '';
  const grid = resolved.showGrid ? '<rect width="1200" height="1200" fill="url(#grid)"/>' : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200" style="display:block;width:100%;height:auto;max-width:1200px;background:${colors.background}">
      <defs>
        <radialGradient id="space" cx="70%" cy="30%"><stop stop-color="#123c52"/><stop offset=".52" stop-color="${colors.panel}"/><stop offset="1" stop-color="${colors.background}"/></radialGradient>
        <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0b2038"/><stop offset="1" stop-color="#020817"/></linearGradient>
        <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0"><stop stop-color="${colors.warning}"/><stop offset=".5" stop-color="#fff4a3"/><stop offset="1" stop-color="#ca8a04"/></linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="12" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M80 0H0V80" fill="none" stroke="${colors.primary}" stroke-opacity=".045" stroke-width="2"/></pattern>
      </defs>
      <rect width="1200" height="1200" fill="url(#space)"/>${grid}
      <circle cx="940" cy="250" r="260" fill="${colors.secondary}" opacity=".08"/><circle cx="220" cy="1040" r="300" fill="#14b8a6" opacity=".07"/>

      <path d="M70 132L250 48H430L500 108H700L770 48H950L1130 132 990 178H760L700 220H500L440 178H210Z" fill="#070d20" stroke="${colors.primary}" stroke-width="4"/>
      <path d="M70 132L250 72H410L452 110H210Z" fill="${colors.warning}" opacity=".42"/><path d="M1130 132L950 72H790L748 110H990Z" fill="${colors.warning}" opacity=".42"/>
      <path d="M500 108H700L674 158H526Z" fill="url(#gold)"/>
      <text x="600" y="152" text-anchor="middle" fill="${colors.text}" font-family="Arial, sans-serif" font-size="58" font-weight="900" letter-spacing="8">${escapeRecordCardXml(copy.title)}</text>
      <text x="600" y="202" text-anchor="middle" fill="${colors.primary}" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="7">${escapeRecordCardXml(copy.subtitle)}</text>

      <rect x="70" y="250" width="1060" height="510" rx="8" fill="url(#panel)" stroke="${colors.primary}" stroke-opacity=".5" stroke-width="3"/>
      <path d="M70 320L160 250H70ZM1130 320L1040 250H1130Z" fill="${colors.warning}" opacity=".7"/>
      ${encounterArt}
      ${shipArt}
      <text x="760" y="580" fill="${colors.muted}" font-family="Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="5">ENCOUNTER</text>
      <text x="760" y="630" fill="${colors.text}" font-family="Arial, sans-serif" font-size="34" font-weight="900">${escapeRecordCardXml(record.encounter)}</text>
      <text x="760" y="682" fill="${colors.success}" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="4">${escapeRecordCardXml(integrityLabel)}</text>

      <text x="90" y="835" fill="${colors.muted}" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="5">${escapeRecordCardXml(copy.callsignLabel)}</text>
      <text x="90" y="895" fill="${colors.text}" font-family="Arial, sans-serif" font-size="54" font-weight="900">${escapeRecordCardXml(record.pilotName)}</text>
      <text x="760" y="835" fill="${colors.muted}" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="5">${escapeRecordCardXml(copy.scoreLabel)}</text>
      <text x="760" y="900" fill="#fef08a" font-family="Arial, sans-serif" font-size="68" font-weight="900">${escapeRecordCardXml(score.toLocaleString('en-US'))}</text>

      <g font-family="Arial, sans-serif">
        <rect x="70" y="950" width="250" height="130" rx="6" fill="${colors.panel}" stroke="${colors.primary}" stroke-opacity=".35"/><text x="195" y="995" text-anchor="middle" fill="#64748b" font-size="18" font-weight="700" letter-spacing="3">${escapeRecordCardXml(copy.metricLabels.wave)}</text><text x="195" y="1052" text-anchor="middle" fill="${colors.primary}" font-size="42" font-weight="900">${wave}</text>
        <rect x="340" y="950" width="250" height="130" rx="6" fill="${colors.panel}" stroke="${colors.success}" stroke-opacity=".35"/><text x="465" y="995" text-anchor="middle" fill="#64748b" font-size="18" font-weight="700" letter-spacing="3">${escapeRecordCardXml(copy.metricLabels.targets)}</text><text x="465" y="1052" text-anchor="middle" fill="${colors.success}" font-size="42" font-weight="900">${targetsDefeated}</text>
        <rect x="610" y="950" width="250" height="130" rx="6" fill="${colors.panel}" stroke="${colors.warning}" stroke-opacity=".35"/><text x="735" y="995" text-anchor="middle" fill="#64748b" font-size="18" font-weight="700" letter-spacing="3">${escapeRecordCardXml(copy.metricLabels.coins)}</text><text x="735" y="1052" text-anchor="middle" fill="#fef08a" font-size="42" font-weight="900">${coinsCollected}</text>
        <rect x="880" y="950" width="250" height="130" rx="6" fill="${colors.panel}" stroke="${colors.text}" stroke-opacity=".24"/><text x="1005" y="995" text-anchor="middle" fill="#64748b" font-size="18" font-weight="700" letter-spacing="3">${escapeRecordCardXml(copy.metricLabels.flight)}</text><text x="1005" y="1052" text-anchor="middle" fill="${colors.text}" font-size="42" font-weight="900">${escapeRecordCardXml(record.durationLabel)}</text>
      </g>
      <text x="70" y="1140" fill="#64748b" font-family="Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="3">${escapeRecordCardXml(record.completedLabel)}  //  ${escapeRecordCardXml(record.gameVersion)}</text>
      <text x="1130" y="1140" text-anchor="end" fill="${colors.success}" font-family="Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="3">PLAY. WIN THE WEEK. FUND RESEARCH.</text>
    </svg>`;
};

export default renderRecordCardSvg;
