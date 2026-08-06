import {
  MINI_BOSS_ENCOUNTER_DEFINITIONS,
  getMiniBossEncounterDefinition
} from './MiniBossEncounterRegistry.ts';
import type {
  MiniBossDefinitionDiagnostic,
  MiniBossEncounterDefinition,
  MiniBossEncounterFrameState,
  MiniBossEncounterId,
  MiniBossSafeRouteProofResult
} from './types.ts';
import { MINI_BOSS_LAB_ENCOUNTER_IDS } from './types.ts';

const error = (code: string, message: string): MiniBossDefinitionDiagnostic => ({
  level: 'error',
  code,
  message
});

const warning = (code: string, message: string): MiniBossDefinitionDiagnostic => ({
  level: 'warning',
  code,
  message
});

const isPositiveFinite = (value: number) => Number.isFinite(value) && value > 0;

const resolveDefinition = (
  definitionOrId: MiniBossEncounterDefinition | MiniBossEncounterId
) => {
  if (typeof definitionOrId !== 'string') return definitionOrId;
  const definition = getMiniBossEncounterDefinition(definitionOrId);
  if (!definition) throw new Error(`Unknown Mini-Boss Lab encounter: ${definitionOrId}`);
  return definition;
};

export const proveMiniBossSafeRoute = (
  definitionOrId: MiniBossEncounterDefinition | MiniBossEncounterId,
  viewportWidth = 390,
  viewportHeight = 844
): MiniBossSafeRouteProofResult => {
  const definition = resolveDefinition(definitionOrId);
  const safeWidth = Math.max(1, Number.isFinite(viewportWidth) ? viewportWidth : 390);
  const safeHeight = Math.max(1, Number.isFinite(viewportHeight) ? viewportHeight : 844);
  const scale = Math.min(
    safeWidth / definition.safeRoute.logicalViewportWidth,
    safeHeight / definition.safeRoute.logicalViewportHeight
  );
  const requiredGapPixels = (
    definition.safeRoute.playerDiameterPixels
    + definition.safeRoute.minimumClearancePixels * 2
  ) * scale;
  const routeGaps = definition.safeRoute.variants.map((variant) => variant.corridorWidthPixels * scale);
  const measuredMinimumGapPixels = Math.min(
    definition.safeRoute.minimumGapPixels * scale,
    ...routeGaps
  );
  const diagnostics: MiniBossDefinitionDiagnostic[] = [];

  if (definition.safeRoute.variants.length === 0) {
    diagnostics.push(error('safe-route.missing-variant', `${definition.displayName} has no safe-route variants.`));
  }
  if (measuredMinimumGapPixels < requiredGapPixels) {
    diagnostics.push(error(
      'safe-route.too-narrow',
      `${definition.displayName} exposes only ${measuredMinimumGapPixels.toFixed(1)} px for a ${requiredGapPixels.toFixed(1)} px requirement.`
    ));
  }

  definition.safeRoute.variants.forEach((variant) => {
    if (variant.waypoints.length < 2) {
      diagnostics.push(error('safe-route.too-few-waypoints', `${variant.id} must contain at least two waypoints.`));
    }
    variant.waypoints.forEach((waypoint, index) => {
      if (
        !Number.isFinite(waypoint.xRatio)
        || !Number.isFinite(waypoint.yRatio)
        || waypoint.xRatio < 0.05
        || waypoint.xRatio > 0.95
        || waypoint.yRatio < 0.05
        || waypoint.yRatio > 0.96
      ) {
        diagnostics.push(error(
          'safe-route.waypoint-outside-arena',
          `${variant.id} waypoint ${index + 1} is outside the bounded mobile playfield.`
        ));
      }
    });
  });

  if (definition.safeRoute.kind === 'safe-quadrant') {
    const quadrantWidth = safeWidth * 0.39;
    const quadrantHeight = safeHeight * 0.38;
    if (Math.min(quadrantWidth, quadrantHeight) < requiredGapPixels) {
      diagnostics.push(error(
        'safe-route.quadrant-too-small',
        `${definition.displayName} does not preserve a full player-sized quadrant.`
      ));
    }
    if (definition.safeRoute.variants.length < 4) {
      diagnostics.push(error(
        'safe-route.quadrant-coverage',
        `${definition.displayName} must prove all four deterministic safe quadrants.`
      ));
    }
  }

  return Object.freeze({
    encounterId: definition.id,
    viewportWidth: safeWidth,
    viewportHeight: safeHeight,
    requiredGapPixels,
    measuredMinimumGapPixels,
    passed: diagnostics.every((diagnostic) => diagnostic.level !== 'error'),
    diagnostics: Object.freeze(diagnostics)
  });
};

