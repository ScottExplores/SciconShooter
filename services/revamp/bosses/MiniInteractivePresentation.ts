import { Container, Graphics } from 'pixi.js';
import type { Entity, GameEngine } from '../../gameLogic';
import { getInteractiveMini, interactiveMiniSocket, type MiniInteractivePart, type MiniInteractiveState } from './miniInteractive';
import { interactiveBossPalette } from './InteractiveBossPresentation';
import type { BossAttackPlan } from './patterns';

const INK = 0x070d21;
const CYAN = 0x8cf2e5;
const AMBER = 0xffcc66;

class MiniPartView {
  readonly root = new Container({ eventMode: 'none' });
  private readonly shape = new Graphics();
  private readonly light = new Graphics().rect(-2, -2, 4, 4).fill(AMBER);
  private readonly hpBack = new Graphics();
  private readonly hp = new Graphics().rect(0, 0, 1, 2).fill(CYAN);
  private readonly smoke = new Graphics().rect(-2, -2, 4, 4).fill(0x526077);
  private signature = '';

  constructor() { this.root.addChild(this.shape, this.light, this.hpBack, this.hp, this.smoke); }

  sync(part: MiniInteractivePart, boss: Entity, state: MiniInteractiveState, reducedMotion: boolean): void {
    this.root.position.set(Math.round(part.x), Math.round(part.y));
    this.root.rotation = boss.bossPresentationBankRadians || 0;
    const radius = Math.max(5, Math.round(part.radius));
    const palette = interactiveBossPalette(boss.sourceItemId ?? '');
    const ratio = Math.max(0, part.hp / Math.max(1, part.maxHp));
    const damage = part.broken ? 3 : ratio < 0.3 ? 2 : ratio < 0.65 ? 1 : 0;
    const signature = `${radius}/${palette.armor}/${part.kind}/${damage}`;
    if (signature !== this.signature) {
      this.signature = signature;
      const g = this.shape.clear();
      g.rect(-4, -radius - 6, 8, 9).fill(INK)
        .rect(-2, -radius - 5, 4, 8).fill(palette.armor)
        .poly(part.broken
          ? [-radius + 3, -radius, -3, -radius, 0, -4, 4, -radius + 4, radius - 2, -radius + 1,
            radius - 2, 4, 5, radius - 5, -radius + 2, 3]
          : [-radius + 4, -radius, radius - 4, -radius, radius - 1, -radius + 4,
            radius - 1, radius - 5, radius - 5, radius - 1, -radius + 5, radius - 1, -radius + 1, radius - 5, -radius + 1, -radius + 4])
        .fill(part.broken ? 0x273442 : palette.armor).stroke({ color: INK, width: 2 });
      if (part.broken) g.rect(-radius + 3, -radius + 3, radius, 3).fill(0x596471)
        .rect(-3, -3, 7, 7).fill(INK);
      else {
        g.rect(-radius + 4, -radius + 2, radius * 2 - 8, 2).fill(palette.trim)
          .rect(-radius + 3, -radius + 6, 2, radius * 2 - 12).fill(palette.trim)
          .rect(-radius + 5, radius - 5, radius * 2 - 10, 2).fill(0x26354a);
        if (part.kind === 'cannon') g.rect(-4, -radius + 5, 8, radius * 2 - 3).fill(INK)
          .rect(-2, -radius + 5, 3, radius * 2 - 5).fill(palette.trim);
        else g.poly([0, -radius + 4, radius - 4, 0, 0, radius - 4, -radius + 4, 0]).fill(palette.energy);
        if (damage > 0) g.moveTo(-radius + 3, -radius + 2).lineTo(-1, -2).lineTo(-4, 2).lineTo(3, radius - 2)
          .stroke({ color: INK, width: 2 });
      }
      this.hpBack.clear().rect(-radius - 1, radius + 4, radius * 2 + 2, 4).fill(INK);
      this.hp.position.set(-radius, radius + 5);
    }
    this.light.visible = !part.broken;
    this.light.position.set(0, part.kind === 'cannon' ? radius - 3 : 0);
    this.light.tint = state.stage === 'warning' ? AMBER : palette.energy;
    this.light.alpha = reducedMotion || state.stage !== 'warning' ? 0.85 : 0.65 + Math.sin(state.ageFrames * 0.2) * 0.3;
    this.hpBack.visible = this.hp.visible = !part.broken && state.stage !== 'intro';
    this.hp.scale.x = radius * 2 * ratio;
    this.hp.tint = damage === 2 ? AMBER : CYAN;
    this.smoke.visible = damage >= 2;
    const age = reducedMotion ? 10 : state.ageFrames % 36;
    this.smoke.position.set(Math.round(Math.sin(age * 0.1) * 3), -radius - age * 0.45);
    this.smoke.alpha = (1 - age / 36) * 0.42;
    this.smoke.scale.set(0.8 + age / 42);
  }
}

class MiniBossView {
  readonly root = new Container({ eventMode: 'none' });
  private readonly warning = new Graphics();
  private readonly core = new Container({ eventMode: 'none' });
  private readonly center = new Graphics();
  private readonly left = new Graphics();
  private readonly right = new Graphics();
  private readonly parts: MiniPartView[] = [];
  private skin = '';
  private warningPlan: BossAttackPlan | null = null;
  private wallWarningPhase = 0;

  constructor() { this.core.addChild(this.center, this.left, this.right); this.root.addChild(this.warning, this.core); }

