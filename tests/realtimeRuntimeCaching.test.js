import test from 'node:test';
import assert from 'node:assert/strict';

import {
  blueprintAddHopper,
  blueprintConnect,
  blueprintDisconnect,
  createBlueprint,
  getNodePortDefinitions,
  getStreamForConnection,
} from '../src/simulation/simulationEngine.js';
import {
  createWorldSimulation,
  pauseWorldSimulation,
  registerSimulationSession,
  resumeWorldSimulation,
  worldSimulationTick,
} from '../src/simulation/worldSimulation.js';

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
