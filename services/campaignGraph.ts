import type {
  CampaignGraphDefinition,
  CampaignGraphNodeDefinition,
  CampaignRouteEdgeDefinition,
  GameCampaignConfig,
  LevelDefinition
} from '../game-config/types';

export type CampaignTraversalClassification =
  | 'same'
  | 'forward'
  | 'backward'
  | 'disconnected';

export type CampaignRouteSelectionFailureReason =
  | 'unknown-source'
  | 'unknown-target'
  | 'not-outgoing'
  | 'prerequisites-not-met';

export interface CampaignGraphIndex {
  definition: CampaignGraphDefinition;
  nodeById: ReadonlyMap<string, CampaignGraphNodeDefinition>;
  edgeById: ReadonlyMap<string, CampaignRouteEdgeDefinition>;
  edgesBySourceNodeId: ReadonlyMap<string, readonly CampaignRouteEdgeDefinition[]>;
  incomingSourceNodeIdsByTargetNodeId: ReadonlyMap<string, readonly string[]>;
  nodeIdsByMissionDefinitionId: ReadonlyMap<string, readonly string[]>;
}

export type CampaignRouteSelectionValidation =
  | {
    valid: true;
    reason: null;
    sourceNode: CampaignGraphNodeDefinition;
    targetNode: CampaignGraphNodeDefinition;
    edge: CampaignRouteEdgeDefinition;
  }
  | {
    valid: false;
    reason: CampaignRouteSelectionFailureReason;
    sourceNode: CampaignGraphNodeDefinition | null;
    targetNode: CampaignGraphNodeDefinition | null;
    edge: CampaignRouteEdgeDefinition | null;
  };

export interface CampaignNextNodeOptions {
  /** A player-selected direct exit. Omit this when no selection was made. */
  selectedTargetNodeId?: string | null;
  /** Previously completed nodes. The current node is added for this decision. */
  completedNodeIds?: Iterable<string>;
}

export type CampaignNextNodeDecision =
  | {
    kind: 'advance';
    currentNode: CampaignGraphNodeDefinition;
    nextNode: CampaignGraphNodeDefinition;
    edge: CampaignRouteEdgeDefinition;
    reason: 'selected' | 'only-valid-target';
  }
  | {
    kind: 'choice-required';
    currentNode: CampaignGraphNodeDefinition;
    options: readonly CampaignGraphNodeDefinition[];
    edges: readonly CampaignRouteEdgeDefinition[];
  }
  | {
    kind: 'terminal';
    currentNode: CampaignGraphNodeDefinition;
  }
  | {
    kind: 'blocked';
    currentNode: CampaignGraphNodeDefinition;
    blockedTargetNodeIds: readonly string[];
  }
  | {
    kind: 'invalid-selection';
    currentNode: CampaignGraphNodeDefinition | null;
    selectedTargetNodeId: string;
    validation: CampaignRouteSelectionValidation;
  };

type CampaignGraphSource = Pick<GameCampaignConfig, 'levels' | 'campaignGraph'> &
  Partial<Pick<GameCampaignConfig, 'sectors'>>;

const compareLevels = (left: LevelDefinition, right: LevelDefinition) => (
  left.order - right.order || left.id.localeCompare(right.id)
);

const getFallbackMapPosition = (index: number, count: number) => ({
  x: 0.5,
  y: count <= 1 ? 0.5 : 1 - (index / (count - 1))
});

const getFallbackSectorId = (
  campaign: CampaignGraphSource,
  missionId: string,
  missionIndex: number
) => (
  campaign.sectors?.find((sector) => sector.missionIds.includes(missionId))?.id
  ?? `legacy-sector-${Math.floor(missionIndex / 5) + 1}`
);

/**
 * Builds the deterministic compatibility route used by legacy Campaign data.
 * Mission array order is not trusted: authored `order`, then ID, defines the
 * fallback route. New Campaign packages should author `campaignGraph` instead.
 */
