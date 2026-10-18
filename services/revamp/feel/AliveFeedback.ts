import type { Container, Text } from 'pixi.js';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Cosmetic receipt clocks; never alter an entity's position, lifetime or reward. */
export function sampleFeedbackPop(ageMs: number, durationMs: number, reducedMotion = false) {
  const age = Math.max(0, Number.isFinite(ageMs) ? ageMs : 0);
  const duration = Math.max(1, durationMs);
  const progress = clamp01(age / duration);
  const entrance = clamp01(age / 135);
  const settle = clamp01((age - 135) / 155);
  return {
    alpha: clamp01((duration - age) / Math.min(220, duration * 0.3)),
    scale: reducedMotion ? 1 : age < 135
      ? 0.78 + (1 - Math.pow(1 - entrance, 3)) * 0.36
      : 1 + 0.14 * Math.pow(1 - settle, 2),
    offsetY: reducedMotion ? 0 : -8 * (1 - Math.pow(1 - progress, 2))
  };
}

export const isRewardLabel = (text: string) => /^\+\d|^(?:POWER|PROJECTILE UPGRADE|MAX PROJECTILE|MAX SHOT!|SHIELD!|MAGNET!|RESEARCH BEAM!|BOMB \+|FLASK \+)|\+1 LIFE/.test(text);

/** Existing labels supply their text, color, lifetime and movement; this adds a short pop. */
export function animateCombatLabel(
  root: Container,
  label: Text,
  effect: { text?: string; life: number; maxLife: number },
  reducedMotion: boolean
) {
  // Views are reused across text categories; do not retain the previous pop.
  label.scale.set(1);
  if (!isRewardLabel(effect.text ?? '')) return;
  const pose = sampleFeedbackPop((effect.maxLife - effect.life) * 1000 / 60, effect.maxLife * 1000 / 60, reducedMotion);
  // Run before fitCombatCallout so its edge clamp includes this frame's pop.
  label.scale.set(pose.scale);
  label.alpha = pose.alpha;
  root.y += pose.offsetY;
}

/** Short pixel glints use stable per-entity phase, with no gameplay RNG draws. */
export function pickupGlint(frame: number, phase: number, reducedMotion: boolean) {
  if (reducedMotion) return 0.24;
  const age = ((frame + phase) % 84 + 84) % 84;
  return age < 12 ? Math.sin(age / 12 * Math.PI) * 0.86 : 0;
}

export function optionalTrailCount(qualityScale: number, reducedMotion: boolean) {
  if (reducedMotion) return 0;
  return Math.max(1, Math.min(3, Math.round(3 * (Number.isFinite(qualityScale) ? qualityScale : 1))));
}
