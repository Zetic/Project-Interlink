/**
 * Browser-side Blueprint authoring model. Physical simulation state is owned
 * exclusively by the Rust/WASM Worker; this module never advances physical time.
 */

import { DEFAULT_EXTRACTOR_RATE_KG_PER_SECOND } from './extractorNode.js';
import { createZeroStream } from './materialStream.js';
import {
  defaultProcessParameters,
  getProcessDefinition,
  CRUSHING_PROCESS_ID,
  MAGNETIC_SEPARATION_PROCESS_ID,
} from '../core/processes/definitions/index.js';
import {
  getApparatusDefinition,
  validateApparatusParameters,
} from '../content/apparatus/definitions.js';
import { createApparatusNode } from './apparatus/registry.js';
import { PORT_CAPABILITIES, portCapabilityMatches } from '../core/systems/ports.js';
import { MATERIAL_FORMS } from '../core/materials/materialForms.js';

export const SIMULATION_STEP_S = 0.1;
export const DEFAULT_HOPPER_CAPACITY_KG = 1000;
export const DEFAULT_CRUSHER_THROUGHPUT_KG_PER_S = 4;
export const DEFAULT_CRUSHER_TARGET_PARTICLE_SIZE_MM = defaultProcessParameters(CRUSHING_PROCESS_ID).targetParticleSizeMm;
export const DEFAULT_MAG_SEP_THROUGHPUT_KG_PER_S = 4;
export const DEFAULT_MAG_SEP_FIELD_STRENGTH = defaultProcessParameters(MAGNETIC_SEPARATION_PROCESS_ID).fieldStrength;
// The editable Blueprint remains the authoritative, readable graph. The live
// fixed-step runtime compiles that graph into a transient execution projection
// and reuses it until a canonical topology mutation invalidates the cache.
// Nothing in these WeakMaps is serialized or changes physical state semantics.
const blueprintTopologyRevisionCache = new WeakMap<object, number>();
const blueprintPresentationRevisionCache = new WeakMap<object, number>();
const layoutPresentationRevisionCache = new WeakMap<object, number>();

function revisionFor(cache, object) {
  return object && typeof object === 'object' ? (cache.get(object) ?? 0) : 0;
}

function bumpRevision(cache, object) {
  if (!object || typeof object !== 'object') return 0;
  const revision = revisionFor(cache, object) + 1;
  cache.set(object, revision);
  return revision;
}

export function blueprintTopologyRevision(blueprint) {
  return revisionFor(blueprintTopologyRevisionCache, blueprint);
}

export function blueprintPresentationRevision(blueprint) {
  return revisionFor(blueprintPresentationRevisionCache, blueprint);
}

export function blueprintLayoutRevision(layout) {
  return revisionFor(layoutPresentationRevisionCache, layout);
}

export function invalidateBlueprintPresentation(blueprint) {
  return bumpRevision(blueprintPresentationRevisionCache, blueprint);
}

export function invalidateBlueprintLayout(layout) {
  return bumpRevision(layoutPresentationRevisionCache, layout);
}

let _nextNodeOrdinal = 1;
let _nextConnectionOrdinal = 1;
let _nextStreamOrdinal = 1;

function nextNodeId() { return `node-${_nextNodeOrdinal++}`; }
function nextConnectionId() { return `conn-${_nextConnectionOrdinal++}`; }
function nextStreamId() { return `stream-${_nextStreamOrdinal++}`; }

export function _resetOrdinals() {
  _nextNodeOrdinal = 1;
  _nextConnectionOrdinal = 1;
  _nextStreamOrdinal = 1;
}

export function invalidateBlueprintExecutionPlan(blueprint) {
  if (!blueprint || typeof blueprint !== 'object') return;
  bumpRevision(blueprintTopologyRevisionCache, blueprint);
  invalidateBlueprintPresentation(blueprint);
}

export function createBlueprint(): import('./types.js').Blueprint {
  const blueprint: import('./types.js').Blueprint = {
    nodes: {},
    connections: {},
    streams: {},
    simulationStats: {
      elapsedSeconds: 0,
      extractedKg: 0,
    },
  };
  blueprintTopologyRevisionCache.set(blueprint, 0);
  blueprintPresentationRevisionCache.set(blueprint, 0);
  return blueprint;
}

