
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealtimeRuntime, REALTIME_RUNTIME_BACKENDS } from '../src/simulation/realtimeRuntime.js';
import { RUNTIME_EVENT_TYPES, createRuntimeEvent } from '../src/simulation/runtimeProtocol.js';

const world = () => ({ sites: {}, regions: {}, features: {}, resourceOccurrences: {}, systemNodes: {} });
const capabilities = () => ({ worker: true, hardwareConcurrency: 2, webAssembly: true, wasmSimd: true, sharedArrayBuffer: false, crossOriginIsolated: false, wasmThreads: false, webGpu: false, offscreenCanvas: false });

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

test('Worker crash is terminal', async () => {
  const listeners = new Map(); let terminated = false;
  const worker = { addEventListener: (type, cb) => listeners.set(type, cb), postMessage: () => queueMicrotask(() => listeners.get('error')?.({ message: 'crash' })), terminate: () => { terminated = true; } };
  const runtime = createRealtimeRuntime(world(), { capabilities: capabilities(), workerFactory: () => worker });
  await assert.rejects(runtime.ready, /crash/); assert.equal(runtime.running, false); assert.equal(terminated, true);
});

test('Worker protocol ERROR is terminal', async () => {
  const listeners = new Map(); let terminated = false;
  const worker = { addEventListener: (type, cb) => listeners.set(type, cb), postMessage: () => queueMicrotask(() => listeners.get('message')?.({ data: createRuntimeEvent(RUNTIME_EVENT_TYPES.ERROR, { message: 'wasm failed' }) })), terminate: () => { terminated = true; } };
  const runtime = createRealtimeRuntime(world(), { capabilities: capabilities(), workerFactory: () => worker });
  await assert.rejects(runtime.ready, /wasm failed/); assert.equal(runtime.running, false); assert.equal(terminated, true);
});
