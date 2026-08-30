
import test from 'node:test';
import assert from 'node:assert/strict';
import { browserRuntimeCapabilities, recommendedRuntimeBackend } from '../src/simulation/runtimeCapabilities.js';

test('runtime capability report detects Worker and WebAssembly', () => {
  const capabilities = browserRuntimeCapabilities({ Worker: class {}, WebAssembly, navigator: { hardwareConcurrency: 8 } });
  assert.equal(capabilities.worker, true);
  assert.equal(capabilities.webAssembly, true);
  assert.equal(capabilities.hardwareConcurrency, 8);
});

test('runtime policy reports unsupported instead of selecting JavaScript fallback', () => {
  assert.deepEqual(recommendedRuntimeBackend({ worker: false, webAssembly: false, wasmThreads: false, webGpu: false }), {
    supported: false, simulationThread: 'unavailable', numericCore: 'unavailable', cpuParallelism: 'unavailable', gpuCompute: 'cpu',
  });
});

test('runtime policy reports Rust/WASM Worker when required browser capabilities exist', () => {
  assert.deepEqual(recommendedRuntimeBackend({ worker: true, webAssembly: true, wasmThreads: true, webGpu: true }), {
    supported: true, simulationThread: 'worker', numericCore: 'rust-wasm', cpuParallelism: 'shared-memory-workers', gpuCompute: 'webgpu-available',
  });
});
