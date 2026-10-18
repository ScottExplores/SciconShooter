import type { Container, Graphics, Text } from 'pixi.js';
import type { GameEngine } from '../../gameLogic';

/** Reuse the authored wave lettering in the header, leaving curved entry lanes visible. */
export class CompactFormationIntro {
  constructor(
    private root: Container,
    private counter: Container,
    private level: Text,
    private name: Text,
    private aura: Graphics,
    private pixels: Graphics,
    private sweep: Graphics
  ) {}

  sync(engine: GameEngine, age: number, width: number, reducedMotion = false, headerOffset = 0) {
    const wave = engine.getCurrentWaveDefinition();
    // REVAMP(P): Every ordinary wave gets the same unobtrusive header entrance.
    // Boss waves already own a named warning/entrance card; avoid a second title.
    if (wave?.events.some(event => event.kind === 'boss')) {
      this.root.visible = false;
      this.counter.scale.set(1);
      return true;
    }
    const compact = Boolean(wave);
    if (!compact) {
      this.counter.scale.set(1);
      return false;
    }

    this.aura.clear(); this.pixels.clear(); this.sweep.clear();
    this.root.visible = age < 1_350;
    if (!this.root.visible) return true;
    this.root.scale.set(1);
    const enter = Math.min(1, Math.max(0, age / 220));
    this.root.position.set(14 + (reducedMotion ? 0 : Math.round((1 - enter) ** 3 * -18)), 74 + headerOffset);
    this.root.alpha = reducedMotion ? 1 : Math.max(0, Math.min(1, age / 100, (1_350 - age) / 200));
    this.level.visible = false;
    this.counter.position.set(38, 0);
    this.counter.scale.set(0.30);
    for (const glyph of this.counter.children) { glyph.alpha = 1; glyph.y = 0; }
    this.name.visible = true;
    this.name.alpha = 1;
    this.name.scale.set(1);
    const stripWidth = Math.min(222, width - 120);
    this.name.scale.set(Math.min(0.60, (stripWidth - 88) / Math.max(1, this.name.width)));
    this.name.position.set((stripWidth + 82) / 2, 0);
    this.aura.rect(-4, -9, stripWidth + 8, 18).fill({ color: '#041321', alpha: 0.82 });
    this.aura.rect(-4, 9, stripWidth + 8, 1).fill({ color: '#67e8f9', alpha: 0.48 });
    return true;
  }
}
