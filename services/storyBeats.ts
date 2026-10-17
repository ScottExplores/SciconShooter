import { ASSETS } from '../constants';

export interface StoryBeat {
  phase: number;
  speaker: string;
  role: string;
  portrait: string;
  accent: string;
  title: string;
  text: string;
  /** Short label above the line. Sector openers keep the sector name. */
  kicker?: string;
}

/**
 * The Campaign story: one transmission per Sector, ten in all.
 *
 * There used to be five beats keyed to the Mission number, so the story stopped
 * dead at Mission 5 of 50 and the remaining nine Sectors ran silent. Beats are
 * now keyed to Sectors, and each one names a real thing ResearchHub is trying
 * to fix -- paywalls, predatory journals, glacial review, the replication
 * crisis, hoarded data, stolen credit, captured funding, gamed metrics -- so
 * the shooting has something behind it.
 *
 * Deliberately kept light. It is an arcade game, not a lecture.
 */
export const STORY_BEATS: StoryBeat[] = [
  {
    phase: 1,
    speaker: 'Brian Armstrong',
    role: 'Clarity Relay',
    portrait: ASSETS.FOUNDER_BRIAN,
    accent: 'from-blue-400 via-cyan-300 to-emerald-300',
    title: 'Open Orbit',
    text: '.... Pilot, Brian on the Clarity relay. Every paper humanity has ever written is out here, and most of it sits behind a wall. Those drones ARE the wall. Punch a hole in it and let the light through.'
  },
  {
    phase: 2,
    speaker: 'Jeffrey',
    role: 'Peer Review Shield',
    portrait: ASSETS.FOUNDER_JEFFREY,
    accent: 'from-emerald-300 via-cyan-300 to-sky-400',
    title: 'Redline Frontier',
    text: '.... Careful here. Predatory journals: they will publish anything for a fee and call it science. They look like the real thing right up until you shoot one and nothing is inside.'
  },
  {
    phase: 3,
    speaker: 'Patrick',
    role: 'Funding Vector',
    portrait: ASSETS.FOUNDER_PATRICK,
    accent: 'from-yellow-300 via-emerald-300 to-cyan-300',
    title: 'Gravity Rift',
    text: '.... This is the review well. A good paper falls in and takes two years to climb back out. Two years. Half these results are stale before anyone is allowed to read them. Cut the drag.'
  },
  {
    phase: 4,
    speaker: 'Arshia',
    role: 'Replication Deck',
    portrait: ASSETS.FOUNDER_ARSHIA,
    accent: 'from-rose-300 via-amber-200 to-cyan-300',
    title: 'Terminus Frontier',
    text: '.... Welcome to the graveyard. Every wreck out here is a result nobody could reproduce. Published, cited, built on, and hollow. Replication is not glamorous. It is the entire job.'
  },
  {
    phase: 5,
    speaker: 'Brian Armstrong',
    role: 'Clarity Relay',
    portrait: ASSETS.FOUNDER_BRIAN,
    accent: 'from-indigo-400 via-violet-300 to-cyan-300',
    title: 'Prism Expanse',
    text: '.... See those sealed vaults? Datasets. Publicly funded, privately hoarded. The science is already finished and locked in a drawer. Crack them open and the field moves a decade in a week.'
  },
  {
    phase: 6,
    speaker: 'Jeffrey',
    role: 'Attribution Watch',
    portrait: ASSETS.FOUNDER_JEFFREY,
    accent: 'from-cyan-300 via-teal-200 to-emerald-300',
    title: 'Rail Meridian',
    text: '.... Rail Meridian runs on borrowed credit. The grad student does the work, someone senior takes the byline. Fix attribution and you fix who bothers to show up tomorrow.'
  },
  {
    phase: 7,
    speaker: 'Patrick',
    role: 'Funding Vector',
    portrait: ASSETS.FOUNDER_PATRICK,
    accent: 'from-amber-300 via-yellow-200 to-emerald-300',
    title: 'Singularity Reach',
    text: '.... Funding capture. Grants keep flowing to whoever already has grants, and the interesting work starves out at the edges. RSC routes around it: the crowd funds the question directly.'
  },
  {
    phase: 8,
    speaker: 'Arshia',
    role: 'Metrics Array',
    portrait: ASSETS.FOUNDER_ARSHIA,
    accent: 'from-fuchsia-300 via-violet-300 to-cyan-300',
    title: 'Gyroscope Array',
    text: '.... Everything here is optimising for a number. Impact factor, h-index, citation count. Point a whole civilisation at a proxy and it will hit the proxy perfectly and miss the truth.'
  },
  {
    phase: 9,
    speaker: 'Brian Armstrong',
    role: 'Clarity Relay',
    portrait: ASSETS.FOUNDER_BRIAN,
    accent: 'from-red-300 via-amber-200 to-cyan-300',
    title: 'Hammerhead Line',
    text: '.... This is the incentive core, and it is fighting back, which means we are close. None of the wreckage behind us was ever the real problem. What people get rewarded for was.'
  },
  {
    phase: 10,
    speaker: 'Jeffrey',
    role: 'Final Systems Check',
    portrait: ASSETS.FOUNDER_JEFFREY,
    accent: 'from-emerald-300 via-yellow-200 to-cyan-300',
    title: 'Crownclaw Frontier',
    text: '.... Last one, pilot. Open access, open data, open review, paid for by the people who actually want the answer. Clear this and science stops being a closed loop. Go finish it.'
  }
];