  sync(boss: Entity, state: MiniInteractiveState, reducedMotion: boolean): void {
    const plan = state.drone?.plan;
    this.warning.visible = state.wall ? boss.isCharging : state.stage === 'warning' && Boolean(plan);
    if (state.wall && this.warning.visible) {
      // Each segment's real surviving vent owns this moving charge. Lines are
      // authored in vent-local coordinates and retain geometry during the march.
      this.warning.position.set(Math.round(boss.x + boss.width / 2), Math.round(boss.y + boss.height));
      if (state.phase !== this.wallWarningPhase) {
        this.wallWarningPhase = state.phase;
        const g = this.warning.clear();
        for (const angle of state.phase === 2 ? [-0.12, 0.12] : [0]) {
          const x = Math.sin(angle) * 1000;
          const y = Math.cos(angle) * 1000;
          g.moveTo(0, 0).lineTo(x, y).stroke({ color: INK, width: 4, alpha: 0.7 });
          g.moveTo(0, 0).lineTo(x, y).stroke({ color: AMBER, width: 1, alpha: 0.7 });
        }
        g.rect(-9, -6, 18, 12).fill({ color: AMBER, alpha: 0.2 })
          .rect(-4, -3, 8, 6).fill({ color: AMBER, alpha: 0.65 });
      }
      this.warning.alpha = reducedMotion ? 1 : 0.8 + Math.sin(state.ageFrames * 0.2) * 0.2;
    } else if (this.warning.visible && plan) {
      this.warning.position.set(0, 0);
      if (plan !== this.warningPlan) {
        this.warningPlan = plan;
        const g = this.warning.clear();
        for (const line of plan.lines) {
          g.moveTo(line.x1, line.y1).lineTo(line.x2, line.y2).stroke({ color: INK, width: 4, alpha: 0.7 });
          g.moveTo(line.x1, line.y1).lineTo(line.x2, line.y2).stroke({ color: AMBER, width: 1, alpha: 0.75 });
        }
        for (const socket of plan.sockets) {
          g.rect(socket.x - 10, socket.y - 10, 20, 20).fill({ color: AMBER, alpha: 0.15 })
            .rect(socket.x - 4, socket.y - 4, 8, 8).fill({ color: AMBER, alpha: 0.45 });
        }
      }
      this.warning.alpha = reducedMotion ? 1 : 0.85 + Math.sin(state.ageFrames * 0.17) * 0.15;
    }
    const palette = interactiveBossPalette(boss.sourceItemId ?? '');
    const radius = Math.max(5, Math.min(12, Math.round(boss.width * 0.075)));
    const skin = `${palette.armor}/${radius}`;
    if (skin !== this.skin) {
      this.skin = skin;
      this.center.clear().rect(-radius, -radius, radius * 2, radius * 2).fill(INK)
        .poly([0, -radius + 3, radius - 3, 0, 0, radius - 3, -radius + 3, 0]).fill(palette.energy)
        .rect(-2, -2, 4, 4).fill(0xf2f8ed);
      for (const [door, side] of [[this.left, -1], [this.right, 1]] as const) {
        door.clear().rect(side < 0 ? -radius : 0, -radius, radius, radius * 2).fill(palette.armor)
          .rect(side < 0 ? -radius + 1 : radius - 3, -radius + 2, 2, radius * 2 - 4).fill(palette.trim)
          .rect(side < 0 ? -3 : 0, -2, 3, 4).fill(AMBER);
      }
    }
    // The wall already has truthful segmented damage artwork; preserve its throat.
    this.core.visible = !state.wall;
    const coreSocket = interactiveMiniSocket(boss, 0.5, 0.68);
    this.core.position.set(Math.round(coreSocket.x), Math.round(coreSocket.y));
    this.core.rotation = boss.bossPresentationBankRadians || 0;
    const open = Math.round(state.openAmount * (radius - 2));
    this.left.x = -open; this.right.x = open;
    this.center.alpha = reducedMotion ? 1 : 0.85 + Math.sin(state.ageFrames * 0.16) * 0.15;
    while (this.parts.length < state.parts.length) {
      const part = new MiniPartView(); this.parts.push(part); this.root.addChild(part.root);
    }
    for (let index = 0; index < this.parts.length; index++) {
      const part = state.parts[index];
      this.parts[index].root.visible = Boolean(part);
      if (part) this.parts[index].sync(part, boss, state, reducedMotion);
    }
  }
}

/** Every simultaneous primary/partner mini keeps its own attached hardware. */
export class MiniInteractivePresentation {
  readonly root = new Container({ label: 'revamp-mini-interactive-anatomy', eventMode: 'none' });
  private readonly views = new Map<string, MiniBossView>();
  private readonly seen = new Set<string>();

  sync(engine: GameEngine, reducedMotion: boolean): boolean {
    this.seen.clear();
    for (const entity of engine.entities) {
      if (entity.markedForDeletion || entity.hp <= 0) continue;
      const state = getInteractiveMini(entity);
      if (!state) continue;
      this.seen.add(entity.id);
      let view = this.views.get(entity.id);
      if (!view) { view = new MiniBossView(); this.views.set(entity.id, view); this.root.addChild(view.root); }
      view.sync(entity, state, reducedMotion);
    }
    for (const [id, view] of this.views) {
      if (this.seen.has(id)) continue;
      view.root.destroy({ children: true });
      this.views.delete(id);
    }
    this.root.visible = this.seen.size > 0;
    return this.root.visible;
  }
}