export const buildLinearCampaignGraph = (
  campaign: CampaignGraphSource
): CampaignGraphDefinition => {
  const levels = [...campaign.levels].sort(compareLevels);
  const positions = levels.map((level, index) => (
    level.campaignProgression?.mapPosition ?? getFallbackMapPosition(index, levels.length)
  ));

  const nodes = levels.map<CampaignGraphNodeDefinition>((level, index) => {
    const previousLevel = levels[index - 1] ?? null;
    const nextLevel = levels[index + 1] ?? null;
    const mapPosition = positions[index];
    const nextMapPosition = positions[index + 1] ?? mapPosition;
    const progression = level.campaignProgression;
    const edge = nextLevel
      ? [{
        edgeId: `legacy-edge:${level.id}->${nextLevel.id}`,
        toNodeId: nextLevel.id,
        routeId: 'legacy-main',
        label: `Continue to ${nextLevel.name}`,
        kind: 'progression' as const,
        risk: 'low' as const,
        weeklyScoreMultiplier: 1
      }]
      : [];

    return {
      nodeId: level.id,
      sectorId: progression?.sectorId ?? getFallbackSectorId(campaign, level.id, index),
      depth: index + 1,
      routeId: 'legacy-main',
      displayLabel: String(index + 1).padStart(2, '0'),
      missionDefinitionId: level.id,
      prerequisiteNodeIds: previousLevel ? [previousLevel.id] : [],
      prerequisiteMode: 'all',
      outgoingEdges: edge,
      rejoinNodeId: null,
      optional: false,
      mainPath: true,
      masteryBranch: false,
      oneTime: false,
      bossId: null,
      miniBossIds: [],
      weeklyStreakEligible: true,
      weeklyScoreMultiplier: 1,
      recommendedPower: progression?.recommendedPower ?? {
        minimum: 0,
        expected: 0,
        comfortable: 0
      },
      rewardProfile: 'standard',
      mapPosition: { ...mapPosition },
      routeControlPoints: [{ ...mapPosition }, { ...nextMapPosition }],
      routeSummary: {
        combatIntensity: 'low',
        miniBossPresence: 'none',
        rewardType: 'standard',
        recommendedSupportTags: [...(progression?.recommendedSupportTags ?? [])],
        estimatedWaveCount: level.waves.length
      }
    };
  });

  return {
    entryNodeId: nodes[0]?.nodeId ?? '',
    nodes
  };
};

/** Resolves authored graph data, retaining a linear fallback for legacy tests. */
export const resolveCampaignGraph = (
  campaign: CampaignGraphSource
): CampaignGraphDefinition => campaign.campaignGraph ?? buildLinearCampaignGraph(campaign);

/**
 * Creates immutable-by-contract lookup tables and rejects ambiguous graph data.
 * Structural validation remains owned by game-config/validate.ts; these checks
 * prevent runtime callers from silently traversing duplicate or dangling IDs.
 */
