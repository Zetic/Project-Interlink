import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { apparatusDefinitionById } from '../dist/apparatus/definitions.js';
import {
  connectPorts,
  createEmptyGraphState,
  placeMechanicalNode,
  setMechanicalNodeEnabled,
  setMechanicalNodeParameter,
} from '../dist/graph/graphCommands.js';
import { portForEndpoint } from '../dist/graph/graphQueries.js';
import { compositionTotal } from '../dist/material/types.js';
import { RESOURCE_SOURCE_TEMPLATES } from '../dist/material/resourceSources.js';
import {
  NODE_CARD_LOCAL_BODY_FONT_SIZE,
  NODE_CARD_LOCAL_HEIGHT,
  NODE_CARD_LOCAL_WIDTH,
} from '../dist/map/rendering/nodeCardGeometry.js';
import { compileFlatRuntimePlan } from '../dist/runtime/compileRuntimePlan.js';
import { generateWorld } from '../dist/world/generateWorld.js';

function connect(graph, planet, from, to) {
  return connectPorts(
    graph,
    from,
    portForEndpoint(planet, graph, from),
    to,
    portForEndpoint(planet, graph, to),
  );
}

test('Phase 5 keeps a guaranteed Iron Ore FEATURE with the four-part ore composition', () => {
  const world = generateWorld('phase5-iron-ore');
  const resource = world.planet.resourceNodes[0];
  assert.equal(resource.nodeType, 'feature');
  assert.equal(resource.featureType, 'mineral-deposit');
  assert.equal(resource.resourceId, 'iron-ore');
  assert.equal(resource.name.startsWith('Iron Ore Deposit'), true);
  assert.deepEqual(resource.source.composition.map(component => component.speciesId), [
    'hematite', 'magnetite', 'goethite', 'quartz',
  ]);
  assert.ok(Math.abs(compositionTotal(resource.source.composition) - 1) < 1e-10);

  const bounds = RESOURCE_SOURCE_TEMPLATES['iron-ore'].composition;
  for (const component of resource.source.composition) {
    const range = bounds.find(candidate => candidate.speciesId === component.speciesId);
    assert.ok(range);
    assert.ok(component.massFraction >= range.minFraction - 1e-12);
    assert.ok(component.massFraction <= range.maxFraction + 1e-12);
  }
});

test('resource-access may fan out, while a material output requires an explicit splitter', () => {
  const planet = generateWorld('phase5-fanout').planet;
  const resource = planet.resourceNodes[0];
  let graph = createEmptyGraphState();
  const extractorA = placeMechanicalNode(graph, apparatusDefinitionById('extractor'), resource.position); graph = extractorA.graph;
  const extractorB = placeMechanicalNode(graph, apparatusDefinitionById('extractor'), resource.position); graph = extractorB.graph;
  const hopperA = placeMechanicalNode(graph, apparatusDefinitionById('hopper'), resource.position); graph = hopperA.graph;
  const hopperB = placeMechanicalNode(graph, apparatusDefinitionById('hopper'), resource.position); graph = hopperB.graph;

  const resourceOut = { nodeId: resource.id, portId: 'resource-access' };
  graph = connect(graph, planet, resourceOut, { nodeId: extractorA.node.id, portId: 'resource-source' });
  graph = connect(graph, planet, resourceOut, { nodeId: extractorB.node.id, portId: 'resource-source' });
  assert.equal(graph.connections.filter(connection => connection.kind === 'resource-access').length, 2);

  const output = { nodeId: extractorA.node.id, portId: 'output' };
  graph = connect(graph, planet, output, { nodeId: hopperA.node.id, portId: 'input' });
  assert.throws(
    () => connect(graph, planet, output, { nodeId: hopperB.node.id, portId: 'input' }),
    /use a Splitter for fan-out/,
  );
});