export const validateMiniBossEncounterDefinition = (
  definitionOrId: MiniBossEncounterDefinition | MiniBossEncounterId
): readonly MiniBossDefinitionDiagnostic[] => {
  const definition = resolveDefinition(definitionOrId);
  const diagnostics: MiniBossDefinitionDiagnostic[] = [];
  const expectedEventId = `sandbox-mini-boss-lab:${definition.id}:v1`;
  if (definition.eventId !== expectedEventId) {
    diagnostics.push(error('identity.event-id', `${definition.displayName} must use event ID ${expectedEventId}.`));
  }
  if (!definition.sandboxReady) {
    diagnostics.push(error('scope.sandbox-preview', `${definition.displayName} must remain available for isolated Sandbox previews.`));
  }
  if (!definition.campaignAssigned) {
    diagnostics.push(error('scope.campaign-assignment', `${definition.displayName} must remain assigned to the Campaign mini-boss roster.`));
  }
  if (definition.expectedDurationSeconds < 15 || definition.expectedDurationSeconds > 35) {
    diagnostics.push(error('duration.out-of-range', `${definition.displayName} must last between 15 and 35 seconds.`));
  }
  if (!isPositiveFinite(definition.entranceSeconds) || definition.entranceSeconds >= 4) {
    diagnostics.push(error('entrance.invalid', `${definition.displayName} needs a short, positive entrance.`));
  }
  if (definition.categories.length === 0 || !definition.categories.includes(definition.primaryCategory)) {
    diagnostics.push(error('category.primary-missing', `${definition.displayName} must include its primary category.`));
  }
  if (definition.signature.id === definition.support.id || definition.signature.name === definition.support.name) {
    diagnostics.push(error('attacks.not-distinct', `${definition.displayName} requires one distinct signature and one distinct supporting behavior.`));
  }

  const attacks = [definition.signature, definition.support];
  attacks.forEach((attackDefinition) => {
    if (
      !isPositiveFinite(attackDefinition.telegraphSeconds)
      || !isPositiveFinite(attackDefinition.activeSeconds)
      || !isPositiveFinite(attackDefinition.recoverySeconds)
    ) {
      diagnostics.push(error('attack.invalid-window', `${attackDefinition.name} must have warning, action, and recovery windows.`));
    }
    if (attackDefinition.maximumProjectilesPerEmission > definition.budgets.maximumProjectiles) {
      diagnostics.push(error('budget.projectile-emission', `${attackDefinition.name} exceeds the encounter projectile budget.`));
    }
    if (attackDefinition.emissionIntervalFrames < 1) {
      diagnostics.push(error('attack.invalid-cadence', `${attackDefinition.name} needs a positive frame cadence.`));
    }
  });

  const assetIds = new Set<string>();
  definition.assets.forEach((binding) => {
    if (assetIds.has(binding.id)) {
      diagnostics.push(error('asset.duplicate-id', `${definition.displayName} repeats asset ID ${binding.id}.`));
    }
    assetIds.add(binding.id);
    const approvedExisting = binding.status === 'approved-existing'
      && binding.provenance === 'existing-runtime-art';
    const approvedGenerated = binding.status === 'approved-generated'
      && binding.provenance === 'generated-mini-boss-lab-v2';
    if (!approvedExisting && !approvedGenerated) {
      diagnostics.push(error('asset.unapproved', `${binding.id} is not an approved runtime asset.`));
    }
    const paths = [...(binding.frames ?? []), ...(binding.url ? [binding.url] : [])];
    if (paths.length === 0 || paths.some((path) => !path.startsWith('/game-art/'))) {
      diagnostics.push(error('asset.invalid-path', `${binding.id} must use a role-bound /game-art/ path.`));
    }
    if (
      (binding.widthPixels !== undefined || binding.heightPixels !== undefined)
      && (!isPositiveFinite(binding.widthPixels ?? 0) || !isPositiveFinite(binding.heightPixels ?? 0))
    ) {
      diagnostics.push(error('asset.invalid-gameplay-size', `${binding.id} needs positive gameplay width and height.`));
    }
  });

  let initialEntityCount = 0;
  let guardianCount = 0;
  definition.memberArchetypes.forEach((archetype) => {
    initialEntityCount += archetype.count;
    guardianCount += archetype.roles.filter((role) => role === 'guardian' || role === 'escort' || role === 'satellite').length;
    if (archetype.count < 1 || archetype.roles.length !== archetype.count) {
      diagnostics.push(error('member.role-count', `${archetype.label} must declare one role for every member.`));
    }
    if (!isPositiveFinite(archetype.maxHealth) || !isPositiveFinite(archetype.collisionRadiusPixels)) {
      diagnostics.push(error('member.invalid-body', `${archetype.label} needs positive health and collision geometry.`));
    }
    if (!assetIds.has(archetype.assetId)) {
      diagnostics.push(error('member.asset-missing', `${archetype.label} references missing asset ${archetype.assetId}.`));
    }
  });

  const maximumSimultaneousEntities = initialEntityCount + definition.budgets.maximumReinforcements;
  if (maximumSimultaneousEntities > definition.budgets.maximumHostileEntities) {
    diagnostics.push(error(
      'budget.hostile-entities',
      `${definition.displayName} can create ${maximumSimultaneousEntities} hostiles against a ${definition.budgets.maximumHostileEntities} budget.`
    ));
  }
  if (guardianCount > definition.budgets.maximumGuardians && definition.budgets.maximumGuardians > 0) {
    diagnostics.push(error('budget.guardians', `${definition.displayName} exceeds its guardian budget.`));
  }
  if (definition.budgets.maximumHostileEntities < 1 || definition.budgets.maximumProjectiles < 1) {
    diagnostics.push(error('budget.invalid', `${definition.displayName} requires positive hostile and projectile budgets.`));
  }

  if (!assetIds.has(definition.signature.projectileAssetId ?? '')) {
    diagnostics.push(error('signature.projectile-asset', `${definition.signature.name} references an unknown projectile asset.`));
  }
  if (!assetIds.has(definition.support.projectileAssetId ?? '')) {
    diagnostics.push(error('support.projectile-asset', `${definition.support.name} references an unknown projectile asset.`));
  }

  const safetyProof = proveMiniBossSafeRoute(definition);
  diagnostics.push(...safetyProof.diagnostics);
  if (definition.safeRoute.minimumGapPixels > 150) {
    diagnostics.push(warning('safe-route.low-pressure', `${definition.displayName} uses a very generous safe corridor.`));
  }
  return Object.freeze(diagnostics);
};

