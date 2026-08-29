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
import {
  REALTIME_RUNTIME_PROTOCOL_VERSION,
  RUNTIME_COMMAND_TYPES,
  RUNTIME_EVENT_TYPES,
  createRuntimeEvent,
  validateRuntimeCommand,
} from './runtimeProtocol.js';

export { REALTIME_RUNTIME_PROTOCOL_VERSION } from './runtimeProtocol.js';

export const REALTIME_RUNTIME_BACKENDS = Object.freeze({
  MAIN_THREAD: 'main-thread-compiled',
  WORKER: 'worker',
  RUST_WASM_WORKER: 'rust-wasm-worker',
});

/**
 * Backend-neutral execution contract for the runtime migration. The compiled
 * JavaScript implementation remains authoritative while Rust/WASM primitives
 * reach parity. Presentation code can now communicate through dispatch(command)
 * without depending on worldSimulationTick, which is the boundary a Worker-owned
 * Rust runtime will implement later.
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

  function pause() {
    assertActive();
    pauseWorldSimulation(world);
    return true;
  }

  function resume() {
    assertActive();
    resumeWorldSimulation(world);
    return true;
  }

  function stepFixed(dt = SIMULATION_STEP_S) {
    assertActive();
    if (dt !== SIMULATION_STEP_S) {
      throw new Error(`Realtime runtime requires the authoritative ${SIMULATION_STEP_S} s fixed step`);
    }
    return worldSimulationTick(world, dt);
  }

  function dispatch(command) {
    assertActive();
    validateRuntimeCommand(command);
    switch (command.type) {
      case RUNTIME_COMMAND_TYPES.PAUSE:
        pause();
        return createRuntimeEvent(RUNTIME_EVENT_TYPES.RUN_STATE, { running: false });
      case RUNTIME_COMMAND_TYPES.RESUME:
        resume();
        return createRuntimeEvent(RUNTIME_EVENT_TYPES.RUN_STATE, { running: true });
      case RUNTIME_COMMAND_TYPES.STEP_FIXED: {
        const result = stepFixed(command.payload.dt ?? SIMULATION_STEP_S);
        return createRuntimeEvent(RUNTIME_EVENT_TYPES.STEPPED, {
          ...result,
          elapsedSeconds: world.simulation?.elapsedSeconds ?? 0,
        });
      }
      default:
        throw new Error(`Unsupported runtime command '${command.type}'`);
    }
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

    pause,
    resume,
    stepFixed,
    dispatch,

    dispose() {
      if (disposed) return;
      pauseWorldSimulation(world);
      disposed = true;
    },
  };
}

/**
 * Runtime factory. `auto` deliberately selects the proven compiled JavaScript
 * backend until Rust/WASM owns canonical packed simulation state inside a Worker.
 * The new Rust crate is a real execution backend foundation, but selecting it
 * before full world-state parity would split physical truth across runtimes.
 */
export function createRealtimeRuntime(world, {
  backend = 'auto',
  capabilities = browserRuntimeCapabilities(),
} = {}) {
  if (backend === 'auto' || backend === REALTIME_RUNTIME_BACKENDS.MAIN_THREAD) {
    return createMainThreadRealtimeRuntime(world, { capabilities });
  }
  if (backend === REALTIME_RUNTIME_BACKENDS.WORKER || backend === REALTIME_RUNTIME_BACKENDS.RUST_WASM_WORKER) {
    throw new Error('Worker realtime backend is not available until Rust/WASM owns canonical packed simulation state');
  }
  throw new Error(`Unknown realtime runtime backend '${backend}'`);
}