test('Extractor and Hopper authoring parameters are typed graph configuration, not simulated state', () => {
  let graph = createEmptyGraphState();
  const extractor = placeMechanicalNode(graph, apparatusDefinitionById('extractor'), { x: 1, y: 1 }); graph = extractor.graph;
  const hopper = placeMechanicalNode(graph, apparatusDefinitionById('hopper'), { x: 2, y: 1 }); graph = hopper.graph;
  assert.equal(extractor.node.parameters.rateKgPerSecond, 5);
  assert.equal(hopper.node.parameters.capacityKg, 1000);
  graph = setMechanicalNodeParameter(graph, extractor.node.id, 'rateKgPerSecond', 7.5);
  graph = setMechanicalNodeEnabled(graph, extractor.node.id, true);
  assert.equal(graph.nodes.find(node => node.id === extractor.node.id).parameters.rateKgPerSecond, 7.5);
  assert.equal(graph.nodes.find(node => node.id === extractor.node.id).enabled, true);
  assert.throws(() => setMechanicalNodeParameter(graph, extractor.node.id, 'rateKgPerSecond', 0), /at least/);
});

test('flat runtime compiler emits source relationships and stream identities without TypeScript physics', () => {
  const planet = generateWorld('phase5-runtime-plan').planet;
  const resource = planet.resourceNodes[0];
  let graph = createEmptyGraphState();
  const extractor = placeMechanicalNode(graph, apparatusDefinitionById('extractor'), resource.position); graph = extractor.graph;
  const hopper = placeMechanicalNode(graph, apparatusDefinitionById('hopper'), resource.position); graph = hopper.graph;
  graph = setMechanicalNodeEnabled(graph, extractor.node.id, true);
  graph = connect(graph, planet, { nodeId: resource.id, portId: 'resource-access' }, { nodeId: extractor.node.id, portId: 'resource-source' });
  graph = connect(graph, planet, { nodeId: extractor.node.id, portId: 'output' }, { nodeId: hopper.node.id, portId: 'input' });

  const plan = compileFlatRuntimePlan(planet, graph);
  const source = plan.resourceSources.find(candidate => candidate.sourceNodeId === resource.id);
  assert.ok(source);
  assert.equal(source.resourceId, 'iron-ore');
  assert.equal(source.composition.length, 4);
  assert.equal(plan.resourceBindings.length, 1);
  assert.equal(plan.materialStreams.length, 1);
  assert.equal(plan.materialStreams[0].streamId, `stream:${graph.connections[1].id}`);
  assert.equal(plan.materialStreams[0].physicalForm, 'solid-particulate');
  assert.equal(Object.hasOwn(plan.materialStreams[0], 'massFlowKgPerSecond'), false);
  assert.equal(Object.hasOwn(plan.materialStreams[0], 'composition'), false);
  assert.equal(plan.machines.find(machine => machine.nodeId === extractor.node.id).parameters.rateKgPerSecond, 5);
});

test('engineering cards render with normal local SVG text sizes while retaining the 160x100 grammar', () => {
  assert.equal(NODE_CARD_LOCAL_WIDTH, 160);
  assert.equal(NODE_CARD_LOCAL_HEIGHT, 100);
  assert.ok(NODE_CARD_LOCAL_BODY_FONT_SIZE >= 10);
  const resourceRenderer = fs.readFileSync('src/map/rendering/resourceRenderer.ts', 'utf8');
  const mechanicalRenderer = fs.readFileSync('src/map/rendering/mechanicalRenderer.ts', 'utf8');
  const css = fs.readFileSync('map.css', 'utf8');
  assert.match(resourceRenderer, /localCardTransform/);
  assert.match(mechanicalRenderer, /localCardTransform/);
  assert.doesNotMatch(resourceRenderer, /metersToWorldUnits\([^)]*FONT/);
  assert.doesNotMatch(mechanicalRenderer, /metersToWorldUnits\([^)]*FONT/);
  assert.doesNotMatch(css, /text-rendering:\s*geometricPrecision/);
});
