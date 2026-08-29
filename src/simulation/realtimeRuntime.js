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
import { compilePackedWorldWorkerSetup } from './packedWorldWorkerSetup.js';
import {
  REALTIME_RUNTIME_PROTOCOL_VERSION,
  RUNTIME_COMMAND_TYPES,
  RUNTIME_EVENT_TYPES,
  createRuntimeCommand,
  createRuntimeEvent,
  validateRuntimeCommand,
} from './runtimeProtocol.js';

export { REALTIME_RUNTIME_PROTOCOL_VERSION } from './runtimeProtocol.js';

export const REALTIME_RUNTIME_BACKENDS = Object.freeze({
  MAIN_THREAD: 'main-thread-compiled',
  WORKER: 'worker',
  RUST_WASM_WORKER: 'rust-wasm-worker',
});

function validateFixedStep(dt) {
  if (dt !== SIMULATION_STEP_S) {
    throw new Error(`Realtime runtime requires the authoritative ${SIMULATION_STEP_S} s fixed step`);
  }
}

function validateStepCount(steps) {
  if (!Number.isInteger(steps) || steps < 0 || steps > 10_000) {
    throw new Error('fixed-step advance count must be an integer from 0 to 10000');
  }
}

/** Backend-neutral synchronous reference runtime used by production today. */
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
    validateFixedStep(dt);
    return worldSimulationTick(world, dt);
  }

  function advanceFixedSteps(steps) {
    assertActive();
    validateStepCount(steps);
    let ticks = 0;
    let advanced = false;
    let extractedKg = 0;
    for (let index = 0; index < steps; index++) {
      const result = worldSimulationTick(world, SIMULATION_STEP_S);
      if (result.advanced) ticks += 1;
      advanced ||= result.advanced;
      extractedKg += result.extractedKg ?? 0;
    }
    return { advanced, ticks, extractedKg };
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
          ticks: result.advanced ? 1 : 0,
          elapsedSeconds: world.simulation?.elapsedSeconds ?? 0,
        });
      }
      case RUNTIME_COMMAND_TYPES.ADVANCE_FIXED: {
        const result = advanceFixedSteps(command.payload.steps);
        return createRuntimeEvent(RUNTIME_EVENT_TYPES.STEPPED, {
          ...result,
          elapsedSeconds: world.simulation?.elapsedSeconds ?? 0,
        });
      }
      case RUNTIME_COMMAND_TYPES.INIT:
        throw new Error('main-thread runtime is initialized directly from its world object');
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
    ready: Promise.resolve(null),

    get running() {
      return !disposed && world.simulation?.running === true;
    },

    get snapshot() {
      return null;
    },

    pause,
    resume,
    stepFixed,
    advanceFixedSteps,
    dispatch,

    dispose() {
      if (disposed) return;
      pauseWorldSimulation(world);
      disposed = true;
    },
  };
}

function defaultWorkerFactory(url, options) {
  if (typeof Worker !== 'function') throw new Error('Web Worker API is unavailable');
  return new Worker(url, options);
}

/**
 * Real Rust/WASM execution backend. Canonical authoring state is compiled once
 * into a structured-clone-safe numeric setup; after READY, all fixed-step physics
 * and state ownership live inside the module Worker/WASM instance.
 */
