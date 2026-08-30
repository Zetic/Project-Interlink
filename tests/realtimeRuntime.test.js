
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealtimeRuntime, REALTIME_RUNTIME_BACKENDS } from '../src/simulation/realtimeRuntime.js';
import { RUNTIME_COMMAND_TYPES, RUNTIME_EVENT_TYPES, createRuntimeEvent } from '../src/simulation/runtimeProtocol.js';

const world = () => ({ sites: {}, regions: {}, features: {}, resourceOccurrences: {}, systemNodes: {} });
const capabilities = () => ({ worker: true, hardwareConcurrency: 2, webAssembly: true, wasmSimd: true, sharedArrayBuffer: false, crossOriginIsolated: false, wasmThreads: false, webGpu: false, offscreenCanvas: false });

function workerHarness(onCommand) {
  const listeners = new Map();
  let terminated = false;
  const worker = {
    addEventListener: (type, cb) => listeners.set(type, cb),
    postMessage: command => onCommand(command, runtimeEvent => {
      queueMicrotask(() => listeners.get('message')?.({ data: runtimeEvent }));
    }, listeners),
    terminate: () => { terminated = true; },
  };
  return { worker, get terminated() { return terminated; } };
}

function readyEvent(command) {
  return createRuntimeEvent(RUNTIME_EVENT_TYPES.READY, {
    running: true,
    elapsedSeconds: 0,
    snapshot: { running: true, elapsedSeconds: 0, sites: [], hoppers: [], occurrences: [], machines: [], exhaustVents: [], passiveLinks: [], boundaryTransfers: [] },
  }, command.requestId);
}

test('unsupported browsers fail instead of selecting a JavaScript simulation backend', () => {
  assert.throws(() => createRealtimeRuntime(world(), { capabilities: { worker: false, webAssembly: true } }), /requires a browser with Web Worker and WebAssembly support/);
  assert.throws(() => createRealtimeRuntime(world(), { capabilities: { worker: true, webAssembly: false } }), /requires a browser with Web Worker and WebAssembly support/);
});

test('auto selects the only production backend: rust-wasm-worker', async () => {
  const worker = { addEventListener() {}, postMessage() {}, terminate() {} };
  const runtime = createRealtimeRuntime(world(), { workerFactory: () => worker, capabilities: capabilities() });
  const pending = runtime.ready.catch(error => error);
  assert.equal(runtime.backend, REALTIME_RUNTIME_BACKENDS.RUST_WASM_WORKER);
  runtime.dispose();
  assert.match((await pending).message, /disposed/);
});

test('non-Rust backend requests are rejected', () => {
  assert.throws(() => createRealtimeRuntime(world(), { backend: 'main-thread-compiled', capabilities: capabilities() }), /requires rust-wasm-worker/);
});

test('request IDs resolve concurrent out-of-order Worker responses to the correct callers', async () => {
  let pauseCommand = null;
  const harness = workerHarness((command, emit) => {
    if (command.type === RUNTIME_COMMAND_TYPES.INIT) return emit(readyEvent(command));
    if (command.type === RUNTIME_COMMAND_TYPES.PAUSE) {
      pauseCommand = command;
      return;
    }
    if (command.type === RUNTIME_COMMAND_TYPES.QUERY_DETAIL) {
      emit(createRuntimeEvent(RUNTIME_EVENT_TYPES.DETAIL, {
        ok: true,
        detail: { kind: 'hopper', id: 'hopper-a', storedMassKg: 7 },
      }, command.requestId));
      emit(createRuntimeEvent(RUNTIME_EVENT_TYPES.RUN_STATE, {
        running: false,
        elapsedSeconds: 0,
      }, pauseCommand.requestId));
    }
  });
  const runtime = createRealtimeRuntime(world(), { capabilities: capabilities(), workerFactory: () => harness.worker });
  await runtime.ready;
  const paused = runtime.pause();
  const detail = runtime.queryDetail('hopper', 'hopper-a');
  assert.equal((await detail).storedMassKg, 7);
  assert.equal(await paused, true);
  runtime.dispose();
});

test('detail query failure is non-terminal and physics can continue', async () => {
  const harness = workerHarness((command, emit) => {
    if (command.type === RUNTIME_COMMAND_TYPES.INIT) return emit(readyEvent(command));
    if (command.type === RUNTIME_COMMAND_TYPES.QUERY_DETAIL) {
      return emit(createRuntimeEvent(RUNTIME_EVENT_TYPES.DETAIL, {
        ok: false,
        error: { message: 'unknown hopper' },
      }, command.requestId));
    }
    if (command.type === RUNTIME_COMMAND_TYPES.STEP_FIXED) {
      return emit(createRuntimeEvent(RUNTIME_EVENT_TYPES.STEPPED, {
        advanced: true,
        ticks: 1,
        elapsedSeconds: 0.1,
        snapshot: { running: true, elapsedSeconds: 0.1, sites: [], hoppers: [], occurrences: [], machines: [], exhaustVents: [], passiveLinks: [], boundaryTransfers: [] },
      }, command.requestId));
    }
  });
  const runtime = createRealtimeRuntime(world(), { capabilities: capabilities(), workerFactory: () => harness.worker });
  await runtime.ready;
  await assert.rejects(runtime.queryDetail('hopper', 'missing'), /unknown hopper/);
  assert.equal(runtime.error, null);
  assert.equal(runtime.running, true);
  assert.equal((await runtime.stepFixed()).advanced, true);
  assert.equal(harness.terminated, false);
  runtime.dispose();
});

test('Worker crash is terminal', async () => {
  const listeners = new Map(); let terminated = false;
  const worker = { addEventListener: (type, cb) => listeners.set(type, cb), postMessage: () => queueMicrotask(() => listeners.get('error')?.({ message: 'crash' })), terminate: () => { terminated = true; } };
  const runtime = createRealtimeRuntime(world(), { capabilities: capabilities(), workerFactory: () => worker });
  await assert.rejects(runtime.ready, /crash/); assert.equal(runtime.running, false); assert.equal(terminated, true);
});

test('Worker protocol ERROR is terminal', async () => {
  const harness = workerHarness((command, emit) => emit(createRuntimeEvent(
    RUNTIME_EVENT_TYPES.ERROR,
    { message: 'wasm failed' },
    command.requestId,
  )));
  const runtime = createRealtimeRuntime(world(), { capabilities: capabilities(), workerFactory: () => harness.worker });
  await assert.rejects(runtime.ready, /wasm failed/);
  assert.equal(runtime.running, false);
  assert.equal(harness.terminated, true);
});