export const indexCampaignGraph = (
  definition: CampaignGraphDefinition
): CampaignGraphIndex => {
  const nodeById = new Map<string, CampaignGraphNodeDefinition>();
  const edgeById = new Map<string, CampaignRouteEdgeDefinition>();
  const edgesBySourceNodeId = new Map<string, readonly CampaignRouteEdgeDefinition[]>();
  const incomingMutable = new Map<string, string[]>();
  const missionMutable = new Map<string, string[]>();

  definition.nodes.forEach((node) => {
    if (nodeById.has(node.nodeId)) {
      throw new Error(`Campaign graph contains duplicate node ID: ${node.nodeId}`);
    }
    nodeById.set(node.nodeId, node);
    edgesBySourceNodeId.set(node.nodeId, node.outgoingEdges);
    const missionNodes = missionMutable.get(node.missionDefinitionId) ?? [];
    missionNodes.push(node.nodeId);
    missionMutable.set(node.missionDefinitionId, missionNodes);
  });

  if (definition.nodes.length > 0 && !nodeById.has(definition.entryNodeId)) {
    throw new Error(`Campaign graph entry node does not exist: ${definition.entryNodeId}`);
  }

  definition.nodes.forEach((node) => {
    node.prerequisiteNodeIds.forEach((prerequisiteNodeId) => {
      if (!nodeById.has(prerequisiteNodeId)) {
        throw new Error(
          `Campaign graph node ${node.nodeId} has unknown prerequisite: ${prerequisiteNodeId}`
        );
      }
    });

    node.outgoingEdges.forEach((edge) => {
      if (edgeById.has(edge.edgeId)) {
        throw new Error(`Campaign graph contains duplicate edge ID: ${edge.edgeId}`);
      }
      if (!nodeById.has(edge.toNodeId)) {
        throw new Error(
          `Campaign graph edge ${edge.edgeId} has unknown target: ${edge.toNodeId}`
        );
      }
      edgeById.set(edge.edgeId, edge);
      const incoming = incomingMutable.get(edge.toNodeId) ?? [];
      if (!incoming.includes(node.nodeId)) incoming.push(node.nodeId);
      incomingMutable.set(edge.toNodeId, incoming);
    });

    if (node.rejoinNodeId !== null && !nodeById.has(node.rejoinNodeId)) {
      throw new Error(
        `Campaign graph node ${node.nodeId} has unknown rejoin node: ${node.rejoinNodeId}`
      );
    }
  });

  const incomingSourceNodeIdsByTargetNodeId = new Map<string, readonly string[]>();
  nodeById.forEach((_node, nodeId) => {
    incomingSourceNodeIdsByTargetNodeId.set(nodeId, incomingMutable.get(nodeId) ?? []);
  });
  const nodeIdsByMissionDefinitionId = new Map<string, readonly string[]>();
  missionMutable.forEach((nodeIds, missionId) => {
    nodeIdsByMissionDefinitionId.set(missionId, nodeIds);
  });

  return {
    definition,
    nodeById,
    edgeById,
    edgesBySourceNodeId,
    incomingSourceNodeIdsByTargetNodeId,
    nodeIdsByMissionDefinitionId
  };
};

export const createCampaignGraphIndex = (campaign: CampaignGraphSource): CampaignGraphIndex => (
  indexCampaignGraph(resolveCampaignGraph(campaign))
);

export const getCampaignGraphNode = (
  graph: CampaignGraphIndex,
  nodeId: string
): CampaignGraphNodeDefinition | undefined => graph.nodeById.get(nodeId);

export const getCampaignGraphEdge = (
  graph: CampaignGraphIndex,
  sourceNodeId: string,
  targetNodeId: string
): CampaignRouteEdgeDefinition | undefined => (
  graph.edgesBySourceNodeId.get(sourceNodeId)?.find((edge) => edge.toNodeId === targetNodeId)
);

export const getCampaignGraphEdgeById = (
  graph: CampaignGraphIndex,
  edgeId: string
): CampaignRouteEdgeDefinition | undefined => graph.edgeById.get(edgeId);

export const getCampaignOutgoingEdges = (
  graph: CampaignGraphIndex,
  nodeId: string
): readonly CampaignRouteEdgeDefinition[] => graph.edgesBySourceNodeId.get(nodeId) ?? [];

export const getCampaignOutgoingTargetIds = (
  graph: CampaignGraphIndex,
  nodeId: string
): readonly string[] => getCampaignOutgoingEdges(graph, nodeId).map((edge) => edge.toNodeId);

export const getCampaignIncomingSourceNodeIds = (
  graph: CampaignGraphIndex,
  nodeId: string
): readonly string[] => graph.incomingSourceNodeIdsByTargetNodeId.get(nodeId) ?? [];

