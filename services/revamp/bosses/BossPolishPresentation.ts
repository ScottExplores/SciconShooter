import { Container, Graphics, Text } from 'pixi.js';
import { EntityType } from '../../../types';
import type { Entity, GameEngine } from '../../gameLogic';
import { BOSS_INTRO_FRAMES, bossDamageMultiplier, getBossEncounter, type BossEncounterState } from './runtime';

const AMBER = 0xffcc66;
const MAGENTA = 0xf799e5;
const CYAN = 0x8cf2e5;
const INK = 0x070d21;
const WHITE = 0xfff5de;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const label = (fontSize: number, fill: number, heading = false) => {
  const text = new Text({
    text: '',
    style: {
      fontFamily: heading ? 'Orbitron, ui-monospace, monospace' : 'Inter, system-ui, sans-serif',
      fontWeight: heading ? 'bold' : '600',
      fontSize,
      fill,
      align: 'center',
      letterSpacing: heading ? 1 : 0.5,
      stroke: { color: INK, width: 3 },
    },
  });
  text.anchor.set(0.5);
  return text;
};

/** Procedural encounter cues, driven by simulation state rather than optional VFX events.
 * World graphics follow the encounter camera; text remains readable in display pixels.
 * All display objects are retained, with no texture uploads or per-frame display allocation.
 */
export class BossPolishPresentation {
  private readonly worldRoot = new Container({ label: 'revamp-boss-cues', eventMode: 'none' });
  private readonly hazards = new Graphics();
  private readonly part = new Graphics();
  private readonly partLabel = label(10, AMBER);
  private readonly hud = new Container({ label: 'revamp-boss-hud', eventMode: 'none' });
  private readonly card = new Container({ eventMode: 'none' });
  private readonly cardBackground = new Graphics();
  private readonly cardEyebrow = label(10, AMBER, true);
  private readonly title = label(23, WHITE, true);
  private readonly epithet = label(12, 0xc8d6ed);
  private readonly phase = label(10, AMBER, true);
  private readonly status = label(11, WHITE);
  private readonly statusBackground = new Graphics();
  private readonly transitionHalo = new Graphics();

  constructor() {
    this.worldRoot.addChild(this.hazards, this.transitionHalo, this.part, this.partLabel);
    this.card.addChild(this.cardBackground, this.cardEyebrow, this.title, this.epithet);
    this.hud.addChild(this.statusBackground, this.phase, this.status, this.card);
    this.worldRoot.visible = false;
    this.hud.visible = false;
  }

  attach(worldLayer: Container, hudLayer: Container): void {
    worldLayer.addChild(this.worldRoot);
    hudLayer.addChild(this.hud);
  }

  getName(boss: Entity): string | undefined {
    return getBossEncounter(boss)?.definition.name.toUpperCase();
  }

  /** Add readable milestones to Scott's existing frame and health bar artwork. */
  decorateHealthBar(graphics: Graphics, boss: Entity, width: number, y: number, height: number): void {
    const state = getBossEncounter(boss);
    if (!state) return;
    for (const threshold of [0.33, 0.66, 1]) {
      const x = -width / 2 + width * threshold;
      graphics.moveTo(x, y - 2).lineTo(x, y + height + 2)
        .stroke({ color: INK, width: 3, alpha: 0.95 });
      graphics.moveTo(x, y - 2).lineTo(x, y + height + 2)
        .stroke({ color: WHITE, width: 1, alpha: 0.9 });
    }
    const rageX = -width / 2 + width * 0.15;
    graphics.poly([rageX - 3, y - 5, rageX + 3, y - 5, rageX, y - 1])
      .fill({ color: MAGENTA, alpha: 1 });
  }

  sync(engine: GameEngine, width: number, height: number, reducedMotion: boolean): boolean {
    const boss = engine.entities.find((entity) => entity.type === EntityType.BOSS && !entity.markedForDeletion);
    const state = boss && getBossEncounter(boss);
    const visible = Boolean(state && state.stage !== 'defeated');
    this.worldRoot.visible = visible;
    this.hud.visible = visible;
    if (!boss || !state || !visible) return false;

    this.drawHazards(state, reducedMotion);
    this.drawPart(state, boss, reducedMotion);
    this.drawHud(state, width, height, reducedMotion);
    return true;
  }

