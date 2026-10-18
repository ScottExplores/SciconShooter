import { Container, Graphics } from 'pixi.js';
import type { Entity } from '../../gameLogic';
import type { BossEncounterState } from './runtime';

const INK = 0x070d21;
const STEEL = 0x293c51;
const LIGHT = 0xd2e3eb;
const AMBER = 0xffcc66;
const CYAN = 0x8cf2e5;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
type InteractiveState = NonNullable<BossEncounterState['interactive']>;
type PartState = InteractiveState['parts'][number];

/** Existing hull palettes remain authoritative; these small, attached fittings share them. */
export const interactiveBossPalette = (id: string): { armor: number; trim: number; energy: number; motif: 'prism' | 'claw' | 'reactor' | 'plate' } => {
  if (id === 'paywall-decimator') return { armor: 0x9c3028, trim: 0xf17847, energy: 0x8abe66, motif: 'plate' };
  // Mini hulls have their own source palettes; exact IDs avoid recoloring majors.
  if (id === 'fracture-engine-elite') return { armor: 0x4b2868, trim: 0x9564ad, energy: 0xa6e8ef, motif: 'plate' };
  if (id === 'aegis-brood-core') return { armor: 0x236e68, trim: 0xb4a64d, energy: 0x9ce3d6, motif: 'plate' };
  if (id === 'railspine-wallcrawler') return { armor: 0x454043, trim: 0xa77c70, energy: 0xf25443, motif: 'plate' };
  if (id === 'maw-carrier') return { armor: 0x4d5828, trim: 0x9aaa4d, energy: 0xb4ee60, motif: 'plate' };
  if (id === 'twin-meridian-sentinels') return { armor: 0x167e9f, trim: 0xd4ac45, energy: 0x8ce9ed, motif: 'plate' };
  if (id === 'prism-bloom') return { armor: 0x3c4dba, trim: 0xae70e8, energy: 0x9ceafa, motif: 'prism' };
  if (id === 'aegis-convoy-captain') return { armor: 0x233e59, trim: 0xb6a047, energy: 0xf0d674, motif: 'plate' };
  if (/prism|replication/.test(id)) return { armor: 0x7995ad, trim: LIGHT, energy: 0x61d8fa, motif: 'prism' };
  if (/aurora|orbit|impact-factor/.test(id)) return { armor: 0x315ba8, trim: 0xdce1ee, energy: 0x78eed7, motif: 'prism' };
  if (/helios|grant/.test(id)) return { armor: 0x3e7b81, trim: 0xc8ba8f, energy: 0xffb84f, motif: 'reactor' };
  if (/hammerhead|gloamforge/.test(id)) return { armor: 0xa39176, trim: 0xf0dfbd, energy: 0xffb84f, motif: 'reactor' };
  if (/singularity/.test(id)) return { armor: 0x753c44, trim: 0xd0a265, energy: 0xffb84f, motif: 'reactor' };
  if (/crown|hydra|octarch|abyssal/.test(id)) return { armor: 0x2e7165, trim: 0xc4aa52, energy: 0x77e8cf, motif: 'claw' };
  if (/umbra/.test(id)) return { armor: 0x263e58, trim: 0xbbd0df, energy: 0xf88786, motif: 'prism' };
  if (/nullwake/.test(id)) return { armor: 0x8a7b88, trim: 0xe6d6cf, energy: 0xc49aef, motif: 'prism' };
  if (/gatekeeper|peer-reviewer/.test(id)) return { armor: 0x447c82, trim: 0xb3dfde, energy: 0x78eae3, motif: 'plate' };
  return { armor: 0x4b6279, trim: 0xbad5dc, energy: 0x77dce9, motif: 'plate' };
};

