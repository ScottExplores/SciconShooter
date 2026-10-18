import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const pixi = `
class Point {
  x=0; y=0;
  set(x,y=x){this.x=x;this.y=y;}
  copyFrom(p){this.set(p.x,p.y);}
}
export class Container {
  children=[]; position=new Point(); scale=new Point(); visible=true; alpha=1; rotation=0;
  constructor(){this.scale.set(1);}
  get x(){return this.position.x;} set x(x){this.position.x=x;}
  get y(){return this.position.y;} set y(y){this.position.y=y;}
  addChild(...items){this.children.push(...items);return items[0];}
  destroy(){this.children=[];}
}
export class Graphics extends Container {
  commands=[];
  clear(){this.commands=[];return this;}
  rect(...args){this.commands.push(['rect',...args]);return this;}
  ellipse(...args){this.commands.push(['ellipse',...args]);return this;}
  circle(...args){this.commands.push(['circle',...args]);return this;}
  roundRect(...args){this.commands.push(['roundRect',...args]);return this;}
  fill(...args){this.commands.push(['fill',...args]);return this;}
  stroke(...args){this.commands.push(['stroke',...args]);return this;}
  moveTo(...args){this.commands.push(['moveTo',...args]);return this;}
  lineTo(...args){this.commands.push(['lineTo',...args]);return this;}
  closePath(){return this;}
}
export class Sprite extends Container { anchor=new Point(); constructor(texture){super();this.texture=texture;} }
export class Text extends Sprite { constructor(opts){super();this.text=opts.text;this.style=opts.style;} }
export class Texture { static WHITE={white:true}; }
`;
const result = await build({ stdin: { contents: `
export * from './services/revamp/feel/FeelPresentation';
export * from './services/revamp/feel/ProjectileReadability';
export * from './services/revamp/feel/CombatSpriteMotion';
export * from './services/revamp/presentation/CompactFormationIntro';
export * from './services/revamp/enemies/CombatCalloutLayout';
export * from './types';
export * from 'pixi.js';
`, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'pixi-transform-model', setup(builder) {
    builder.onResolve({ filter: /^pixi.js$/ }, () => ({ path: 'pixi', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: pixi }));
  } }]
});
const api = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const { FeelPresentation, Container, Sprite, Graphics, EntityType } = api;
const view = () => ({root:new Container(), sprite:new Sprite({art:true}), body:new Graphics(), aura:new Graphics(), trail:new Graphics(), flash:new Graphics(),hasFallbackBody:false});
const entity = (type=EntityType.ENEMY_DRONE) => ({id:'target',type,width:32,height:32,x:0,y:0,vx:0,vy:0,variant:0,formationIndex:0});
const engine = () => ({ width:390,height:844,frameCount:10,performanceMode:false,entities:[], feel:{resetGeneration:0,events:[],comboMultiplier:1}, player:{x:150,y:650,width:80,height:80}, playerVel:{x:0,y:0} });
const contact = () => ({targetId:'target',x:7,y:12,vx:0,vy:-8});
const sink = () => ({spawnMuzzle(){},spawnTieredExplosion(){}});

test('continuous accepted hits cannot keep a target tinted beyond 50 ms', () => {
  const p = new FeelPresentation(sink(),new Container());
  const e=engine(), v=view(), target=entity();
  p.beginFrame(e,0);p.impact(contact());p.entity(v,target);
  assert.equal(v.hitFlash.blendMode,'add');
  assert.equal(v.hitFlash.filters,null);
  assert.ok(v.hitFlash.alpha <= .45);
  for(let tick=0; tick<3; tick++) {p.beginFrame(e,20);p.impact(contact());p.entity(v,target);}
  assert.equal(v.hitFlash.visible,false,'rapid hits do not restart the render-clock flash');
  p.beginFrame(e,70);p.impact(contact());p.entity(v,target);
  assert.equal(v.hitFlash.visible,true,'after a visible recovery interval a new hit can tint again');
  p.destroy();
});

test('boss and mini-boss hits light only the impact point, without whole-hull overlays', () => {
  for(const type of [EntityType.BOSS,EntityType.MINI_BOSS]) {
    const p=new FeelPresentation(sink(),new Container()), v=view(), e=engine();
    const target={...entity(type),width:280,height:220};
    p.beginFrame(e,0);p.impact(contact());p.entity(v,target);
    assert.equal(v.hitFlash,undefined);
    assert.deepEqual(v.flash.commands[0],['rect',1,10,12,4]);
    assert.equal(v.sprite.texture.art,true);
    p.beginFrame(e,60);p.entity(v,target);
    assert.equal(v.flash.commands.length,0);
  }
});

test('family metadata changes presentation without changing the shot or source', () => {
  const shot={width:8,height:16};
  const source={campaignRoleId:'role-sniper'};
  api.markProjectileFamily(shot,source);
  assert.equal(api.getProjectileFamily(shot),'dart');
  assert.deepEqual(shot,{width:8,height:16});
  assert.deepEqual(source,{campaignRoleId:'role-sniper'});
  api.markProjectileFamily(shot,{type:EntityType.ENEMY_JOURNAL});
  assert.equal(api.getProjectileFamily(shot),'diamond');
});

