/**
 * Fixed-timestep Site simulation. Physical material state lives in blueprint
 * runtime objects; node layout and viewport state live separately in UI state.
 */

import {
  createExtractor,
  extractorOccurrenceEligibility,
  extractorOutputRates,
  DEFAULT_EXTRACTOR_RATE_KG_PER_SECOND,
} from './extractorNode.js';
import {
  createHopper,
  hopperFreeCapacityKg,
  hopperStoredMassKg,
  hopperReceiveInflow,
  hopperWithdraw,
  cloneHopperMaterialState,
  commitHopperMaterialState,
  HOPPER_TOLERANCE_KG,
} from './hopperNode.js';
import { applyContinuousCrushing, applyContinuousMagneticSeparation } from './continuousProcessing.js';
import {
  createZeroStream,
  setMaterialStreamState,
  totalMassFlowKgPerSecond,
  scaleFlowRates,
} from './materialStream.js';
import {
  createSolidMaterialState,
  multiplySolidMaterialState,
  scaleSolidMaterialState,
  totalSolidQuantity,
} from '../core/materials/solidMaterialState.js';
import {
  defaultProcessParameters,
  getProcessDefinition,
  CRUSHING_PROCESS_ID,
  MAGNETIC_SEPARATION_PROCESS_ID,
} from '../core/processes/processDefinitions.js';
import { validateApparatusParameters } from './apparatusDefinitions.js';

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
    ports: [{ id: 'resource-access', direction: 'output', kind: 'resource-access', label: 'resources' }],
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
  const id = nextNodeId();
  const node = createExtractor({
    id,
    occurrenceId,
    prototypeRateKgPerSecond: rateKgPerSecond,
    enabled,
  });
  blueprint.nodes[id] = node;
  return node;
}

export function blueprintAddHopper(blueprint, capacityKg = DEFAULT_HOPPER_CAPACITY_KG) {
  const id = nextNodeId();
  const node = createHopper({ id, capacityKg });
  blueprint.nodes[id] = node;
  return node;
}

export function blueprintAddCrusher(blueprint, {
  throughputKgPerSecond = DEFAULT_CRUSHER_THROUGHPUT_KG_PER_S,
  targetParticleSizeMm = DEFAULT_CRUSHER_TARGET_PARTICLE_SIZE_MM,
  enabled = false,
} = {}) {
  if (typeof throughputKgPerSecond !== 'number' || !Number.isFinite(throughputKgPerSecond) || throughputKgPerSecond <= 0) {
    throw new Error('Crusher throughputKgPerSecond must be a finite positive number');
  }
  if (typeof enabled !== 'boolean') throw new Error('Crusher enabled must be boolean');

  const id = nextNodeId();
  const node = {
    id,
    nodeType: 'crusher',
    systemType: 'crusher',
    kind: 'primitive',
    processId: CRUSHING_PROCESS_ID,
    throughputKgPerSecond,
    targetParticleSizeMm,
    inputPortId: 'feed',
    outputPortId: 'product',
    lastError: null,
    enabled,
    operatingState: enabled ? 'idle' : 'off',
  };
  validateApparatusParameters(node);
  blueprint.nodes[id] = node;
  return node;
}

export function blueprintAddMagSep(blueprint, {
  fieldStrength = DEFAULT_MAG_SEP_FIELD_STRENGTH,
  throughputKgPerSecond = DEFAULT_MAG_SEP_THROUGHPUT_KG_PER_S,
  enabled = false,
} = {}) {
  if (typeof throughputKgPerSecond !== 'number' || !Number.isFinite(throughputKgPerSecond) || throughputKgPerSecond <= 0) {
    throw new Error('Magnetic Separator throughputKgPerSecond must be a finite positive number');
  }
  if (typeof enabled !== 'boolean') throw new Error('Magnetic Separator enabled must be boolean');

  const processDefinition = getProcessDefinition(MAGNETIC_SEPARATION_PROCESS_ID);
  const id = nextNodeId();
  const node = {
    id,
    nodeType: 'magSep',
    systemType: 'magnetic-separator',
    kind: 'primitive',
    processId: MAGNETIC_SEPARATION_PROCESS_ID,
    fieldStrength,
    throughputKgPerSecond,
    inputPortId: 'feed',
    concentratePortId: 'concentrate',
    tailingsPortId: 'tailings',
    maxFeedParticleSizeMm: processDefinition?.maxFeedParticleSizeMm ?? 25,
    lastError: null,
    enabled,
    operatingState: enabled ? 'idle' : 'off',
  };
  validateApparatusParameters(node);
  blueprint.nodes[id] = node;
  return node;
}

