const WASM_SIMD_PROBE = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
  0x03, 0x02, 0x01, 0x00,
  0x0a, 0x16, 0x01, 0x14, 0x00, 0xfd, 0x0c,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x0b,
]);

export interface RuntimeCapabilities {
  worker: boolean;
  hardwareConcurrency: number;
  webAssembly: boolean;
  wasmSimd: boolean;
  sharedArrayBuffer: boolean;
  crossOriginIsolated: boolean;
  wasmThreads: boolean;
  webGpu: boolean;
  offscreenCanvas: boolean;
}

function wasmSimdAvailable(webAssemblyLike: typeof WebAssembly | undefined): boolean {
  try {
    return typeof webAssemblyLike === 'object'
      && typeof webAssemblyLike.validate === 'function'
      && webAssemblyLike.validate(WASM_SIMD_PROBE);
  } catch {
    return false;
  }
}

export function browserRuntimeCapabilities(scope: typeof globalThis = globalThis): RuntimeCapabilities {
  const navigatorLike = scope.navigator;
  const webAssemblyLike = scope.WebAssembly;
  const sharedArrayBufferAvailable = typeof scope.SharedArrayBuffer === 'function';
  const isolated = scope.crossOriginIsolated === true;
  return {
    worker: typeof scope.Worker === 'function',
    hardwareConcurrency: Number.isFinite(navigatorLike?.hardwareConcurrency)
      ? Math.max(1, Math.floor(navigatorLike.hardwareConcurrency))
      : 1,
    webAssembly: typeof webAssemblyLike === 'object',
    wasmSimd: wasmSimdAvailable(webAssemblyLike),
    sharedArrayBuffer: sharedArrayBufferAvailable,
    crossOriginIsolated: isolated,
    wasmThreads: sharedArrayBufferAvailable && isolated && typeof scope.Atomics === 'object',
    webGpu: Boolean((navigatorLike as Navigator & { gpu?: unknown } | undefined)?.gpu),
    offscreenCanvas: typeof scope.OffscreenCanvas === 'function',
  };
}
