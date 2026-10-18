import type { Graphics } from 'pixi.js';
import type { EnemyTelegraph } from './EnemyBehaviorRuntime';

const INK = 0x111827;
const AMBER = 0xfbbf24;
const ORANGE = 0xfb923c;
const MAGENTA = 0xfb7185;
const CYAN = 0x67e8f9;
const TAU = Math.PI * 2;
const arc = (graphics: Graphics, x: number, y: number, radius: number, start: number, end: number) =>
  graphics.moveTo(x + Math.cos(start) * radius, y + Math.sin(start) * radius).arc(x, y, radius, start, end);

/**
 * Small procedural accents preserve Scott's existing enemy sprites. Coordinates
 * are simulation-world pixels; the caller clears/positions its Graphics layer.
 * Telegraph lifetime and geometry come exclusively from gameplay state.
 */
export function drawRevampEnemyTelegraphs(graphics: Graphics, visuals: readonly EnemyTelegraph[], frame = 0) {
  for (const visual of visuals) {
    const { x, y } = visual;
    if (visual.kind === 'shield') {
      arc(graphics, x, y, visual.radius, Math.PI * 0.15, Math.PI * 0.85)
        .stroke({ color: INK, width: 8, alpha: 0.92 });
      arc(graphics, x, y, visual.radius, Math.PI * 0.15, Math.PI * 0.85)
        .stroke({ color: CYAN, width: 4, alpha: 0.8 + Math.sin(frame / 13) * 0.12 });
      arc(graphics, x, y, visual.radius + 4, Math.PI * 0.32, Math.PI * 0.68)
        .stroke({ color: 0xe0f2fe, width: 1, alpha: 0.8 });
    } else if (visual.kind === 'sniper') {
      const dx = visual.targetX - x, dy = visual.targetY - y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const pulse = 0.55 + Math.sin(frame * 0.35) * 0.2;
      graphics.moveTo(x, y).lineTo(visual.targetX, visual.targetY)
        .stroke({ color: INK, width: 5, alpha: 0.66 });
      graphics.moveTo(x, y).lineTo(visual.targetX, visual.targetY)
        .stroke({ color: ORANGE, width: 1.5, alpha: pulse + visual.progress * 0.2 });
      for (let at = 0; at < length; at += 22) {
        const end = Math.min(length, at + 9);
        graphics.moveTo(x + dx * at / length, y + dy * at / length)
          .lineTo(x + dx * end / length, y + dy * end / length)
          .stroke({ color: 0xffedd5, width: 2, alpha: 0.5 + visual.progress * 0.4 });
      }
      const radius = 5 + visual.progress * 5;
      graphics.circle(x, y, radius + 3).fill({ color: ORANGE, alpha: 0.12 + visual.progress * 0.2 });
      graphics.circle(x, y, radius).fill({ color: AMBER, alpha: 0.85 });
      graphics.circle(x, y, 2).fill(0xfffbeb);
      graphics.circle(visual.targetX, visual.targetY, 10).stroke({ color: ORANGE, width: 1.5, alpha: 0.8 });
      graphics.moveTo(visual.targetX - 14, visual.targetY).lineTo(visual.targetX - 7, visual.targetY)
        .moveTo(visual.targetX + 7, visual.targetY).lineTo(visual.targetX + 14, visual.targetY)
        .stroke({ color: ORANGE, width: 2, alpha: 0.9 });
    } else if (visual.kind === 'ghost') {
      const halfW = visual.width * 0.52, halfH = visual.height * 0.52;
      const alpha = 0.3 + visual.progress * 0.5;
      // A winged silhouette and four brackets remain legible behind existing art.
      graphics.poly([x, y + halfH, x - halfW, y - halfH * 0.55, x - halfW * 0.25, y - halfH * 0.2,
        x, y - halfH, x + halfW * 0.25, y - halfH * 0.2, x + halfW, y - halfH * 0.55])
        .fill({ color: CYAN, alpha: 0.1 + visual.progress * 0.15 }).stroke({ color: CYAN, width: 2, alpha });
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const bx = x + sx * (halfW + 6), by = y + sy * (halfH + 6);
        graphics.moveTo(bx - sx * 8, by).lineTo(bx, by).lineTo(bx, by - sy * 8)
          .stroke({ color: 0xe0f2fe, width: 2, alpha });
      }
    } else if (visual.kind === 'mine') {
      const urgent = visual.progress > 0.7;
      const pulse = urgent ? 0.6 + Math.sin(frame * 0.45) * 0.3 : 0.45;
      graphics.circle(x, y, visual.radius).fill({ color: ORANGE, alpha: urgent ? 0.1 : 0.035 });
      for (let i = 0; i < 8; i++) {
        arc(graphics, x, y, visual.radius, i * TAU / 8, (i + 0.55) * TAU / 8)
          .stroke({ color: urgent ? MAGENTA : ORANGE, width: 1, alpha: pulse });
      }
      graphics.circle(x, y, 14).stroke({ color: INK, width: 5, alpha: 0.9 });
      arc(graphics, x, y, 14, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - visual.progress))
        .stroke({ color: urgent ? MAGENTA : AMBER, width: 3, alpha: 0.95 });
      graphics.poly([x, y - 8, x + 8, y, x, y + 8, x - 8, y]).fill(INK).stroke({ color: ORANGE, width: 2 });
      graphics.circle(x, y, 3).fill({ color: urgent ? MAGENTA : AMBER, alpha: 0.75 + pulse * 0.2 });
    } else if (visual.kind === 'blast') {
      const alpha = 1 - visual.progress;
      graphics.circle(x, y, visual.radius).fill({ color: ORANGE, alpha: alpha * 0.22 });
      graphics.circle(x, y, visual.radius * (0.8 + visual.progress * 0.2))
        .stroke({ color: AMBER, width: 3 * alpha + 0.5, alpha });
    } else if (visual.kind === 'edge') {
      // Chevron tips point inward, so side and bottom incursions read instantly.
      const angle = visual.direction === 'left' ? 0 : visual.direction === 'right' ? Math.PI
        : visual.direction === 'top' ? Math.PI / 2 : -Math.PI / 2;
      const directionX = Math.cos(angle), directionY = Math.sin(angle);
      const pulse = 0.55 + (Math.sin(frame * 0.4) + 1) * 0.225;
      for (let i = 0; i < 3; i++) {
        const cx = x + directionX * i * 9, cy = y + directionY * i * 9;
        const a = { x: cx - directionX * 4 - directionY * 6, y: cy - directionY * 4 + directionX * 6 };
        const b = { x: cx + directionX * 2, y: cy + directionY * 2 };
        const c = { x: cx - directionX * 4 + directionY * 6, y: cy - directionY * 4 - directionX * 6 };
        graphics.moveTo(a.x, a.y).lineTo(b.x, b.y).lineTo(c.x, c.y).stroke({ color: INK, width: 6, alpha: 0.95 });
        graphics.moveTo(a.x, a.y).lineTo(b.x, b.y).lineTo(c.x, c.y).stroke({ color: AMBER, width: 3, alpha: pulse });
      }
    }
  }
}