/** Fixed pixel geometry: all per-frame changes are transforms/alpha, including HP bars. */
class PartView {
  readonly root = new Container({ eventMode: 'none' });
  private readonly connector = new Graphics();
  private readonly armor = new Graphics();
  private readonly lamp = new Graphics().rect(-3, -2, 6, 4).fill(LIGHT);
  private readonly healthBack = new Graphics();
  private readonly health = new Graphics();
  private readonly smoke = Array.from({ length: 3 }, () => new Graphics().rect(-3, -3, 6, 6).fill(0x465269));
  private signature = '';
  private connectorSignature = '';

  constructor() {
    this.root.addChild(this.connector, this.armor, this.lamp, this.healthBack, this.health, ...this.smoke);
  }

  sync(part: PartState, state: BossEncounterState, boss: Entity, reducedMotion: boolean): void {
    this.root.visible = part.active || part.broken;
    if (!this.root.visible) return;
    this.root.position.set(Math.round(part.x), Math.round(part.y));
    const palette = interactiveBossPalette(state.definition.sourceBossId);
    const r = Math.max(10, Math.round(part.radius));
    const signature = `${part.kind}/${part.damageState}/${r}/${palette.armor}`;
    if (signature !== this.signature) {
      this.signature = signature;
      this.drawArmor(part, r, palette);
    }
    // The fitting never drifts independently from its owning hull; its overlap cap
    // remains attached even when the authored boss has a long lower silhouette.
    const capY = Math.min(-r + 5, Math.round(boss.y + boss.height * 0.78 - part.y));
    const connectorSignature = `${capY}/${r}/${part.broken}`;
    if (connectorSignature !== this.connectorSignature) {
      this.connectorSignature = connectorSignature;
      this.connector.clear().rect(-6, capY, 12, -capY).fill(INK)
        .rect(-3, capY + 2, 6, Math.max(1, -capY - 2)).fill(part.broken ? 0x283342 : STEEL)
        .rect(-8, capY - 1, 16, 6).fill(palette.armor);
    }
    const live = !part.broken;
    const ownWarning = state.stage === 'warning' && state.attack?.id === part.attackId;
    const ownFire = state.stage === 'fire' && state.attack?.id === part.attackId;
    const recoil = ownFire && state.plan && state.plan.liveFrames - state.remainingFrames < 5 ? -2 : 0;
    this.armor.y = reducedMotion ? 0 : recoil;
    this.lamp.visible = live;
    this.lamp.position.set(0, part.kind === 'cannon' ? r - 5 + recoil : recoil);
    this.lamp.tint = ownWarning || ownFire ? AMBER : palette.energy;
    this.lamp.alpha = part.flashFrames > 0 ? 1 : ownWarning && !reducedMotion ? 0.6 + Math.sin(state.ageFrames * 0.32) * 0.4 : 0.85;
    this.lamp.scale.set(ownFire ? 1.6 : 1);
    this.healthBack.visible = live && state.stage !== 'intro';
    this.health.visible = this.healthBack.visible;
    this.health.scale.x = clamp01(part.hp / Math.max(1, part.maxHp));
    this.health.tint = part.damageState === 'smoking' ? 0xf6a86e : CYAN;
    for (let index = 0; index < this.smoke.length; index++) {
      const puff = this.smoke[index];
      puff.visible = part.damageState === 'smoking' || part.broken;
      if (!puff.visible) continue;
      const age = reducedMotion ? index * 12 : (state.ageFrames + index * 13) % 42;
      puff.position.set(Math.round(Math.sin(index * 2.1 + age * 0.05) * 5), -r - age * 0.6);
      puff.scale.set(0.65 + age / 40);
      puff.alpha = (1 - age / 42) * (part.broken ? 0.28 : 0.45);
    }
  }

