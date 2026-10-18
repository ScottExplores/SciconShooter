import type { Graphics } from 'pixi.js';

const COSMETICS = Object.freeze({
  'revamp-trail-ion': { kind: 'trail', color: '#67e8f9', second: '#e0f2fe', lanes: 2 },
  'revamp-trail-aurora': { kind: 'trail', color: '#a7f3d0', second: '#c4b5fd', lanes: 3 },
  'revamp-skin-frontier': { kind: 'accent', color: '#67e8f9', second: '#e0f2fe', lanes: 0 }
});
export const isRevampCosmetic = (id: string | null | undefined) => Boolean(id && Object.hasOwn(COSMETICS, id));

/** Purely additive graphics on existing pooled layers. No particles, textures or collision entities. */
export const drawRevampShipCosmetic = (
  trail: Graphics, aura: Graphics, id: string | null, width: number, height: number,
  frame: number, reducedMotion: boolean
) => {
  if (!id || !isRevampCosmetic(id)) return;
  const style = COSMETICS[id as keyof typeof COSMETICS];
  const engineY = height * 0.34;
  if (style.kind === 'accent') {
    // Small cyan wingtip seams leave the authored hull, cockpit and hitbox visible.
    for (const side of [-1, 1]) {
      aura.moveTo(side * width * 0.35, height * 0.06)
        .lineTo(side * width * 0.4, height * 0.19)
        .lineTo(side * width * 0.25, height * 0.23)
        .stroke({ color: style.color, alpha: 0.62, width: 1.4 });
      aura.circle(side * width * 0.35, height * 0.06, 1.4).fill({ color: style.second, alpha: 0.75 });
    }
    return;
  }
  for (let lane = 0; lane < style.lanes; lane++) {
    const x = (lane - (style.lanes - 1) / 2) * width * 0.085;
    const wave = reducedMotion ? 0 : Math.sin(frame * 0.085 + lane * 1.7) * 2;
    const length = Math.min(42, height * 0.31) + (reducedMotion ? 0 : Math.sin(frame * 0.13 + lane) * 3);
    trail.moveTo(x, engineY).lineTo(x + wave, engineY + length * 0.5)
      .lineTo(x + wave * 1.3, engineY + length)
      .stroke({ color: lane % 2 ? style.second : style.color, alpha: 0.3, width: 3.5 });
    trail.moveTo(x, engineY).lineTo(x + wave * 0.6, engineY + length * 0.62)
      .stroke({ color: style.second, alpha: 0.65, width: 1.1 });
  }
};
