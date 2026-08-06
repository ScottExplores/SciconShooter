import type {
  BossWeaponSocketPoseSampler,
  BossWeaponSocketProfile,
  BossWeaponSocketRole
} from '../../gameplay/bosses/BossWeaponSocketRuntime';
import {
  resolveModularBossRigHierarchy,
  type ModularBossRigRegistration,
  type ModularBossRigPoseOverrides
} from './ModularHierarchyRig';

const resolveSocketRole = (
  id: string,
  role: string
): BossWeaponSocketRole | null => {
  if (role === 'core-origin' || role === 'beam-origin') return 'core';
  if (id.includes('starboard')) return 'starboard';
  if (id.includes('port')) return 'port';
  if (/(?:^|[.-])right(?:$|[.-])/.test(id)) return 'starboard';
  if (/(?:^|[.-])left(?:$|[.-])/.test(id)) return 'port';
  return null;
};

const socketMatchesAction = (
  rigId: string,
  id: string,
  role: BossWeaponSocketRole,
  action: Parameters<BossWeaponSocketPoseSampler>[0]['action']
) => {
  if (!action) return true;
  if (rigId === 'singularity-reach-commander') {
    if (action.primitiveId === 'singularity-gravity-well-genesis') {
      return id === 'gravity-seed-origin' || id === 'singularity-core';
    }
    if (
      action.primitiveId === 'singularity-event-horizon-gaze'
      || action.primitiveId === 'singularity-pulse'
      || action.primitiveId === 'singularity-gravity-collapse'
    ) {
      return id === 'singularity-core';
    }
    if (action.primitiveId === 'singularity-tidal-claw-pincer') {
      return id.startsWith('claw-tip-');
    }
    if (action.primitiveId === 'singularity-orbital-pylon-barrage') {
      return id.startsWith('pylon-muzzle-');
    }
  }
  if (rigId === 'frontier-crownclaw') {
    if (action.primitiveId === 'chainclaw-harpoon') {
      return id.startsWith('claw-socket-')
        || id.startsWith('claw-tip-')
        || id.startsWith('chain-spool-');
    }
    if (action.primitiveId === 'crown-reactor-beam') {
      return id === 'crown-reactor';
    }
    if (action.primitiveId === 'bastion-crabwalk-barrage') {
      return id.startsWith('bastion-port-') || id.startsWith('rear-bastion-');
    }
  }
  if (action.primitiveId === 'reactor-aperture-pattern') return role === 'core';
  if (action.primitiveId === 'prism-wingbeat-weave') {
    return id.startsWith('wing-edge-') || id.startsWith('wing-tip-');
  }
  if (action.primitiveId === 'prism-brood-procession') {
    return id.startsWith('brood-release-') || id === 'prism-core';
  }
  if (action.primitiveId === 'prism-lunar-swoop') {
    return id.startsWith('wing-tip-');
  }
  if (action.primitiveId === 'prism-kaleidoscope-brood') {
    return id.startsWith('brood-release-') || id === 'prism-core';
  }
  if (role === 'core') return true;
  if (action.primitiveId === 'paired-cannon-burst') return id.startsWith('rotary-muzzle-');
  if (
    action.primitiveId === 'articulated-melee-sweep'
    || action.primitiveId === 'tracking-pincer-dive'
  ) {
    return id.startsWith('claw-tip-');
  }
  if (action.motionCue === 'heavy-cannon') return id.startsWith('heavy-muzzle-');
  if (action.motionCue === 'gatling-barrage') return id.startsWith('rotary-muzzle-');
  if (action.primitiveId === 'pod-volley') return id.startsWith('mine-');
  return true;
};

/**
 * Adapts one validated modular hierarchy into simulation-owned normalized
 * muzzle points. Renderer and engine can now sample the same pose without the
 * engine importing Pixi or knowing any boss-specific limb names.
 */
export const createModularBossWeaponSocketPoseSampler = (
  registration: ModularBossRigRegistration,
  samplePose: (input: Parameters<BossWeaponSocketPoseSampler>[0]) => ModularBossRigPoseOverrides
): BossWeaponSocketPoseSampler => (input): BossWeaponSocketProfile => {
  const hierarchy = resolveModularBossRigHierarchy(registration, samplePose(input));
  const width = Math.max(1, registration.manifest.designSize.width);
  const height = Math.max(1, registration.manifest.designSize.height);
  return Object.freeze({
    kind: 'normalized-boss-sockets-v1' as const,
    sockets: Object.freeze(hierarchy.sockets.flatMap((socket) => {
      const role = resolveSocketRole(socket.id, socket.role);
      if (
        !role
        || !socketMatchesAction(registration.manifest.id, socket.id, role, input.action)
      ) return [];
      return [Object.freeze({
        id: socket.id,
        role,
        xRatio: 0.5 + socket.worldX / width,
        yRatio: 0.5 + socket.worldY / height
      })];
    }))
  });
};
