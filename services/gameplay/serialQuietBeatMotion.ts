export type SerialQuietBeatKind =
  | 'cinderjaw'
  | 'vesperglass'
  | 'twin-halo'
  | 'riftcoil'
  | 'gloamforge';

export interface SerialQuietBeatSample {
  readonly x: number;
  readonly y: number;
  readonly bankRadians: number;
}

const smoothstep = (value: number) => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - (2 * t));
};

const wrap = (value: number, period: number) => {
  const scaled = value / period;
  return scaled - Math.floor(scaled);
};

/**
 * Large commanders fill the phone width, so a roam based on the leftover
 * margin barely moves. The beat instead slides the body across the top,
 * hanging off only far enough that most of the sprite stays on screen.
 */
export const serialQuietBeatHorizontalSpan = (
  arenaWidth: number,
  bossWidth: number
): { minX: number; maxX: number } => {
  const padding = 8;
  const slack = arenaWidth - bossWidth - (padding * 2);
  if (slack >= 96) {
    return { minX: padding, maxX: padding + slack };
  }
  const overhang = Math.min(bossWidth * 0.22, Math.max(64, arenaWidth * 0.2));
  const minX = -overhang;
  const maxX = Math.max(minX + 96, arenaWidth - bossWidth + overhang);
  return { minX, maxX };
};

export const serialQuietBeatVerticalBand = (arenaHeight: number) => (
  Math.min(72, Math.max(48, arenaHeight * 0.08))
);

const identify = (value: string): SerialQuietBeatKind | null => {
  const haystack = value.toLowerCase();
  if (haystack.includes('gloamforge')) return 'gloamforge';
  if (haystack.includes('riftcoil')) return 'riftcoil';
  if (haystack.includes('twin-halo') || haystack.includes('twin halo')) return 'twin-halo';
  if (haystack.includes('cinderjaw')) return 'cinderjaw';
  if (haystack.includes('vesperglass')) return 'vesperglass';
  return null;
};

export const resolveSerialQuietBeatKind = (
  ...parts: Array<string | undefined>
): SerialQuietBeatKind | null => identify(parts.filter(Boolean).join(' '));

/**
 * Autonomous top-band motion for the beat between volleys. It never tracks
 * the player and never climbs above the combat anchor, so the phase clock
 * keeps running. Each kit has its own crossing.
 */
export const sampleSerialQuietBeat = ({
  kind,
  elapsedSeconds,
  arenaWidth,
  arenaHeight,
  bossWidth,
  entranceY
}: {
  kind: SerialQuietBeatKind;
  elapsedSeconds: number;
  arenaWidth: number;
  arenaHeight: number;
  bossWidth: number;
  entranceY: number;
}): SerialQuietBeatSample => {
  const { minX, maxX } = serialQuietBeatHorizontalSpan(arenaWidth, bossWidth);
  const span = Math.max(1, maxX - minX);
  const band = serialQuietBeatVerticalBand(arenaHeight);
  const place = (across: number, dip: number, bankRadians: number): SerialQuietBeatSample => ({
    x: minX + (span * Math.min(1, Math.max(0, across))),
    y: entranceY + (band * Math.min(1, Math.max(0, dip))),
    bankRadians
  });

  if (kind === 'cinderjaw') {
    // Siege beetle: a heavy strafe that parks each cheek cannon on a side.
    const across = smoothstep(Math.abs((wrap(elapsedSeconds, 2.4) * 2) - 1));
    return place(across, 0.08, (across - 0.5) * -0.1);
  }
  if (kind === 'vesperglass') {
    // Moth: a shallow wingbeat swoop that stays in the upper air.
    const sweep = (Math.sin(wrap(elapsedSeconds, 2.2) * Math.PI * 2) + 1) / 2;
    const wing = Math.sin(wrap(elapsedSeconds, 1.1) * Math.PI * 2);
    return place(sweep, 0.18 + (Math.max(0, wing) * 0.55), Math.cos(wrap(elapsedSeconds, 2.2) * Math.PI * 2) * 0.16);
  }
  if (kind === 'twin-halo') {
    // Wardens: one body slides across while the other altitude answers.
    const swap = smoothstep(wrap(elapsedSeconds, 2.15));
    const across = Math.floor(elapsedSeconds / 2.15) % 2 === 0 ? swap : 1 - swap;
    return place(across, 0.12 + (across * 0.35), (across - 0.5) * 0.12);
  }
  if (kind === 'riftcoil') {
    // Serpent: two weaves per crossing, a coil rather than a straight slide.
    const weave = (Math.sin(wrap(elapsedSeconds, 1.7) * Math.PI * 2) + 1) / 2;
    const ripple = (Math.sin(wrap(elapsedSeconds, 0.85) * Math.PI * 2) + 1) / 2;
    return place(weave, 0.1 + (ripple * 0.42), Math.cos(wrap(elapsedSeconds, 1.7) * Math.PI * 2) * 0.2);
  }
  // Mantis: a committed lunge to one side, a short dip, then the return.
  const cycle = wrap(elapsedSeconds, 2.05);
  const striking = cycle < 0.58;
  const across = striking
    ? smoothstep(cycle / 0.58)
    : smoothstep(1 - ((cycle - 0.58) / 0.42));
  const side = Math.floor(elapsedSeconds / 2.05) % 2 === 0 ? across : 1 - across;
  const dip = striking ? Math.sin((cycle / 0.58) * Math.PI) : 0;
  return place(side, 0.06 + (dip * 0.9), (side - 0.5) * -0.18);
};