/** Ports exposed to the current child workspace. */
export function getNodePortDefinitions(node) {
  if (!node) return [];

  if (node.nodeType === 'feature') {
    return node.ports ?? [{ id: 'resource-access', direction: 'output', kind: 'resource-access', label: 'resources' }];
  }
  if (node.nodeType === 'extractor') {
    return [
      { id: node.sourceInputPortId, direction: 'input', kind: 'resource-access', label: 'resource source' },
      { id: node.outputPortId, direction: 'output', kind: 'material', label: 'material out' },
    ];
  }
  if (node.nodeType === 'hopper') {
    if (node.boundaryRole === 'import') {
      return [{ id: node.outputPortId, direction: 'output', kind: 'material', label: 'out' }];
    }
    if (node.boundaryRole === 'export') {
      return [{ id: node.inputPortId, direction: 'input', kind: 'material', label: 'in' }];
    }
    return [
      { id: node.inputPortId, direction: 'input', kind: 'material', label: 'in' },
      { id: node.outputPortId, direction: 'output', kind: 'material', label: 'out' },
    ];
  }

  const processDefinition = getProcessDefinition(node.processId);
  if (!processDefinition) return [];
  return [
    ...(processDefinition.inputs ?? []).map(port => ({ id: port.id, direction: 'input', kind: port.kind, label: port.id })),
    ...(processDefinition.outputs ?? []).map(port => ({ id: port.id, direction: 'output', kind: port.kind, label: port.id })),
  ];
}

function isExplicitBoundaryStorageTransition(sourceNode, targetNode) {
  return sourceNode?.nodeType === 'hopper'
    && targetNode?.nodeType === 'hopper'
    && (sourceNode.boundaryRole === 'import' || targetNode.boundaryRole === 'export');
}