  private drawArmor(part: PartState, r: number, palette: ReturnType<typeof interactiveBossPalette>): void {
    const g = this.armor.clear();
    const broken = part.broken;
    const body = broken ? 0x26303e : palette.armor;
    const trim = broken ? 0x506071 : palette.trim;
    if (broken) {
      g.poly([-r + 3, -r + 5, -3, -r + 5, 0, -4, 4, -10, r - 3, -r + 5, r - 3, 6, 6, r - 6, -r + 3, 7])
        .fill(body).stroke({ color: INK, width: 1 });
      g.rect(-r + 5, -r + 7, 7, 3).fill(trim).rect(4, 1, 7, 3).fill(0x121b2b);
    } else {
      g.poly([-r + 6, -r, r - 6, -r, r - 2, -r + 5, r - 2, r - 7, r - 7, r - 2,
        -r + 7, r - 2, -r + 2, r - 7, -r + 2, -r + 5])
        .fill(body).stroke({ color: INK, width: 1 });
      g.rect(-r + 5, -r + 2, r * 2 - 10, 1).fill(trim)
        .rect(-r + 4, -r + 4, 1, r * 2 - 13).fill(trim)
        .rect(r - 5, -r + 5, 2, r * 2 - 13).fill(STEEL)
        .rect(-r + 7, r - 5, r * 2 - 14, 2).fill(STEEL)
        .rect(-r + 5, -r + 4, 6, 2).fill(STEEL)
        .rect(r - 10, -r + 4, 5, 2).fill(STEEL);
      // Two-pixel screws, stepped edge light and dark vents match the original
      // sprites' metal clusters; they keep these fittings from reading as UI tiles.
      for (const side of [-1, 1]) {
        g.rect(side < 0 ? -r + 6 : r - 9, -r + 7, 3, 3).fill(INK)
          .rect(side < 0 ? -r + 6 : r - 9, -r + 7, 2, 1).fill(trim);
        for (let vent = 0; vent < 3; vent++) {
          const x = side < 0 ? -r + 6 : r - 10;
          g.rect(x, -4 + vent * 4, 4, 3).fill(INK)
            .rect(x, -4 + vent * 4, 3, 1).fill(trim)
            .rect(x + 1, -2 + vent * 4, 3, 1).fill(STEEL);
        }
      }
      if (part.kind === 'cannon') {
        g.rect(-7, -r + 6, 14, r * 2 - 4).fill(INK)
          .rect(-5, -r + 5, 10, r * 2 - 5).fill(STEEL)
          .rect(-4, -r + 4, 2, r * 2 - 7).fill(trim)
          .rect(1, -r + 4, 1, r * 2 - 7).fill(body)
          .rect(-7, r - 5, 14, 5).fill(INK)
          .rect(-6, r - 5, 12, 1).fill(trim)
          .rect(-5, r - 3, 2, 3).fill(STEEL)
          .rect(3, r - 3, 2, 3).fill(STEEL);
        for (let rib = -r + 9; rib < r - 6; rib += 5) {
          g.rect(-6, rib, 12, 2).fill(INK).rect(-5, rib, 9, 1).fill(trim)
            .rect(4, rib, 2, 1).fill(body);
        }
      } else if (part.kind === 'generator') {
        g.poly([0, -r + 6, r - 6, 0, 0, r - 6, -r + 6, 0]).fill(INK)
          .poly([0, -r + 8, r - 8, 0, 0, r - 8, -r + 8, 0]).fill(trim)
          .poly([0, -r + 9, r - 9, 0, 0, r - 9, -r + 9, 0]).fill(STEEL)
          .poly([0, -6, 6, 0, 0, 6, -6, 0]).fill(palette.energy)
          .poly([0, -4, 4, 0, 0, 4, -4, 0]).fill(INK)
          .rect(-1, -2, 2, 4).fill(LIGHT);
        for (const side of [-1, 1]) {
          g.rect(side < 0 ? -r + 6 : r - 8, -2, 2, 4).fill(trim)
            .rect(-2, side < 0 ? -r + 6 : r - 8, 4, 2).fill(trim);
        }
      } else {
        g.rect(-r + 7, -r + 7, r * 2 - 14, r * 2 - 14).fill(STEEL);
        for (let row = -r + 8; row < r - 7; row += 4) {
          g.rect(-r + 8, row, r * 2 - 16, 2).fill(body)
            .rect(-r + 8, row, r * 2 - 18, 1).fill(trim);
        }
      }
      if (part.damageState === 'cracked' || part.damageState === 'smoking') {
        g.moveTo(-r + 6, -r + 4).lineTo(-3, -4).lineTo(-6, 2).lineTo(4, r - 3)
          .stroke({ color: INK, width: 3 });
        if (part.damageState === 'smoking') g.rect(4, -r + 7, 7, 6).fill(INK).rect(5, -r + 8, 3, 2).fill(0xe9854b);
      }
    }
    this.healthBack.clear().rect(-r - 1, r + 5, r * 2 + 2, 5).fill(INK);
    this.health.clear().rect(0, 0, r * 2, 2).fill(0xffffff);
    this.health.position.set(-r, r + 7);
  }
}

