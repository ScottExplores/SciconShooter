import type { Entity, GameEngine } from '../../gameLogic';
import { EntityType } from '../../../types';
import type { BossEncounterState } from './runtime';

interface EscortFlight { owner: Entity; state: BossEncounterState; age: number; side: -1 | 1; x: number; y: number }
const flights = new WeakMap<Entity, EscortFlight>();
export const isInteractiveBossEscort = (entity: Entity): boolean => flights.has(entity);
/** Generic ram damage treats zero as its default; the collision admission must use this gate. */
export const interactiveEscortCanDamage = (entity: Entity): boolean => {
  const flight = flights.get(entity);
  if (!flight) return true;
  return flight.age >= INTERACTIVE_ESCORT_DEPLOY_FRAMES && flight.age <= INTERACTIVE_ESCORT_LIFETIME * 0.8
    && flight.state.stage === 'fire' && flight.state.interactive?.attackMode === 'summon'
    && !entity.markedForDeletion && entity.hp > 0 && !flight.owner.markedForDeletion && flight.owner.hp > 0;
};
export const INTERACTIVE_ESCORT_LIFETIME = 180;
export const INTERACTIVE_ESCORT_DEPLOY_FRAMES = 42;
/** Visible hangar spawn; two shootable scouts, with no independent off-pattern bullets. */
export const summonInteractiveBossEscorts = (engine: GameEngine, owner: Entity, state: BossEncounterState): void => {
  const anatomy = state.interactive;
  if (!anatomy || anatomy.escorts.length || typeof engine.createEnemy !== 'function') return;
  for (const side of [-1, 1] as const) {
    const x = anatomy.hangarX + side * 12;
    const y = anatomy.hangarY;
    const escort = engine.createEnemy(EntityType.ENEMY_DRONE, x - 14, y - 14);
    escort.width = escort.height = 28;
    escort.hp = escort.maxHp = Math.max(2, Math.min(12, owner.maxHp * 0.025));
    escort.bossOwnerId = owner.id;
    escort.contactDamage = 0;
    escort.vx = escort.vy = 0;
    escort.powerupDropChance = 0;
    escort.scoreReward = 0;
    escort.sourceItemId = `${state.definition.id}:escort`;
    escort.sourceEventId = owner.sourceEventId;
    flights.set(escort, { owner, state, age: 0, side, x, y });
    anatomy.escorts.push({ id: escort.id, x, y, stage: 'deploy' });
  }
};

/** Called before the generic enemy driver: bounded movement/contact are the only threats. */
export const updateInteractiveBossEscort = (engine: GameEngine, entity: Entity): boolean => {
  const flight = flights.get(entity);
  if (!flight) return false;
  const anatomy = flight.state.interactive!;
  const retire = () => {
    entity.markedForDeletion = true;
    anatomy.escorts = anatomy.escorts.filter(escort => escort.id !== entity.id);
  };
  if (entity.markedForDeletion || entity.hp <= 0 || flight.owner.markedForDeletion || flight.owner.hp <= 0
    || flight.state.stage !== 'fire' || anatomy.attackMode !== 'summon' || ++flight.age >= INTERACTIVE_ESCORT_LIFETIME) {
    retire(); return true;
  }
  const age = flight.age;
  const deploy = age < INTERACTIVE_ESCORT_DEPLOY_FRAMES;
  const progress = Math.min(1, age / INTERACTIVE_ESCORT_LIFETIME);
  const centerX = flight.x + flight.side * progress * (engine.width * 0.62);
  // Scouts leave through the upper sidewalls; the lower combat-space proof remains clear.
  const centerY = Math.min(382, flight.y + Math.sin(progress * Math.PI) * 90);
  entity.x = centerX - entity.width / 2;
  entity.y = centerY - entity.height / 2;
  entity.contactDamage = interactiveEscortCanDamage(entity) ? 1 : 0;
  entity.spriteStyle = { ...entity.spriteStyle, opacity: deploy ? 0.55 + age / INTERACTIVE_ESCORT_DEPLOY_FRAMES * 0.45 : 1 };
  const marker = anatomy.escorts.find(escort => escort.id === entity.id);
  if (marker) { marker.x = centerX; marker.y = centerY; marker.stage = deploy ? 'deploy' : progress > 0.8 ? 'exit' : 'active'; }
  return true;
};
