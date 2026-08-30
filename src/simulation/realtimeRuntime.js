import { SIMULATION_STEP_S } from './simulationEngine.js';
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

function defaultWorkerFactory(url, options) {
  if (typeof Worker !== 'function') throw new Error('Web Worker API is unavailable');
  return new Worker(url, options);
}

/**
 * Production Rust/WASM execution backend. Canonical authoring state is compiled
 * to a structured-clone-safe setup; after READY, fixed-step physics and retained
 * physical state live only inside the Worker/WASM runtime.
 */
export function createRustWasmWorkerRealtimeRuntime(world, {
  capabilities = browserRuntimeCapabilities(),
  workerFactory = defaultWorkerFactory,
} = {}) {
  if (!world || typeof world !== 'object') throw new Error('Realtime runtime requires a world object');
  if (!capabilities?.worker) throw new Error('Rust/WASM Worker backend requires Web Worker support');
  if (!capabilities?.webAssembly) throw new Error('Rust/WASM Worker backend requires WebAssembly support');

  let setup = compilePackedWorldWorkerSetup(world);
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
      const error = new Error(runtimeEvent.payload?.message ?? 'Rust/WASM Worker runtime failed');
      request.reject(error);
      failWorker(error);
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

  async function reconfigure(nextWorld = world, { resetNodeIds = [] } = {}) {
    assertActive();
    await ready;
    const nextSetup = compilePackedWorldWorkerSetup(nextWorld, { previousSetup: setup });
    const event = await send(createRuntimeCommand(RUNTIME_COMMAND_TYPES.RECONFIGURE, {
      setup: nextSetup,
      resetNodeIds,
    }));
    if (event.type !== RUNTIME_EVENT_TYPES.RECONFIGURED) {
      throw new Error(`Rust/WASM Worker expected RECONFIGURED, got '${event.type}'`);
    }
    setup = nextSetup;
    lastSnapshot = event.payload.snapshot ?? lastSnapshot;
    running = event.payload.running === true;
    return event.payload;
  }

  return {
    protocolVersion: REALTIME_RUNTIME_PROTOCOL_VERSION,
    backend: REALTIME_RUNTIME_BACKENDS.RUST_WASM_WORKER,
    capabilities,
    recommendation: recommendedRuntimeBackend(capabilities),
    world,
    ready,

    get setup() { return setup; },
    get running() { return !disposed && !terminalError && running; },
    get snapshot() { return lastSnapshot; },
    get error() { return terminalError; },

    pause,
    resume,
    stepFixed,
    advanceFixedSteps,
    reconfigure,
    dispatch,

    dispose() {
      if (disposed) return;
      disposed = true;
      rejectAll(new Error('Realtime runtime has been disposed'));
      if (typeof worker.terminate === 'function') worker.terminate();
    },
  };
}

/** Rust/WASM Worker is the required production simulation runtime. */
export function createRealtimeRuntime(world, {
  backend = REALTIME_RUNTIME_BACKENDS.RUST_WASM_WORKER,
  capabilities = browserRuntimeCapabilities(),
  workerFactory,
} = {}) {
  if (backend !== 'auto' && backend !== REALTIME_RUNTIME_BACKENDS.RUST_WASM_WORKER) {
    throw new Error(`Unsupported realtime runtime backend '${backend}'; Project Interlink requires rust-wasm-worker`);
  }
  if (!capabilities?.worker || !capabilities?.webAssembly) {
    throw new Error('Project Interlink requires a browser with Web Worker and WebAssembly support');
  }
  return createRustWasmWorkerRealtimeRuntime(world, { capabilities, workerFactory });
}