export const getCampaignGraphNodesForMission = (
  graph: CampaignGraphIndex,
  missionDefinitionId: string
): readonly CampaignGraphNodeDefinition[] => (
  (graph.nodeIdsByMissionDefinitionId.get(missionDefinitionId) ?? [])
    .map((nodeId) => graph.nodeById.get(nodeId))
    .filter((node): node is CampaignGraphNodeDefinition => node !== undefined)
);

export const getCampaignRejoinNode = (
  graph: CampaignGraphIndex,
  nodeId: string
): CampaignGraphNodeDefinition | null => {
  const node = graph.nodeById.get(nodeId);
  if (!node) return null;
  const explicitRejoinId = node.rejoinNodeId
    ?? node.outgoingEdges.find((edge) => edge.kind === 'rejoin')?.toNodeId
    ?? null;
  return explicitRejoinId ? graph.nodeById.get(explicitRejoinId) ?? null : null;
};

export const getCampaignReachableNodeIds = (
  graph: CampaignGraphIndex,
  sourceNodeId: string,
  options: { includeSource?: boolean } = {}
): readonly string[] => {
  if (!graph.nodeById.has(sourceNodeId)) return [];
  const visited = new Set<string>();
  const queued = new Set<string>([sourceNodeId]);
  const queue = [sourceNodeId];
  const reachable: string[] = [];

  while (queue.length > 0) {
    const currentNodeId = queue.shift();
    if (currentNodeId === undefined || visited.has(currentNodeId)) continue;
    visited.add(currentNodeId);
    if (currentNodeId !== sourceNodeId || options.includeSource) reachable.push(currentNodeId);

    getCampaignOutgoingEdges(graph, currentNodeId).forEach((edge) => {
      if (!visited.has(edge.toNodeId) && !queued.has(edge.toNodeId)) {
        queued.add(edge.toNodeId);
        queue.push(edge.toNodeId);
      }
    });
  }

  return reachable;
};

export const isCampaignNodeReachable = (
  graph: CampaignGraphIndex,
  sourceNodeId: string,
  targetNodeId: string
): boolean => {
  if (!graph.nodeById.has(sourceNodeId) || !graph.nodeById.has(targetNodeId)) return false;
  if (sourceNodeId === targetNodeId) return true;
  return getCampaignReachableNodeIds(graph, sourceNodeId).includes(targetNodeId);
};

export const classifyCampaignTraversal = (
  graph: CampaignGraphIndex,
  sourceNodeId: string,
  targetNodeId: string
): CampaignTraversalClassification => {
  if (!graph.nodeById.has(sourceNodeId) || !graph.nodeById.has(targetNodeId)) {
    return 'disconnected';
  }
  if (sourceNodeId === targetNodeId) return 'same';
  if (isCampaignNodeReachable(graph, sourceNodeId, targetNodeId)) return 'forward';
  if (isCampaignNodeReachable(graph, targetNodeId, sourceNodeId)) return 'backward';
  return 'disconnected';
};

/** Returns same-depth alternatives that share at least one direct predecessor. */
export const getCampaignSiblingNodes = (
  graph: CampaignGraphIndex,
  nodeId: string
): readonly CampaignGraphNodeDefinition[] => {
  const node = graph.nodeById.get(nodeId);
  if (!node) return [];
  const incoming = new Set(getCampaignIncomingSourceNodeIds(graph, nodeId));
  if (incoming.size === 0) return [];

  return graph.definition.nodes.filter((candidate) => (
    candidate.nodeId !== nodeId
    && candidate.sectorId === node.sectorId
    && candidate.depth === node.depth
    && getCampaignIncomingSourceNodeIds(graph, candidate.nodeId)
      .some((sourceNodeId) => incoming.has(sourceNodeId))
  ));
};

export const areCampaignNodePrerequisitesMet = (
  node: CampaignGraphNodeDefinition,
  completedNodeIds: Iterable<string>
): boolean => {
  if (node.prerequisiteNodeIds.length === 0) return true;
  const completed = completedNodeIds instanceof Set
    ? completedNodeIds
    : new Set(completedNodeIds);
  return node.prerequisiteMode === 'any'
    ? node.prerequisiteNodeIds.some((nodeId) => completed.has(nodeId))
    : node.prerequisiteNodeIds.every((nodeId) => completed.has(nodeId));
};

