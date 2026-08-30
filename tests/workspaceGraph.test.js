import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createBlueprint,
  blueprintAddHopper,
  blueprintAddCrusher,
  blueprintConnect,
} from '../src/simulation/simulationEngine.js';
import { createCompositeNode, createSystemPort } from '../src/core/systems/systemNode.js';
import {
  projectBlueprintGraph,
  projectBoundaryGraph,
  graphConnectionEndpoint,
  disconnectGraphConnection,
  renderGraphConnections,
  renderGraphConnectionPreview,
} from '../src/workspace/graph/workspaceGraph.js';

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

test('graph projections carry selected node state for the shared renderer', () => {
  const blueprint = createBlueprint();
  const node = blueprintAddHopper(blueprint);
  assert.equal(projectBlueprintGraph(blueprint, { nodePositions: {} }, {
    selectedNodeId: node.id,
  }).nodes.find(item => item.id === node.id).selected, true);
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
    level: 'planet',
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

test('Region boundary adapters project hidden terminals to visible boundary buffers', () => {
  const regionImport = createCompositeNode({
    id: 'region-import-hopper',
    nodeType: 'hopper',
    ports: [createSystemPort({ id: 'output', direction: 'output' })],
  });
  const regionExport = createCompositeNode({
    id: 'region-export-hopper',
    nodeType: 'hopper',
    ports: [createSystemPort({ id: 'input', direction: 'input' })],
  });
  const site = createCompositeNode({
    id: 'site-1',
    nodeType: 'site',
    ports: [
      createSystemPort({ id: 'material-input', direction: 'input' }),
      createSystemPort({ id: 'material-output', direction: 'output' }),
    ],
  });
  const definition = {
    level: 'region',
    scopeId: 'region-1',
    nodes: [regionImport, regionExport, site],
  };
  const transfers = {
    export: {
      id: 'export',
      sourceCompositeId: 'site-1',
      sourcePortId: 'material-output',
      targetCompositeId: 'region-1-export-terminal',
      targetPortId: 'material-input',
      scopeId: 'region-1',
    },
    import: {
      id: 'import',
      sourceCompositeId: 'region-1-import-terminal',
      sourcePortId: 'material-output',
      targetCompositeId: 'site-1',
      targetPortId: 'material-input',
      scopeId: 'region-1',
    },
  };
  const graph = projectBoundaryGraph(definition, transfers, (nodeId, portId) => {
    if (nodeId === 'region-1-export-terminal') return { nodeId: 'region-export-hopper', portId: 'input' };
    if (nodeId === 'region-1-import-terminal') return { nodeId: 'region-import-hopper', portId: 'output' };
    return { nodeId, portId };
  });

  assert.deepEqual(graphConnectionEndpoint(graph.connections.find(item => item.id === 'export'), 'target'), {
    nodeId: 'region-export-hopper',
    portId: 'input',
  });
  assert.deepEqual(graphConnectionEndpoint(graph.connections.find(item => item.id === 'import'), 'source'), {
    nodeId: 'region-import-hopper',
    portId: 'output',
  });
  assert.deepEqual(graph.nodes.find(node => node.id === 'region-import-hopper').ports.map(port => port.id), ['output']);
  assert.deepEqual(graph.nodes.find(node => node.id === 'region-export-hopper').ports.map(port => port.id), ['input']);
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
  const transfers = { 'boundary-1': graph.connections[0] };
  let disconnected = null;
  assert.equal(disconnectGraphConnection(graph, 'boundary-1', {
    'boundary-transfer': connection => {
      disconnected = connection.id;
      delete transfers[connection.id];
    },
  }), true);
  assert.equal(disconnected, 'boundary-1');
  assert.equal(transfers['boundary-1'], undefined);
});

test('common disconnect dispatches real blueprint and boundary adapters', () => {
  const blueprint = createBlueprint();
  const source = blueprintAddHopper(blueprint);
  const target = blueprintAddCrusher(blueprint);
  const local = blueprintConnect(blueprint, source.id, source.outputPortId, target.id, target.inputPortId);
  const localGraph = projectBlueprintGraph(blueprint);
  assert.equal(disconnectGraphConnection(localGraph, local.id, {
    blueprint: connection => blueprint.connections[connection.id] && delete blueprint.connections[connection.id],
  }), true);
  assert.equal(blueprint.connections[local.id], undefined);
});

test('shared SVG renderer creates and reuses one stable path per projected edge', () => {
  const children = [];
  const svg = {
    contains: element => children.includes(element),
    appendChild: element => children.push(element),
  };
  const makePath = () => ({
    attrs: {},
    dataset: {},
    classList: { add() {}, toggle() {} },
    setAttribute(name, value) { this.attrs[name] = value; },
    addEventListener() {},
    remove() { children.splice(children.indexOf(this), 1); },
  });

  const graph = {
    connections: [{
      id: 'edge-1',
      source: { nodeId: 'a', portId: 'out' },
      target: { nodeId: 'b', portId: 'in' },
    }],
  };
  const elements = new Map();
  const options = {
    svg, graph, elements, createPath: makePath,
    endpointPosition: endpoint => endpoint.nodeId === 'a' ? { x: 0, y: 10 } : { x: 100, y: 20 },
  };
  renderGraphConnections(options);
  const path = elements.get('edge-1');
  assert.ok(path);
  assert.match(path.attrs.d, /^M 0 10 C 50 10, 50 20, 100 20$/);
  renderGraphConnections(options);
  assert.equal(elements.get('edge-1'), path);
  assert.equal(children.length, 1);
});

test('shared preview renderer creates and updates one cursor-following line', () => {
  const children = [];
  const line = {
    attrs: {},
    classList: { add() {} },
    setAttribute(name, value) { this.attrs[name] = value; },
    remove() { children.splice(children.indexOf(this), 1); },
  };
  const svg = {
    contains: element => children.includes(element),
    appendChild: element => children.push(element),
  };
  const previousDocument = globalThis.document;
  globalThis.document = { createElementNS: () => line };
  try {
    const options = {
      svg,
      active: true,
      source: { nodeId: 'a', portId: 'out' },
      target: { x: 80, y: 90 },
      endpointPosition: () => ({ x: 10, y: 20 }),
    };
    const preview = renderGraphConnectionPreview(options);
    assert.equal(preview, line);
    assert.deepEqual(line.attrs, { x1: 10, y1: 20, x2: 80, y2: 90 });
    assert.equal(renderGraphConnectionPreview({ ...options, preview }), line);
    renderGraphConnectionPreview({ svg, active: false, preview });
    assert.equal(children.length, 0);
  } finally {
    globalThis.document = previousDocument;
  }
});
