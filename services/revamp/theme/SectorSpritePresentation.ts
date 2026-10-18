import { Assets, Container, Sprite, Text, Texture, type Renderer } from 'pixi.js';
import { EntityType } from '../../../types';
import type { Entity, GameEngine } from '../../gameLogic';
import type { RenderQualityBudget } from '../performance/AdaptiveRenderQuality';
import { getWorldTheme, WORLD_THEMES, type WorldTheme } from './WorldTheme';
import { SpriteIdleAtlas } from './SpriteIdleAtlas';
import { idleFrame, shimmerFrame, type SpriteRole } from './spritePixels';

type ActorView = { sprite: Sprite; root: Container; displayedTextureKey: string | null };
type Decoration = { glow: Sprite; outline: Sprite; shimmer: Sprite };
type ThemeWindow = Window & { __sciconSpriteThemeQA?: { snapshot: () => ReturnType<SectorSpritePresentation['snapshot']> } };
const regular = new Set([EntityType.ENEMY_DRONE, EntityType.ENEMY_SWARM, EntityType.ENEMY_JOURNAL, EntityType.ENEMY_BRICK, EntityType.ENEMY_INVADER]);
const pickups = new Set([EntityType.COIN, EntityType.POWERUP, EntityType.BOMB, EntityType.SUPPLY_DROP]);

/** Cosmetic-only sibling overlays. Source art, collision geometry, authored
 * steering/attack strips, I's flash and P's motion remain authoritative. */
