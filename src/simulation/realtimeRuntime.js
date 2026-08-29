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
 * Current production backend. The contract deliberately does not expose the
 * implementation details of worldSimulationTick to presentation code. A Worker
 * runtime can therefore become authoritative behind the same interface once
 * command/snapshot ownership is migrated.
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
 * Runtime factory. `auto` intentionally selects the proven compiled JS backend
 * until the Worker implementation owns canonical simulation state. Capability
 * detection may recommend Worker/WASM/WebGPU support, but selecting an
 * incomplete accelerator would be worse than a correct optimized fallback.
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
