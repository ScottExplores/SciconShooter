import { REVAMP_BOSSES } from './catalog';

/** One practice roster; every entry resolves an existing campaign event and art. */
export const INTERACTIVE_MINI_BOSSES = Object.freeze([
  ['bottleneck-drone', 'Bottleneck Drone'], ['paywall-wall', 'Paywall Wall'],
  ['fracture-engine-elite', 'Fracture Engine Elite'], ['aegis-brood-core', 'Aegis Brood Core'],
  ['railspine-wallcrawler', 'Railspine Wallcrawler'], ['maw-carrier', 'Maw Carrier'],
  ['twin-meridian-sentinels', 'Twin Meridian Sentinels'], ['prism-bloom', 'Prism Bloom'],
  ['aegis-convoy-captain', 'Aegis Convoy Captain'], ['gridline-sentries', 'Gridline Sentries']
].map(([id, name]) => Object.freeze({ id, name, sourceBossId: id, mini: true })));

export const BOSS_LAB_ROSTER = Object.freeze([...REVAMP_BOSSES, ...INTERACTIVE_MINI_BOSSES]);
export const isInteractiveMiniId = (id: string | undefined) => INTERACTIVE_MINI_BOSSES.some(boss => boss.id === id);
