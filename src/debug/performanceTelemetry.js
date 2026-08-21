/** Debug-only performance telemetry. Never participates in simulation decisions or serialization. */

const MAX_SAMPLES_PER_TYPE = 512;

let deepProfilingEnabled = false;
let totalProfileDurationMs = 0;
let totalProfileCalls = 0;
const profilesByType = new Map();

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

function recordSample(nodeType, nodeId, durationMs) {
  let profile = profilesByType.get(nodeType);
  if (!profile) {
    profile = {
      nodeType,
      calls: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
      samples: [],
      byNode: new Map(),
    };
    profilesByType.set(nodeType, profile);
  }
  profile.calls += 1;
  profile.totalDurationMs += durationMs;
  profile.maxDurationMs = Math.max(profile.maxDurationMs, durationMs);
  profile.samples.push(durationMs);
  if (profile.samples.length > MAX_SAMPLES_PER_TYPE) profile.samples.shift();

  if (nodeId) {
    const node = profile.byNode.get(nodeId) ?? { calls: 0, totalDurationMs: 0, maxDurationMs: 0 };
    node.calls += 1;
    node.totalDurationMs += durationMs;
    node.maxDurationMs = Math.max(node.maxDurationMs, durationMs);
    profile.byNode.set(nodeId, node);
  }
  totalProfileCalls += 1;
  totalProfileDurationMs += durationMs;
}

export function setDeepProfilingEnabled(enabled) {
  deepProfilingEnabled = Boolean(enabled);
}

export function isDeepProfilingEnabled() {
  return deepProfilingEnabled;
}

/**
 * Time one apparatus call only when deep profiling is explicitly enabled.
 * The disabled path deliberately avoids even reading the clock.
 */
export function profileApparatusCall(nodeType, nodeId, simulate, args) {
  if (!deepProfilingEnabled) return simulate(...args);
  const start = nowMs();
  try {
    return simulate(...args);
  } finally {
    recordSample(nodeType, nodeId, nowMs() - start);
  }
}

export function resetPerformanceTelemetry() {
  totalProfileDurationMs = 0;
  totalProfileCalls = 0;
  profilesByType.clear();
}

export function performanceTelemetrySnapshot() {
  const byType = [...profilesByType.values()].map(profile => ({
    nodeType: profile.nodeType,
    calls: profile.calls,
    totalDurationMs: profile.totalDurationMs,
    averageDurationMs: profile.calls ? profile.totalDurationMs / profile.calls : 0,
    p95DurationMs: percentile(profile.samples, 0.95),
    maxDurationMs: profile.maxDurationMs,
    slowestNodes: [...profile.byNode.entries()]
      .map(([nodeId, value]) => ({
        nodeId,
        calls: value.calls,
        averageDurationMs: value.calls ? value.totalDurationMs / value.calls : 0,
        maxDurationMs: value.maxDurationMs,
      }))
      .sort((a, b) => b.averageDurationMs - a.averageDurationMs)
      .slice(0, 5),
  })).sort((a, b) => b.totalDurationMs - a.totalDurationMs);

  return {
    deepProfilingEnabled,
    totalProfileDurationMs,
    totalProfileCalls,
    byType,
  };
}
