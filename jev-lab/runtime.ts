import { GameEngine, type Entity } from '../services/gameLogic';
import { DEFAULT_GAME_CAMPAIGN } from '../services/levelConfig';
import { createSeededGameplayRandom } from '../services/gameplay/random';
import { EntityType, PowerupType, type Stats } from '../types';

export const VIEWPORT = { width: 390, height: 844 };
export const LEVEL = DEFAULT_GAME_CAMPAIGN.levels.find(level => level.id === 'operation-open-galaxy')!;
export type Action = { movement: string; special: string };
export const idle: Action = { movement: 'idle', special: 'none' };
export function createTrialEngine(seed: number) {
  const stats: Stats = {
    score: 0, highScore: 0, wave: 1, coins: 0, totalCoins: 0, enemiesDefeated: 0,
    bombs: 0, bombCharge: 0, bombChargeMax: 100, lives: 3, repairsCount: 0,
    shipAbilityCooldown: 0, shipAbilityCooldownMax: 960,
    upgrades: { fireRate: 0, speed: 0, ability: 0 },
    powerupUses: Object.fromEntries(Object.values(PowerupType).map(type => [type, 0])) as Stats['powerupUses'],
    bossProgress: 0, isBossActive: false, bossHp: 0, bossMaxHp: 100
  };
  const engine = new GameEngine(stats, {
    campaign: DEFAULT_GAME_CAMPAIGN, initialLevelId: LEVEL.id,
    playerShipId: 'researchhub', randomSeed: seed, previewMode: false, previewInvincible: false,
    audioEnabled: false, preloadCanvasAssets: false, refillLivesAtMissionBoundary: false,
    runtimeHooks: {
      presentationRandom: createSeededGameplayRandom(`${seed}:presentation`).next,
      loadCanvasImage: () => ({ complete: false, naturalWidth: 0, naturalHeight: 0 }) as HTMLImageElement,
      emitDomainEvent: () => {}, fixedPerformanceMode: false, stableEntityIds: true,
      playerInvulnerable: false, disablePickups: false
    }
  });
  engine.init(VIEWPORT.width, VIEWPORT.height);
  return engine;
}
const round = (value: number) => Math.round(value * 10) / 10;
function entityState(entity: Entity) {
  return {
    type: entity.type, x: round(entity.x), y: round(entity.y), width: round(entity.width), height: round(entity.height),
    vx: round(entity.vx || 0), vy: round(entity.vy || 0), hp: round(entity.hp || 0),
    beam: Boolean(entity.isBeam), beamAngleRadians: entity.beamAngleRadians ?? null,
    pickup: entity.type === EntityType.POWERUP ? entity.text : undefined
  };
}
export function observe(engine: GameEngine, tick: number) {
  const visible = engine.entities.filter(entity => !entity.markedForDeletion && !entity.isPlayerShot
    && entity.type !== EntityType.PARTICLE && entity.type !== EntityType.EFFECT
    && entity.x + entity.width >= 0 && entity.x <= engine.width
    && entity.y + entity.height >= 0 && entity.y <= engine.height);
  const distance = (entity: Entity) => Math.hypot(entity.x - engine.player.x, entity.y - engine.player.y);
  const pickups = visible.filter(entity => [EntityType.POWERUP, EntityType.COIN, EntityType.SUPPLY_DROP].includes(entity.type));
  const threats = visible.filter(entity => !pickups.includes(entity)).sort((a, b) => distance(a) - distance(b));
  return {
    game: 'Scicon Shooter', observation: 'structured visible entities; no images or future spawns',
    coordinates: 'pixels; origin top-left; velocities pixels per 60Hz tick; player fires upward automatically',
    viewport: VIEWPORT, seconds: round(tick / 60), score: engine.stats.score, lives: engine.lives,
    wave: engine.wave, player: { ...entityState(engine.player), vx: round(engine.playerVel.x), vy: round(engine.playerVel.y), invincibleFrames: engine.invincibleTimer },
    bombs: engine.stats.bombs, abilityCooldownFrames: engine.stats.shipAbilityCooldown,
    enemiesDefeated: engine.stats.enemiesDefeated,
    threats: threats.slice(0, 40).map(entityState), omittedThreats: Math.max(0, threats.length - 40),
    pickups: pickups.slice(0, 10).map(entityState), activePowerups: Object.fromEntries(engine.activePowerups)
  };
}
export function applyMovement(engine: GameEngine, action: Action) {
  engine.handleInput({
    ArrowUp: action.movement.includes('N'), ArrowDown: action.movement.includes('S'),
    ArrowLeft: action.movement.includes('W'), ArrowRight: action.movement.includes('E'), ' ': true
  }, null);
}
export function applySpecial(engine: GameEngine, action: Action) {
  return action.special === 'bomb' ? engine.triggerBomb() : action.special === 'ability' ? engine.triggerShipAbility() : false;
}
// Deliberately simple connection check. This is never presented as Jev or learning.
export function baselineAction(engine: GameEngine): Action {
  const enemies = engine.entities.filter(entity => engine.isEnemyTarget(entity) && !entity.markedForDeletion && entity.y >= 0);
  const target = enemies.sort((a, b) => b.y - a.y)[0];
  const desiredX = target ? target.x + target.width / 2 : engine.width / 2;
  const dx = desiredX - (engine.player.x + engine.player.width / 2);
  const threat = engine.entities.find(entity => !entity.isPlayerShot && entity.type === EntityType.PROJECTILE
    && entity.y > engine.player.y - 140 && entity.y < engine.player.y + 50 && Math.abs(entity.x - engine.player.x) < 55);
  const horizontal = threat ? (engine.player.x > engine.width / 2 ? 'W' : 'E') : Math.abs(dx) > 18 ? (dx > 0 ? 'E' : 'W') : '';
  const vertical = engine.player.y < engine.height * 0.72 ? 'S' : engine.player.y > engine.height * 0.84 ? 'N' : '';
  return { movement: vertical + horizontal || 'idle', special: 'none' };
}
