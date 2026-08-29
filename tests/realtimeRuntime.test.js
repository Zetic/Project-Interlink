import test from 'node:test';
import assert from 'node:assert/strict';

import { createBlueprint } from '../src/simulation/simulationEngine.js';
import { registerSimulationSession } from '../src/simulation/worldSimulation.js';
import {
  createRealtimeRuntime,
  REALTIME_RUNTIME_BACKENDS,
  REALTIME_RUNTIME_PROTOCOL_VERSION,
} from '../src/simulation/realtimeRuntime.js';

function minimalWorld() {
  return { sites: {}, regions: {}, systemNodes: {} };
}

test('realtime runtime preserves pause/play and authoritative fixed-step semantics', () => {
  const world = minimalWorld();
  const blueprint = createBlueprint();
  registerSimulationSession(world, 'site', blueprint);
  const runtime = createRealtimeRuntime(world, {
    capabilities: {
      worker: false,
      hardwareConcurrency: 1,
      webAssembly: true,
      wasmSimd: false,
      sharedArrayBuffer: false,
      crossOriginIsolated: false,
      wasmThreads: false,
      webGpu: false,
      offscreenCanvas: false,
    },
  });

  assert.equal(runtime.protocolVersion, REALTIME_RUNTIME_PROTOCOL_VERSION);
  assert.equal(runtime.backend, REALTIME_RUNTIME_BACKENDS.MAIN_THREAD);
  runtime.pause();
  assert.equal(runtime.stepFixed().advanced, false);
  assert.equal(blueprint.simulationStats.elapsedSeconds, 0);

  runtime.resume();
  assert.equal(runtime.stepFixed().advanced, true);
  assert.equal(blueprint.simulationStats.elapsedSeconds, 0.1);

  assert.throws(() => runtime.stepFixed(0.2), /authoritative 0.1 s fixed step/);
  runtime.dispose();
  assert.throws(() => runtime.stepFixed(), /disposed/);
});

test('auto runtime reports acceleration recommendation without selecting an incomplete backend', () => {
  const world = minimalWorld();
  const runtime = createRealtimeRuntime(world, {
    capabilities: {
      worker: true,
      hardwareConcurrency: 8,
      webAssembly: true,
      wasmSimd: true,
      sharedArrayBuffer: true,
      crossOriginIsolated: true,
      wasmThreads: true,
      webGpu: true,
      offscreenCanvas: true,
    },
  });

  assert.equal(runtime.backend, REALTIME_RUNTIME_BACKENDS.MAIN_THREAD);
  assert.equal(runtime.recommendation.simulationThread, 'worker');
  assert.equal(runtime.recommendation.cpuParallelism, 'shared-memory-workers');
  assert.equal(runtime.recommendation.gpuCompute, 'webgpu-available');
});
