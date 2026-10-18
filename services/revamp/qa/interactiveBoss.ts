import type { GameEngine } from '../../gameLogic';
import { getBossEncounter } from '../bosses/runtime';
import { damageRevampPart } from '../bosses/engineAdapter';
import { getInteractiveMini, damageInteractiveMiniPart } from '../bosses/miniInteractive';

const findBoss = (engine: GameEngine) => engine.entities.find(entity => !entity.markedForDeletion
  && entity.hp > 0 && (getBossEncounter(entity) || getInteractiveMini(entity)));

/** Read-only serialization of actual combat state. No renderer/debug approximation. */
export function readInteractiveBoss(engine: GameEngine) {
  const boss = findBoss(engine);
  if (!boss) return null;
  const major = getBossEncounter(boss);
  const mini = getInteractiveMini(boss);
  if (major?.interactive) return { ...structuredClone(major.interactive),
    id: major.definition.id, entityId: boss.id, status: major.stage, stage: major.stage,
    phase: major.phase, hp: boss.hp, maxHp: boss.maxHp, ageFrames: major.ageFrames,
    attackId: major.attack?.id ?? null, attackKind: major.attack?.kind ?? null,
    remainingFrames: major.remainingFrames, warningFrames: major.plan?.warningFrames ?? 0 };
  if (!mini) return null;
  return { id: boss.sourceItemId, entityId: boss.id, status: mini.stage, stage: mini.stage,
    phase: mini.phase, hp: boss.hp, maxHp: boss.maxHp, ageFrames: mini.ageFrames,
    scale: 'mini', layer: mini.phase, shielded: mini.parts.some(part => !part.broken),
    coreOpen: mini.openAmount, hatchStage: mini.openAmount === 1 ? 'open' : mini.openAmount === 0 ? 'closed' : 'opening',
    transform: mini.phase - 1, parts: mini.parts.map(part => ({ ...part, active: !part.broken,
      damageState: part.broken ? 'destroyed' : part.hp <= part.maxHp * 0.3 ? 'smoking' : part.hp <= part.maxHp * 0.65 ? 'cracked' : 'intact' })),
    arena: { kind: mini.wall ? 'walls' : 'clear' }, escorts: [],
    members: engine.entities.filter(entity => !entity.markedForDeletion && entity.sourceEventId === boss.sourceEventId
      && (entity.type === 'MINI_BOSS' || entity.type === 'ENEMY_INVADER'))
      .map(entity => ({ id: entity.id, role: entity.miniBossLabRole, hp: entity.hp, maxHp: entity.maxHp })) };
}

export interface BossQACommand { type: 'damage-part' | 'damage-hull'; partId?: string; amount?: number; entityId?: string }
/** Called only by the explicit qa=1 lab bridge. Goes through normal gates/rewards. */
export function commandInteractiveBoss(engine: GameEngine, command: BossQACommand) {
  const boss = command.entityId ? engine.entities.find(entity => entity.id === command.entityId && !entity.markedForDeletion)
    : findBoss(engine);
  if (!boss) return { accepted: false, damage: 0 };
  const amount = Math.max(0, Math.min(1e7, Number(command.amount) || 0));
  if (command.type === 'damage-part') {
    const major = getBossEncounter(boss);
    const mini = getInteractiveMini(boss);
    const parts = major?.interactive?.parts ?? mini?.parts;
    const index = parts?.findIndex(part => part.id === command.partId) ?? -1;
    const part = parts?.[index]; const component = boss.bossComponents?.[index];
    if (!part || !component) return { accepted: false, damage: 0 };
    const before = part.hp;
    if (major) damageRevampPart(engine, boss, component, amount);
    else damageInteractiveMiniPart(engine, boss, component, amount);
    return { accepted: part.hp < before, damage: before - part.hp };
  }
  if (command.type !== 'damage-hull') return { accepted: false, damage: 0 };
  const before = boss.hp;
  const parts = getBossEncounter(boss)?.interactive?.parts ?? getInteractiveMini(boss)?.parts ?? [];
  const beforeParts = parts.reduce((sum, part) => sum + part.hp, 0);
  if (boss.type === 'ENEMY_INVADER') boss.hp = Math.max(0, boss.hp - amount);
  else engine.damageBossHull(boss, amount);
  if (boss.hp <= 0) engine.handleEnemyDestroyed(boss);
  const damage = before - boss.hp + beforeParts - parts.reduce((sum, part) => sum + part.hp, 0);
  return { accepted: damage > 0, damage };
}
