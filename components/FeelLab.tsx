import React, { useEffect, useRef, useState } from 'react';
import { Application, Assets, ColorMatrixFilter, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { ArcadeEffectPool } from '../services/pixi/ArcadeEffectPool';
import { FeelEffects } from '../services/revamp/feel/FeelEffects';
import { FeelPresentation, drawReadableProjectile } from '../services/revamp/feel/FeelPresentation';
import { FeelRuntime } from '../services/revamp/feel/FeelRuntime';
import { markAimedShot } from '../services/revamp/feel/FeelGameplay';
import { audioService, type GameSoundType } from '../services/audioService';
import { EntityType } from '../types';
import type { Entity, GameEngine } from '../services/gameLogic';

const SCENES = [
  ['explosions', 'Explosion tiers'], ['hits', 'Directional impact'], ['armor', 'Armored ting'],
  ['muzzle', 'Fleet muzzle flash'], ['projectiles', 'Projectile contrast'], ['cancel', 'Phase cancel'],
  ['power', 'Power pickup'], ['hud', 'Combo + perfect wave'], ['boss', 'Boss defeat']
] as const;
type Scene = typeof SCENES[number][0];
const WORLD_WIDTH = 390;
const WORLD_HEIGHT = 580;
const isScene = (value: string | null): value is Scene => SCENES.some(([id]) => id === value);
const requested = new URLSearchParams(window.location.search).get('effect');
const firstScene: Scene = isScene(requested) ? requested : 'explosions';

/** Isolated dev surface: local art, real effect pool, no account/network services. */
export default function FeelLab() {
  const host = useRef<HTMLDivElement>(null);
  const controls = useRef({ scene: firstScene, auto: !isScene(requested), reduced: false, sound: false, replay: 0 });
  const [scene, setScene] = useState<Scene>(firstScene);
  const [auto, setAuto] = useState(!isScene(requested));
  const [reduced, setReduced] = useState(false);
  const [sound, setSound] = useState(false);
  const [status, setStatus] = useState('Preparing effects…');
  const [counts, setCounts] = useState('');

  useEffect(() => {
    const app = new Application();
    let disposed = false;
    let initialized = false;
    let pool: ArcadeEffectPool | undefined;
    let hitFilter: ColorMatrixFilter | undefined;
    let presentation: FeelPresentation | undefined;
    const start = async () => {
      await app.init({ width: WORLD_WIDTH, height: WORLD_HEIGHT, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true, antialias: false, background: '#030b19', preference: 'webgl' });
      initialized = true;
      if (disposed) { app.destroy(true, { children: true }); return; }
      app.canvas.style.width = '100%';
      app.canvas.style.height = '100%';
      app.canvas.style.display = 'block';
      // The production page positions its canvas absolutely; the lab is inline.
      app.canvas.style.position = 'static';
      host.current?.appendChild(app.canvas);

      const background = new Graphics();
      for (let index = 0; index < 90; index++) {
        const x = (index * 137.507) % WORLD_WIDTH;
        const y = (index * 79.319) % WORLD_HEIGHT;
        background.circle(x, y, index % 5 ? 0.6 : 1).fill({ color: index % 2 ? '#7dd3fc' : '#cbd5e1', alpha: index % 5 ? 0.2 : 0.4 });
      }
      background.roundRect(14, 16, 362, 44, 8).fill({ color: '#0c1e32', alpha: 0.95 }).stroke({ color: '#67e8f9', alpha: 0.25, width: 1 });
      app.stage.addChild(background);
      const score = new Text({ text: 'SCIENCE CREDITS   012,450', style: { fontFamily: 'monospace', fontSize: 15, fontWeight: 'bold', fill: '#fde68a', letterSpacing: 1 } });
      score.position.set(28, 30);
      app.stage.addChild(score);

      const effectLayer = new Container();
      pool = new ArcadeEffectPool(effectLayer);
      pool.setQuality(false, true);
      const feel = new FeelEffects(pool);
      const runtime = new FeelRuntime();
      // A presentation-only fixture: importing GameEngine above is type-only,
      // so this lab never constructs simulation, wallet, or account services.
      const fixture = { width: WORLD_WIDTH, height: WORLD_HEIGHT, frameCount: 0, performanceMode: false, feel: runtime };
      const engine = fixture as unknown as GameEngine;
      const hudLayer = new Container();
      presentation = new FeelPresentation(pool, hudLayer);
      const projectileLayer = new Container();
      const projectiles = Array.from({ length: 18 }, (_, index) => {
        const column = index % 3;
        const root = new Container();
        const sprite = new Sprite();
        sprite.visible = false;
        const body = new Graphics();
        const aura = new Graphics();
        const trail = new Graphics();
        const flash = new Graphics();
        root.addChild(aura, trail, body, sprite, flash);
        projectileLayer.addChild(root);
        const view = { root, sprite, body, aura, trail, flash, hasFallbackBody: true };
        const entity = {
          id: `lab-shot-${index}`, type: EntityType.PROJECTILE, isPlayerShot: column === 0,
          width: column === 0 ? 8 : 15, height: column === 0 ? 20 : 15,
          vx: 0, vy: column === 0 ? -6 : 3, weaponVisualStartFrame: 0
        } as Entity;
        if (column === 2) markAimedShot(entity);
        return { view, entity, column, row: Math.floor(index / 3) };
      });
      const labels = new Container();
      const addLabel = (text: string, x: number, y: number, color = '#94a3b8', fontSize = 11) => {
        const label = new Text({ text, style: { fontFamily: 'monospace', fontSize, fontWeight: 'bold', fill: color, letterSpacing: 1 } });
        label.anchor.set(0.5);
        label.position.set(x, y);
        labels.addChild(label);
        return label;
      };
      const caption = addLabel('SMALL       ELITE       BOSS PART', 195, 150);
      const power = addLabel('POWER 4', 195, 305, '#e0faff', 32);
      power.visible = false;
      const flash = new Graphics().rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT).fill('#ffffff');
      flash.alpha = 0;
      const targets = new Container();
      const hitSilhouettes: Sprite[] = [];
      hitFilter = new ColorMatrixFilter();
      hitFilter.matrix = [0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0];

      // Reuse Scott's existing pixel art. Missing optional artwork does not block FX.
      const paths = Array.from({ length: 7 }, (_, index) => `/game-art/pixi/effects/explosion/frame-${index + 1}.png`);
      try {
        const [shipTexture, enemyTexture, ...explosions] = await Promise.all([
          Assets.load<Texture>('/game-art/branding/bio-ship.png'),
          Assets.load<Texture>('/game-art/pixi/enemies/jet-heavy/frame-1.png'),
          ...paths.map(path => Assets.load<Texture>(path))
        ]);
        if (disposed) return;
        pool.setExplosionTextures(explosions);
        const ship = new Sprite(shipTexture);
        ship.anchor.set(0.5);
        ship.position.set(195, 497);
        ship.width = 78;
        ship.height = 78;
        app.stage.addChild(ship);
        for (const side of [-1, 1]) {
          const wing = new Sprite(shipTexture);
          wing.anchor.set(0.5);
          wing.position.set(195 + side * 63, 518);
          wing.width = 36;
          wing.height = 36;
          app.stage.addChild(wing);
        }
        for (let index = 0; index < 3; index++) {
          const enemy = new Sprite(enemyTexture);
          enemy.anchor.set(0.5);
          enemy.position.set(95 + index * 100, 215);
          enemy.width = enemy.height = 55;
          const silhouette = new Sprite(enemyTexture);
          silhouette.anchor.set(0.5);
          silhouette.position.copyFrom(enemy.position);
          silhouette.scale.copyFrom(enemy.scale);
          silhouette.filters = [hitFilter];
          hitSilhouettes.push(silhouette);
          targets.addChild(enemy, silhouette);
        }
      } catch { /* Procedural effects remain fully testable offline. */ }
      if (disposed) return;
      app.stage.addChild(targets, projectileLayer, effectLayer, labels, hudLayer, flash);
      let sceneAge = 0;
      let repeat = 9999;
      let telemetry = 0;
      let active = controls.current.scene;
      let replay = controls.current.replay;
      let powerAge = 1000;
      let hitAge = 1000;
      let fixedAccumulator = 0;
      let hudAge = 0;
      let hudStep = 0;
      const hudTimeline = [0, 200, 400, 600, 800, 1000, 1200, 1900];
      const soundForScene: Record<Scene, GameSoundType> = {
        explosions: 'explosion_elite', hits: 'impact', armor: 'armored_hit', muzzle: 'shoot',
        projectiles: 'shoot', cancel: 'phase_change', power: 'powerup', hud: 'explosion_small', boss: 'explosion_boss_part'
      };
      setStatus('Live · 390 × 580 world');
      const spawn = () => {
        if (!pool) return;
        const selected = controls.current.scene;
        caption.text = selected === 'explosions' ? 'SMALL       ELITE       BOSS PART' : SCENES.find(([id]) => id === selected)?.[1].toUpperCase() ?? '';
        if (controls.current.sound && selected !== 'hud') audioService.playSound(soundForScene[selected]);
        if (selected === 'explosions') {
          pool.spawnTieredExplosion(65, 245, 34, 'small');
          pool.spawnTieredExplosion(195, 245, 57, 'elite');
          pool.spawnTieredExplosion(325, 245, 76, 'boss-part', '#fef08a');
        } else if (selected === 'hits' || selected === 'armor') {
          hitAge = 0;
          for (let index = 0; index < 3; index++) {
            pool.spawnProjectileHit(95 + index * 100, 245, 22, '#67e8f9', index - 1, -1, controls.current.reduced, selected === 'armor');
          }
        } else if (selected === 'muzzle') {
          pool.spawnMuzzle(195, 461, 18);
          pool.spawnMuzzle(132, 500, 11);
          pool.spawnMuzzle(258, 500, 11);
        } else if (selected === 'cancel') {
          for (let index = 0; index < 24; index++) {
            const angle = index * 2.399963;
            const radius = Math.sqrt(index / 24) * 140;
            pool.spawnScoreSpark(195 + Math.cos(angle) * radius, 285 + Math.sin(angle) * radius, 280, 38);
          }
        } else if (selected === 'power') {
          pool.spawnPickupRing(195, 360, true);
          powerAge = 0;
        } else if (selected === 'projectiles') {
          caption.text = 'PLAYER       ENEMY       AIMED';
        } else if (selected === 'hud') {
          runtime.reset();
          hudAge = 0;
          hudStep = 0;
        } else if (selected === 'boss') {
          feel.startBossDefeat(195, 245, 230, 150);
        }
      };
      app.ticker.add(ticker => {
        const delta = Math.min(100, ticker.deltaMS);
        sceneAge += delta;
        repeat += delta;
        telemetry += delta;
        powerAge += delta;
        hitAge += delta;
        fixedAccumulator += delta;
        while (fixedAccumulator >= 1000 / 60) {
          fixedAccumulator -= 1000 / 60;
          fixture.frameCount++;
          runtime.advanceFrame();
        }
        if (active !== controls.current.scene || replay !== controls.current.replay) {
          active = controls.current.scene;
          replay = controls.current.replay;
          sceneAge = 0;
          repeat = 9999;
          feel.reset();
          runtime.reset();
        }
        if (controls.current.auto && sceneAge > 4400) {
          const next = SCENES[(SCENES.findIndex(([id]) => id === active) + 1) % SCENES.length][0];
          controls.current.scene = next;
          setScene(next);
        }
        pool?.setQuality(controls.current.reduced, true);
        feel.setReducedFlash(controls.current.reduced);
        const interval = active === 'hud' ? 4200 : active === 'muzzle' ? 150 : active === 'hits' || active === 'armor' ? 320 : active === 'boss' ? 2200 : 1250;
        if (repeat > interval) { repeat = 0; spawn(); }
        if (active === 'hud') {
          hudAge += delta;
          while (hudStep < hudTimeline.length && hudAge >= hudTimeline[hudStep]) {
            const position = { frame: fixture.frameCount, x: 85 + (hudStep % 3) * 110, y: 270 + (hudStep % 2) * 50 };
            if (hudStep < 6) {
              runtime.recordKill({ ...position, tier: 'small', score: 100 });
              if (controls.current.sound) audioService.playSound('explosion_small');
            } else if (hudStep === 6) {
              runtime.recordWaveClear(position);
              if (controls.current.sound) audioService.playSound('wave');
            } else {
              runtime.recordPickup({ frame: fixture.frameCount, x: 195, y: 360, pickupType: 'power', powerLevel: 4 });
              if (controls.current.sound) audioService.playSound('powerup');
            }
            hudStep++;
          }
        }
        fixture.performanceMode = controls.current.reduced;
        presentation?.beginFrame(engine, delta);
        hudLayer.visible = active === 'hud';
        projectileLayer.visible = active === 'projectiles';
        if (projectileLayer.visible) {
          for (const { view, entity, column, row } of projectiles) {
            view.body.clear(); view.aura.clear(); view.trail.clear();
            const travel = (sceneAge * (column === 0 ? 0.15 : 0.09) + row * 48) % 260;
            view.root.position.set(90 + column * 105, column === 0 ? 445 - travel : 185 + travel);
            drawReadableProjectile(view, entity, fixture.frameCount);
          }
        }
        pool?.update(delta);
        feel.update(delta);
        flash.alpha = feel.screenFlashAlpha;
        targets.visible = active === 'hits' || active === 'armor';
        for (const silhouette of hitSilhouettes) {
          silhouette.visible = hitAge < 60;
          silhouette.alpha = controls.current.reduced ? 0.26 : 0.88;
        }
        power.visible = powerAge < 950;
        power.alpha = Math.min(1, Math.max(0, (950 - powerAge) / 200));
        power.scale.set(1 + Math.max(0, 1 - powerAge / 200) * 0.18);
        power.y = 320 - Math.min(1, powerAge / 950) * 28;
        if (telemetry > 350 && pool) {
          telemetry = 0;
          const stats = pool.getStats();
          setCounts(`${stats.active}/${stats.cap} particles · ${stats.lights}/${stats.lightCap} lights`);
        }
      });
    };
    start().catch(() => { if (!disposed) setStatus('Renderer could not start. WebGL is required.'); });
    return () => {
      disposed = true;
      if (initialized) {
        app.stop();
        presentation?.destroy();
        pool?.destroy();
        app.destroy(true, { children: true });
        hitFilter?.destroy();
      }
    };
  }, []);

  return <main style={{ height: '100dvh', overflowY: 'auto', padding: '18px 12px 24px', background: '#030914', color: '#dbeafe', fontFamily: 'monospace' }}>
    <div style={{ maxWidth: 500, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div><div style={{ color: '#67e8f9', fontSize: 11, letterSpacing: 3 }}>SCICON / FEEL LAB</div><h1 style={{ fontSize: 20, margin: '6px 0 0' }}>Impact systems</h1></div>
        <a href="/?view=hangar" style={{ color: '#94a3b8', fontSize: 12 }}>Game ↗</a>
      </header>
      <div ref={host} aria-label="Live game effects preview" style={{ width: '100%', aspectRatio: `${WORLD_WIDTH}/${WORLD_HEIGHT}`, overflow: 'hidden', borderRadius: 10, border: '1px solid #1e3a50' }} />
      <div role="status" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', color: '#7c9ab5', fontSize: 10, margin: '9px 0 12px' }}><span>{status}</span><span>{counts}</span></div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{SCENES.map(([id, title]) => <button key={id} aria-pressed={scene === id} onClick={() => { controls.current.scene = id; controls.current.auto = false; controls.current.replay++; setScene(id); setAuto(false); }} style={{ minHeight: 40, padding: '8px 11px', borderRadius: 6, border: `1px solid ${scene === id ? '#67e8f9' : '#294158'}`, background: scene === id ? '#10354a' : '#0c1827', color: scene === id ? '#cffafe' : '#94a3b8', fontSize: 11, cursor: 'pointer' }}>{title}</button>)}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginTop: 16, fontSize: 12 }}>
        <label><input type="checkbox" checked={auto} onChange={event => { controls.current.auto = event.target.checked; setAuto(event.target.checked); }} /> Cycle scenes</label>
        <label><input type="checkbox" checked={reduced} onChange={event => { controls.current.reduced = event.target.checked; setReduced(event.target.checked); }} /> Low FX / reduced flash</label>
        <label><input type="checkbox" checked={sound} onChange={event => { controls.current.sound = event.target.checked; setSound(event.target.checked); if (event.target.checked) audioService.playSound('coin'); }} /> Sound previews</label>
      </div>
    </div>
  </main>;
}
