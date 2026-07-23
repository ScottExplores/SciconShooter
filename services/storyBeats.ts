import { ASSETS } from '../constants';

export interface StoryBeat {
  phase: number;
  speaker: string;
  role: string;
  portrait: string;
  accent: string;
  title: string;
  text: string;
}

export const STORY_BEATS: StoryBeat[] = [
  {
    phase: 1,
    speaker: 'Brian Armstrong',
    role: 'Clarity Relay',
    portrait: ASSETS.FOUNDER_BRIAN,
    accent: 'from-blue-400 via-cyan-300 to-emerald-300',
    title: 'Research Frontier',
    text: '.... Pilot, Brian on the Clarity relay. Keep the lab charged, tune the ship mid-flight, and punch through the bottlenecks slowing open science.'
  },
  {
    phase: 2,
    speaker: 'Jeffrey',
    role: 'Peer Review Shield',
    portrait: ASSETS.FOUNDER_JEFFREY,
    accent: 'from-emerald-300 via-cyan-300 to-sky-400',
    title: 'Predatory Drift',
    text: '.... Nice flying. Predatory journals and review traps crowd this sector. Upgrade early for a leaderboard run. Weekly leaders can guide the RSC allocation to a ResearchHub proposal.'
  },
  {
    phase: 3,
    speaker: 'Patrick',
    role: 'Funding Vector',
    portrait: ASSETS.FOUNDER_PATRICK,
    accent: 'from-yellow-300 via-emerald-300 to-cyan-300',
    title: 'Liquidity For Research',
    text: '.... The Galaxy is responding. RSC streams are coming online, but bureaucracy bricks are blocking the funding rails. Every clean lab tune-up is a vote for speed, clarity, and better scientific incentives.'
  },
  {
    phase: 4,
    speaker: 'Brian Armstrong',
    role: 'Clarity Relay',
    portrait: ASSETS.FOUNDER_BRIAN,
    accent: 'from-blue-400 via-indigo-300 to-cyan-300',
    title: 'Truth Optimization',
    text: '.... We are past the noise layer. The next sector is where incentives decide everything. If truth gets paid faster than friction, the whole scientific system can accelerate.'
  },
  {
    phase: 5,
    speaker: 'Jeffrey',
    role: 'Final Systems Check',
    portrait: ASSETS.FOUNDER_JEFFREY,
    accent: 'from-red-300 via-yellow-200 to-cyan-300',
    title: 'The Gatekeeper Core',
    text: '.... Final mission. The bottleneck core is adapting to your signal. Expect swarms, bricks, and beam attacks together. Free the Galaxy from slow science. Fight for clarity.'
  }
];

export const getStoryBeatForPhase = (phase: number) => (
  STORY_BEATS.find((beat) => beat.phase === phase) || null
);
