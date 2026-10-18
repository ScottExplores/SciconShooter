import type { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { GameEngine } from '../../gameLogic';

/** Presentation only: the simulation still owns the complete warning window. */
export class CompactBossWarning {
  constructor(
    private root: Container, private shade: Graphics, private edge: Graphics,
    private banner: Sprite, private ring: Sprite, private scan: Sprite,
    private crystal: Sprite, private title: Text, private subtitle: Text
  ) {}

  sync(engine: GameEngine, width: number, reducedMotion: boolean, headerOffset = 0) {
    const active = engine.inBossWarningSequence;
    this.root.visible = this.edge.visible = active;
    this.shade.visible = false;
    if (!active) return;
    const elapsed = engine.bossWarningDuration - engine.bossWarningFrame;
    const enter = Math.min(1, Math.max(0, elapsed / 14));
    const exit = Math.min(1, Math.max(0, engine.bossWarningFrame / 12));
    const eased = 1 - (1 - enter) ** 3;
    const pulse = reducedMotion ? 0.85 : 0.7 + Math.sin(elapsed * 0.12) * 0.15;
    const span = Math.min(300, width - 28);
    this.root.position.set(width / 2, 77 + headerOffset - (reducedMotion ? 0 : Math.round((1 - eased) * 12)));
    this.root.scale.set(1);
    this.root.alpha = reducedMotion ? 1 : Math.min(enter, exit);
    this.banner.width = span;
    this.banner.height = 42;
    this.banner.alpha = 0.9;
    this.ring.visible = this.scan.visible = this.crystal.visible = false;
    this.title.text = engine.pendingBossType === 'gatekeeper' ? 'WARNING: BOSS' : 'WARNING: ELITE';
    this.title.style.fontSize = 14;
    this.title.position.set(0, -7);
    this.title.alpha = 1;
    this.subtitle.text = engine.pendingConfiguredEncounter?.label?.toUpperCase()
      ?? (engine.pendingBossType === 'wall' ? 'PAYWALL BASTION' : 'HOSTILE SIGNATURE');
    this.subtitle.style.fontSize = 11;
    this.subtitle.scale.set(1);
    this.subtitle.scale.set(Math.min(1, (span - 36) / Math.max(1, this.subtitle.width)));
    this.subtitle.position.set(0, 10);
    this.subtitle.alpha = 1;
    this.edge.clear().rect(0, 0, width, 2).fill({ color: '#fb7185', alpha: pulse });
    // A short stepped hazard strip replaces the old full-screen red strobe.
    for (let x = 14; x < width - 14; x += 24) {
      this.edge.rect(x, 51 + headerOffset, 10, 2).fill({ color: '#fbbf24', alpha: pulse });
    }
  }
}
