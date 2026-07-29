const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const compileCampaignGraph = () => {
  const source = fs.readFileSync(path.join(root, 'services', 'campaignGraph.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  Function('exports', 'require', 'module', compiled)(module.exports, require, module);
  return module.exports;
};

const campaignGraph = compileCampaignGraph();

const makeNode = (nodeId, overrides = {}) => ({
  nodeId,
  sectorId: 'sector-1',
  depth: 1,
  routeId: 'main',
  displayLabel: nodeId,
  missionDefinitionId: `mission-${nodeId}`,
  prerequisiteNodeIds: [],
  prerequisiteMode: 'all',
  outgoingEdges: [],
  rejoinNodeId: null,
  optional: false,
  mainPath: true,
  masteryBranch: false,
  oneTime: false,
  bossId: null,
  miniBossIds: [],
  weeklyStreakEligible: true,
  weeklyScoreMultiplier: 1,
  recommendedPower: { minimum: 0, expected: 0, comfortable: 0 },
  rewardProfile: 'standard',
  mapPosition: { x: 0.5, y: 0.5 },
  routeControlPoints: [{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.4 }],
  routeSummary: {
    combatIntensity: 'low',
    miniBossPresence: 'none',
    rewardType: 'standard',
    recommendedSupportTags: [],
    estimatedWaveCount: 3
  },
  ...overrides
});

const edge = (edgeId, toNodeId, overrides = {}) => ({
  edgeId,
  toNodeId,
  routeId: 'main',
  label: edgeId,
  kind: 'progression',
  risk: 'low',
  weeklyScoreMultiplier: 1,
  ...overrides
});

const makeBranchGraph = () => ({
  entryNodeId: 'root',
  nodes: [
    makeNode('root', {
      outgoingEdges: [
        edge('root-to-a', 'route-a', { routeId: 'alpha', kind: 'route-choice' }),
        edge('root-to-b', 'route-b', { routeId: 'beta', kind: 'route-choice' })
      ]
    }),
    makeNode('route-a', {
      depth: 2,
      routeId: 'alpha',
      displayLabel: '02A',
      prerequisiteNodeIds: ['root'],
      outgoingEdges: [edge('a-to-rejoin', 'rejoin', { routeId: 'alpha', kind: 'rejoin' })],
      rejoinNodeId: 'rejoin'
    }),
    makeNode('route-b', {
      depth: 2,
      routeId: 'beta',
      displayLabel: '02B',
      prerequisiteNodeIds: ['root'],
      outgoingEdges: [edge('b-to-rejoin', 'rejoin', { routeId: 'beta', kind: 'rejoin' })],
      rejoinNodeId: 'rejoin'
    }),
    makeNode('rejoin', {
      depth: 3,
      prerequisiteNodeIds: ['route-a', 'route-b'],
      prerequisiteMode: 'any',
      outgoingEdges: [edge('rejoin-to-end', 'end')]
    }),
    makeNode('end', {
      depth: 4,
      prerequisiteNodeIds: ['rejoin']
    }),
    makeNode('island', {
      sectorId: 'sector-2',
      depth: 2,
      routeId: 'island'
    })
  ]
});

test('legacy Campaigns resolve to a stable sorted linear graph', () => {
  const legacyCampaign = {
    levels: [
      {
        id: 'mission-b',
        name: 'Second',
        order: 2,
        waves: [{ id: 'b-wave-1' }],
        campaignProgression: {
          sectorId: 'sector-1',
          recommendedPower: { minimum: 2, expected: 3, comfortable: 4 },
          recommendedSupportTags: ['survival'],
          mapPosition: { x: 0.6, y: 0.3 }
        }
      },
      {
        id: 'mission-a',
        name: 'First',
        order: 1,
        waves: [{ id: 'a-wave-1' }, { id: 'a-wave-2' }],
        campaignProgression: {
          sectorId: 'sector-1',
          recommendedPower: { minimum: 1, expected: 2, comfortable: 3 },
          recommendedSupportTags: [],
          mapPosition: { x: 0.4, y: 0.8 }
        }
      }
    ]
  };

  const graph = campaignGraph.resolveCampaignGraph(legacyCampaign);
  assert.equal(graph.entryNodeId, 'mission-a');
  assert.deepEqual(graph.nodes.map((node) => node.nodeId), ['mission-a', 'mission-b']);
  assert.deepEqual(graph.nodes[0].outgoingEdges.map((item) => item.toNodeId), ['mission-b']);
  assert.deepEqual(graph.nodes[1].outgoingEdges, []);
  assert.deepEqual(graph.nodes[0].routeControlPoints, [
    { x: 0.4, y: 0.8 },
    { x: 0.6, y: 0.3 }
  ]);

  const index = campaignGraph.createCampaignGraphIndex(legacyCampaign);
  const next = campaignGraph.decideNextCampaignNode(index, 'mission-a');
  assert.equal(next.kind, 'advance');
  assert.equal(next.nextNode.nodeId, 'mission-b');
  assert.equal(campaignGraph.decideNextCampaignNode(index, 'mission-b').kind, 'terminal');
});

test('lookups expose authored nodes, edges, incoming sources, and mission mappings', () => {
  const graph = campaignGraph.indexCampaignGraph(makeBranchGraph());
  assert.equal(campaignGraph.getCampaignGraphNode(graph, 'route-a').displayLabel, '02A');
  assert.equal(campaignGraph.getCampaignGraphEdge(graph, 'root', 'route-b').edgeId, 'root-to-b');
  assert.equal(campaignGraph.getCampaignGraphEdgeById(graph, 'a-to-rejoin').toNodeId, 'rejoin');
  assert.deepEqual(campaignGraph.getCampaignOutgoingTargetIds(graph, 'root'), ['route-a', 'route-b']);
  assert.deepEqual(campaignGraph.getCampaignIncomingSourceNodeIds(graph, 'rejoin'), ['route-a', 'route-b']);
  assert.deepEqual(
    campaignGraph.getCampaignGraphNodesForMission(graph, 'mission-route-a').map((node) => node.nodeId),
    ['route-a']
  );
  assert.equal(campaignGraph.getCampaignRejoinNode(graph, 'route-a').nodeId, 'rejoin');
});

test('reachability and traversal classification follow directed edges, not numeric depth', () => {
  const graph = campaignGraph.indexCampaignGraph(makeBranchGraph());
  assert.deepEqual(
    campaignGraph.getCampaignReachableNodeIds(graph, 'root'),
    ['route-a', 'route-b', 'rejoin', 'end']
  );
  assert.equal(campaignGraph.isCampaignNodeReachable(graph, 'root', 'end'), true);
  assert.equal(campaignGraph.classifyCampaignTraversal(graph, 'root', 'end'), 'forward');
  assert.equal(campaignGraph.classifyCampaignTraversal(graph, 'end', 'root'), 'backward');
  assert.equal(campaignGraph.classifyCampaignTraversal(graph, 'root', 'root'), 'same');
  assert.equal(campaignGraph.classifyCampaignTraversal(graph, 'route-a', 'route-b'), 'disconnected');
  assert.equal(campaignGraph.classifyCampaignTraversal(graph, 'root', 'island'), 'disconnected');
});

test('same-depth siblings require a route choice and never implicitly advance into each other', () => {
  const graph = campaignGraph.indexCampaignGraph(makeBranchGraph());
  const choice = campaignGraph.decideNextCampaignNode(graph, 'root');
  assert.equal(choice.kind, 'choice-required');
  assert.deepEqual(choice.options.map((node) => node.nodeId), ['route-a', 'route-b']);

  const selected = campaignGraph.decideNextCampaignNode(graph, 'root', {
    selectedTargetNodeId: 'route-b'
  });
  assert.equal(selected.kind, 'advance');
  assert.equal(selected.nextNode.nodeId, 'route-b');
  assert.equal(selected.reason, 'selected');

  const invalidSibling = campaignGraph.validateCampaignRouteSelection(
    graph,
    'route-a',
    'route-b',
    ['root', 'route-a']
  );
  assert.equal(invalidSibling.valid, false);
  assert.equal(invalidSibling.reason, 'not-outgoing');

  const afterA = campaignGraph.decideNextCampaignNode(graph, 'route-a', {
    completedNodeIds: ['root']
  });
  assert.equal(afterA.kind, 'advance');
  assert.equal(afterA.nextNode.nodeId, 'rejoin');
  assert.deepEqual(campaignGraph.getCampaignSiblingNodes(graph, 'route-a').map((node) => node.nodeId), ['route-b']);
});

test('route validation honors all-mode prerequisites and reports blocked choices', () => {
  const definition = {
    entryNodeId: 'source',
    nodes: [
      makeNode('source', { outgoingEdges: [edge('source-to-target', 'target')] }),
      makeNode('gate'),
      makeNode('target', {
        depth: 2,
        prerequisiteNodeIds: ['source', 'gate'],
        prerequisiteMode: 'all'
      })
    ]
  };
  const graph = campaignGraph.indexCampaignGraph(definition);
  const blocked = campaignGraph.validateCampaignRouteSelection(graph, 'source', 'target');
  assert.equal(blocked.valid, false);
  assert.equal(blocked.reason, 'prerequisites-not-met');
  assert.equal(campaignGraph.decideNextCampaignNode(graph, 'source').kind, 'blocked');

  const valid = campaignGraph.validateCampaignRouteSelection(
    graph,
    'source',
    'target',
    ['gate']
  );
  assert.equal(valid.valid, true);
  assert.equal(valid.edge.edgeId, 'source-to-target');
});

test('indexing rejects duplicate and dangling identifiers instead of traversing ambiguity', () => {
  assert.throws(
    () => campaignGraph.indexCampaignGraph({
      entryNodeId: 'duplicate',
      nodes: [makeNode('duplicate'), makeNode('duplicate')]
    }),
    /duplicate node ID: duplicate/
  );
  assert.throws(
    () => campaignGraph.indexCampaignGraph({
      entryNodeId: 'root',
      nodes: [makeNode('root', { outgoingEdges: [edge('dangling', 'missing')] })]
    }),
    /unknown target: missing/
  );
});
