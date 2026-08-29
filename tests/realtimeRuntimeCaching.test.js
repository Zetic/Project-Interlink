import test from 'node:test';
import assert from 'node:assert/strict';

import {
  blueprintAddHopper,
  blueprintConnect,
  blueprintDisconnect,
  blueprintPresentationRevision,
  blueprintTopologyRevision,
  createBlueprint,
  createBlueprintLayout,
  getNodePortDefinitions,
  getStreamForConnection,
  layoutMoveNode,
} from '../src/simulation/simulationEngine.js';
import {
  createWorldSimulation,
  pauseWorldSimulation,
  registerSimulationSession,
  resumeWorldSimulation,
  worldSimulationTick,
} from '../src/simulation/worldSimulation.js';
import {
  createMaterialStream,
  setMaterialStreamState,
  totalMaterialStreamMassFlowKgPerSecond,
} from '../src/simulation/materialStream.js';
import { createSolidMaterialState, addSolidFractionDirect } from '../src/core/materials/solids/solidMaterialState.js';
import { projectBlueprintGraph } from '../src/workspace/graph/workspaceGraph.js';

function materialPort(node, direction) {
  return getNodePortDefinitions(node).find(port => port.direction === direction && port.kind === 'material');
}

function minimalWorld() {
  return {
    sites: {},
    regions: {},
    systemNodes: {},
  };
}

test('compiled blueprint stream lookup invalidates across disconnect and reconnect', () => {
  const blueprint = createBlueprint();
  const source = blueprintAddHopper(blueprint, 100);
  const target = blueprintAddHopper(blueprint, 100);
  const sourcePort = materialPort(source, 'output');
  const targetPort = materialPort(target, 'input');

  const firstConnection = blueprintConnect(
    blueprint,
    source.id,
    sourcePort.id,
    target.id,
    targetPort.id,
  );
  assert.ok(firstConnection);
  const firstStream = getStreamForConnection(blueprint, firstConnection.id);
  assert.ok(firstStream);

  blueprintDisconnect(blueprint, firstConnection.id);
  assert.equal(getStreamForConnection(blueprint, firstConnection.id), null);

  const secondConnection = blueprintConnect(
    blueprint,
    source.id,
    sourcePort.id,
    target.id,
    targetPort.id,
  );
  assert.ok(secondConnection);
  const secondStream = getStreamForConnection(blueprint, secondConnection.id);
  assert.ok(secondStream);
  assert.notEqual(secondStream.id, firstStream.id);
});

test('cached world session list invalidates when a new realtime session is registered', () => {
  const world = minimalWorld();
  createWorldSimulation(world);

  const first = createBlueprint();
  registerSimulationSession(world, 'first', first);
  worldSimulationTick(world, 0.1);
  assert.equal(first.simulationStats.elapsedSeconds, 0.1);

  const second = createBlueprint();
  registerSimulationSession(world, 'second', second);
  worldSimulationTick(world, 0.1);

  assert.equal(first.simulationStats.elapsedSeconds, 0.2);
  assert.equal(second.simulationStats.elapsedSeconds, 0.1);
});

test('pause and resume retain fixed-step realtime world semantics', () => {
  const world = minimalWorld();
  const blueprint = createBlueprint();
  registerSimulationSession(world, 'site', blueprint);

  pauseWorldSimulation(world);
  const paused = worldSimulationTick(world, 0.1);
  assert.deepEqual(paused, { advanced: false, ticks: 0 });
  assert.equal(world.simulation.elapsedSeconds, 0);
  assert.equal(blueprint.simulationStats.elapsedSeconds, 0);

  resumeWorldSimulation(world);
  const running = worldSimulationTick(world, 0.1);
  assert.deepEqual(running, { advanced: true, ticks: 1 });
  assert.equal(world.simulation.elapsedSeconds, 0.1);
  assert.equal(blueprint.simulationStats.elapsedSeconds, 0.1);
});

test('presentation revision advances on physical ticks without rebuilding topology', () => {
  const world = minimalWorld();
  const blueprint = createBlueprint();
  blueprintAddHopper(blueprint, 100);
  registerSimulationSession(world, 'site', blueprint);

  const topologyBefore = blueprintTopologyRevision(blueprint);
  const presentationBefore = blueprintPresentationRevision(blueprint);
  worldSimulationTick(world, 0.1);

  assert.equal(blueprintTopologyRevision(blueprint), topologyBefore);
  assert.equal(blueprintPresentationRevision(blueprint), presentationBefore + 1);
});

test('blueprint graph projection is reused until topology, runtime presentation, or layout changes', () => {
  const blueprint = createBlueprint();
  const layout = createBlueprintLayout();
  const hopper = blueprintAddHopper(blueprint, 100);
  layoutMoveNode(layout, hopper.id, 10, 20);

  const first = projectBlueprintGraph(blueprint, layout);
  const unchanged = projectBlueprintGraph(blueprint, layout);
  assert.equal(unchanged, first);

  layoutMoveNode(layout, hopper.id, 30, 40);
  const afterLayout = projectBlueprintGraph(blueprint, layout);
  assert.notEqual(afterLayout, first);
  assert.deepEqual(afterLayout.nodes[0].position, { x: 30, y: 40 });

  const world = minimalWorld();
  registerSimulationSession(world, 'site', blueprint);
  worldSimulationTick(world, 0.1);
  const afterTick = projectBlueprintGraph(blueprint, layout);
  assert.notEqual(afterTick, afterLayout);
});

test('stream total-flow cache updates with state and is excluded from serialization', () => {
  const stream = createMaterialStream({
    id: 'stream-cache-test',
    sourceNodeId: 'source',
    sourcePortId: 'out',
    targetNodeId: 'target',
    targetPortId: 'in',
  });
  const state = createSolidMaterialState();
  addSolidFractionDirect(state, {
    speciesId: 'hematite',
    sizeBinId: '1-5mm',
    liberationClassId: 'partial',
    quantity: 3.5,
  });
  setMaterialStreamState(stream, state);

  assert.equal(totalMaterialStreamMassFlowKgPerSecond(stream), 3.5);
  assert.equal(Object.keys(stream).includes('_cachedTotalMassFlowKgPerSecond'), false);
  assert.equal(JSON.stringify(stream).includes('_cachedTotalMassFlowKgPerSecond'), false);
});
