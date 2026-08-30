import {
  browserRuntimeCapabilities,
  recommendedRuntimeBackend,
} from '../../simulation/runtimeCapabilities.js';

function setText(root, name, value) {
  const element = root?.querySelector?.(`[data-debug-stat="${name}"]`);
  if (element) element.textContent = value;
}

function yesNo(value) {
  return value ? 'Available' : 'Unavailable';
}

/** Static browser/runtime facts; no polling is required. */
export function installRuntimeDebugStats(root, scope = globalThis) {
  if (!root) return null;
  const capabilities = browserRuntimeCapabilities(scope);
  const recommendation = recommendedRuntimeBackend(capabilities);
  setText(root, 'runtime-backend', 'Rust/WASM Worker');
  setText(root, 'logical-cpus', String(capabilities.hardwareConcurrency));
  setText(root, 'worker-capability', yesNo(capabilities.worker));
  setText(
    root,
    'wasm-capability',
    capabilities.webAssembly
      ? `Available${capabilities.wasmSimd ? ' + SIMD' : ''}`
      : 'Unavailable',
  );
  setText(
    root,
    'thread-capability',
    capabilities.wasmThreads
      ? 'Available'
      : (capabilities.sharedArrayBuffer ? 'Needs isolation' : 'Unavailable'),
  );
  setText(root, 'webgpu-capability', yesNo(capabilities.webGpu));
  setText(root, 'offscreen-capability', yesNo(capabilities.offscreenCanvas));
  return { capabilities, recommendation };
}
