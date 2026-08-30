
import { SIMULATION_STEP_S } from './simulationEngine.js';
import {
  populateWasmPackedWorldRuntimeFromWorkerSetup,
  snapshotWasmPackedWorldRuntime,
  detailWasmPackedWorldRuntime,
} from './packedWorldWorkerSetup.js';
import { reconfigureWasmPackedWorldRuntime } from './liveWorldReconfigure.js';
import {
  REALTIME_RUNTIME_PROTOCOL_VERSION,
  RUNTIME_COMMAND_TYPES,
  RUNTIME_EVENT_TYPES,
  createRuntimeEvent,
  validateRuntimeCommand,
} from './runtimeProtocol.js';

/**
 * Pure command host used by the dedicated Worker and by Node regression tests.
 * Browser globals intentionally stay outside this module.
 */
export function createRustWasmWorkerHost({
  WasmPackedWorldRuntime,
  runtimeProtocolVersion,
} = {}) {
  if (typeof WasmPackedWorldRuntime !== 'function') {
    throw new Error('WasmPackedWorldRuntime constructor is required');
  }
  if (typeof runtimeProtocolVersion !== 'function') {
    throw new Error('WASM runtime protocol version function is required');
  }
  const wasmProtocolVersion = runtimeProtocolVersion();
  if (wasmProtocolVersion !== REALTIME_RUNTIME_PROTOCOL_VERSION) {
    throw new Error(
      `WASM runtime protocol ${wasmProtocolVersion} does not match browser protocol ${REALTIME_RUNTIME_PROTOCOL_VERSION}`,
    );
  }

  let runtime = null;
  let setup = null;

  function ensureRuntime() {
    if (!runtime || !setup) throw new Error('Rust/WASM Worker runtime has not been initialized');
  }

  function event(type, payload, requestId) {
    return createRuntimeEvent(type, payload, requestId);
  }

  function handle(command) {
    validateRuntimeCommand(command);
    const requestId = command.requestId ?? null;

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
          return event(RUNTIME_EVENT_TYPES.READY, {
            running: runtime.running(),
            elapsedSeconds: runtime.elapsed_seconds(),
            snapshot: initialSnapshot,
          }, requestId);
        } catch (error) {
          if (typeof nextRuntime.free === 'function') nextRuntime.free();
          throw error;
        }
      }

      case RUNTIME_COMMAND_TYPES.RECONFIGURE: {
        ensureRuntime();
        const nextSetup = command.payload.setup;
        const candidate = runtime.clone_for_live_reconfigure();
        try {
          reconfigureWasmPackedWorldRuntime(
            candidate,
            setup,
            nextSetup,
            { resetNodeIds: command.payload.resetNodeIds ?? [] },
          );
          const nextSnapshot = snapshotWasmPackedWorldRuntime(candidate, nextSetup);
          const previous = runtime;
          runtime = candidate;
          setup = nextSetup;
          if (typeof previous.free === 'function') previous.free();
          return event(RUNTIME_EVENT_TYPES.RECONFIGURED, {
            running: runtime.running(),
            elapsedSeconds: runtime.elapsed_seconds(),
            snapshot: nextSnapshot,
          }, requestId);
        } catch (error) {
          if (typeof candidate.free === 'function') candidate.free();
          throw error;
        }
      }

      case RUNTIME_COMMAND_TYPES.QUERY_DETAIL: {
        ensureRuntime();
        try {
          return event(RUNTIME_EVENT_TYPES.DETAIL, {
            ok: true,
            detail: detailWasmPackedWorldRuntime(runtime, setup, command.payload),
          }, requestId);
        } catch (error) {
          // Inspector/observability failures are deliberately non-terminal. A
          // bad read request must never tear down otherwise-valid physics.
          return event(RUNTIME_EVENT_TYPES.DETAIL, {
            ok: false,
            error: { message: error instanceof Error ? error.message : String(error) },
          }, requestId);
        }
      }

      case RUNTIME_COMMAND_TYPES.PAUSE:
        ensureRuntime();
        runtime.pause();
        return event(RUNTIME_EVENT_TYPES.RUN_STATE, {
          running: false,
          elapsedSeconds: runtime.elapsed_seconds(),
          snapshot: snapshotWasmPackedWorldRuntime(runtime, setup),
        }, requestId);

      case RUNTIME_COMMAND_TYPES.RESUME:
        ensureRuntime();
        runtime.resume();
        return event(RUNTIME_EVENT_TYPES.RUN_STATE, {
          running: true,
          elapsedSeconds: runtime.elapsed_seconds(),
          snapshot: snapshotWasmPackedWorldRuntime(runtime, setup),
        }, requestId);

      case RUNTIME_COMMAND_TYPES.STEP_FIXED: {
        ensureRuntime();
        const dt = command.payload.dt ?? SIMULATION_STEP_S;
        if (dt !== SIMULATION_STEP_S) {
          throw new Error(`Rust/WASM Worker requires the authoritative ${SIMULATION_STEP_S} s fixed step`);
        }
        const advanced = runtime.tick_fixed();
        return event(RUNTIME_EVENT_TYPES.STEPPED, {
          advanced,
          ticks: advanced ? 1 : 0,
          elapsedSeconds: runtime.elapsed_seconds(),
          snapshot: snapshotWasmPackedWorldRuntime(runtime, setup),
        }, requestId);
      }

      case RUNTIME_COMMAND_TYPES.ADVANCE_FIXED: {
        ensureRuntime();
        const ticks = runtime.advance_fixed_steps(command.payload.steps);
        return event(RUNTIME_EVENT_TYPES.STEPPED, {
          advanced: ticks > 0,
          ticks,
          elapsedSeconds: runtime.elapsed_seconds(),
          snapshot: snapshotWasmPackedWorldRuntime(runtime, setup),
        }, requestId);
      }

      default:
        throw new Error(`Unsupported Rust/WASM Worker command '${command.type}'`);
    }
  }

  return {
    handle,
    get runtime() { return runtime; },
    get setup() { return setup; },
  };
}