test('solid enemy outline matches both collision axes; halo is cosmetic and separate', () => {
  const v=view(), shot={...entity(EntityType.PROJECTILE),width:8,height:16};
  const before={...shot};
  api.drawReadableProjectile(v,shot,0);
  assert.deepEqual(v.body.commands[0],['ellipse',0,0,4,8]);
  assert.deepEqual(v.aura.commands[0],['ellipse',0,0,6.5,10.5]);
  assert.deepEqual(shot,before);
});

test('chunky primary bolts preserve hull colors and bound their solid width to the hitbox', () => {
  for(const [family,color] of [['research','#67e8f9'],['eth','#b7a5ff'],['bio','#b7ff68'],['btc','#ffbf47']]) {
    const v=view(), shot={...entity(EntityType.PROJECTILE),isPlayerShot:true,width:8,height:20,weaponVisualStartFrame:0,weaponVisualFamily:family};
    api.drawReadableProjectile(v,shot,2);
    const rect=v.body.commands[0];
    assert.ok(rect[3]>=5 && rect[3]<=shot.width);
    assert.equal(v.body.commands[1][1].color,color);
  }
});

test('wings use 76 percent of player visual span and animate without changing simulation', () => {
  const e=engine(), companion={x:110,y:700,width:38,height:38,alpha:1,scale:1,tilt:.05}, before={...companion};
  const pod=new Sprite({});
  api.animateWingBody(pod,companion,e,0,false);
  assert.equal(pod.width,e.player.width*.95*.76);
  assert.notEqual(pod.y,companion.y);
  assert.deepEqual(companion,before);
  api.animateWingBody(pod,companion,e,0,true);
  assert.equal(pod.y,companion.y);
});

test('enemy idle engines and pickup magnet trails animate without touching gameplay', () => {
  const e=engine(), v=view(), enemy={...entity(),formationState:'hold'};
  const before={...enemy};
  api.animateCombatSprite(v,enemy,e,false);
  const first=JSON.stringify(v.aura.commands);
  e.frameCount+=5;api.animateCombatSprite(v,enemy,e,false);
  assert.notEqual(JSON.stringify(v.aura.commands),first);
  assert.deepEqual(enemy,before);
  const coin={...entity(EntityType.COIN),x:140,y:500,vx:0,vy:6};
  api.animateCombatSprite(v,coin,e,false);
  assert.equal(v.trail.commands.filter(c=>c[0]==='rect').length,3);
  api.animateCombatSprite(v,coin,e,true);
  assert.equal(v.trail.commands.length,0);
});


test('chain header stays above the formation and yields to every boss size', () => {
  const overlay = new Container(), p = new FeelPresentation(sink(), overlay), e=engine();
  e.feel.comboMultiplier=8;e.feel.comboRemaining=.5;
  p.beginFrame(e,0);
  const [bar, text]=overlay.children[0].children;
  assert.equal(text.text,'CHAIN x8');
  assert.equal(text.y,74);
  assert.ok(bar.commands[0][2] + bar.commands[0][4] < 90);
  for (const type of [EntityType.BOSS,EntityType.MINI_BOSS]) {
    e.entities=[entity(type)];p.beginFrame(e,16);
    assert.equal(text.text,'');assert.equal(bar.commands.length,0);
  }
});

test('wave introductions leave entry lanes visible and defer to the named boss warning', () => {
  const root=new Container(), counter=new Container(), level=new api.Text({}), name=new api.Text({});
  const aura=new Graphics(), pixels=new Graphics(), sweep=new Graphics();
  name.width=170; counter.addChild(new Sprite({}));
  const presentation=new api.CompactFormationIntro(root,counter,level,name,aura,pixels,sweep);
  const events=[{kind:'spawn',enemies:[{roleId:'role-revamp-linefighter'}]}];
  const e={getCurrentWaveDefinition:()=>({events})};
  assert.equal(presentation.sync(e,500,390),true);
  assert.equal(root.y,74); assert.equal(level.visible,false);
  assert.ok(aura.commands[0][4]<=18); assert.equal(counter.scale.x,.30);
  presentation.sync(e,1400,390); assert.equal(root.visible,false);
  events.push({kind:'boss'});
  assert.equal(presentation.sync(e,500,390),true);
  assert.equal(root.visible,false, 'bosses own their single named header');
  assert.equal(counter.scale.x,1,'boss counters recover their full authored size');
});

test('first-sighting callouts fit the header without changing ordinary floating labels', () => {
  const root=new Container(), label=new api.Text({text:'NEW ENEMY: DIVER'});
  label.width=270; root.position.set(195,220);
  api.fitCombatCallout(root,label,390);
  assert.equal(root.y,74); assert.ok(root.scale.x<=.68);
  assert.ok(root.x-label.width*root.scale.x/2>=16);
  api.fitCombatCallout(root,label,390,43);
  assert.equal(root.y,117, 'first-sighting receipts clear a notched phone header');
  label.text='POWER UP'; root.position.set(195,220);
  api.fitCombatCallout(root,label,390,43);
  assert.equal(root.y,220); assert.equal(root.scale.x,1);
});
