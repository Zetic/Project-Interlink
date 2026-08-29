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
import { reconfigureWasmPackedWorldRuntime } from './liveWorldReconfigure.js';

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

  function releaseCandidate(candidate) {
    if (!candidate) return;
    try {
      if (typeof candidate.free === 'function') candidate.free();
      else if (typeof candidate[Symbol.dispose] === 'function') candidate[Symbol.dispose]();
    } catch {
      // Cleanup must not hide the physical/setup error that caused the release.
    }
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
        const nextSetup = command.payload.setup;
        const nextRuntime = new WasmPackedWorldRuntime();
        try {
          populateWasmPackedWorldRuntimeFromWorkerSetup(nextRuntime, nextSetup);
          const initialSnapshot = snapshotWasmPackedWorldRuntime(nextRuntime, nextSetup);
          runtime = nextRuntime;
          setup = nextSetup;
          return createRuntimeEvent(RUNTIME_EVENT_TYPES.READY, {
            running: runtime.running(),
            elapsedSeconds: runtime.elapsed_seconds(),
            snapshot: initialSnapshot,
          });
        } catch (error) {
          releaseCandidate(nextRuntime);
          throw error;
        }
      }
      case RUNTIME_COMMAND_TYPES.RECONFIGURE: {
        assertInitialized();
        if (typeof runtime.clone_for_live_reconfigure !== 'function') {
          throw new Error('Rust/WASM runtime does not support live reconfiguration');
        }
        const nextSetup = command.payload.setup;
        const candidate = runtime.clone_for_live_reconfigure();
        try {
          reconfigureWasmPackedWorldRuntime(candidate, setup, nextSetup, {
            resetNodeIds: command.payload.resetNodeIds ?? [],
          });
          const nextSnapshot = snapshotWasmPackedWorldRuntime(candidate, nextSetup);
          const previous = runtime;
          runtime = candidate;
          setup = nextSetup;
          releaseCandidate(previous);
          return createRuntimeEvent(RUNTIME_EVENT_TYPES.RECONFIGURED, {
            running: runtime.running(),
            elapsedSeconds: runtime.elapsed_seconds(),
            snapshot: nextSnapshot,
          });
        } catch (error) {
          releaseCandidate(candidate);
          throw error;
        }
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
