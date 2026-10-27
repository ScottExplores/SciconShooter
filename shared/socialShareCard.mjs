// Share-card URLs follow the same 25K window as SCICON_BIG_EVENT.
// Keep these two instants identical to shared/weeklyCompetitionBoundary.js.
export const SHARE_EVENT_START = '2026-10-26T07:00:00.000Z';
export const SHARE_EVENT_CLOSE = '2026-11-30T07:59:00.000Z';

const ORIGIN = 'https://sciconshooter.xyz';
const EVENT_FILE = 'scicon-share-25k.png';
const BASE_FILE = 'scicon-share.png';
const EVENT_VERSION = 'nih-btc-25k';
const BASE_VERSION = 'nih-btc';

export const SHARE_CARD_EVENT_ALT = 'Scicon Shooter: Play games. Fund science. The NIH ship and the Bitcoin ship in a neon pixel-art arena during the 25K RSC high score event, ending Nov 29.';
export const SHARE_CARD_BASE_ALT = 'Scicon Shooter: Play games. Fund science. The NIH ship and the Bitcoin ship battle through a neon pixel-art space arena.';

export const shareCardForTime = (time = Date.now()) => {
  const at = new Date(time).getTime();
  const live = at >= Date.parse(SHARE_EVENT_START) && at < Date.parse(SHARE_EVENT_CLOSE);
  const file = live ? EVENT_FILE : BASE_FILE;
  const version = live ? EVENT_VERSION : BASE_VERSION;
  return {
    live,
    width: 1200,
    height: 630,
    path: `/social/${file}`,
    url: `${ORIGIN}/social/${file}?v=${version}`,
    alt: live ? SHARE_CARD_EVENT_ALT : SHARE_CARD_BASE_ALT
  };
};

const replaceMeta = (html, attribute, key, value) => {
  const pattern = new RegExp(`(<meta ${attribute}="${key}" content=")[^"]*(")`);
  if (!pattern.test(html)) {
    throw new Error(`Missing meta ${attribute}="${key}"`);
  }
  return html.replace(pattern, `$1${value}$2`);
};

export const applyShareCardMeta = (html, card = shareCardForTime()) => {
  let next = html;
  next = replaceMeta(next, 'property', 'og:image', card.url);
  next = replaceMeta(next, 'property', 'og:image:alt', card.alt);
  next = replaceMeta(next, 'property', 'og:image:width', String(card.width));
  next = replaceMeta(next, 'property', 'og:image:height', String(card.height));
  next = replaceMeta(next, 'name', 'twitter:image', card.url);
  next = replaceMeta(next, 'name', 'twitter:image:alt', card.alt);
  if (!next.includes('name="twitter:card" content="summary_large_image"')) {
    throw new Error('twitter:card must stay summary_large_image');
  }
  return next;
};