/** Add a physical world Feature as a source/opportunity node in a Site graph. */
export function blueprintAddFeatureSource(blueprint, {
  id = null,
  featureId,
  displayName = null,
  resourceOccurrenceIds = [],
} = {}) {
  if (!featureId || typeof featureId !== 'string') throw new Error('Feature source featureId must be a non-empty string');
  if (!Array.isArray(resourceOccurrenceIds)) throw new Error('Feature source resourceOccurrenceIds must be an array');
  const nodeId = id ?? `feature-node-${featureId}`;
  if (blueprint.nodes[nodeId]) throw new Error(`Blueprint node '${nodeId}' already exists`);
  const node = {
    id: nodeId,
    featureId,
    displayName: displayName ?? featureId,
    resourceOccurrenceIds: [...resourceOccurrenceIds],
    nodeType: 'feature',
    systemType: 'feature',
    kind: 'world-feature',
    resourceAccessPortId: 'resource-access',
    ports: [{
      id: 'resource-access',
      direction: 'output',
      kind: 'resource-access',
      label: 'resources',
      provides: [PORT_CAPABILITIES.RESOURCE_SOURCE],
    }],
  };
  blueprint.nodes[nodeId] = node;
  invalidateBlueprintExecutionPlan(blueprint);
  return node;
}

export function blueprintAddExtractor(
  blueprint,
  occurrenceId = null,
  rateKgPerSecond = DEFAULT_EXTRACTOR_RATE_KG_PER_SECOND,
  { enabled = false } = {}
) {
  return blueprintAddApparatus(blueprint, 'extractor', {
    occurrenceId,
    rateKgPerSecond,
    enabled,
  });
}

export function blueprintAddHopper(blueprint: import('./types.js').Blueprint, capacityKg = DEFAULT_HOPPER_CAPACITY_KG) {
  return blueprintAddApparatus(blueprint, 'hopper', { capacityKg });
}

export function blueprintAddCrusher(blueprint, {
  throughputKgPerSecond = DEFAULT_CRUSHER_THROUGHPUT_KG_PER_S,
  targetParticleSizeMm = DEFAULT_CRUSHER_TARGET_PARTICLE_SIZE_MM,
  enabled = false,
} = {}) {
  return blueprintAddApparatus(blueprint, 'crusher', {
    throughputKgPerSecond,
    targetParticleSizeMm,
    enabled,
  });
}

export function blueprintAddMagSep(blueprint, {
  fieldStrength = DEFAULT_MAG_SEP_FIELD_STRENGTH,
  throughputKgPerSecond = DEFAULT_MAG_SEP_THROUGHPUT_KG_PER_S,
  enabled = false,
} = {}) {
  return blueprintAddApparatus(blueprint, 'magSep', {
    fieldStrength,
    throughputKgPerSecond,
    enabled,
  });
}

export function blueprintAddApparatus(blueprint: import('./types.js').Blueprint, nodeType: string, parameters: Record<string, unknown> = {}) {
  const definition = getApparatusDefinition(nodeType);
  if (!definition) throw new Error(`Unknown apparatus '${nodeType}'`);

  const runtimeParameters = {
    ...definition.defaults,
    ...parameters,
    id: parameters.id ?? nextNodeId(),
  };
  for (const [canonicalId, alias] of Object.entries(definition.placementParameterAliases ?? {})) {
    if (parameters[canonicalId] == null && parameters[alias] != null) {
      runtimeParameters[canonicalId] = parameters[alias];
    }
  }

  const node = createApparatusNode(nodeType, runtimeParameters);
  validateApparatusParameters(node);
  blueprint.nodes[node.id] = node;
  invalidateBlueprintExecutionPlan(blueprint);
  return node;
}

/** Ports exposed to the current child workspace. */
export function getNodePortDefinitions(node: import('./types.js').BlueprintNode | null | undefined): import('../core/systems/types.js').SystemPort[] {
  if (!node) return [];

  if (node.nodeType === 'feature') {
    return node.ports ?? [{
      id: 'resource-access',
      direction: 'output',
      kind: 'resource-access',
      label: 'resources',
      provides: [PORT_CAPABILITIES.RESOURCE_SOURCE],
    }];
  }
  const apparatusDefinition = getApparatusDefinition(node.nodeType);
  if (apparatusDefinition && node.nodeType !== 'hopper') {
    return apparatusDefinition.ports.map(port => {
      const { runtimePortField, ...resolvedPort } = port;
      return {
        ...resolvedPort,
        id: node[runtimePortField] ?? port.id,
      };
    });
  }
  if (node.nodeType === 'hopper') {
    const solidCapability = PORT_CAPABILITIES.SOLID_PARTICULATE;
    if (node.boundaryRole === 'import') {
      return [{
        id: node.outputPortId,
        direction: 'output',
        kind: 'material',
        label: 'out',
        provides: [solidCapability, PORT_CAPABILITIES.STORED_SOLID_PARTICULATE],
      }];
    }
    if (node.boundaryRole === 'export') {
      return [{
        id: node.inputPortId,
        direction: 'input',
        kind: 'material',
        label: 'in',
        accepts: [solidCapability],
      }];
    }
    return [
      {
        id: node.inputPortId,
        direction: 'input',
        kind: 'material',
        label: 'in',
        accepts: [solidCapability],
      },
      {
        id: node.outputPortId,
        direction: 'output',
        kind: 'material',
        label: 'out',
        provides: [solidCapability, PORT_CAPABILITIES.STORED_SOLID_PARTICULATE],
      },
    ];
  }
  if (Array.isArray(node.ports)) return node.ports;

  const processDefinition = getProcessDefinition(node.processId);
  if (!processDefinition) return [];
  return [
    ...(processDefinition.inputs ?? []).map(port => ({
      id: port.id,
      direction: 'input',
      kind: port.kind,
      label: port.id,
      accepts: [PORT_CAPABILITIES.STORED_SOLID_PARTICULATE],
    })),
    ...(processDefinition.outputs ?? []).map(port => ({
      id: port.id,
      direction: 'output',
      kind: port.kind,
      label: port.id,
      provides: [PORT_CAPABILITIES.SOLID_PARTICULATE],
    })),
  ];
}

