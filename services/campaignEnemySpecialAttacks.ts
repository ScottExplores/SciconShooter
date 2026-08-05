import type { EnemyRoleDefinition } from '../game-config/types';

export type CampaignEnemySpecialAttack = NonNullable<EnemyRoleDefinition['specialAttack']>;

const LEGACY_SPECIAL_ATTACK_BY_ARCHETYPE: Readonly<Record<string, CampaignEnemySpecialAttack>> = Object.freeze({
  'bullet-ring-emitter': 'ring-burst',
  'crescent-minelayer': 'mine-fan',
  'dna-conductor': 'ring-burst',
  'laser-hunter': 'lane-laser',
  'laser-stalker': 'lane-laser',
  'ring-sentinel': 'ring-burst',
  'wall-sniper-left': 'lane-laser',
  'wall-sniper-right': 'lane-laser'
});

/**
 * Authored role metadata is authoritative. The archetype lookup remains only
 * so tracked legacy Campaign roles retain their established specialist moves
 * until their data is migrated.
 */
export const resolveCampaignEnemySpecialAttack = (
  authoredSpecialAttack: EnemyRoleDefinition['specialAttack'],
  legacyArchetype: string
): CampaignEnemySpecialAttack | undefined => (
  authoredSpecialAttack ?? LEGACY_SPECIAL_ATTACK_BY_ARCHETYPE[legacyArchetype]
);
