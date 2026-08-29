import { SIMULATION_STEP_S } from './simulationEngine.js';
import {
  createWorldSimulation,
  pauseWorldSimulation,
  resumeWorldSimulation,
  worldSimulationTick,
} from './worldSimulation.js';
import {
  browserRuntimeCapabilities,
  recommendedRuntimeBackend,
} from './runtimeCapabilities.js';

export const REALTIME_RUNTIME_PROTOCOL_VERSION = 1;
export const REALTIME_RUNTIME_BACKENDS = Object.freeze({
  MAIN_THREAD: 'main-thread-compiled',
  WORKER: 'worker',
});

/**
 * Backend-neutral execution contract for the runtime migration. The compiled
 * JavaScript implementation is intentionally the only selectable backend in
 * this PR. A later scheduler migration can consume this contract without making
 * an incomplete Worker responsible for cloning authoritative world state every
 * fixed step.
 */
export function createMainThreadRealtimeRuntime(world, {
  capabilities = browserRuntimeCapabilities(),
} = {}) {
  if (!world || typeof world !== 'object') throw new Error('Realtime runtime requires a world object');
  createWorldSimulation(world);
  let disposed = false;

  function assertActive() {
    if (disposed) throw new Error('Realtime runtime has been disposed');
  }

  return {
    protocolVersion: REALTIME_RUNTIME_PROTOCOL_VERSION,
    backend: REALTIME_RUNTIME_BACKENDS.MAIN_THREAD,
    capabilities,
    recommendation: recommendedRuntimeBackend(capabilities),
    world,

    get running() {
      return !disposed && world.simulation?.running === true;
    },

    resume() {
      assertActive();
      resumeWorldSimulation(world);
      return true;
    },

    pause() {
      assertActive();
      pauseWorldSimulation(world);
      return true;
    },

    stepFixed(dt = SIMULATION_STEP_S) {
      assertActive();
      if (dt !== SIMULATION_STEP_S) {
        throw new Error(`Realtime runtime requires the authoritative ${SIMULATION_STEP_S} s fixed step`);
      }
      return worldSimulationTick(world, dt);
    },

    dispose() {
      if (disposed) return;
      pauseWorldSimulation(world);
      disposed = true;
    },
  };
}

/**
 * Runtime factory. `auto` deliberately selects the proven compiled JavaScript
 * backend until a Worker owns canonical simulation state and can exchange compact
 * commands/snapshots. Capability detection may recommend Worker/WASM/WebGPU
 * support, but selecting an incomplete accelerator would regress correctness and
 * can perform worse than the optimized fallback.
 */
export function createRealtimeRuntime(world, {
  backend = 'auto',
  capabilities = browserRuntimeCapabilities(),
} = {}) {
  if (backend === 'auto' || backend === REALTIME_RUNTIME_BACKENDS.MAIN_THREAD) {
    return createMainThreadRealtimeRuntime(world, { capabilities });
  }
  if (backend === REALTIME_RUNTIME_BACKENDS.WORKER) {
    throw new Error('Worker realtime backend is not available until simulation-state ownership is migrated');
  }
  throw new Error(`Unknown realtime runtime backend '${backend}'`);
}