/** Five Missions per Sector, so beat N opens Missions 5N-4 through 5N. */
const MISSIONS_PER_SECTOR = 5;

const BOSS_INTROS: Record<number, { title: string; name: string; tell: string }> = {
  5: {
    title: 'Gatekeeper Prime',
    name: 'Gatekeeper Prime',
    tell: 'It owns the lane. Break a cannon and the volley collapses. Do not sit in the gap it paints first.'
  },
  10: {
    title: 'Paywall Decimator',
    name: 'the Paywall Decimator',
    tell: 'The wall is the weapon. March with it, then step through the opening it has to leave.'
  },
  15: {
    title: 'Prism Moth',
    name: 'the Prism Moth',
    tell: 'Wings first. When the brood fans, the safe lane is the one that was empty a moment ago.'
  },
  20: {
    title: 'Frontier Crownclaw',
    name: 'the Frontier Crownclaw',
    tell: 'The claw telegraphs with the arm, not the bullet. If the limb is winding up, you are already late to move.'
  },
  25: {
    title: 'Helios Clawcarrier',
    name: 'Helios Clawcarrier',
    tell: 'Crossfire comes from the mounts. Kill a mount and that channel goes quiet.'
  },
  30: {
    title: 'Nullwake Revenant',
    name: 'the Nullwake Revenant',
    tell: 'It leaves and comes back. The vanish is the warning. Be off the mark where it faded.'
  },
  35: {
    title: 'Singularity Crab',
    name: 'the Singularity Crab',
    tell: 'The collapse point is chosen, then it waits. Leave before the well finishes drawing.'
  },
  40: {
    title: 'Orbit Gyroscope',
    name: 'the Orbit Gyroscope',
    tell: 'Rings rotate. A gap that is safe now will not be safe in one turn. Ride the opening.'
  },
  45: {
    title: 'Hammerhead Siege',
    name: 'Hammerhead Siege',
    tell: 'It commits to a ram. The lean is the tell. Sidestep, do not race it backward.'
  },
  50: {
    title: 'Umbra Needlewing',
    name: 'the Umbra Needlewing',
    tell: 'The needle draws a line before it fires. Treat the bright thread as solid until it goes dark.'
  }
};

const BRIDGE_LINES = [
  'Same rule as the lab: if you cannot point at the result, it is not a result yet.',
  'Hold formation. The swarm looks random until you watch who peels first.',
  'Science is a magnifying glass. Get closer, and the pattern stops being noise.',
  'Pickups are data. Leave them and the next wave is just a harder version of this one.'
];

const sectorForMission = (mission: number) => (
  Math.floor((Math.max(1, mission) - 1) / MISSIONS_PER_SECTOR) + 1
);

const bridgeBeat = (mission: number): StoryBeat => {
  const sector = sectorForMission(mission);
  const opener = STORY_BEATS.find((beat) => beat.phase === sector) ?? STORY_BEATS[0];
  const line = BRIDGE_LINES[(mission + sector) % BRIDGE_LINES.length];
  return {
    phase: sector,
    speaker: opener.speaker,
    role: opener.role,
    portrait: opener.portrait,
    accent: opener.accent,
    title: `Mission ${mission}`,
    kicker: `Mission ${mission}`,
    text: `.... ${opener.speaker.split(' ')[0]} again. ${line}`
  };
};

const bossIntroBeat = (mission: number): StoryBeat | null => {
  const intro = BOSS_INTROS[mission];
  if (!intro) return null;
  const sector = sectorForMission(mission);
  const opener = STORY_BEATS.find((beat) => beat.phase === sector) ?? STORY_BEATS[0];
  return {
    phase: sector,
    speaker: opener.speaker,
    role: 'Encounter brief',
    portrait: opener.portrait,
    accent: opener.accent,
    title: intro.title,
    kicker: `Boss · Mission ${mission}`,
    text: `.... ${intro.name} is on the scope. ${intro.tell} Skip this if you already know the fight.`
  };
};

/**
 * Sector openers carry the campaign letter. Boss Missions get a one-line
 * tell. Every other Mission gets a short bridge. All of them are skippable.
 */
export const getStoryBeatForPhase = (missionNumber: number) => {
  const mission = Math.max(1, Math.floor(Number(missionNumber) || 1));
  const bossIntro = bossIntroBeat(mission);
  if (bossIntro) return bossIntro;
  if ((mission - 1) % MISSIONS_PER_SECTOR === 0) {
    const sector = sectorForMission(mission);
    return STORY_BEATS.find((beat) => beat.phase === sector) || null;
  }
  return bridgeBeat(mission);
};

/** The beat for a Sector, for anywhere that already knows the Sector. */
export const getStoryBeatForSector = (sector: number) => (
  STORY_BEATS.find((beat) => beat.phase === Math.max(1, Math.floor(Number(sector) || 1))) || null
);
