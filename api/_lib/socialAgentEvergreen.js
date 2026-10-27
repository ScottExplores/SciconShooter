const { getPublicPrizeState, SCICON_EVENT_CHOICE_COPY, WEEKLY_ALLOCATION_RSC } = require('../../shared/weeklyCompetitionBoundary.js');

const GAME_URL = 'https://www.sciconshooter.xyz/';
const CAMPAIGN = 'evergreen-social-v1';
const CANDIDATES_PER_SLOT = 3;

const THEMES = Object.freeze([
  'competition',
  'challenge',
  'boss',
  'loadout',
  'progression',
  'onboarding',
  'funding'
]);

const VARIANTS = Object.freeze({
  competition: Object.freeze([
    'The weekly board does not care how good the run felt. It cares about the number. Put up a verified score before Sunday at noon Pacific.',
    'Somebody has to post the score everyone else spends the week trying to delete. It might as well be you.',
    'Weekly leaderboard etiquette: arrive early, post something rude, and make the next pilot earn it.',
    'Sunday at noon Pacific is the cutoff. Until then, every score on the board is a temporary problem.'
  ]),
  challenge: Object.freeze([
    'One clean run. No warm-up excuses. Reply with the score and the exact thing that ended it.',
    'Your first run gathers data. Your second run starts an argument. Your third run settles it. Bring back a score.',
    'Arcade science: change one ship choice, run it again, and pretend the result was always the plan.',
    'The bullets have submitted their findings. Your job is peer review. Run it back and post the score.'
  ]),
  boss: Object.freeze([
    'Boss Archive rule: losing once is scouting. Losing twice is a pattern. Losing three times means the boss owns part of your weekend.',
    'Beat a boss, unlock the rematch, then keep going until the attack pattern looks slow. Which one keeps farming you?',
    'Every giant space problem eventually becomes a timing problem. Open the Boss Archive and prove it.',
    'A boss fight is just a very loud questionnaire. Dodge carefully and submit your answer with lasers.'
  ]),
  loadout: Object.freeze([
    'One main ship, two mini-ships, and enough upgrade choices to make every bad run feel self-inflicted. Build the squad.',
    'Damage, speed, or survival? Pick the loadout you trust when the screen stops leaving polite gaps.',
    'The Hangar is where confidence becomes a build. The mission is where the build meets evidence.',
    'Choose a main ship. Draft two mini-ships. Then discover which part of the plan was fiction.'
  ]),
  progression: Object.freeze([
    'The Campaign Map offers routes. Arcade instinct offers one route: whichever option looks least responsible.',
    'Clear missions, stack upgrades, choose a route, meet something enormous. That is the entire briefing.',
    'A safe route preserves the run. A dangerous route preserves the story. Pick one and report back.',
    'Campaign progress is just a sequence of increasingly expensive lessons taught by space insects.'
  ]),
  onboarding: Object.freeze([
    'Guest play first. Wallet optional. The bullets remain aggressively mandatory.',
    'Scicon Shooter runs in the browser. No install, no wallet required to start, no sympathy from the opening wave.',
    'If you have a browser and one bad competitive impulse, you have the complete starter kit.',
    'Start as a guest, learn the controls, and bring back the first score you are willing to defend publicly.'
  ]),
  funding: Object.freeze([
    getPublicPrizeState().phase === 'weekly'
      ? `Top the verified weekly board and choose an eligible ResearchHub proposal for the round's ${WEEKLY_ALLOCATION_RSC.toLocaleString('en-US')} RSC funding-credit allocation. Make the score useful.`
      : 'SciCon Big Event scoring runs through November 29, 2026. Airborne Disease Resilience is the featured suggestion, and any open ResearchHub proposal or RFP can be chosen.',
    'Scicon Shooter is a DeSci-inspired arcade game community-built on Base: play games, compete, and help direct ResearchHub Funding Credits.',
    getPublicPrizeState().phase === 'weekly'
      ? 'A weekly high score can do more than sit on a leaderboard. The winner chooses an eligible proposal for that round\'s RSC funding-credit allocation.'
      : SCICON_EVENT_CHOICE_COPY,
    'The loop is strange on purpose: dodge bullets, top the verified board, choose eligible science for the round\'s Funding Credits.'
  ])
});

