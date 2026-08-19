/**
 * Stable player-facing node categories.
 *
 * Category answers "what kind of thing is this?" and intentionally stays
 * separate from subtype (Crusher, Hopper, Mineral Deposit, etc.) and from
 * operating state (running, blocked, off, etc.).
 */

export const NODE_CATEGORIES = Object.freeze({
  PLANET: Object.freeze({ key: 'planet', label: 'PLANET' }),
  REGION: Object.freeze({ key: 'region', label: 'REGION' }),
  SITE: Object.freeze({ key: 'site', label: 'SITE' }),
  FACILITY: Object.freeze({ key: 'facility', label: 'FACILITY' }),
  FEATURE: Object.freeze({ key: 'feature', label: 'FEATURE' }),
  APPARATUS: Object.freeze({ key: 'apparatus', label: 'APPARATUS' }),
  CONTAINER: Object.freeze({ key: 'container', label: 'CONTAINER' }),
  BOUNDARY: Object.freeze({ key: 'boundary', label: 'BOUNDARY' }),
  PROCESS: Object.freeze({ key: 'process', label: 'PROCESS' }),
  SENSOR: Object.freeze({ key: 'sensor', label: 'SENSOR' }),
  CONTROLLER: Object.freeze({ key: 'controller', label: 'CONTROLLER' }),
  LOGISTICS: Object.freeze({ key: 'logistics', label: 'LOGISTICS' }),
  SYSTEM: Object.freeze({ key: 'system', label: 'SYSTEM' }),
});

const CONTAINER_TYPES = new Set(['hopper', 'container', 'tank', 'silo', 'storage']);
const PROCESS_TYPES = new Set(['process']);
const SENSOR_TYPES = new Set(['sensor']);
const CONTROLLER_TYPES = new Set(['controller']);
const LOGISTICS_TYPES = new Set(['logistics', 'transport']);

function normalized(value) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Resolve the visual recognition category for any graph source node.
 * Unknown composite/system types deliberately fall back to SYSTEM rather than
 * inventing a new category from the node subtype.
 */
export function nodeCategory(node) {
  if (!node) return NODE_CATEGORIES.SYSTEM;

  const nodeType = normalized(node.nodeType);
  const systemType = normalized(node.systemType);

  if (node.boundaryRole || systemType === 'boundary-buffer') return NODE_CATEGORIES.BOUNDARY;
  if (nodeType === 'planet') return NODE_CATEGORIES.PLANET;
  if (nodeType === 'region') return NODE_CATEGORIES.REGION;
  if (nodeType === 'site') return NODE_CATEGORIES.SITE;
  if (nodeType === 'facility') return NODE_CATEGORIES.FACILITY;
  if (nodeType === 'feature') return NODE_CATEGORIES.FEATURE;

  if (PROCESS_TYPES.has(nodeType) || PROCESS_TYPES.has(systemType)) return NODE_CATEGORIES.PROCESS;
  if (SENSOR_TYPES.has(nodeType) || SENSOR_TYPES.has(systemType)) return NODE_CATEGORIES.SENSOR;
  if (CONTROLLER_TYPES.has(nodeType) || CONTROLLER_TYPES.has(systemType)) return NODE_CATEGORIES.CONTROLLER;
  if (LOGISTICS_TYPES.has(nodeType) || LOGISTICS_TYPES.has(systemType)) return NODE_CATEGORIES.LOGISTICS;
  if (CONTAINER_TYPES.has(nodeType) || CONTAINER_TYPES.has(systemType)) return NODE_CATEGORIES.CONTAINER;

  // Current extractor/crusher/separator nodes are physical apparatus executing
  // processes; they are not themselves abstract Process nodes.
  if (nodeType === 'apparatus' || systemType === 'apparatus' || node.kind === 'primitive') {
    return NODE_CATEGORIES.APPARATUS;
  }

  return NODE_CATEGORIES.SYSTEM;
}
