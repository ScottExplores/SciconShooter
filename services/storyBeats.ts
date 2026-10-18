import { ASSETS } from '../constants';
import campaign from '../game-config/campaign.json' with { type: 'json' };
import {
  getCampaignStoryCue,
  type CampaignStoryEvent,
  type CampaignStoryKind
} from './revamp/story/campaignStory';

export interface StoryBeat {
  phase: number;
  speaker: string;
  role: string;
  /** An empty portrait uses a radio insignia; existing founder art is never relabelled. */
  portrait: string;
  accent: string;
  title: string;
  text: string;
  kicker?: string;
  id?: string;
  kind?: CampaignStoryKind;
  presentation?: 'inline' | 'vault';
}

export interface FrontierStorySector {
  sectorId: string;
  chapter: string;
  /** Design target; encounter content remains owned by the boss/campaign job. */
  plannedBoss: string;
  intro: string;
  midpoint: string;
  boss: string;
  victory: string;
}

/**
 * The Open Science Frontier. Chapter names sit over the existing sector IDs and
 * scenery, preserving saves and authored routes. Boss taunts work with the
 * currently installed encounter while the design-target roster is promoted.
 * All copy is short radio traffic, delivered over live gameplay.
 */
export const OPEN_SCIENCE_FRONTIER: readonly FrontierStorySector[] = [
  {
    sectorId: 'sector-open-orbit', chapter: 'Launch Bay', plannedBoss: 'Gatekeeper Prime',
    intro: 'Explorer, Dr. Vega on comms. Launch Bay is our first research station. Open its relay and the whole frontier can hear us.',
    midpoint: 'Those shields protect a subscription meter. The Syndicate is charging this station to read its own discoveries.',
    boss: 'Unauthorized access, Explorer. Every answer in this sector belongs to the Paywall Syndicate. Your clearance ends here.',
    victory: 'Launch Bay is open. First station, first free signal. Explorer, the frontier heard us. Keep that channel clear.'
  },
  {
    sectorId: 'sector-redline', chapter: 'Citation Storm', plannedBoss: 'Prism Moth',
    intro: 'Citation drones are burying the next station in noise. Follow the signal, Explorer. A thousand copies do not make one fact.',
    midpoint: 'The swarm is citing itself. No source, no evidence. Break the loop and the station can broadcast its real results.',
    boss: 'Our drones agree with us unanimously. Your little correction will never survive the swarm.',
    victory: 'Citation loop broken. The station can finally credit the people who did the work. One more signal is free.'
  },
  {
    sectorId: 'sector-gravity', chapter: 'Peer Review Nebula', plannedBoss: 'Frontier Crownclaw',
    intro: 'Peer Review Nebula. Good questions are stranded behind those shields. Let us get them to people who can test them.',
    midpoint: 'The review queue is a prison. The Syndicate rejected the escape route before anyone could read it. I am sending it anyway.',
    boss: 'Your flight plan has been rejected. No appeal. No explanation. Return to the queue.',
    victory: 'Review channels restored. The station is sharing methods, critiques, and corrections in the open. That is how we move forward.'
  },
  {
    sectorId: 'sector-terminus', chapter: 'Grant Desert', plannedBoss: 'Helios Clawcarrier',
    intro: 'Grant Desert. Empty labs, full Syndicate convoys. Recover those Science Credits and get the station working again.',
    midpoint: 'These are not supply shortages. Every convoy was rerouted to one vault. Follow the money; bring it back.',
    boss: 'Funding denied, Explorer. We have invested heavily in making sure you never reach the vault.',
    victory: 'Supplies delivered. The lights are back on, and a new research signal is waiting in the hangar.'
  },
  {
    sectorId: 'sector-prism-expanse', chapter: 'Replication Reef', plannedBoss: 'Abyssal Octarch',
    intro: 'Replication Reef. Every echo looks convincing. Stay sharp, Explorer. We need results that hold up twice.',
    midpoint: 'The clones are copies of a failed experiment. The original data is still inside the station. We can correct the record.',
    boss: 'Destroy one result and I will publish ten more. You cannot fight a consensus I manufacture.',
    victory: 'Original data recovered. The station can reproduce the result, not just repeat the headline. Another signal is free.'
  },
  {
    sectorId: 'sector-rail-meridian', chapter: 'Data Graveyard', plannedBoss: 'Umbra Needlewing',
    intro: 'Welcome to the Data Graveyard. Lost datasets are still transmitting. Watch the flashes; the patrols jump before they fire.',
    midpoint: 'Nothing was lost. The Syndicate hid every inconvenient result here. Those quiet signals could change everything.',
    boss: 'Some findings are better forgotten. Follow me into the dark, Explorer. Leave no record.',
    victory: 'Archive recovered, including the failures. Future crews will not have to make the same mistakes. Relay is open.'
  },
  {
    sectorId: 'sector-singularity-reach', chapter: 'Impact Factor Forge', plannedBoss: 'Gloamforge',
    intro: 'Impact Factor Forge. Armored formations are stamping rankings onto every discovery. Aim for the seams, Explorer.',
    midpoint: 'The rankings are fixed before the research arrives. The station has evidence. We just need to get it out.',
    boss: 'We decide what matters here. Your impact will be a scorch mark on my armor.',
    victory: 'The forge is quiet. Let the work speak for itself. Station seven is broadcasting on an open channel.'
  },
  {
    sectorId: 'sector-gyroscope-array', chapter: 'The Paywall', plannedBoss: 'Paywall Boss',
    intro: 'That is the wall, Explorer. Shutters, toll gates, a price on every answer. There is a research station on the other side.',
    midpoint: 'The shutters draw power from the captive relays. Every breach frees a channel. Keep those openings alive.',
    boss: 'Access expired. Your curiosity is not a valid payment method.',
    victory: 'The wall is down. No account required. The station is sending its first free signal across the frontier.'
  },
  {
    sectorId: 'sector-hammerhead-line', chapter: 'Null Hypothesis Void', plannedBoss: 'Nullwake',
    intro: 'Null Hypothesis Void. The Syndicate wants us chasing every false lead. Watch the tells, Explorer. Test your assumptions.',
    midpoint: 'The distress signal is a decoy. The real station went silent to survive. Follow the gap in their patrols.',
    boss: 'You came looking for answers. I offer you nothing. Let us see how long your certainty lasts.',
    victory: 'Station found. A null result is still a result. One last archive stands between the frontier and open skies.'
  },
  {
    sectorId: 'sector-crownclaw-frontier', chapter: 'Singularity Archive', plannedBoss: 'Singularity Commander',
    intro: 'The Singularity Archive. Every liberated signal leads here. Explorer, bring the last station home.',
    midpoint: 'The archive is the lock on every relay. They are trying to erase it all. I have a copy route. Keep flying.',
    boss: 'Without our permission, knowledge is chaos. I will close this frontier before I surrender the key.',
    victory: 'The archive is open. All ten stations are sharing the sky. Explorer, this is just the beginning. Science belongs to everyone.'
  }
];