/**
 * Validates only a direct authored route. General reachability is deliberately
 * insufficient: this prevents a completed sibling from implicitly advancing
 * into another sibling merely because both eventually reach the same node.
 */
export const validateCampaignRouteSelection = (
  graph: CampaignGraphIndex,
  sourceNodeId: string,
  targetNodeId: string,
  completedNodeIds: Iterable<string> = []
): CampaignRouteSelectionValidation => {
  const sourceNode = graph.nodeById.get(sourceNodeId) ?? null;
  const targetNode = graph.nodeById.get(targetNodeId) ?? null;
  if (!sourceNode) {
    return { valid: false, reason: 'unknown-source', sourceNode, targetNode, edge: null };
  }
  if (!targetNode) {
    return { valid: false, reason: 'unknown-target', sourceNode, targetNode, edge: null };
  }
  const edge = getCampaignGraphEdge(graph, sourceNodeId, targetNodeId) ?? null;
  if (!edge) {
    return { valid: false, reason: 'not-outgoing', sourceNode, targetNode, edge };
  }
  const completed = new Set(completedNodeIds);
  completed.add(sourceNodeId);
  if (!areCampaignNodePrerequisitesMet(targetNode, completed)) {
    return {
      valid: false,
      reason: 'prerequisites-not-met',
      sourceNode,
      targetNode,
      edge
    };
  }
  return { valid: true, reason: null, sourceNode, targetNode, edge };
};

export const decideNextCampaignNode = (
  graph: CampaignGraphIndex,
  currentNodeId: string,
  options: CampaignNextNodeOptions = {}
): CampaignNextNodeDecision => {
  const currentNode = graph.nodeById.get(currentNodeId) ?? null;
  if (!currentNode) {
    const selectedTargetNodeId = options.selectedTargetNodeId ?? '';
    return {
      kind: 'invalid-selection',
      currentNode,
      selectedTargetNodeId,
      validation: validateCampaignRouteSelection(
        graph,
        currentNodeId,
        selectedTargetNodeId,
        options.completedNodeIds
      )
    };
  }

  if (options.selectedTargetNodeId) {
    const validation = validateCampaignRouteSelection(
      graph,
      currentNodeId,
      options.selectedTargetNodeId,
      options.completedNodeIds
    );
    if (!validation.valid) {
      return {
        kind: 'invalid-selection',
        currentNode,
        selectedTargetNodeId: options.selectedTargetNodeId,
        validation
      };
    }
    return {
      kind: 'advance',
      currentNode,
      nextNode: validation.targetNode,
      edge: validation.edge,
      reason: 'selected'
    };
  }

  const outgoingEdges = getCampaignOutgoingEdges(graph, currentNodeId);
  if (outgoingEdges.length === 0) return { kind: 'terminal', currentNode };

  const valid = outgoingEdges
    .map((edge) => validateCampaignRouteSelection(
      graph,
      currentNodeId,
      edge.toNodeId,
      options.completedNodeIds
    ))
    .filter((selection): selection is Extract<CampaignRouteSelectionValidation, { valid: true }> => (
      selection.valid
    ));

  if (valid.length === 0) {
    return {
      kind: 'blocked',
      currentNode,
      blockedTargetNodeIds: outgoingEdges.map((edge) => edge.toNodeId)
    };
  }
  if (valid.length === 1) {
    return {
      kind: 'advance',
      currentNode,
      nextNode: valid[0].targetNode,
      edge: valid[0].edge,
      reason: 'only-valid-target'
    };
  }
  return {
    kind: 'choice-required',
    currentNode,
    options: valid.map((selection) => selection.targetNode),
    edges: valid.map((selection) => selection.edge)
  };
};
