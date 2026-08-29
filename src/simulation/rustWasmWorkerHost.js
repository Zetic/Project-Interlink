import {
  REALTIME_RUNTIME_PROTOCOL_VERSION,
  RUNTIME_COMMAND_TYPES,
  RUNTIME_EVENT_TYPES,
  createRuntimeEvent,
  validateRuntimeCommand,
} from './runtimeProtocol.js';
import {
  populateWasmPackedWorldRuntimeFromWorkerSetup,
  snapshotWasmPackedWorldRuntime,
} from './packedWorldWorkerSetup.js';

/**
 * Pure Worker command host. Keeping message handling separate from the browser
 * Worker global makes the protocol testable without loading a real .wasm file.
 */
export function createRustWasmWorkerHost({
  WasmPackedWorldRuntime,
  runtimeProtocolVersion,
}) {
  if (typeof WasmPackedWorldRuntime !== 'function') {
    throw new Error('WasmPackedWorldRuntime constructor is required');
  }
  const wasmProtocolVersion = typeof runtimeProtocolVersion === 'function'
    ? runtimeProtocolVersion()
    : runtimeProtocolVersion;
  if (wasmProtocolVersion !== REALTIME_RUNTIME_PROTOCOL_VERSION) {
    throw new Error(
      `Rust/WASM runtime protocol ${wasmProtocolVersion} does not match browser protocol ${REALTIME_RUNTIME_PROTOCOL_VERSION}`,
    );
  }

  let runtime = null;
  let setup = null;

  function assertInitialized() {
    if (!runtime || !setup) throw new Error('Rust/WASM Worker runtime has not been initialized');
  }

  function snapshot() {
    assertInitialized();
    return snapshotWasmPackedWorldRuntime(runtime, setup);
  }

  function handle(command) {
    validateRuntimeCommand(command);
    switch (command.type) {
      case RUNTIME_COMMAND_TYPES.INIT: {
        if (runtime) throw new Error('Rust/WASM Worker runtime is already initialized');
        setup = command.payload.setup;
        runtime = new WasmPackedWorldRuntime();
        populateWasmPackedWorldRuntimeFromWorkerSetup(runtime, setup);
        return createRuntimeEvent(RUNTIME_EVENT_TYPES.READY, {
          running: runtime.running(),
          elapsedSeconds: runtime.elapsed_seconds(),
          snapshot: snapshot(),
        });
      }
      case RUNTIME_COMMAND_TYPES.PAUSE:
        assertInitialized();
        runtime.pause();
        return createRuntimeEvent(RUNTIME_EVENT_TYPES.RUN_STATE, {
          running: false,
          elapsedSeconds: runtime.elapsed_seconds(),
        });
      case RUNTIME_COMMAND_TYPES.RESUME:
        assertInitialized();
        runtime.resume();
        return createRuntimeEvent(RUNTIME_EVENT_TYPES.RUN_STATE, {
          running: true,
          elapsedSeconds: runtime.elapsed_seconds(),
        });
      case RUNTIME_COMMAND_TYPES.STEP_FIXED: {
        assertInitialized();
        const advanced = runtime.tick_fixed();
        return createRuntimeEvent(RUNTIME_EVENT_TYPES.STEPPED, {
          advanced,
          ticks: advanced ? 1 : 0,
          elapsedSeconds: runtime.elapsed_seconds(),
          snapshot: snapshot(),
        });
      }
      case RUNTIME_COMMAND_TYPES.ADVANCE_FIXED: {
        assertInitialized();
        const ticks = runtime.advance_fixed_steps(command.payload.steps);
        return createRuntimeEvent(RUNTIME_EVENT_TYPES.STEPPED, {
          advanced: ticks > 0,
          ticks,
          elapsedSeconds: runtime.elapsed_seconds(),
          snapshot: snapshot(),
        });
      }
      default:
        throw new Error(`Unsupported Rust/WASM Worker command '${command.type}'`);
    }
  }

  return {
    protocolVersion: REALTIME_RUNTIME_PROTOCOL_VERSION,
    handle,
    snapshot,
    get runtime() { return runtime; },
    get setup() { return setup; },
  };
}