/** Retained anatomy overlay over Scott's original sprites; no generated textures. */
export class InteractiveBossPresentation {
  readonly root = new Container({ label: 'revamp-interactive-boss-anatomy', eventMode: 'none' });
  readonly arenaRoot = new Container({ label: 'revamp-boss-arena', eventMode: 'none' });
  private readonly parts: PartView[] = [];
  private readonly core = new Container({ eventMode: 'none' });
  private readonly coreBack = new Graphics();
  private readonly coreGlow = new Graphics();
  private readonly leftDoor = new Graphics();
  private readonly rightDoor = new Graphics();
  private readonly shellLeft = new Graphics();
  private readonly shellRight = new Graphics();
  private readonly hangar = new Container({ eventMode: 'none' });
  private readonly hangarBack = new Graphics();
  private readonly hangarLeft = new Graphics();
  private readonly hangarRight = new Graphics();
  private readonly arenaEdge = new Graphics();
  private readonly debris = Array.from({ length: 8 }, (_, index) => {
    const g = new Graphics().poly([-3, -5, 3, -3, 4, 2, -2, 4, -5, 0]).fill(index % 2 ? 0x2b354d : 0x3b435b);
    return g;
  });
  private skinKey = '';
  private arenaKey = '';

  constructor() {
    this.core.addChild(this.shellLeft, this.shellRight, this.coreBack, this.coreGlow, this.leftDoor, this.rightDoor);
    this.hangar.addChild(this.hangarBack, this.hangarLeft, this.hangarRight);
    this.root.addChild(this.core, this.hangar);
    this.arenaRoot.addChild(this.arenaEdge, ...this.debris);
    this.hide();
  }

  hide(): void { this.root.visible = false; this.arenaRoot.visible = false; }

  sync(state: BossEncounterState, boss: Entity, worldWidth: number, worldHeight: number, reducedMotion: boolean): void {
    const interactive = state.interactive;
    this.root.visible = Boolean(interactive);
    this.arenaRoot.visible = Boolean(interactive);
    if (!interactive) return;
    const palette = interactiveBossPalette(state.definition.sourceBossId);
    const miniature = interactive.scale === 'mini';
    const skinKey = `${state.definition.sourceBossId}/${miniature}`;
    if (skinKey !== this.skinKey) {
      this.skinKey = skinKey;
      this.drawCore(palette, miniature);
    }
    while (this.parts.length < interactive.parts.length) {
      const part = new PartView();
      this.parts.push(part);
      this.root.addChild(part.root);
    }
    for (let index = 0; index < this.parts.length; index++) {
      const part = interactive.parts[index];
      if (part) this.parts[index].sync(part, state, boss, reducedMotion);
      else this.parts[index].root.visible = false;
    }
    this.syncCore(interactive, state, boss, reducedMotion);
    this.syncArena(interactive, state, worldWidth, worldHeight, palette, reducedMotion);
  }

