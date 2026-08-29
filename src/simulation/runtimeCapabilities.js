const WASM_SIMD_PROBE = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
  0x03, 0x02, 0x01, 0x00,
  0x0a, 0x16, 0x01, 0x14, 0x00, 0xfd, 0x0c,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x0b,
]);

function wasmSimdAvailable(webAssemblyLike) {
  try {
    return typeof webAssemblyLike === 'object'
      && typeof webAssemblyLike.validate === 'function'
      && webAssemblyLike.validate(WASM_SIMD_PROBE);
  } catch {
    return false;
  }
}

/**
 * Runtime-only feature detection for the acceleration architecture. This is a
 * capability report, not a policy decision: the simulation must still choose a
 * backend based on workload shape rather than blindly using every available API.
 */
export function browserRuntimeCapabilities(scope = globalThis) {
  const navigatorLike = scope?.navigator ?? {};
  const webAssemblyLike = scope?.WebAssembly;
  const hasSharedArrayBuffer = typeof scope?.SharedArrayBuffer === 'function';
  const crossOriginIsolated = scope?.crossOriginIsolated === true;
  return {
    worker: typeof scope?.Worker === 'function',
    hardwareConcurrency: Number.isFinite(navigatorLike.hardwareConcurrency)
      ? Math.max(1, Math.floor(navigatorLike.hardwareConcurrency))
      : 1,
    webAssembly: typeof webAssemblyLike === 'object',
    wasmSimd: wasmSimdAvailable(webAssemblyLike),
    sharedArrayBuffer: hasSharedArrayBuffer,
    crossOriginIsolated,
    wasmThreads: hasSharedArrayBuffer && crossOriginIsolated && typeof scope?.Atomics === 'object',
    webGpu: Boolean(navigatorLike.gpu),
    offscreenCanvas: typeof scope?.OffscreenCanvas === 'function',
  };
}

export function recommendedRuntimeBackend(capabilities = browserRuntimeCapabilities()) {
  return {
    simulationThread: capabilities.worker ? 'worker' : 'main-thread',
    numericCore: capabilities.webAssembly ? 'wasm-ready' : 'javascript',
    cpuParallelism: capabilities.wasmThreads
      ? 'shared-memory-workers'
      : (capabilities.worker ? 'message-workers' : 'single-thread'),
    gpuCompute: capabilities.webGpu ? 'webgpu-available' : 'cpu-fallback',
  };
}
