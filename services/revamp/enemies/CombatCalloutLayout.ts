import type { Container, Text } from 'pixi.js';

/** Keep teaching/pickup messages readable inside the shared portrait arena. */
export function fitCombatCallout(root: Container, label: Text, width: number, headerOffset = 0) {
  const padding = 16;
  const measured = Math.max(1, label.width);
  // REVAMP(I): First-sighting labels stay below the header instead of covering entry cohorts.
  if (label.text.startsWith('NEW ENEMY:')) {
    const scale = Math.min(0.68, Math.max(1, width - 180) / measured);
    root.scale.set(scale);
    // REVAMP(P): Match the thin header and its cached physical safe-area inset.
    root.position.set(padding + measured * scale / 2, 74 + headerOffset);
    return;
  }
  const scale = Math.min(1, Math.max(1, width - padding * 2) / measured);
  root.scale.set(scale);
  const halfWidth = measured * scale / 2;
  root.position.x = Math.max(padding + halfWidth, Math.min(width - padding - halfWidth, root.position.x));
}