  private drawCore(palette: ReturnType<typeof interactiveBossPalette>, miniature: boolean): void {
    // The compact shutter preserves the painted cockpit and marks the timed
    // hull-damage bonus window; it does not define a separate core hit target.
    const r = miniature ? 11 : 15;
    this.coreBack.clear().poly([-r + 4, -r - 2, r - 4, -r - 2, r + 2, -r + 4, r + 2, r - 4,
      r - 4, r + 2, -r + 4, r + 2, -r - 2, r - 4, -r - 2, -r + 4])
      .fill(INK).stroke({ color: palette.trim, width: 1 })
      .rect(-r + 5, -r - 2, r * 2 - 10, 1).fill(LIGHT)
      .rect(-r - 1, -r + 5, 2, r * 2 - 10).fill(palette.armor)
      .rect(r - 1, -r + 5, 2, r * 2 - 10).fill(STEEL)
      .rect(-r + 5, r, r * 2 - 10, 2).fill(STEEL);
    this.coreGlow.clear().poly([0, -r + 3, r - 3, 0, 0, r - 3, -r + 3, 0]).fill(palette.energy)
      .poly([0, -r + 5, r - 5, 0, 0, r - 5, -r + 5, 0]).fill(STEEL)
      .poly([0, -6, 6, 0, 0, 6, -6, 0]).fill(palette.energy)
      .rect(-2, -3, 4, 6).fill(LIGHT);
    for (const [door, sign] of [[this.leftDoor, -1], [this.rightDoor, 1]] as const) {
      door.clear().poly([sign, -r, sign * (r - 4), -r, sign * r, -r + 4,
        sign * r, r - 4, sign * (r - 4), r, sign, r]).fill(STEEL);
      const x = sign < 0 ? -r + 2 : 2;
      for (let row = -r + 3; row < r - 3; row += 4) {
        door.rect(x, row, r - 4, 3).fill(palette.armor)
          .rect(x, row, r - 6, 1).fill(palette.trim)
          .rect(x + r - 5, row + 1, 1, 2).fill(INK)
          .rect(sign < 0 ? -3 : 1, row + 2, 2, 1).fill(INK);
      }
      for (const y of [-r + 3, r - 5]) {
        door.rect(sign < 0 ? -r + 3 : r - 6, y, 3, 3).fill(INK)
          .rect(sign < 0 ? -r + 3 : r - 6, y, 1, 1).fill(LIGHT);
      }
      door.rect(sign < 0 ? -2 : 1, -2, 1, 4).fill(AMBER);
    }
    for (const [shell, sign] of [[this.shellLeft, -1], [this.shellRight, 1]] as const) {
      const shape = palette.motif === 'prism'
        ? [sign * 12, -14, sign * 23, -25, sign * 19, 7, sign * 13, 16]
        : palette.motif === 'claw'
          ? [sign * 12, -18, sign * 22, -10, sign * 22, 14, sign * 16, 20, sign * 18, 2, sign * 12, -5]
          : [sign * 12, -17, sign * 20, -13, sign * 22, 5, sign * 16, 18, sign * 12, 11];
      shell.clear().poly(shape).fill(palette.armor).stroke({ color: INK, width: 1 })
        .moveTo(sign * 15, -14).lineTo(sign * 18, -8).lineTo(sign * 18, 4)
        .stroke({ color: palette.trim, width: 1 });
      for (let row = -8; row < 10; row += 5) {
        shell.rect(sign < 0 ? -20 : 18, row, 2, 3).fill(INK)
          .rect(sign < 0 ? -20 : 18, row, 1, 1).fill(palette.trim);
      }
    }
    this.hangarBack.clear().poly([-11, -7, 11, -7, 15, -3, 15, 3, 11, 7, -11, 7, -15, 3, -15, -3]).fill(INK)
      .rect(-11, -5, 22, 1).fill(palette.trim)
      .rect(-11, -2, 22, 1).fill(palette.energy).rect(-11, 3, 22, 1).fill(palette.energy);
    for (const [door, sign] of [[this.hangarLeft, -1], [this.hangarRight, 1]] as const) {
      const x = sign < 0 ? -13 : 1;
      door.clear().rect(x, -5, 12, 10).fill(STEEL);
      for (let row = -5; row <= 3; row += 3) {
        door.rect(x + 1, row, 10, 2).fill(palette.armor)
          .rect(x + 1, row, 8, 1).fill(palette.trim);
      }
      door.rect(sign < 0 ? -12 : 10, -3, 2, 2).fill(INK).rect(sign < 0 ? -12 : 10, -3, 1, 1).fill(LIGHT);
    }
  }