function resolveResourceAccessOccurrence(sourceNode, targetNode, requestedOccurrenceId = null) {
  const availableOccurrenceIds = [...new Set(sourceNode?.resourceOccurrenceIds ?? [])];
  if (!availableOccurrenceIds.length) {
    return { ok: false, reason: 'Feature exposes no ResourceOccurrence for extraction', occurrenceId: null };
  }

  const preferredOccurrenceId = requestedOccurrenceId ?? targetNode?.requestedOccurrenceId ?? null;
  if (preferredOccurrenceId) {
    if (!availableOccurrenceIds.includes(preferredOccurrenceId)) {
      return { ok: false, reason: 'Selected ResourceOccurrence is not available from this Feature', occurrenceId: null };
    }
    return { ok: true, reason: '', occurrenceId: preferredOccurrenceId };
  }

  if (availableOccurrenceIds.length === 1) {
    return { ok: true, reason: '', occurrenceId: availableOccurrenceIds[0] };
  }

  return {
    ok: false,
    reason: 'Feature exposes multiple ResourceOccurrences; select one for this resource-access connection',
    occurrenceId: null,
  };
}

export function checkBlueprintConnection(blueprint: import('./types.js').Blueprint, sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string, options: { occurrenceId?: string | null } = {}): import('./types.js').ConnectionCheckResult {
  const sourceNode = blueprint?.nodes?.[sourceNodeId];
  const targetNode = blueprint?.nodes?.[targetNodeId];
  if (!sourceNode) return { ok: false, reason: `Unknown source node '${sourceNodeId}'` };
  if (!targetNode) return { ok: false, reason: `Unknown target node '${targetNodeId}'` };
  if (sourceNodeId === targetNodeId) return { ok: false, reason: 'A node cannot connect to itself' };

  const sourcePort = getNodePortDefinitions(sourceNode).find(port => port.id === sourcePortId);
  const targetPort = getNodePortDefinitions(targetNode).find(port => port.id === targetPortId);
  if (!sourcePort) return { ok: false, reason: `Unknown source port '${sourcePortId}'` };
  if (!targetPort) return { ok: false, reason: `Unknown target port '${targetPortId}'` };
  if (sourcePort.direction !== 'output') return { ok: false, reason: 'Connections must start at an output port' };
  if (targetPort.direction !== 'input') return { ok: false, reason: 'Connections must end at an input port' };
  if (sourcePort.kind !== targetPort.kind) return { ok: false, reason: 'Port kinds are incompatible' };
  if (!portCapabilityMatches(sourcePort, targetPort)) return { ok: false, reason: 'Port capabilities are not supported for this connection' };

  for (const connection of Object.values(blueprint.connections ?? {})) {
    // Material outputs cannot fan out until an explicit splitter exists. A Feature's
    // resource-access interface may feed multiple extractors because it moves no matter.
    if (
      sourcePort.kind === 'material'
      && connection.sourceNodeId === sourceNodeId
      && connection.sourcePortId === sourcePortId
    ) {
      return { ok: false, reason: 'This material output is already connected; use an explicit splitter for fan-out' };
    }
    if (connection.targetNodeId === targetNodeId && connection.targetPortId === targetPortId) {
      return { ok: false, reason: 'This input port is already connected' };
    }
  }

  if (sourcePort.kind === 'resource-access') {
    const resourceAccess = resolveResourceAccessOccurrence(sourceNode, targetNode, options.occurrenceId);
    if (!resourceAccess.ok) return resourceAccess;
    return { ok: true, reason: '', occurrenceId: resourceAccess.occurrenceId };
  }

  return { ok: true, reason: '' };
}

