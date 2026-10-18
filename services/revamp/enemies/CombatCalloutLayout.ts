import type { Container, Text } from 'pixi.js';

/** Keep teaching/pickup messages readable inside the shared portrait arena. */
export function fitCombatCallout(root: Container, label: Text, width: number) {
  const padding = 16;
  const measured = Math.max(1, label.width);
  const scale = Math.min(1, Math.max(1, width - padding * 2) / measured);
  root.scale.set(scale);
  const halfWidth = measured * scale / 2;
  root.position.x = Math.max(padding + halfWidth, Math.min(width - padding - halfWidth, root.position.x));
}
