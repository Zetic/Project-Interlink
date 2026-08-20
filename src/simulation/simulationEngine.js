/**
 * Fixed-timestep Site simulation. Physical material state lives in blueprint
 * runtime objects; node layout and viewport state live separately in UI state.
 */

import { DEFAULT_EXTRACTOR_RATE_KG_PER_SECOND } from './extractorNode.js';
import {
  hopperFreeCapacityKg,
  hopperStoredMassKg,
  hopperReceiveInflow,
  hopperWithdraw,
  cloneHopperMaterialState,
  commitHopperMaterialState,
  HOPPER_TOLERANCE_KG,
} from './hopperNode.js';
import {
  createZeroStream,
  setMaterialStreamState,
} from './materialStream.js';
import {
  createSolidMaterialState,
  multiplySolidMaterialState,
} from '../core/materials/solids/solidMaterialState.js';
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
import { createApparatusRuntime, apparatusRuntimeFor } from './apparatus/registry.js';
import { PORT_CAPABILITIES, portCapabilityMatches } from '../core/systems/ports.js';

export const SIMULATION_STEP_S = 0.1;
export const DEFAULT_HOPPER_CAPACITY_KG = 1000;
export const DEFAULT_CRUSHER_THROUGHPUT_KG_PER_S = 4;
export const DEFAULT_CRUSHER_TARGET_PARTICLE_SIZE_MM = defaultProcessParameters(CRUSHING_PROCESS_ID).targetParticleSizeMm;
export const DEFAULT_MAG_SEP_THROUGHPUT_KG_PER_S = 4;
export const DEFAULT_MAG_SEP_FIELD_STRENGTH = defaultProcessParameters(MAGNETIC_SEPARATION_PROCESS_ID).fieldStrength;
export const DEFAULT_PASSIVE_STORAGE_TRANSFER_KG_PER_S = 10;

const TRANSFER_TOLERANCE_KG = 1e-8;

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