export class SectorSpritePresentation {
  private atlas: SpriteIdleAtlas | null = null;
  private theme: WorldTheme = WORLD_THEMES[0];
  private level = '';
  private campaign: GameEngine['campaign'] | null = null;
  private frame = 0;
  private quality: RenderQualityBudget['tier'] = 'high';
  private reduced = false;
  private actorsAnimated = 0;
  private revision = 0;
  private readonly decorations = new Map<Sprite, Decoration>();
  private readonly seenDecorations = new WeakMap<Sprite, number>();
  private readonly sourceTextures = new Map<Sprite, Texture>();
  private readonly bossCandidates = new WeakMap<Container, { frame: number; sprites: Sprite[] }>();
  private readonly qaBridge = { snapshot: () => this.snapshot() };
  private disposed = false;
  constructor(private readonly renderer: () => Renderer) {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('qa') === '1') {
      (window as ThemeWindow).__sciconSpriteThemeQA = this.qaBridge;
    }
  }
  beginFrame(engine: GameEngine, quality: RenderQualityBudget, reducedMotion: boolean) {
    if (this.disposed) return;
    const level = engine.getCurrentLevelDefinition()?.id ?? '';
    if (!this.atlas || level !== this.level || engine.campaign !== this.campaign) {
      this.clear(); this.level = level; this.campaign = engine.campaign;
      this.theme = getWorldTheme(engine.campaign, level, engine.campaign.id.startsWith('weekly-run-') || level.startsWith('weekly-run-stage-'));
      this.atlas = new SpriteIdleAtlas(this.renderer(), this.theme.enemyPalette);
    }
    this.frame = engine.frameCount; this.quality = quality.tier; this.reduced = reducedMotion;
    this.revision++;
    this.actorsAnimated = 0;
    this.atlas.prepareNext();
  }
  entity(view: ActorView, entity: Entity) {
    if (this.disposed || !this.atlas) return;
    if (!view.sprite.visible) this.hideDecoration(view.sprite);
    let role: SpriteRole;
    if (entity.type === EntityType.PLAYER) role = 'player';
    else if (regular.has(entity.type) && entity.variant < 900) role = 'enemy';
    else if (pickups.has(entity.type)) role = 'pickup';
    else if (entity.type === EntityType.BOSS || entity.type === EntityType.MINI_BOSS) role = 'boss';
    else { this.hideDecoration(view.sprite); return; }
    const key = view.displayedTextureKey;
    if (view.sprite.visible && key) {
      const original = Assets.get<Texture>(key);
      if (original) this.present(view.sprite, original, key, role, (entity.variant ?? 0) * 11 + (entity.formationIndex ?? 0) * 5,
        role === 'pickup' || entity.isElite);
    } else if (role === 'boss') {
      // Generic assembled-hull traversal: no knowledge of O's boss modules or
      // gameplay parts. The four largest visible art sprites receive metal only.
      let cached = this.bossCandidates.get(view.root);
      if (!cached || this.frame - cached.frame >= 30) {
        const sprites: Sprite[] = []; this.bossSprites(view.root, sprites);
        sprites.sort((a, b) => b.width * b.height - a.width * a.height);
        cached = { frame: this.frame, sprites: sprites.slice(0, 4) }; this.bossCandidates.set(view.root, cached);
      }
      const candidates = cached.sprites;
      for (let i = 0; i < Math.min(4, candidates.length); i++) {
        const sprite = candidates[i];
        if (!sprite.visible || sprite.destroyed) { this.hideDecoration(sprite); continue; }
        // J's atlas view retains the original URL in its label. Resolve that
        // loaded Assets source before CPU baking; never read a render target.
        const sourceKey = sprite.texture.label?.replace(/^atlas:/, '');
        const original = sourceKey && Assets.cache.has(sourceKey) ? Assets.get<Texture>(sourceKey) : sprite.texture;
        this.present(sprite, original, `rig:${original.uid}`, role, entity.variant * 11 + i * 9, false);
      }
    }
  }
  wing(sprite: Sprite, key: string, index: number) {
    const original = Assets.get<Texture>(key);
    if (original && sprite.visible) this.present(sprite, original, key, 'wing', index * 13, false);
    else this.hideDecoration(sprite);
  }
  /** Hook after ordinary HUD updates so dynamic messages retain their layout. */
  headers(texts: readonly Text[], gems: readonly Sprite[], overlay: Container) {
    // Retire only overlays whose owner disappeared/recycled this render. Active
    // glows stay visible across frames so Pixi can retain render instructions.
    this.decorations.forEach((_parts, sprite) => {
      if (this.seenDecorations.get(sprite) !== this.revision) this.hideDecoration(sprite);
    });
    for (const text of texts) if (text.style.fill !== this.theme.accent) text.style.fill = this.theme.accent;
    for (const gem of gems) gem.tint = this.theme.secondary;
    const bossHud = overlay.children.find(child => child.label === 'revamp-boss-hud');
    // A light tint grades the retained card without recoloring world hazards.
    if (bossHud) bossHud.tint = this.theme.secondary;
  }
  snapshot() {
    const optionalVisible = { glow: 0, outline: 0, shimmer: 0 };
    this.decorations.forEach(parts => {
      if (parts.glow.visible) optionalVisible.glow++;
      if (parts.outline.visible) optionalVisible.outline++;
      if (parts.shimmer.visible) optionalVisible.shimmer++;
    });
    return { themeId: this.theme.id, levelId: this.level, frame: this.frame, quality: this.quality,
      reducedMotion: this.reduced, actorsAnimated: this.actorsAnimated, optionalVisible, atlas: this.atlas?.stats() ?? null };
  }
  destroy() {
    if (this.disposed) return; this.disposed = true; this.clear();
    if (typeof window !== 'undefined' && (window as ThemeWindow).__sciconSpriteThemeQA === this.qaBridge) delete (window as ThemeWindow).__sciconSpriteThemeQA;
  }
  private clear() {
    this.sourceTextures.forEach((texture, sprite) => { if (!sprite.destroyed && !texture.destroyed) sprite.texture = texture; });
    this.sourceTextures.clear();
    this.decorations.forEach(parts => Object.values(parts).forEach(sprite => sprite.destroy({ texture: false, textureSource: false })));
    this.decorations.clear(); this.atlas?.destroy(); this.atlas = null;
  }
  private bossSprites(root: Container, result: Sprite[], depth = 0) {
    if (depth > 5 || !root.visible) return;
    for (const child of root.children) {
      if (!child.visible || child.label === 'sector-sprite-fx') continue;
      if (child instanceof Sprite && child.texture !== Texture.WHITE && child.width > 16 && child.height > 16) result.push(child);
      else if (child instanceof Container && child.children?.length) this.bossSprites(child, result, depth + 1);
    }
  }
  private present(sprite: Sprite, original: Texture, key: string, role: SpriteRole, phase: number, outline: boolean) {
    if (!this.atlas || !sprite.parent) return;
    const entry = this.atlas.request(`${role}:${key}`, original, role, role === 'enemy' || role === 'pickup');
    const old = this.decorations.get(sprite);
    if (!entry) { this.hideDecoration(sprite); if (this.sourceTextures.has(sprite)) sprite.texture = original; return; }
    if (entry.frames.length) {
      sprite.texture = entry.frames[idleFrame(this.frame, phase, this.reduced, this.quality === 'low')];
      this.sourceTextures.set(sprite, original);
      this.actorsAnimated++;
    }
    // Retain exactly three optional quads only on actors that use them. Regular
    // enemies receive the baked energy cycle with no extra display objects.
    if (!outline && !entry.shimmer.length) { this.hideDecoration(sprite); return; }
    const parts = old ?? this.createDecoration(sprite);
    this.seenDecorations.set(sprite, this.revision);
    const pulse = this.reduced ? .5 : .5 + Math.sin((this.frame + phase) * .055) * .5;
    const optional = this.quality !== 'low';
    parts.glow.visible = outline && optional;
    if (parts.glow.visible) {
      parts.glow.texture = this.atlas.glowTexture(); parts.glow.position.copyFrom(sprite.position);
      parts.glow.width = Math.max(16, sprite.width * 1.25); parts.glow.height = Math.max(16, sprite.height * 1.25);
      parts.glow.rotation = sprite.rotation; parts.glow.tint = role === 'pickup' ? this.theme.pickupGlow : this.theme.uiGlow;
      parts.glow.alpha = (role === 'pickup' ? .34 : .18) * (.75 + pulse * .25) * sprite.alpha;
    }
    parts.outline.visible = Boolean(entry.outline) && optional;
    if (parts.outline.visible && entry.outline) {
      this.pose(parts.outline, sprite, entry.outline);
      parts.outline.tint = this.theme.accent; parts.outline.alpha = (.22 + pulse * .2) * sprite.alpha;
    }
    const metal = shimmerFrame(this.frame, phase, this.reduced, this.quality === 'high');
    parts.shimmer.visible = metal >= 0 && Boolean(entry.shimmer[metal]);
    if (parts.shimmer.visible) {
      this.pose(parts.shimmer, sprite, entry.shimmer[metal]); parts.shimmer.alpha = .22 * sprite.alpha;
    }
  }
  private createDecoration(sprite: Sprite): Decoration {
    const make = () => { const part = new Sprite({ texture: Texture.EMPTY, label: 'sector-sprite-fx', eventMode: 'none', roundPixels: true }); part.anchor.set(.5); part.blendMode = 'add'; part.visible = false; return part; };
    const parts = { glow: make(), outline: make(), shimmer: make() };
    const parent = sprite.parent!;
    parent.addChildAt(parts.glow, parent.getChildIndex(sprite));
    parent.addChildAt(parts.outline, parent.getChildIndex(sprite) + 1);
    parent.addChildAt(parts.shimmer, parent.getChildIndex(parts.outline) + 1);
    this.decorations.set(sprite, parts); return parts;
  }
  private pose(target: Sprite, source: Sprite, texture: Texture) {
    target.texture = texture; target.position.copyFrom(source.position); target.anchor.copyFrom(source.anchor);
    target.scale.copyFrom(source.scale); target.rotation = source.rotation;
  }
  private hideDecoration(sprite: Sprite) {
    const parts = this.decorations.get(sprite);
    if (parts) { parts.glow.visible = false; parts.outline.visible = false; parts.shimmer.visible = false; }
  }
}
