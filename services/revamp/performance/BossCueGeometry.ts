import { Container, Graphics } from 'pixi.js';
import type { Entity } from '../../gameLogic';
import type { BossEncounterState } from '../bosses/runtime';
import { BOSS_STATUS_TOP, BOSS_STATUS_HEIGHT, BOSS_INTRO_CARD_HEIGHT } from '../presentation/BossHudLayout';

const AMBER = 0xffcc66;
const CYAN = 0x8cf2e5;
const INK = 0x070d21;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** REVAMP(J): Retain authored boss cue geometry; motion and opacity stay continuous.
 * Each instance owns a fixed set of shapes, with no textures or global cache lifetime.
 * The halo outline pulses independently of its constant fill opacity.
 */
export class BossCueGeometry {
  private readonly haloFill = new Graphics();
  private readonly haloOutline = new Graphics();
  private connectorY = NaN;
  private radius = NaN;
  private health = NaN;
  private broken: boolean | undefined;
  private exposed: boolean | undefined;
  private intro: boolean | undefined;
  private haloMode = '';
  private haloWidth = NaN;
  private haloHeight = NaN;
  private statusWidth = NaN;
  private statusUnderline: number | null | undefined;
  private cardWidth = NaN;

  constructor(
    private readonly part: Graphics,
    private readonly halo: Container,
    private readonly status: Graphics,
    private readonly card: Graphics,
  ) {
    this.halo.addChild(this.haloFill, this.haloOutline);
  }

  syncPart(state: BossEncounterState, boss: Entity): void {
    const part = state.part;
    const exposed = state.stage === 'recovery' || state.stage === 'stagger';
    const intro = state.stage === 'intro';
    const radius = Math.max(12, part.radius);
    const health = clamp01(part.hp / part.maxHp);
    const connectorY = boss.y + boss.height * 0.78 - part.y;
    this.part.position.set(part.x, part.y);
    // Translating both endpoints can introduce sub-pixel floating point noise.
    // The tolerance is far below a visible pixel and avoids rebuilding on motion.
    if (Math.abs(connectorY - this.connectorY) < 1e-7 && radius === this.radius
      && health === this.health && part.broken === this.broken
      && exposed === this.exposed && intro === this.intro) return;
    this.connectorY = connectorY;
    this.radius = radius;
    this.health = health;
    this.broken = part.broken;
    this.exposed = exposed;
    this.intro = intro;

    const graphics = this.part.clear();
    graphics.moveTo(0, connectorY).lineTo(0, 0)
      .stroke({ color: INK, width: 6, alpha: 0.95 });
    graphics.moveTo(0, connectorY).lineTo(0, 0)
      .stroke({ color: 0x758d9c, width: 2, alpha: part.broken ? 0.35 : 0.8 });
    graphics.poly([-7, -11, 7, -11, 11, -7, 11, 7, 7, 11, -7, 11, -11, 7, -11, -7])
      .fill({ color: 0x182635, alpha: 0.98 })
      .stroke({ color: part.broken ? 0x475569 : 0xc9a35d, width: 2, alpha: 0.95 });
    graphics.circle(0, 0, 5).fill({ color: INK, alpha: 1 })
      .stroke({ color: part.broken ? 0x475569 : AMBER, width: 1, alpha: 0.8 });
    if (!part.broken) graphics.circle(0, 0, 2.5).fill({ color: exposed ? CYAN : AMBER, alpha: 0.9 });
    if (part.broken || intro) return;

    const color = exposed ? CYAN : AMBER;
    const corner = Math.min(7, radius * 0.4);
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        graphics.moveTo(sx * radius, sy * (radius - corner))
          .lineTo(sx * radius, sy * radius)
          .lineTo(sx * (radius - corner), sy * radius)
          .stroke({ color: INK, width: 4, alpha: 0.9 });
        graphics.moveTo(sx * radius, sy * (radius - corner))
          .lineTo(sx * radius, sy * radius)
          .lineTo(sx * (radius - corner), sy * radius)
          .stroke({ color, width: 1.5, alpha: 0.95 });
      }
    }
    graphics.roundRect(-radius, radius + 5, radius * 2, 4, 1).fill({ color: INK, alpha: 0.95 });
    graphics.rect(-radius + 1, radius + 6, Math.max(0, (radius * 2 - 2) * health), 2)
      .fill({ color, alpha: 0.95 });
  }

  syncHalo(state: BossEncounterState, boss: Entity, reducedMotion: boolean): void {
    const mode = state.stage === 'transition' ? 'transition'
      : state.stage === 'recovery' || state.stage === 'stagger' ? 'exposed' : '';
    this.halo.visible = Boolean(mode);
    if (!mode) return;
    this.halo.position.set(boss.x + boss.width / 2, boss.y + boss.height / 2);
    this.haloOutline.alpha = mode === 'transition'
      ? reducedMotion ? 0.42 : 0.25 + Math.sin(state.ageFrames * 0.16) * 0.12
      : 0.4;
    if (mode === this.haloMode && boss.width === this.haloWidth && boss.height === this.haloHeight) return;
    this.haloMode = mode;
    this.haloWidth = boss.width;
    this.haloHeight = boss.height;
    this.haloFill.clear();
    const rx = boss.width * (mode === 'transition' ? 0.52 : 0.48);
    const ry = boss.height * (mode === 'transition' ? 0.48 : 0.44);
    if (mode === 'transition') this.haloFill.ellipse(0, 0, rx, ry).fill({ color: CYAN, alpha: 0.045 });
    this.haloOutline.clear().ellipse(0, 0, rx, ry).stroke({ color: CYAN, width: 2, alpha: 1 });
  }

  syncStatus(width: number, underline: number | null): void {
    const backWidth = Math.min(width - 22, 330);
    this.status.position.set(width / 2, BOSS_STATUS_TOP);
    if (backWidth === this.statusWidth && underline === this.statusUnderline) return;
    this.statusWidth = backWidth;
    this.statusUnderline = underline;
    this.status.clear().roundRect(-backWidth / 2, 0, backWidth, BOSS_STATUS_HEIGHT, 3)
      .fill({ color: INK, alpha: 0.79 });
    if (underline !== null) {
      this.status.moveTo(-backWidth / 2 + 10, BOSS_STATUS_HEIGHT).lineTo(backWidth / 2 - 10, BOSS_STATUS_HEIGHT)
        .stroke({ color: underline, width: 1, alpha: 0.65 });
    }
  }

  syncCard(width: number): void {
    if (width === this.cardWidth) return;
    this.cardWidth = width;
    const height = BOSS_INTRO_CARD_HEIGHT;
    this.card.clear().roundRect(-width / 2, -height / 2, width, height, 6)
      .fill({ color: INK, alpha: 0.93 })
      .stroke({ color: AMBER, width: 1, alpha: 0.64 });
    this.card.moveTo(-width / 2 + 14, -height / 2).lineTo(-width / 2 + 66, -height / 2)
      .moveTo(width / 2 - 66, height / 2).lineTo(width / 2 - 14, height / 2)
      .stroke({ color: AMBER, width: 3, alpha: 0.95 });
  }
}
