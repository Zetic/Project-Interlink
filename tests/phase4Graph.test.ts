import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { APPARATUS_DEFINITIONS, apparatusDefinitionById } from '../dist/apparatus/definitions.js';
import { collectSimulationDebugStats } from '../dist/debug/debugTelemetry.js';
import { browserRuntimeCapabilities } from '../dist/debug/runtimeCapabilities.js';
import { connectPorts, createEmptyGraphState, moveMechanicalNode, placeMechanicalNode, removeMechanicalNode } from '../dist/graph/graphCommands.js';
import { portForEndpoint } from '../dist/graph/graphQueries.js';
import {
  ENGINEERING_NODE_CARD_PHYSICAL_HEIGHT_METERS,
  ENGINEERING_NODE_CARD_PHYSICAL_WIDTH_METERS,
} from '../dist/map/rendering/mechanicalRenderer.js';
import {
  RESOURCE_NODE_PHYSICAL_HEIGHT_METERS,
  RESOURCE_NODE_PHYSICAL_WIDTH_METERS,
} from '../dist/map/rendering/resourceRenderer.js';
import { AppStore } from '../dist/state/appState.js';
import { generateWorld } from '../dist/world/generateWorld.js';

test('Phase 4 catalog is definition-driven and restores the engineering vocabulary', () => {
  const ids = APPARATUS_DEFINITIONS.map(definition => definition.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const required of ['extractor', 'jaw-crusher', 'cone-crusher', 'ball-mill', 'screen', 'splitter', 'material-merger', 'feeder', 'magnetic-separator', 'hopper']) assert.ok(ids.includes(required), required);
  assert.equal(apparatusDefinitionById('extractor').ports[0].kind, 'resource-access');
  assert.equal(apparatusDefinitionById('hopper').category, 'container');
});

test('graph commands place, move, and remove mechanical nodes without UI ownership', () => {
  let graph = createEmptyGraphState();
  const placed = placeMechanicalNode(graph, apparatusDefinitionById('hopper'), { x: 10, y: 20 }); graph = placed.graph;
  assert.equal(graph.nodes.length, 1); assert.equal(placed.node.position.x, 10); assert.equal(placed.node.ports.length, 2);
  graph = moveMechanicalNode(graph, placed.node.id, { x: 30, y: 40 }); assert.deepEqual(graph.nodes[0].position, { x: 30, y: 40 });
  graph = removeMechanicalNode(graph, placed.node.id); assert.equal(graph.nodes.length, 0);
});

test('resource-access connects FEATURE output only to compatible Extractor input', () => {
  const world = generateWorld('phase4-connect'); const planet = world.planet; const resource = planet.resourceNodes[0];
  let graph = createEmptyGraphState(); const extractor = placeMechanicalNode(graph, apparatusDefinitionById('extractor'), resource.position); graph = extractor.graph;
  const resourceEndpoint = { nodeId: resource.id, portId: resource.resourceAccessPortId }; const extractorEndpoint = { nodeId: extractor.node.id, portId: 'resource-source' };
  graph = connectPorts(graph, resourceEndpoint, portForEndpoint(planet, graph, resourceEndpoint), extractorEndpoint, portForEndpoint(planet, graph, extractorEndpoint));
  assert.equal(graph.connections.length, 1); assert.equal(graph.connections[0].kind, 'resource-access');
  const hopper = placeMechanicalNode(graph, apparatusDefinitionById('hopper'), { x: resource.position.x + 1, y: resource.position.y }); graph = hopper.graph;
  const hopperInput = { nodeId: hopper.node.id, portId: 'input' };
  assert.throws(() => connectPorts(graph, resourceEndpoint, portForEndpoint(planet, graph, resourceEndpoint), hopperInput, portForEndpoint(planet, graph, hopperInput)), /Port kinds are incompatible/);
});

test('removing a mechanical node also removes its attached connections', () => {
  const world = generateWorld('phase4-remove'); const planet = world.planet; let graph = createEmptyGraphState();
  const extractor = placeMechanicalNode(graph, apparatusDefinitionById('extractor'), { x: 2, y: 2 }); graph = extractor.graph; const hopper = placeMechanicalNode(graph, apparatusDefinitionById('hopper'), { x: 3, y: 2 }); graph = hopper.graph;
  const output = { nodeId: extractor.node.id, portId: 'output' }; const input = { nodeId: hopper.node.id, portId: 'input' };
  graph = connectPorts(graph, output, portForEndpoint(planet, graph, output), input, portForEndpoint(planet, graph, input)); assert.equal(graph.connections.length, 1);
  graph = removeMechanicalNode(graph, hopper.node.id); assert.equal(graph.connections.length, 0);
});

test('all engineering node cards share the original fixed visual footprint', () => {
  assert.equal(ENGINEERING_NODE_CARD_PHYSICAL_WIDTH_METERS, RESOURCE_NODE_PHYSICAL_WIDTH_METERS);
  assert.equal(ENGINEERING_NODE_CARD_PHYSICAL_HEIGHT_METERS, RESOURCE_NODE_PHYSICAL_HEIGHT_METERS);
});

test('original DEBUG simulation counters project onto the flat graph without new diagnostic sections', () => {
  const store = new AppStore(); store.setWorld(generateWorld('phase4-debug'));
  const stats = collectSimulationDebugStats(store.getState());
  assert.equal(stats.sessions, 0); assert.equal(stats.connections, 0); assert.equal(stats.furnaces, 0);
  assert.equal(stats.nodes, store.getState().world.planet.resourceNodes.length);
  const shell = fs.readFileSync('src/ui/workspaceShell.ts', 'utf8');
  for (const title of ['Performance', 'Runtime', 'Simulation', 'Thermochemical', 'Simulation tools', 'Test factory']) assert.match(shell, new RegExp(`>${title}<`));
  for (const removed of ['section(\'World\'', 'section(\'Camera\'', 'section(\'Graph\'', 'section(\'Selection\'']) assert.doesNotMatch(shell, new RegExp(removed.replace(/[()']/g, '\\$&')));
  assert.equal(fs.existsSync('src/debug/debugModel.ts'), false);
});

test('original runtime capability tracking is preserved', () => {
  const capabilities = browserRuntimeCapabilities();
  assert.ok(capabilities.hardwareConcurrency >= 1);
  assert.equal(typeof capabilities.webAssembly, 'boolean');
  assert.equal(typeof capabilities.wasmSimd, 'boolean');
});

test('Phase 4 TypeScript architecture keeps UI parity modules separated', () => {
  const renderer = fs.readFileSync('src/map/mapRenderer.ts', 'utf8');
  assert.match(renderer, /camera\/mapCamera/); assert.match(renderer, /rendering\/mechanicalRenderer/); assert.doesNotMatch(renderer, /APPARATUS_DEFINITIONS\s*=|workspaceController/);
  const navigation = fs.readFileSync('src/ui/navigationPanel.ts', 'utf8');
  assert.match(navigation, /ws-navigation-context-row/); assert.match(navigation, /Current view/);
  const catalog = fs.readFileSync('src/ui/nodeCatalogPanel.ts', 'utf8');
  assert.match(catalog, /ws-node-catalog-entry/); assert.doesNotMatch(catalog, /ws-node-catalog-item/);
  const app = fs.readFileSync('src/app.ts', 'utf8'); assert.match(app, /installNodeCatalogPanel/); assert.match(app, /installDebugPanel/); assert.doesNotMatch(app, /workspaceController\.js/);
});
