import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createBlueprint,
  blueprintAddHopper,
  blueprintAddCrusher,
  blueprintConnect,
} from '../src/simulation/simulationEngine.js';
import { createCompositeNode, createSystemPort } from '../src/simulation/systemNode.js';
import {
  projectBlueprintGraph,
  projectBoundaryGraph,
  graphConnectionEndpoint,
  disconnectGraphConnection,
} from '../src/workspace/workspaceGraph.js';

test('shared graph projects local connections with the original endpoints', () => {
  const blueprint = createBlueprint();
  const source = blueprintAddHopper(blueprint);
  const target = blueprintAddCrusher(blueprint);
  const connection = blueprintConnect(blueprint, source.id, source.outputPortId, target.id, target.inputPortId);
  const graph = projectBlueprintGraph(blueprint);

  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.connections.length, 1);
  assert.deepEqual(graph.connections[0].source, {
    nodeId: source.id,
    portId: source.outputPortId,
  });
  assert.equal(graph.connections[0].id, connection.id);
  assert.equal(graph.connections[0].adapter, 'blueprint');
});

test('shared graph projects Region and Planet transfers into visible edges', () => {
  const source = createCompositeNode({
    id: 'region-a',
    nodeType: 'region',
    ports: [createSystemPort({ id: 'out', direction: 'output' })],
  });
  const target = createCompositeNode({
    id: 'region-b',
    nodeType: 'region',
    ports: [createSystemPort({ id: 'in', direction: 'input' })],
  });
  const transfer = {
    id: 'transfer-1',
    sourceCompositeId: source.id,
    sourcePortId: 'out',
    targetCompositeId: target.id,
    targetPortId: 'in',
    scopeId: 'planet',
  };
  const graph = projectBoundaryGraph({
    scopeId: 'planet',
    planetScopeId: 'planet',
    nodes: [source, target],
  }, { [transfer.id]: transfer }, (nodeId, portId) => ({ nodeId, portId }));

  assert.equal(graph.connections.length, 1);
  assert.deepEqual(graphConnectionEndpoint(graph.connections[0], 'source'), {
    nodeId: source.id,
    portId: 'out',
  });
  assert.deepEqual(graphConnectionEndpoint(graph.connections[0], 'target'), {
    nodeId: target.id,
    portId: 'in',
  });
});

test('common disconnect resolves the correct simulation adapter', () => {
  const graph = {
    connections: [{
      id: 'boundary-1',
      adapter: 'boundary-transfer',
      source: { nodeId: 'a', portId: 'out' },
      target: { nodeId: 'b', portId: 'in' },
    }],
  };
  let disconnected = null;
  assert.equal(disconnectGraphConnection(graph, 'boundary-1', {
    'boundary-transfer': connection => { disconnected = connection.id; },
  }), true);
  assert.equal(disconnected, 'boundary-1');
});