  private syncCore(interactive: InteractiveState, state: BossEncounterState, boss: Entity, reducedMotion: boolean): void {
    const open = clamp01(interactive.coreOpen);
    const transform = clamp01(interactive.transform);
    // Runtime owns these world sockets for damage and escort creation.
    this.core.position.set(Math.round(interactive.coreX), Math.round(interactive.coreY));
    const slide = Math.round(open * (interactive.scale === 'mini' ? 10 : 15));
    this.leftDoor.x = -slide;
    this.rightDoor.x = slide;
    this.coreGlow.alpha = open > 0 ? reducedMotion ? 0.9 : 0.78 + Math.sin(state.ageFrames * 0.16) * 0.16 : 0.2;
    this.shellLeft.x = -Math.round(transform * 10);
    this.shellRight.x = Math.round(transform * 10);
    this.shellLeft.y = this.shellRight.y = -Math.round(transform * 7);
    this.shellLeft.rotation = reducedMotion ? 0 : -transform * 0.12;
    this.shellRight.rotation = reducedMotion ? 0 : transform * 0.12;
    this.shellLeft.alpha = this.shellRight.alpha = 1 - transform * 0.18;
    this.hangar.position.set(Math.round(interactive.hangarX), Math.round(interactive.hangarY));
    const hatch = clamp01(interactive.hatchOpen ?? 0);
    this.hangar.visible = interactive.scale === 'major';
    this.hangarLeft.x = -Math.round(hatch * 14);
    this.hangarRight.x = Math.round(hatch * 14);
    this.hangarBack.alpha = 0.5 + hatch * 0.5;
  }

  private syncArena(interactive: InteractiveState, state: BossEncounterState, width: number, height: number,
    palette: ReturnType<typeof interactiveBossPalette>, reducedMotion: boolean): void {
    // Background-only perimeter machinery, never a false collision outline.
    // All damaging walls/grids use the exact plan.zones rendered by BossPolishPresentation.
    const kind = interactive.arena.kind;
    const key = `${kind}/${interactive.arena.phase}/${width}/${height}/${palette.energy}`;
    if (key !== this.arenaKey) {
      this.arenaKey = key;
      const g = this.arenaEdge.clear();
      if (kind !== 'clear') {
        g.rect(0, 150, 6, Math.max(0, height - 190)).fill(INK)
          .rect(width - 6, 150, 6, Math.max(0, height - 190)).fill(INK);
        for (let y = 170; y < height - 65; y += 94) {
          g.rect(0, y, 9, 24).fill(STEEL).rect(width - 9, y, 9, 24).fill(STEEL)
            .rect(0, y + 5, 3, 12).fill(palette.energy).rect(width - 3, y + 5, 3, 12).fill(palette.energy);
        }
      }
    }
    this.arenaEdge.alpha = state.stage === 'transition' && !reducedMotion ? 0.5 + Math.sin(state.ageFrames * 0.1) * 0.15 : 0.55;
    for (let index = 0; index < this.debris.length; index++) {
      const debris = this.debris[index];
      debris.visible = kind === 'debris';
      if (!debris.visible) continue;
      const side = index % 2 ? 1 : -1;
      debris.position.set(side < 0 ? 9 + index % 3 * 7 : width - 9 - index % 3 * 7,
        175 + ((index * 79 + (reducedMotion ? 0 : state.ageFrames * 0.22)) % Math.max(1, height - 230)));
      debris.rotation = reducedMotion ? index : index + state.ageFrames * 0.004 * side;
      debris.alpha = 0.52;
    }
  }
}