  private drawHazards(state: BossEncounterState, reducedMotion: boolean): void {
    const graphics = this.hazards.clear();
    const plan = state.plan;
    const warning = state.stage === 'warning';
    const firing = state.stage === 'fire';
    if (!plan || (!warning && !firing)) return;
    const color = state.attack?.color === 'magenta' ? MAGENTA : AMBER;
    const progress = warning ? clamp01(1 - state.remainingFrames / plan.warningFrames) : 1;
    const fireFrames = firing ? plan.liveFrames - state.remainingFrames : 0;
    const pulse = reducedMotion ? 1 : 0.92 + Math.sin(state.ageFrames * 0.15) * 0.08;

    // These shapes are the locked runtime geometry, never extrapolated from player motion.
    for (const zone of plan.zones) {
      if (firing && fireFrames >= zone.durationFrames) continue;
      const left = zone.x;
      const top = zone.y;
      graphics.rect(left, top, zone.width, zone.height)
        .fill({ color, alpha: warning ? 0.07 + progress * 0.09 : 0.17 })
        .stroke({ color: INK, width: 4, alpha: 0.9 });
      graphics.rect(left, top, zone.width, zone.height)
        .stroke({ color, width: 1.5, alpha: pulse * 0.85 });
      // Small inward chevrons make the zone's occupied side unambiguous on phones.
      for (let y = top + 18; y < top + zone.height; y += 64) {
        graphics.moveTo(left + 4, y - 4).lineTo(left + 8, y).lineTo(left + 4, y + 4)
          .moveTo(left + zone.width - 4, y - 4).lineTo(left + zone.width - 8, y)
          .lineTo(left + zone.width - 4, y + 4)
          .stroke({ color, width: 1, alpha: 0.5 });
      }
    }

    if (warning) {
      for (const line of plan.lines) {
        graphics.moveTo(line.x1, line.y1).lineTo(line.x2, line.y2)
          .stroke({ color, width: Math.max(5, line.width), alpha: 0.035 + progress * 0.04 });
        graphics.moveTo(line.x1, line.y1).lineTo(line.x2, line.y2)
          .stroke({ color: INK, width: 4, alpha: 0.7 });
        graphics.moveTo(line.x1, line.y1).lineTo(line.x2, line.y2)
          .stroke({ color, width: 1.35, alpha: 0.55 + progress * 0.35 });
      }
    }

    if (firing && fireFrames >= 12) return;
    for (const socket of plan.sockets) {
      graphics.circle(socket.x, socket.y, 25).fill({ color, alpha: 0.045 * pulse })
        .circle(socket.x, socket.y, 17).fill({ color, alpha: 0.1 * pulse })
        .circle(socket.x, socket.y, 9).fill({ color, alpha: (0.16 + progress * 0.26) * pulse });
      graphics.circle(socket.x, socket.y, 14)
        .stroke({ color: INK, width: 4, alpha: 0.85 });
      graphics.circle(socket.x, socket.y, 14)
        .stroke({ color, width: 1, alpha: 0.4 });
      if (progress > 0) {
        graphics.moveTo(socket.x, socket.y - 14)
          .arc(socket.x, socket.y, 14, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2)
          .stroke({ color: WHITE, width: 2, alpha: 0.95 });
      }
    }
  }