function supportedNodeTransition(sourceNode, targetNode, kind) {
  if (kind === 'resource-access') return sourceNode?.nodeType === 'feature' && targetNode?.nodeType === 'extractor';
  if (kind !== 'material') return false;
  if (isExplicitBoundaryStorageTransition(sourceNode, targetNode)) return true;
  return new Set([
    'extractor->hopper',
    'hopper->crusher',
    'crusher->hopper',
    'hopper->magSep',
    'magSep->hopper',
  ]).has(`${sourceNode.nodeType}->${targetNode.nodeType}`);
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

  if (!supportedNodeTransition(sourceNode, targetNode, sourcePort.kind)) {
    return { ok: false, reason: `${sourceNode.nodeType} → ${targetNode.nodeType} is not supported for '${sourcePort.kind}'` };
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

function simulateExtractorNode(blueprint, world, node, dt) {
  if (!node.enabled) {
    node.operatingState = 'off';
    node.lastError = null;
    return 0;
  }

  const accessConnection = findInboundConnection(blueprint, node.id, node.sourceInputPortId);
  if (!accessConnection || accessConnection.kind !== 'resource-access') {
    node.lastError = 'Extractor requires a connected Feature resource source';
    node.operatingState = 'blocked';
    return 0;
  }
  const sourceFeature = blueprint.nodes[accessConnection.sourceNodeId];
  const occurrenceId = accessConnection.occurrenceId;
  const occurrence = world?.resourceOccurrences?.[occurrenceId];
  if (
    sourceFeature?.nodeType !== 'feature'
    || !sourceFeature.resourceOccurrenceIds?.includes(occurrenceId)
    || !occurrence
    || occurrence.sourceType !== 'feature'
    || occurrence.sourceId !== sourceFeature.featureId
  ) {
    node.lastError = 'Connected Feature does not own the selected ResourceOccurrence';
    node.operatingState = 'blocked';
    return 0;
  }

  const eligibility = extractorOccurrenceEligibility(occurrence);
  if (!eligibility.ok) {
    node.lastError = eligibility.reason;
    node.operatingState = 'blocked';
    return 0;
  }

  const outputConnection = findOutboundConnection(blueprint, node.id, node.outputPortId);
  if (!outputConnection || outputConnection.kind !== 'material') {
    node.lastError = 'Extractor requires a connected material output';
    node.operatingState = 'blocked';
    return 0;
  }

  const targetHopper = blueprint.nodes[outputConnection.targetNodeId];
  if (!targetHopper || targetHopper.nodeType !== 'hopper') {
    node.lastError = 'Extractor material output must feed storage';
    node.operatingState = 'blocked';
    return 0;
  }

  let baseOutput;
  try {
    baseOutput = extractorOutputRates(node, occurrence, 1);
  } catch (error) {
    node.lastError = error.message;
    node.operatingState = 'blocked';
    return 0;
  }
  const baseTotalRate = totalMassFlowKgPerSecond(baseOutput);
  const requestedKg = baseTotalRate * dt;
  const freeKg = hopperFreeCapacityKg(targetHopper);
  const throttle = requestedKg > 0 ? Math.max(0, Math.min(1, freeKg / requestedKg)) : 0;
  const plannedRates = scaleFlowRates(baseOutput, throttle);
  const plannedKg = totalMassFlowKgPerSecond(plannedRates) * dt;
  if (plannedKg <= TRANSFER_TOLERANCE_KG) {
    node.lastError = 'Extractor output storage is full';
    node.operatingState = 'blocked';
    return 0;
  }

  const acceptedKg = hopperReceiveInflow(targetHopper, plannedRates, dt);
  const acceptanceFactor = plannedKg > 0 ? Math.max(0, Math.min(1, acceptedKg / plannedKg)) : 0;
  const actualRates = scaleFlowRates(plannedRates, acceptanceFactor);
  updateConnectionStream(blueprint, outputConnection, actualRates);
  node.lastError = acceptedKg > TRANSFER_TOLERANCE_KG ? null : 'Extractor output storage is full';
  node.operatingState = acceptedKg > TRANSFER_TOLERANCE_KG ? 'running' : 'blocked';
  return acceptedKg;
}

function simulateCrusherNode(blueprint, node, dt) {
  if (!node.enabled) {
    node.operatingState = 'off';
    return;
  }

  const inputConnection = findInboundConnection(blueprint, node.id, node.inputPortId);
  const outputConnection = findOutboundConnection(blueprint, node.id, node.outputPortId);
  if (!inputConnection) {
    node.lastError = null;
    node.operatingState = 'idle';
    return;
  }

  const inputHopper = blueprint.nodes[inputConnection.sourceNodeId];
  if (inputHopper?.nodeType === 'hopper' && hopperStoredMassKg(inputHopper) <= HOPPER_TOLERANCE_KG) {
    node.lastError = null;
    node.operatingState = 'idle';
    return;
  }
  if (!outputConnection) {
    node.lastError = 'Crusher requires connected feed and product ports';
    node.operatingState = 'blocked';
    return;
  }
  const outputHopper = blueprint.nodes[outputConnection.targetNodeId];
  if (inputHopper?.nodeType !== 'hopper' || outputHopper?.nodeType !== 'hopper') {
    node.operatingState = 'blocked';
    return;
  }

  const storedMassKg = hopperStoredMassKg(inputHopper);
  const freeOutputKg = hopperFreeCapacityKg(outputHopper);
  if (freeOutputKg <= HOPPER_TOLERANCE_KG) {
    node.lastError = 'Product storage is full';
    node.operatingState = 'blocked';
    return;
  }

  const feasibleRate = Math.min(node.throughputKgPerSecond, storedMassKg / dt, freeOutputKg / dt);
  if (feasibleRate <= 0) {
    node.operatingState = 'blocked';
    return;
  }

  const candidateRates = proportionalSolidStateFromHopper(inputHopper, feasibleRate);
  try {
    applyContinuousCrushing(candidateRates, node.targetParticleSizeMm, node.throughputKgPerSecond);
  } catch (error) {
    node.lastError = error.message;
    node.operatingState = 'blocked';
    return;
  }

  const stagedInput = cloneHopperMaterialState(inputHopper);
  const stagedOutput = cloneHopperMaterialState(outputHopper);
  const withdrawal = hopperWithdraw(stagedInput, feasibleRate, dt);
  if (withdrawal.actualTotalKg <= TRANSFER_TOLERANCE_KG) {
    node.operatingState = 'idle';
    return;
  }

  const actualFeed = multiplySolidMaterialState(withdrawal.actualSolidState, 1 / dt);
  const result = applyContinuousCrushing(actualFeed, node.targetParticleSizeMm, node.throughputKgPerSecond);
  const expectedOutputKg = totalMassFlowKgPerSecond(result.productSolidState) * dt;
  const acceptedOutputKg = hopperReceiveInflow(
    stagedOutput,
    result.productSolidState,
    dt
  );
  assertTransferAccepted(expectedOutputKg, acceptedOutputKg, 'Crusher');

  commitHopperMaterialState(inputHopper, stagedInput);
  commitHopperMaterialState(outputHopper, stagedOutput);
  updateConnectionStream(blueprint, inputConnection, actualFeed);
  updateConnectionStream(blueprint, outputConnection, result.productSolidState);
  node.lastError = null;
  node.operatingState = 'running';
}

function simulateMagSepNode(blueprint, node, dt) {
  if (!node.enabled) {
    node.operatingState = 'off';
    return;
  }

  const inputConnection = findInboundConnection(blueprint, node.id, node.inputPortId);
  const concentrateConnection = findOutboundConnection(blueprint, node.id, node.concentratePortId);
  const tailingsConnection = findOutboundConnection(blueprint, node.id, node.tailingsPortId);
  if (!inputConnection) {
    node.lastError = null;
    node.operatingState = 'idle';
    return;
  }

  const inputHopper = blueprint.nodes[inputConnection.sourceNodeId];
  if (inputHopper?.nodeType === 'hopper' && hopperStoredMassKg(inputHopper) <= HOPPER_TOLERANCE_KG) {
    node.lastError = null;
    node.operatingState = 'idle';
    return;
  }
  if (!concentrateConnection || !tailingsConnection) {
    node.lastError = 'Magnetic Separator requires feed, concentrate, and tailings connections';
    node.operatingState = 'blocked';
    return;
  }
  const concentrateHopper = blueprint.nodes[concentrateConnection.targetNodeId];
  const tailingsHopper = blueprint.nodes[tailingsConnection.targetNodeId];
  if (inputHopper?.nodeType !== 'hopper' || concentrateHopper?.nodeType !== 'hopper' || tailingsHopper?.nodeType !== 'hopper') {
    node.operatingState = 'blocked';
    return;
  }

  const storedMassKg = hopperStoredMassKg(inputHopper);
  const candidateRate = Math.min(node.throughputKgPerSecond, storedMassKg / dt);
  let candidateFeedRates = proportionalSolidStateFromHopper(inputHopper, candidateRate);
  let candidateResult;
  try {
    candidateResult = applyContinuousMagneticSeparation(
      candidateFeedRates,
      node.fieldStrength,
      node.maxFeedParticleSizeMm
    );
  } catch (error) {
    node.lastError = error.message;
    node.operatingState = 'blocked';
    return;
  }

  const concentrateScale = capacityScaleForOutput(
    hopperFreeCapacityKg(concentrateHopper),
    candidateResult.concentrateSolidState,
    dt
  );
  const tailingsScale = capacityScaleForOutput(
    hopperFreeCapacityKg(tailingsHopper),
    candidateResult.tailingsSolidState,
    dt
  );
  const capacityScale = Math.min(concentrateScale, tailingsScale);
  if (capacityScale <= TRANSFER_TOLERANCE_KG) {
    node.lastError = 'One or more output hoppers are full';
    node.operatingState = 'blocked';
    return;
  }

  if (capacityScale < 1) candidateFeedRates = scaleFlowRates(candidateFeedRates, capacityScale);

  const stagedInput = cloneHopperMaterialState(inputHopper);
  const stagedConcentrate = cloneHopperMaterialState(concentrateHopper);
  const stagedTailings = cloneHopperMaterialState(tailingsHopper);
  const withdrawal = hopperWithdraw(stagedInput, totalSolidQuantity(candidateFeedRates), dt);
  if (withdrawal.actualTotalKg <= TRANSFER_TOLERANCE_KG) {
    node.operatingState = 'idle';
    return;
  }

  const actualFeed = multiplySolidMaterialState(withdrawal.actualSolidState, 1 / dt);
  const result = applyContinuousMagneticSeparation(
    actualFeed,
    node.fieldStrength,
    node.maxFeedParticleSizeMm
  );
  const expectedConcentrateKg = totalMassFlowKgPerSecond(result.concentrateSolidState) * dt;
  const acceptedConcentrateKg = hopperReceiveInflow(
    stagedConcentrate,
    result.concentrateSolidState,
    dt
  );
  assertTransferAccepted(expectedConcentrateKg, acceptedConcentrateKg, 'Magnetic Separator concentrate');

  const expectedTailingsKg = totalMassFlowKgPerSecond(result.tailingsSolidState) * dt;
  const acceptedTailingsKg = hopperReceiveInflow(
    stagedTailings,
    result.tailingsSolidState,
    dt
  );
  assertTransferAccepted(expectedTailingsKg, acceptedTailingsKg, 'Magnetic Separator tailings');

  commitHopperMaterialState(inputHopper, stagedInput);
  commitHopperMaterialState(concentrateHopper, stagedConcentrate);
  commitHopperMaterialState(tailingsHopper, stagedTailings);
  updateConnectionStream(blueprint, inputConnection, actualFeed);
  updateConnectionStream(blueprint, concentrateConnection, result.concentrateSolidState);
  updateConnectionStream(blueprint, tailingsConnection, result.tailingsSolidState);
  node.lastError = null;
  node.operatingState = 'running';
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

  for (const node of Object.values(blueprint.nodes)) {
    if (node.nodeType === 'extractor') extractedThisTickKg += simulateExtractorNode(blueprint, world, node, dt);
  }
  for (const node of Object.values(blueprint.nodes)) {
    if (node.nodeType === 'crusher') simulateCrusherNode(blueprint, node, dt);
  }
  for (const node of Object.values(blueprint.nodes)) {
    if (node.nodeType === 'magSep') simulateMagSepNode(blueprint, node, dt);
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
  if (!['extractor', 'crusher', 'magSep'].includes(node.nodeType)) throw new Error(`Node '${nodeId}' is not active machinery`);
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
  if (['extractor', 'crusher', 'magSep'].includes(node.nodeType)) return node.enabled ? (node.operatingState ?? 'idle') : 'off';
  return null;
}

export function createBlueprintLayout() {
  return { nodePositions: {} };
}

export function layoutMoveNode(layout, nodeId, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Layout coordinates must be finite numbers');
  layout.nodePositions[nodeId] = { x, y };
}