export function blueprintConnect(blueprint: import('./types.js').Blueprint, sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string, options: { occurrenceId?: string | null } = {}) {
  const compatibility = checkBlueprintConnection(
    blueprint,
    sourceNodeId,
    sourcePortId,
    targetNodeId,
    targetPortId,
    options,
  );
  if (!compatibility.ok) return null;

  const sourceNode = blueprint.nodes[sourceNodeId];
  const targetNode = blueprint.nodes[targetNodeId];
  const sourcePort = getNodePortDefinitions(sourceNode).find(port => port.id === sourcePortId);
  const id = nextConnectionId();
  const connection = {
    id,
    sourceNodeId,
    sourcePortId,
    targetNodeId,
    targetPortId,
    kind: sourcePort.kind,
    ...(sourcePort.kind === 'resource-access' ? { occurrenceId: compatibility.occurrenceId } : {}),
  };
  blueprint.connections[id] = connection;

  // The connection is authoritative for source selection. occurrenceId on the
  // Extractor is only a synchronized presentation value for existing UI code.
  if (sourcePort.kind === 'resource-access' && targetNode?.nodeType === 'extractor') {
    targetNode.occurrenceId = compatibility.occurrenceId;
  }

  // Resource-access edges are relationships, not matter in transit. Only a material
  // connection owns a MaterialStream rate/state object.
  if (sourcePort.kind === 'material') {
    const streamId = nextStreamId();
    blueprint.streams[streamId] = createZeroStream({
      id: streamId,
      connectionId: id,
      sourceNodeId,
      sourcePortId,
      targetNodeId,
      targetPortId,
      physicalForm: sourcePort.provides?.includes(PORT_CAPABILITIES.GAS)
        ? MATERIAL_FORMS.GAS
        : MATERIAL_FORMS.SOLID_PARTICULATE,
    });
  }
  invalidateBlueprintExecutionPlan(blueprint);
  return connection;
}

export function blueprintDisconnect(blueprint: import('./types.js').Blueprint, connectionId: string): void {
  const connection = blueprint.connections?.[connectionId];
  if (connection?.kind === 'resource-access') {
    const targetNode = blueprint.nodes?.[connection.targetNodeId];
    if (targetNode?.nodeType === 'extractor' && targetNode.occurrenceId === connection.occurrenceId) {
      targetNode.occurrenceId = null;
    }
  }
  delete blueprint.connections[connectionId];
  for (const [streamId, stream] of Object.entries(blueprint.streams)) {
    if (stream.connectionId === connectionId) delete blueprint.streams[streamId];
  }
  invalidateBlueprintExecutionPlan(blueprint);
}

export function getStreamForConnection(blueprint: import('./types.js').Blueprint, connectionId: string): import('./types.js').MaterialStream | null {
  return Object.values(blueprint?.streams ?? {}).find(stream => stream.connectionId === connectionId) ?? null;
}

export function setNodeEnabled(blueprint: import('./types.js').Blueprint, nodeId: string, enabled: boolean) {
  const node = blueprint?.nodes?.[nodeId];
  if (!node) throw new Error(`Unknown node '${nodeId}'`);
  if (typeof node.enabled !== 'boolean') throw new Error(`Node '${nodeId}' is not active machinery`);
  if (typeof enabled !== 'boolean') throw new Error('enabled must be boolean');
  node.enabled = enabled;
  if (!enabled) node.operatingState = 'off';
  else if (node.operatingState === 'off') node.operatingState = 'idle';
  invalidateBlueprintPresentation(blueprint);
  return node;
}

export function setApparatusParameter(blueprint: import('./types.js').Blueprint, nodeId: string, parameterId: string, value: unknown) {
  const node = blueprint?.nodes?.[nodeId];
  if (!node) throw new Error(`Unknown node '${nodeId}'`);
  const normalized = validateApparatusParameters(node, { [parameterId]: value });
  if (!Object.hasOwn(normalized, parameterId)) {
    throw new Error(`Unknown apparatus parameter '${parameterId}' for '${node.nodeType}'`);
  }
  node[parameterId] = normalized[parameterId];
  invalidateBlueprintPresentation(blueprint);
  return node;
}

export function getNodeOperatingState(node: import('./types.js').BlueprintNode | null | undefined): string | null {
  if (!node) return null;
  const projected = node.runtimePresentation?.operatingState;
  if (typeof projected === 'string') return projected;
  if (typeof node.enabled === 'boolean') return node.enabled ? (node.operatingState ?? 'idle') : 'off';
  return null;
}

export function createBlueprintLayout(): import('./types.js').BlueprintLayout {
  const layout: import('./types.js').BlueprintLayout = { nodePositions: {} };
  layoutPresentationRevisionCache.set(layout, 0);
  return layout;
}

export function layoutMoveNode(layout: import('./types.js').BlueprintLayout, nodeId: string, x: number, y: number) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Layout coordinates must be finite numbers');
  layout.nodePositions[nodeId] = { x, y };
  invalidateBlueprintLayout(layout);
}