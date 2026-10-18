import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Transform-only Pixi fixture: no canvas, browser or GPU required for pooling,
// accessibility and simulation immutability assertions.
const pixi = `
class Point { x=0;y=0;set(x,y=x){this.x=x;this.y=y;} copyFrom(p){this.set(p.x,p.y);} }
export class Container {
  children=[];position=new Point();scale=new Point();visible=true;alpha=1;rotation=0;
  constructor(){this.scale.set(1);}
  get x(){return this.position.x;} set x(v){this.position.x=v;}
  get y(){return this.position.y;} set y(v){this.position.y=v;}
  addChild(...items){this.children.push(...items);return items[0];} destroy(){this.children=[];}
}
export class Graphics extends Container {
  commands=[];clear(){this.commands=[];return this;}
  rect(...v){this.commands.push(['rect',...v]);return this;}
  roundRect(...v){this.commands.push(['roundRect',...v]);return this;}
  fill(...v){this.commands.push(['fill',...v]);return this;}
}
export class Sprite extends Container { anchor=new Point(); constructor(texture){super();this.texture=texture;} }
export class Text extends Sprite { constructor(options){super();this.text=options.text;this.style=options.style;} }
export class Texture { static WHITE={}; }
`;
const result = await build({ stdin: { contents: `
export * from './services/revamp/feel/AliveFeedback';
export * from './services/revamp/feel/CombatSpriteMotion';
export * from './services/revamp/feel/FeelPresentation';
export * from './types';
export * from 'pixi.js';
`, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'presentation-transforms', setup(builder) {
    builder.onResolve({ filter: /^pixi.js$/ }, () => ({ path: 'pixi', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: pixi }));
  } }]
});
const api = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const { EntityType: Type, Container, Sprite, Graphics, Text } = api;
const view = () => ({ root: new Container(), sprite: new Sprite({ art: true }), aura: new Graphics(), trail: new Graphics() });
const entity = (type, variant = 0) => ({ id: `e${variant}`, type, variant, formationIndex: variant, x: 140, y: 250, width: 32, height: 32, vx: 0, vy: 5 });
const engine = () => ({ width: 390, height: 844, frameCount: 15, entities: [], performanceMode: false, feel: { resetGeneration: 0, events: [], comboMultiplier: 1 }, player: { x: 140, y: 650, width: 50, height: 50 }, playerVel: { x: 0 } });

test('reward text pops and floats without modifying receipt lifetime, with stable reduced motion', () => {
  const effect = Object.freeze({ text: '+240', maxLife: 120, life: 114 });
  const root = new Container(), text = new Text({ text: effect.text });
  api.animateCombatLabel(root, text, effect, false);
  assert.ok(text.scale.x > 1 && text.scale.x <= 1.14);
  assert.ok(root.y < 0 && root.y >= -8);
  root.position.set(0, 0);
  api.animateCombatLabel(root, text, effect, true);
  assert.equal(text.scale.x, 1);
  assert.equal(root.y, 0);
  assert.equal(effect.life, 114);
  assert.equal(api.sampleFeedbackPop(2100, 2000).alpha, 0);
});

test('pooled labels reset scale and leave combat instructions untouched', () => {
  const root = new Container(), text = new Text({ text: '+40' });
  api.animateCombatLabel(root, text, { text: '+40', maxLife: 120, life: 114 }, false);
  text.alpha = .7; root.y = 100;
  api.animateCombatLabel(root, text, { text: 'NEW ENEMY: DIVER', maxLife: 120, life: 114 }, false);
  assert.equal(text.scale.x, 1);
  assert.equal(text.alpha, .7);
  assert.equal(root.y, 100);
});

test('regular exhaust is retained on a pooled actor and quality can hide it immediately', () => {
  const e = engine(), v = view(), enemy = Object.freeze({ ...entity(Type.ENEMY_DRONE), formationState: 'hold' });
  for (let i = 0; i < 40; i++) { e.frameCount++; api.animateCombatSprite(v, enemy, e, false, 1); }
  assert.equal(v.aura.children.length, 1);
  const glow = v.aura.children[0];
  assert.equal(glow.blendMode, 'add');
  assert.equal(glow.texture, api.Texture.WHITE);
  api.animateCombatSprite(v, enemy, e, false, .4);
  assert.equal(glow.visible, false);
  api.animateCombatSprite(v, entity(Type.COIN), e, false, 1);
  assert.equal(glow.visible, false, 'pickup view reuse cannot leave an engine visible');
});

test('retained glow visibility stays stable across frames and changes only with quality or actor reuse', () => {
  const e = engine(), v = view(), enemy = Object.freeze({ ...entity(Type.ENEMY_DRONE), formationState: 'hold' });
  api.animateCombatSprite(v, enemy, e, false, 1);
  const glow = v.aura.children[0], transitions = [];
  let visible = glow.visible;
  // Pixi marks its render group dirty on a visibility transition. Observe that
  // public state boundary rather than counting harmless repeated assignments.
  Object.defineProperty(glow, 'visible', {
    get: () => visible,
    set(value) { if (value !== visible) transitions.push(value); visible = value; }
  });
  for (let frame = 0; frame < 30; frame++) {
    e.frameCount++;
    api.animateCombatSprite(v, enemy, e, false, 1);
  }
  assert.deepEqual(transitions, [], 'steady High cannot dirty the render group with hidden/visible churn');
  api.animateCombatSprite(v, enemy, e, false, .4);
  api.animateCombatSprite(v, enemy, e, false, .4);
  assert.deepEqual(transitions, [false], 'Low hides the existing glow exactly once');
  api.animateCombatSprite(v, enemy, e, false, 1);
  api.animateCombatSprite(v, entity(Type.PLAYER), e, false, 1);
  assert.deepEqual(transitions, [false, true, false], 'recycling as player removes the previous enemy glow');
  api.animateCombatSprite(v, entity(Type.ENEMY_INVADER), e, false, 1);
  api.animateCombatSprite(v, entity(Type.COIN), e, false, 1);
  assert.deepEqual(transitions, [false, true, false, true, false]);
  assert.equal(v.aura.children.length, 1, 'quality and actor changes reuse the retained quad');
});