export function createBlueprint() {
  return {
    nodes: {},
    connections: {},
    streams: {},
    simulationStats: {
      elapsedSeconds: 0,
      extractedKg: 0,
    },
  };
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

export function blueprintAddHopper(blueprint, capacityKg = DEFAULT_HOPPER_CAPACITY_KG) {
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

export function blueprintAddApparatus(blueprint, nodeType, parameters = {}) {
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

  const node = createApparatusRuntime(nodeType, runtimeParameters);
  validateApparatusParameters(node);
  blueprint.nodes[node.id] = node;
  return node;
}

/** Ports exposed to the current child workspace. */
export function getNodePortDefinitions(node) {
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

function isExplicitBoundaryStorageTransition(sourceNode, targetNode) {
  return sourceNode?.nodeType === 'hopper'
    && targetNode?.nodeType === 'hopper'
    && (sourceNode.boundaryRole === 'import' || targetNode.boundaryRole === 'export');
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

export function checkBlueprintConnection(blueprint, sourceNodeId, sourcePortId, targetNodeId, targetPortId, options = {}) {
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

export function blueprintConnect(blueprint, sourceNodeId, sourcePortId, targetNodeId, targetPortId, options = {}) {
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
    });
  }
  return connection;
}

export function blueprintDisconnect(blueprint, connectionId) {
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
}

export function getStreamForConnection(blueprint, connectionId) {
  return Object.values(blueprint.streams).find(stream => stream.connectionId === connectionId) ?? null;
}

function findInboundConnection(blueprint, targetNodeId, targetPortId) {
  return Object.values(blueprint.connections).find(
    connection => connection.targetNodeId === targetNodeId && connection.targetPortId === targetPortId
  ) ?? null;
}

function findOutboundConnection(blueprint, sourceNodeId, sourcePortId) {
  return Object.values(blueprint.connections).find(
    connection => connection.sourceNodeId === sourceNodeId && connection.sourcePortId === sourcePortId
  ) ?? null;
}

function updateConnectionStream(blueprint, connection, solidState) {
  if (!connection) return;
  const stream = getStreamForConnection(blueprint, connection.id);
  if (stream) setMaterialStreamState(stream, solidState);
}

function zeroAllStreams(blueprint) {
  for (const stream of Object.values(blueprint.streams)) setMaterialStreamState(stream, createSolidMaterialState());
}

function proportionalSolidStateFromHopper(hopper, requestedTotalRateKgPerSecond) {
  const storedMassKg = hopperStoredMassKg(hopper);
  if (storedMassKg <= HOPPER_TOLERANCE_KG || requestedTotalRateKgPerSecond <= 0) return createSolidMaterialState();
  return multiplySolidMaterialState(hopper.materialBody.solidState, requestedTotalRateKgPerSecond / storedMassKg);
}

function assertTransferAccepted(expectedKg, acceptedKg, context) {
  if (Math.abs(expectedKg - acceptedKg) > TRANSFER_TOLERANCE_KG * Math.max(1, expectedKg)) {
    throw new Error(`${context} could not commit its planned output atomically`);
  }
}

function capacityScaleForOutput(freeCapacityKg, componentRates, dt) {
  const requiredKg = totalMassFlowKgPerSecond(componentRates) * dt;
  if (requiredKg <= TRANSFER_TOLERANCE_KG) return 1;
  return Math.max(0, Math.min(1, freeCapacityKg / requiredKg));
}

function simulateExplicitBoundaryStorageLinks(blueprint, dt) {
  for (const connection of Object.values(blueprint.connections)) {
    if (connection.kind !== 'material') continue;
    const source = blueprint.nodes[connection.sourceNodeId];
    const target = blueprint.nodes[connection.targetNodeId];
    if (!isExplicitBoundaryStorageTransition(source, target)) continue;

    const availableKg = hopperStoredMassKg(source);
    const freeKg = hopperFreeCapacityKg(target);
    if (availableKg <= HOPPER_TOLERANCE_KG || freeKg <= HOPPER_TOLERANCE_KG) continue;

    const rate = Math.min(DEFAULT_PASSIVE_STORAGE_TRANSFER_KG_PER_S, availableKg / dt, freeKg / dt);
    if (rate <= TRANSFER_TOLERANCE_KG) continue;

    const rates = proportionalSolidStateFromHopper(source, rate);
    const stagedSource = cloneHopperMaterialState(source);
    const stagedTarget = cloneHopperMaterialState(target);
    const withdrawal = hopperWithdraw(stagedSource, rate, dt);
    if (withdrawal.actualTotalKg <= TRANSFER_TOLERANCE_KG) continue;

    const actualFlow = multiplySolidMaterialState(withdrawal.actualSolidState, 1 / dt);
    const acceptedKg = hopperReceiveInflow(stagedTarget, actualFlow, dt);
    assertTransferAccepted(withdrawal.actualTotalKg, acceptedKg, 'Boundary storage link');
    commitHopperMaterialState(source, stagedSource);
    commitHopperMaterialState(target, stagedTarget);
    updateConnectionStream(blueprint, connection, actualFlow);
  }
}

export function simulationTick(blueprint, world, dt = SIMULATION_STEP_S) {
  if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) throw new Error('Simulation dt must be a finite positive number');
  zeroAllStreams(blueprint);
  let extractedThisTickKg = 0;

  const nodes = Object.values(blueprint.nodes);
  const runtimeByNode = new Map(nodes.map(node => [node, apparatusRuntimeFor(node.nodeType)]));
  const phases = [...new Set(
    nodes
      .map(node => runtimeByNode.get(node)?.phase)
      .filter(Number.isFinite)
  )].sort((a, b) => a - b);
  for (const phase of phases) {
    for (const node of nodes) {
      const runtime = runtimeByNode.get(node);
      if (runtime?.phase !== phase || typeof runtime.simulate !== 'function') continue;
      const result = runtime.simulate(blueprint, world, node, dt);
      if (node.nodeType === 'extractor') extractedThisTickKg += result ?? 0;
    }
  }
  simulateExplicitBoundaryStorageLinks(blueprint, dt);

  blueprint.simulationStats.elapsedSeconds += dt;
  blueprint.simulationStats.extractedKg += extractedThisTickKg;
  return { extractedKg: extractedThisTickKg };
}

export function simulationAdvance(blueprint, world, elapsedSeconds, dt = SIMULATION_STEP_S) {
  if (typeof elapsedSeconds !== 'number' || !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new Error('elapsedSeconds must be a finite non-negative number');
  }
  if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) throw new Error('Simulation dt must be a finite positive number');
  const ticks = Math.floor((elapsedSeconds + 1e-12) / dt);
  for (let i = 0; i < ticks; i++) simulationTick(blueprint, world, dt);
  return ticks;
}

export function setNodeEnabled(blueprint, nodeId, enabled) {
  const node = blueprint?.nodes?.[nodeId];
  if (!node) throw new Error(`Unknown node '${nodeId}'`);
  if (typeof apparatusRuntimeFor(node.nodeType)?.simulate !== 'function') throw new Error(`Node '${nodeId}' is not active machinery`);
  if (typeof enabled !== 'boolean') throw new Error('enabled must be boolean');
  node.enabled = enabled;
  if (!enabled) node.operatingState = 'off';
  else if (node.operatingState === 'off') node.operatingState = 'idle';
  return node;
}

export function setApparatusParameter(blueprint, nodeId, parameterId, value) {
  const node = blueprint?.nodes?.[nodeId];
  if (!node) throw new Error(`Unknown node '${nodeId}'`);
  const normalized = validateApparatusParameters(node, { [parameterId]: value });
  if (!Object.hasOwn(normalized, parameterId)) {
    throw new Error(`Unknown apparatus parameter '${parameterId}' for '${node.nodeType}'`);
  }
  node[parameterId] = normalized[parameterId];
  return node;
}

export function getNodeOperatingState(node) {
  if (!node) return null;
  if (typeof apparatusRuntimeFor(node.nodeType)?.simulate === 'function') return node.enabled ? (node.operatingState ?? 'idle') : 'off';
  return null;
}

export function createBlueprintLayout() {
  return { nodePositions: {} };
}

export function layoutMoveNode(layout, nodeId, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Layout coordinates must be finite numbers');
  layout.nodePositions[nodeId] = { x, y };
}