const SLOT_DEFINITIONS = Object.freeze([
  Object.freeze({ key: 'morning', short: 'am', hour: 9, expiresHour: 14, expiresMinute: 59 }),
  Object.freeze({ key: 'afternoon', short: 'pm', hour: 16, expiresHour: 23, expiresMinute: 59 })
]);

const pacificParts = (date) => Object.fromEntries(
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short'
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
);

const dateKeyFromParts = ({ year, month, day }) => `${year}-${month}-${day}`;

const addDateKeyDays = (dateKey, days) => {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + Number(days || 0)));
  return shifted.toISOString().slice(0, 10);
};

const pacificDateTimeToUtc = (dateKey, hour, minute = 0) => {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  for (const offsetHours of [7, 8]) {
    const candidate = new Date(Date.UTC(year, month - 1, day, hour + offsetHours, minute));
    const parts = pacificParts(candidate);
    if (
      dateKeyFromParts(parts) === dateKey
      && Number(parts.hour) === hour
      && Number(parts.minute) === minute
    ) return candidate;
  }
  throw new Error(`Unable to resolve Pacific social slot ${dateKey} ${hour}:${minute}.`);
};

const campaignUrl = (content) => (
  `${GAME_URL}?utm_source=x&utm_medium=social&utm_campaign=${CAMPAIGN}&utm_content=${content}`
);

const buildEvergreenCandidates = ({ startDateKey, days = 8 } = {}) => {
  const start = String(startDateKey || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new Error('A valid evergreen start date is required.');
  const safeDays = Math.max(1, Math.min(14, Math.floor(Number(days) || 8)));
  const entries = [];

  for (let dayOffset = 0; dayOffset < safeDays; dayOffset += 1) {
    const dateKey = addDateKeyDays(start, dayOffset);
    const dayOrdinal = Math.floor(Date.parse(`${dateKey}T00:00:00.000Z`) / 86_400_000);
    const weekday = pacificParts(pacificDateTimeToUtc(dateKey, 9)).weekday;
    if (weekday === 'Sun') continue;

    SLOT_DEFINITIONS.forEach((slot, slotIndex) => {
      const notBefore = pacificDateTimeToUtc(dateKey, slot.hour);
      const notAfter = pacificDateTimeToUtc(dateKey, slot.expiresHour, slot.expiresMinute);
      for (let candidateIndex = 0; candidateIndex < CANDIDATES_PER_SLOT; candidateIndex += 1) {
        const themeIndex = ((dayOrdinal * 2) + slotIndex + candidateIndex) % THEMES.length;
        const kind = THEMES[themeIndex];
        const variants = VARIANTS[kind];
        const variantIndex = (dayOrdinal + slotIndex + candidateIndex) % variants.length;
        const dateSlug = dateKey.replaceAll('-', '');
        const campaignContent = `eg-${dateSlug}-${slot.short}-${kind}-${variantIndex + 1}`;
        entries.push({
          content_key: `evergreen:${dateKey}:${slot.key}:${kind}:${variantIndex + 1}`,
          content_kind: kind,
          post_text: variants[variantIndex],
          link_url: campaignUrl(campaignContent),
          not_before: notBefore.toISOString(),
          not_after: notAfter.toISOString(),
          priority: 10 - candidateIndex,
          status: 'queued',
          requires_media: false,
          metadata: {
            evergreen: true,
            campaign: CAMPAIGN,
            campaign_content: campaignContent,
            slot: slot.key,
            claims_verified: true,
            verified_from: 'production README, weekly competition contract, and current game code',
            ...(kind === 'funding' ? { funding_status_wording: 'mechanism_only' } : {})
          }
        });
      }
    });
  }
  return entries;
};

module.exports = {
  CAMPAIGN,
  CANDIDATES_PER_SLOT,
  SLOT_DEFINITIONS,
  THEMES,
  VARIANTS,
  addDateKeyDays,
  buildEvergreenCandidates,
  pacificDateTimeToUtc,
  pacificParts
};