export const validateMiniBossEncounterFrame = (
  definitionOrId: MiniBossEncounterDefinition | MiniBossEncounterId,
  frameState: MiniBossEncounterFrameState
): readonly MiniBossDefinitionDiagnostic[] => {
  const definition = resolveDefinition(definitionOrId);
  const diagnostics: MiniBossDefinitionDiagnostic[] = [];
  const emittedProjectiles = frameState.hazards
    .filter((hazard) => hazard.emitNow && !hazard.warning)
    .reduce((total, hazard) => total + hazard.projectileCount, 0);
  const activeBeams = frameState.hazards.filter((hazard) => (
    hazard.kind === 'beam'
    || hazard.kind === 'rail-sweep'
    || hazard.kind === 'grid-boundary'
  )).length;
  const requestedReinforcements = frameState.reinforcements.reduce((total, request) => total + request.count, 0);

  if (emittedProjectiles > definition.budgets.maximumProjectiles) {
    diagnostics.push(error('frame.projectile-budget', `Frame emits ${emittedProjectiles} projectiles against a ${definition.budgets.maximumProjectiles} budget.`));
  }
  if (activeBeams > definition.budgets.maximumBeams) {
    diagnostics.push(error('frame.beam-budget', `Frame activates ${activeBeams} beams against a ${definition.budgets.maximumBeams} budget.`));
  }
  if (requestedReinforcements > definition.budgets.maximumReinforcements) {
    diagnostics.push(error('frame.reinforcement-budget', `Frame requests ${requestedReinforcements} reinforcements against a ${definition.budgets.maximumReinforcements} budget.`));
  }
  if (
    frameState.hazards.some((hazard) => hazard.ownerEventId !== definition.eventId)
    || frameState.reinforcements.some((request) => request.ownerEventId !== definition.eventId)
  ) {
    diagnostics.push(error('frame.owner-mismatch', 'Every spawned hazard and reinforcement must be owned by the encounter event.'));
  }
  if (
    frameState.cleanup.requested
    && (frameState.hazards.length > 0 || frameState.reinforcements.length > 0)
  ) {
    diagnostics.push(error('cleanup.spawn-after-request', 'Cleanup frames cannot create new hazards or reinforcements.'));
  }
  if (!frameState.cleanup.preserveUnrelatedEntities) {
    diagnostics.push(error('cleanup.scope', 'Cleanup must preserve unrelated simulation entities.'));
  }
  return Object.freeze(diagnostics);
};

export const validateMiniBossEncounterRegistry = (): readonly MiniBossDefinitionDiagnostic[] => {
  const diagnostics: MiniBossDefinitionDiagnostic[] = [];
  const ids = new Set<string>();
  const eventIds = new Set<string>();
  MINI_BOSS_ENCOUNTER_DEFINITIONS.forEach((definition) => {
    if (ids.has(definition.id)) diagnostics.push(error('registry.duplicate-id', `Duplicate encounter ID ${definition.id}.`));
    if (eventIds.has(definition.eventId)) diagnostics.push(error('registry.duplicate-event-id', `Duplicate event ID ${definition.eventId}.`));
    ids.add(definition.id);
    eventIds.add(definition.eventId);
    diagnostics.push(...validateMiniBossEncounterDefinition(definition));
  });
  MINI_BOSS_LAB_ENCOUNTER_IDS.forEach((id) => {
    if (!ids.has(id)) diagnostics.push(error('registry.missing-definition', `Missing definition for ${id}.`));
  });
  if (MINI_BOSS_ENCOUNTER_DEFINITIONS.length !== MINI_BOSS_LAB_ENCOUNTER_IDS.length) {
    diagnostics.push(error('registry.unexpected-size', 'The Mini-Boss Lab registry must contain exactly eight encounters.'));
  }
  return Object.freeze(diagnostics);
};
