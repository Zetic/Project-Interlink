/** Optional observer hook for apparatus timing. Simulation behavior never depends on profiler output. */

let apparatusProfiler = null;

export function setApparatusProfiler(profiler) {
  if (profiler != null && typeof profiler !== 'function') {
    throw new Error('Apparatus profiler must be a function or null');
  }
  apparatusProfiler = profiler;
}

export function runApparatusSimulationWithOptionalProfiling(nodeType, nodeId, simulate, args) {
  if (!apparatusProfiler) return simulate(...args);
  return apparatusProfiler(nodeType, nodeId, simulate, args);
}