test('all ordinary hull types animate while interlocking invader structure remains fixed', () => {
  const e = engine();
  for (const type of [Type.ENEMY_DRONE, Type.ENEMY_SWARM, Type.ENEMY_BRICK, Type.ENEMY_JOURNAL]) {
    const v = view(), enemy = Object.freeze(entity(type));
    api.animateCombatSprite(v, enemy, e, false);
    assert.notEqual(v.sprite.y, 0, type);
    api.animateCombatSprite(v, enemy, e, true);
    assert.equal(v.sprite.y, 0, type);
    assert.equal(v.root.scale.x, 1, type);
  }
  const v = view(), wall = Object.freeze(entity(Type.ENEMY_INVADER));
  v.root.rotation = 0; v.sprite.y = 0;
  api.animateCombatSprite(v, wall, e, false);
  assert.equal(v.root.rotation, 0);
  assert.equal(v.sprite.y, 0);
  assert.equal(v.aura.children.length, 1);
});

test('pickup trail density follows governor and reduced motion disables decorative travel', () => {
  assert.equal(api.optionalTrailCount(1, false), 3);
  assert.equal(api.optionalTrailCount(.4, false), 1);
  assert.equal(api.optionalTrailCount(1, true), 0);
  const e = engine(), v = view(), pickup = Object.freeze(entity(Type.SUPPLY_DROP));
  api.animateCombatSprite(v, pickup, e, false, .4);
  assert.equal(v.trail.commands.filter(c => c[0] === 'rect').length, 1);
  api.animateCombatSprite(v, pickup, e, true, 1);
  assert.equal(v.trail.commands.length, 0);
  assert.equal(v.root.rotation, 0);
  assert.equal(v.sprite.y, 0);
});

test('pickup showers have a per-frame spawn budget and first-sight bursts never replay', () => {
  const events = [], pool = { spawn(...args) { events.push(args); }, spawnLightPulse() {} };
  const p = new api.FeelPresentation(pool, new Container()), e = engine();
  e.entities = Array.from({ length: 30 }, (_, i) => Object.freeze(entity(Type.COIN, i)));
  p.beginFrame(e, 16, 1);
  assert.equal(events.length, 4);
  p.beginFrame(e, 16, 1);
  assert.equal(events.length, 4);
  e.entities = Array.from({ length: 30 }, (_, i) => Object.freeze(entity(Type.COIN, i + 30)));
  p.beginFrame(e, 16, .4);
  assert.equal(events.length, 6);
  p.destroy();
});

test('ordinary power-ups receive local collect feedback without a misleading power-level label', () => {
  const events = [], pool = {
    spawn(...args) { events.push(['burst', ...args]); },
    spawnPickupRing(...args) { events.push(['ring', ...args]); }
  };
  const overlay = new Container(), p = new api.FeelPresentation(pool, overlay), e = engine();
  e.feel.events = [{ sequence: 1, type: 'pickup', pickupType: 'other', frame: e.frameCount, x: 150, y: 650 }];
  p.beginFrame(e, 16);
  assert.deepEqual(events[0], ['ring', 150, 650, true]);
  assert.equal(events.length, 2);
  assert.equal(p.headerOccupied, false);
  p.beginFrame(e, 16);
  assert.equal(events.length, 2, 'render frames cannot replay a consumed collection');
  for (const text of ['SHIELD!', 'MAGNET!', 'MAX SHOT!', 'RESEARCH BEAM!', 'PROJECTILE UPGRADE II!']) {
    assert.equal(api.isRewardLabel(text), true, text);
  }
  p.destroy();
});

test('boss headers retain priority over power and perfect-wave toasts without dropping local collection feedback', () => {
  for (const type of [Type.BOSS, Type.MINI_BOSS]) {
    const events = [], pool = { spawn(...args) { events.push(args); }, spawnPickupRing(...args) { events.push(args); } };
    const p = new api.FeelPresentation(pool, new Container()), e = engine();
    e.entities = [entity(type)];
    e.feel.events = [
      { sequence: 1, type: 'perfect-wave', frame: e.frameCount, x: 150, y: 650 },
      { sequence: 2, type: 'pickup', pickupType: 'power', powerLevel: 3, frame: e.frameCount, x: 150, y: 650 }
    ];
    p.beginFrame(e, 16);
    assert.equal(p.headerOccupied, false, 'boss name/card owns the header');
    assert.equal(events.length, 2, 'collection ring and burst remain at the ship');
    e.entities = [];
    p.beginFrame(e, 16);
    assert.equal(p.headerOccupied, true, 'an unexpired reward can appear once the boss has gone');
    p.destroy();
  }
});