const accents = {
  vega: 'from-cyan-300 via-blue-300 to-emerald-300',
  explorer: 'from-emerald-300 via-cyan-300 to-sky-400',
  syndicate: 'from-rose-400 via-orange-300 to-red-300'
};

export const COLD_OPEN_STORY_BEAT: StoryBeat = {
  id: 'frontier:v1:cold-open', phase: 1, kind: 'cold-open', presentation: 'inline',
  speaker: 'Dr. Vega', role: 'Comms officer', portrait: '', accent: accents.vega,
  kicker: 'The Open Science Frontier', title: 'Explorer, launch!',
  text: 'Explorer, the Paywall Syndicate locked up our discoveries. Drag to fly; weapons fire automatically. Let us open the frontier.'
};

/** Optional hangar discoveries; unlocked by flight time, never needed to play. */
export const FRONTIER_FIELD_LOGS = [
  {
    unlockId: 'story-vega', speaker: 'Dr. Vega', title: 'A signal worth sharing',
    text: 'My first experiment failed. Someone shared their notes, and the second one worked. That is why we keep these channels open, Explorer.'
  },
  {
    unlockId: 'story-frontier', speaker: 'Explorer', title: 'Room for one more question',
    text: 'Scott, flight log. We came to open ten stations. Now every signal carries a new question. Vega, plot a course. There is more frontier ahead.'
  }
] as const;