export function createRustWasmWorkerRealtimeRuntime(world, {
  capabilities = browserRuntimeCapabilities(),
  workerFactory = defaultWorkerFactory,
} = {}) {
  if (!world || typeof world !== 'object') throw new Error('Realtime runtime requires a world object');
  if (!capabilities?.worker) throw new Error('Rust/WASM Worker backend requires Web Worker support');
  if (!capabilities?.webAssembly) throw new Error('Rust/WASM Worker backend requires WebAssembly support');

  const setup = compilePackedWorldWorkerSetup(world);
  const worker = workerFactory(
    new URL('./rustWasmWorker.js', import.meta.url),
    { type: 'module', name: 'interlink-rust-simulation' },
  );
  if (!worker || typeof worker.postMessage !== 'function') {
    throw new Error('Worker factory did not return a Worker-compatible object');
  }

  let disposed = false;
  let terminalError = null;
  let running = setup.running;
  let lastSnapshot = null;
  const pending = [];

  function rejectAll(error) {
    while (pending.length) pending.shift().reject(error);
  }

  function failWorker(error) {
    if (terminalError) return;
    terminalError = error instanceof Error ? error : new Error(String(error));
    running = false;
    rejectAll(terminalError);
    if (typeof worker.terminate === 'function') worker.terminate();
  }

  function onMessage(event) {
    const request = pending.shift();
    if (!request) return;
    const runtimeEvent = event?.data;
    if (!runtimeEvent || runtimeEvent.protocolVersion !== REALTIME_RUNTIME_PROTOCOL_VERSION) {
      const error = new Error('Rust/WASM Worker returned an incompatible runtime event');
      request.reject(error);
      failWorker(error);
      return;
    }
    if (runtimeEvent.type === RUNTIME_EVENT_TYPES.ERROR) {
      request.reject(new Error(runtimeEvent.payload?.message ?? 'Rust/WASM Worker runtime failed'));
      return;
    }
    if (runtimeEvent.type === RUNTIME_EVENT_TYPES.RUN_STATE) {
      running = runtimeEvent.payload.running === true;
    }
    if (runtimeEvent.payload?.snapshot) {
      lastSnapshot = runtimeEvent.payload.snapshot;
      running = lastSnapshot.running === true;
    }
    request.resolve(runtimeEvent);
  }

  function onError(event) {
    failWorker(new Error(event?.message ?? 'Rust/WASM Worker failed'));
  }

  if (typeof worker.addEventListener === 'function') {
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
  } else {
    worker.onmessage = onMessage;
    worker.onerror = onError;
  }

  function assertActive() {
    if (disposed) throw new Error('Realtime runtime has been disposed');
    if (terminalError) throw terminalError;
  }

  function send(command) {
    assertActive();
    validateRuntimeCommand(command);
    return new Promise((resolve, reject) => {
      pending.push({ resolve, reject });
      try {
        worker.postMessage(command);
      } catch (error) {
        pending.pop();
        reject(error);
      }
    });
  }

  const ready = send(createRuntimeCommand(RUNTIME_COMMAND_TYPES.INIT, { setup }))
    .then(event => {
      if (event.type !== RUNTIME_EVENT_TYPES.READY) {
        throw new Error(`Rust/WASM Worker expected READY, got '${event.type}'`);
      }
      running = event.payload.running === true;
      lastSnapshot = event.payload.snapshot ?? null;
      return event.payload;
    });

  async function dispatch(command) {
    assertActive();
    validateRuntimeCommand(command);
    if (command.type === RUNTIME_COMMAND_TYPES.INIT) {
      throw new Error('Rust/WASM Worker runtime initialization is managed by the facade');
    }
    await ready;
    assertActive();
    return send(command);
  }

  async function pause() {
    const event = await dispatch(createRuntimeCommand(RUNTIME_COMMAND_TYPES.PAUSE));
    running = false;
    return event.type === RUNTIME_EVENT_TYPES.RUN_STATE;
  }

  async function resume() {
    const event = await dispatch(createRuntimeCommand(RUNTIME_COMMAND_TYPES.RESUME));
    running = true;
    return event.type === RUNTIME_EVENT_TYPES.RUN_STATE;
  }

  async function stepFixed(dt = SIMULATION_STEP_S) {
    validateFixedStep(dt);
    const event = await dispatch(createRuntimeCommand(RUNTIME_COMMAND_TYPES.STEP_FIXED, { dt }));
    return event.payload;
  }

  async function advanceFixedSteps(steps) {
    validateStepCount(steps);
    const event = await dispatch(createRuntimeCommand(RUNTIME_COMMAND_TYPES.ADVANCE_FIXED, { steps }));
    return event.payload;
  }

  return {
    protocolVersion: REALTIME_RUNTIME_PROTOCOL_VERSION,
    backend: REALTIME_RUNTIME_BACKENDS.RUST_WASM_WORKER,
    capabilities,
    recommendation: recommendedRuntimeBackend(capabilities),
    world,
    setup,
    ready,

    get running() { return !disposed && !terminalError && running; },
    get snapshot() { return lastSnapshot; },
    get error() { return terminalError; },

    pause,
    resume,
    stepFixed,
    advanceFixedSteps,
    dispatch,

    dispose() {
      if (disposed) return;
      disposed = true;
      rejectAll(new Error('Realtime runtime has been disposed'));
      if (typeof worker.terminate === 'function') worker.terminate();
    },
  };
}

/**
 * `auto` remains on the compiled JavaScript backend until the player-facing
 * workspace projects Worker snapshots back into canonical UI state. The explicit
 * Rust/WASM Worker backend is now real and can own a complete world independently.
 */
export function createRealtimeRuntime(world, {
  backend = 'auto',
  capabilities = browserRuntimeCapabilities(),
  workerFactory,
} = {}) {
  if (backend === 'auto' || backend === REALTIME_RUNTIME_BACKENDS.MAIN_THREAD) {
    return createMainThreadRealtimeRuntime(world, { capabilities });
  }
  if (backend === REALTIME_RUNTIME_BACKENDS.RUST_WASM_WORKER) {
    return createRustWasmWorkerRealtimeRuntime(world, { capabilities, workerFactory });
  }
  if (backend === REALTIME_RUNTIME_BACKENDS.WORKER) {
    throw new Error('generic JavaScript Worker backend is not implemented; use rust-wasm-worker');
  }
  throw new Error(`Unknown realtime runtime backend '${backend}'`);
}
