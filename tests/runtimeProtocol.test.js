import test from 'node:test';
import assert from 'node:assert/strict';

import { createBlueprint } from '../src/simulation/simulationEngine.js';
import { registerSimulationSession } from '../src/simulation/worldSimulation.js';
import { createRealtimeRuntime } from '../src/simulation/realtimeRuntime.js';
import {
  REALTIME_RUNTIME_PROTOCOL_VERSION,
  RUNTIME_COMMAND_TYPES,
  RUNTIME_EVENT_TYPES,
  createRuntimeCommand,
} from '../src/simulation/runtimeProtocol.js';

function minimalWorld() {
  return { sites: {}, regions: {}, systemNodes: {} };
}

test('runtime command protocol preserves fixed-step pause/play semantics', () => {
  const world = minimalWorld();
  const blueprint = createBlueprint();
  registerSimulationSession(world, 'site', blueprint);
  const runtime = createRealtimeRuntime(world);

  const pauseEvent = runtime.dispatch(createRuntimeCommand(RUNTIME_COMMAND_TYPES.PAUSE));
  assert.equal(pauseEvent.protocolVersion, REALTIME_RUNTIME_PROTOCOL_VERSION);
  assert.equal(pauseEvent.type, RUNTIME_EVENT_TYPES.RUN_STATE);
  assert.equal(pauseEvent.payload.running, false);

  const pausedStep = runtime.dispatch(createRuntimeCommand(RUNTIME_COMMAND_TYPES.STEP_FIXED));
  assert.equal(pausedStep.type, RUNTIME_EVENT_TYPES.STEPPED);
  assert.equal(pausedStep.payload.advanced, false);
  assert.equal(blueprint.simulationStats.elapsedSeconds, 0);

  runtime.dispatch(createRuntimeCommand(RUNTIME_COMMAND_TYPES.RESUME));
  const runningStep = runtime.dispatch(createRuntimeCommand(RUNTIME_COMMAND_TYPES.STEP_FIXED, { dt: 0.1 }));
  assert.equal(runningStep.payload.advanced, true);
  assert.equal(runningStep.payload.elapsedSeconds, 0.1);
  assert.equal(blueprint.simulationStats.elapsedSeconds, 0.1);
});

test('runtime protocol rejects version drift and non-authoritative timesteps', () => {
  assert.throws(
    () => createRuntimeCommand(RUNTIME_COMMAND_TYPES.STEP_FIXED, { dt: 0.2 }),
    /authoritative 0.1 s timestep/,
  );

  const world = minimalWorld();
  const runtime = createRealtimeRuntime(world);
  assert.throws(
    () => runtime.dispatch({
      protocolVersion: REALTIME_RUNTIME_PROTOCOL_VERSION - 1,
      type: RUNTIME_COMMAND_TYPES.PAUSE,
      payload: {},
    }),
    /protocolVersion/,
  );
});
