import test from 'node:test';
import assert from 'node:assert/strict';

import {
  browserRuntimeCapabilities,
  recommendedRuntimeBackend,
} from '../src/simulation/runtimeCapabilities.js';

test('runtime capability report distinguishes worker, shared-memory, and WebGPU support', () => {
  class FakeWorker {}
  class FakeSharedArrayBuffer {}
  class FakeOffscreenCanvas {}
  const scope = {
    Worker: FakeWorker,
    SharedArrayBuffer: FakeSharedArrayBuffer,
    OffscreenCanvas: FakeOffscreenCanvas,
    Atomics: {},
    WebAssembly,
    crossOriginIsolated: true,
    navigator: {
      hardwareConcurrency: 8,
      gpu: {},
    },
  };

  const capabilities = browserRuntimeCapabilities(scope);
  assert.equal(capabilities.worker, true);
  assert.equal(capabilities.hardwareConcurrency, 8);
  assert.equal(capabilities.webAssembly, true);
  assert.equal(capabilities.sharedArrayBuffer, true);
  assert.equal(capabilities.crossOriginIsolated, true);
  assert.equal(capabilities.wasmThreads, true);
  assert.equal(capabilities.webGpu, true);
  assert.equal(capabilities.offscreenCanvas, true);
});

test('runtime backend policy does not require unavailable accelerators', () => {
  const backend = recommendedRuntimeBackend({
    worker: false,
    webAssembly: false,
    wasmThreads: false,
    webGpu: false,
  });
  assert.deepEqual(backend, {
    simulationThread: 'main-thread',
    numericCore: 'javascript',
    cpuParallelism: 'single-thread',
    gpuCompute: 'cpu-fallback',
  });
});

test('runtime backend policy prefers worker and shared-memory CPU execution when supported', () => {
  const backend = recommendedRuntimeBackend({
    worker: true,
    webAssembly: true,
    wasmThreads: true,
    webGpu: true,
  });
  assert.deepEqual(backend, {
    simulationThread: 'worker',
    numericCore: 'wasm-ready',
    cpuParallelism: 'shared-memory-workers',
    gpuCompute: 'webgpu-available',
  });
});
