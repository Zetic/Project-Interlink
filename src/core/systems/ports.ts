/**
 * Neutral port helpers shared by recursive world nodes and apparatus.
 *
 * Port capabilities refine a connection kind without coupling the graph to a
 * particular node implementation. Existing callers may continue to use only
 * kind, direction, and labels.
 */

export function portCapabilityMatches(sourcePort, targetPort) {
  const provided = sourcePort?.provides ?? [];
  const accepted = targetPort?.accepts ?? [];
  if (!provided.length || !accepted.length) return true;
  return provided.some(capability => accepted.includes(capability));
}

export const PORT_CAPABILITIES = Object.freeze({
  RESOURCE_SOURCE: 'resource-source',
  SOLID_PARTICULATE: 'solid-particulate',
  GAS: 'gas',
  // Solid flow whose rate is explicitly governed by upstream transport/process
  // machinery. Continuous reactors can require this interface so residence time
  // derives from controlled flow instead of the reactor pulling from storage.
  METERED_SOLID_PARTICULATE: 'metered-solid-particulate',
  // Interface requirement, not provenance: the receiving process requires a
  // buffered/withdrawable particulate owner. Matter does not become a different
  // physical form merely because it is stored in a Hopper or boundary buffer.
  STORED_SOLID_PARTICULATE: 'stored-solid-particulate',
});

export function normalizePortCapabilities(capabilities) {
  if (capabilities == null) return [];
  if (!Array.isArray(capabilities) || capabilities.some(capability => typeof capability !== 'string' || !capability)) {
    throw new Error('Port capabilities must be an array of non-empty strings');
  }
  return [...new Set(capabilities)];
}