const makeSectorBeat = (sector: FrontierStorySector, phase: number, kind: Exclude<CampaignStoryKind, 'cold-open' | 'bridge'>): StoryBeat => ({
  id: `frontier:v1:${sector.sectorId}:${kind}`,
  phase, kind, presentation: 'inline',
  speaker: kind === 'boss' ? 'Paywall Syndicate' : 'Dr. Vega',
  role: kind === 'boss' ? 'Hostile channel' : 'Comms officer',
  portrait: '',
  accent: kind === 'boss' ? accents.syndicate : kind === 'victory' ? accents.explorer : accents.vega,
  kicker: `Sector ${phase} · ${kind === 'midpoint' ? 'Intercept' : kind === 'boss' ? 'Incoming threat' : kind === 'victory' ? 'Station liberated' : 'Open channel'}`,
  title: sector.chapter,
  text: sector[kind]
});

/** Sector openers retain the public export used by campaign previews. */
export const STORY_BEATS: StoryBeat[] = OPEN_SCIENCE_FRONTIER.map((sector, index) => makeSectorBeat(sector, index + 1, 'intro'));
export const FRONTIER_STORY_BEATS: readonly StoryBeat[] = [
  COLD_OPEN_STORY_BEAT,
  ...OPEN_SCIENCE_FRONTIER.flatMap((sector, index) => (
    (['intro', 'midpoint', 'boss', 'victory'] as const).map((kind) => makeSectorBeat(sector, index + 1, kind))
  ))
];

const bridgeLines = [
  'Explorer to Vega. Signal is steady. Moving in for the next relay.',
  'Copy, Vega. I have the opening. Bringing the data and the whole squad home.',
  'Another station is listening. Let us give them a clear channel.'
];

export const getStoryBeatForMission = (missionId: string, event: CampaignStoryEvent = 'launch'): StoryBeat | null => {
  const cue = getCampaignStoryCue(campaign, missionId, event);
  if (!cue) return null;
  if (cue.kind === 'cold-open') return COLD_OPEN_STORY_BEAT;
  const sector = OPEN_SCIENCE_FRONTIER.find((entry) => entry.sectorId === cue.sectorId);
  if (!sector) return null;
  if (cue.kind === 'bridge') {
    return {
      ...makeSectorBeat(sector, cue.sectorNumber, 'intro'),
      id: `frontier:v1:${missionId}:bridge`, kind: 'bridge',
      speaker: 'Explorer', role: 'Pilot · Scott', portrait: ASSETS.PLAYER_SHIP, accent: accents.explorer,
      text: bridgeLines[(cue.sectorNumber - 1) % bridgeLines.length]
    };
  }
  return makeSectorBeat(sector, cue.sectorNumber, cue.kind);
};

/** Historical name: phase is a Mission number, never an internal combat wave. */
export const getStoryBeatForPhase = (missionNumber: number): StoryBeat | null => {
  if (!Number.isFinite(missionNumber)) return null;
  const missions = [...campaign.levels].sort((left, right) => left.order - right.order);
  const mission = missions[Math.max(1, Math.floor(missionNumber)) - 1];
  return mission ? getStoryBeatForMission(mission.id) : null;
};

export const getStoryBeatForSector = (sectorNumber: number): StoryBeat | null => (
  STORY_BEATS.find((beat) => beat.phase === Math.max(1, Math.floor(Number(sectorNumber) || 1))) ?? null
);