  private drawPart(state: BossEncounterState, boss: Entity, reducedMotion: boolean): void {
    const graphics = this.part.clear();
    const halo = this.transitionHalo.clear();
    const part = state.part;
    const exposed = state.stage === 'recovery' || state.stage === 'stagger';
    this.partLabel.visible = !part.broken && state.stage !== 'intro';
    if (state.stage === 'transition') {
      const alpha = reducedMotion ? 0.42 : 0.25 + Math.sin(state.ageFrames * 0.16) * 0.12;
      halo.ellipse(boss.x + boss.width / 2, boss.y + boss.height / 2, boss.width * 0.52, boss.height * 0.48)
        .fill({ color: CYAN, alpha: 0.045 })
        .stroke({ color: CYAN, width: 2, alpha });
    }
    if (exposed) {
      halo.ellipse(boss.x + boss.width / 2, boss.y + boss.height / 2, boss.width * 0.48, boss.height * 0.44)
        .stroke({ color: CYAN, width: 2, alpha: 0.4 });
    }
    const x = part.x;
    const y = part.y;
    // A small exposed emitter makes the below-hull collision target physical, including
    // pointed moth rigs. This adds procedural hardware without changing source artwork.
    graphics.moveTo(x, boss.y + boss.height * 0.78).lineTo(x, y)
      .stroke({ color: INK, width: 6, alpha: 0.95 });
    graphics.moveTo(x, boss.y + boss.height * 0.78).lineTo(x, y)
      .stroke({ color: 0x758d9c, width: 2, alpha: part.broken ? 0.35 : 0.8 });
    graphics.poly([x - 7, y - 11, x + 7, y - 11, x + 11, y - 7,
      x + 11, y + 7, x + 7, y + 11, x - 7, y + 11, x - 11, y + 7, x - 11, y - 7])
      .fill({ color: 0x182635, alpha: 0.98 })
      .stroke({ color: part.broken ? 0x475569 : 0xc9a35d, width: 2, alpha: 0.95 });
    graphics.circle(x, y, 5).fill({ color: INK, alpha: 1 })
      .stroke({ color: part.broken ? 0x475569 : AMBER, width: 1, alpha: 0.8 });
    if (!part.broken) graphics.circle(x, y, 2.5).fill({ color: exposed ? CYAN : AMBER, alpha: 0.9 });
    if (part.broken || state.stage === 'intro') return;

    const color = exposed ? CYAN : AMBER;
    const r = Math.max(12, part.radius);
    const corner = Math.min(7, r * 0.4);
    // Brackets mark the actual collision circle without painting over Scott's artwork.
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        graphics.moveTo(x + sx * r, y + sy * (r - corner))
          .lineTo(x + sx * r, y + sy * r)
          .lineTo(x + sx * (r - corner), y + sy * r)
          .stroke({ color: INK, width: 4, alpha: 0.9 });
        graphics.moveTo(x + sx * r, y + sy * (r - corner))
          .lineTo(x + sx * r, y + sy * r)
          .lineTo(x + sx * (r - corner), y + sy * r)
          .stroke({ color, width: 1.5, alpha: 0.95 });
      }
    }
    graphics.roundRect(x - r, y + r + 5, r * 2, 4, 1).fill({ color: INK, alpha: 0.95 });
    graphics.rect(x - r + 1, y + r + 6, Math.max(0, (r * 2 - 2) * clamp01(part.hp / part.maxHp)), 2)
      .fill({ color, alpha: 0.95 });
    this.partLabel.text = 'BREAK';
    this.partLabel.position.set(x, y - r - 10);
    this.partLabel.style.fill = color;
  }

  private drawHud(state: BossEncounterState, width: number, height: number, reducedMotion: boolean): void {
    const intro = state.stage === 'intro';
    this.card.visible = intro;
    const center = width / 2;
    const color = state.rage ? MAGENTA : AMBER;
    this.phase.text = `PHASE ${state.phase} / 3${state.rage ? '   •   RAGE' : ''}`;
    this.phase.position.set(center, width < 520 ? 113 : 117);
    this.phase.style.fill = color;

    const warning = state.stage === 'warning';
    const exposed = state.stage === 'recovery' || state.stage === 'stagger';
    const damageBonus = Math.round((bossDamageMultiplier(state) - 1) * 100);
    const status = intro ? 'HOSTILE SIGNATURE DETECTED'
      : state.stage === 'transition' ? 'PHASE SHIFT • SHIELD ACTIVE'
        : state.stage === 'stagger' ? `PART BROKEN • +${damageBonus}% DAMAGE`
          : state.stage === 'recovery' ? `CORE EXPOSED • +${damageBonus}% DAMAGE`
            : warning ? `${state.attack?.name.toUpperCase() ?? 'WEAPON CHARGING'} • ${(state.remainingFrames / 60).toFixed(1)}s`
              : state.part.broken ? 'WEAPON DISABLED' : state.attack?.name.toUpperCase() ?? '';
    this.status.text = status;
    this.status.style.fill = exposed ? CYAN : warning ? (state.attack?.color === 'magenta' ? MAGENTA : AMBER) : WHITE;
    this.status.position.set(center, width < 520 ? 132 : 136);
    this.status.scale.set(Math.min(1, Math.max(180, width - 30) / Math.max(1, this.status.width / this.status.scale.x)));
    const backWidth = Math.min(width - 22, 330);
    this.statusBackground.clear().roundRect(center - backWidth / 2, width < 520 ? 103 : 107, backWidth, 39, 5)
      .fill({ color: INK, alpha: 0.79 });
    if (warning || exposed || state.stage === 'transition') {
      this.statusBackground.moveTo(center - backWidth / 2 + 10, width < 520 ? 143 : 147)
        .lineTo(center + backWidth / 2 - 10, width < 520 ? 143 : 147)
        .stroke({ color: exposed ? CYAN : color, width: 1, alpha: 0.65 });
    }
    if (!intro) return;

    const remaining = state.remainingFrames;
    const elapsed = BOSS_INTRO_FRAMES - remaining;
    const opacity = Math.min(clamp01(elapsed / 6), clamp01(remaining / 10));
    const cardWidth = Math.min(width - 28, 420);
    const cardHeight = 106;
    this.card.alpha = reducedMotion ? 1 : opacity;
    this.card.position.set(center, Math.min(height * 0.32, 300) + (reducedMotion ? 0 : (1 - clamp01(elapsed / 10)) * 8));
    this.cardBackground.clear()
      .roundRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 6)
      .fill({ color: INK, alpha: 0.93 })
      .stroke({ color: AMBER, width: 1, alpha: 0.64 });
    this.cardBackground.moveTo(-cardWidth / 2 + 14, -cardHeight / 2)
      .lineTo(-cardWidth / 2 + 66, -cardHeight / 2)
      .moveTo(cardWidth / 2 - 66, cardHeight / 2)
      .lineTo(cardWidth / 2 - 14, cardHeight / 2)
      .stroke({ color: AMBER, width: 3, alpha: 0.95 });
    this.cardEyebrow.text = 'PAYWALL SYNDICATE';
    this.cardEyebrow.position.set(0, -31);
    this.title.text = state.definition.name.toUpperCase();
    this.title.position.set(0, -2);
    this.title.scale.set(1);
    this.title.scale.set(Math.min(1, (cardWidth - 26) / Math.max(1, this.title.width)));
    this.epithet.text = state.definition.epithet;
    this.epithet.position.set(0, 29);
    this.epithet.scale.set(1);
    this.epithet.scale.set(Math.min(1, (cardWidth - 30) / Math.max(1, this.epithet.width)));
  }
}
