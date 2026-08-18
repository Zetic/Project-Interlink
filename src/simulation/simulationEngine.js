/**
 * Fixed-timestep simulation for the first Engineering workspace vertical slice.
 * Physical material state lives in the blueprint simulation-runtime object;
 * node layout lives separately in BlueprintLayout application state.
 */

import { createExtractor, extractorOutputRates, DEFAULT_EXTRACTOR_RATE_KG_PER_SECOND } from './extractorNode.js';
import {
  createHopper,
  hopperFreeCapacityKg,
  hopperStoredMassKg,
  hopperReceiveInflow,
  hopperWithdraw,
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
  getProcessDefinition,
  CRUSHING_PROCESS_ID,
  MAGNETIC_SEPARATION_PROCESS_ID,
} from '../core/processes/processDefinitions.js';

export const SIMULATION_STEP_S = 0.1;
export const DEFAULT_HOPPER_CAPACITY_KG = 1000;
export const DEFAULT_CRUSHER_THROUGHPUT_KG_PER_S = 4;
export const DEFAULT_CRUSHER_TARGET_PARTICLE_SIZE_MM = 15;
export const DEFAULT_MAG_SEP_THROUGHPUT_KG_PER_S = 4;
export const DEFAULT_MAG_SEP_FIELD_STRENGTH = 0.6;

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

export function blueprintAddExtractor(blueprint, occurrenceId, rateKgPerSecond = DEFAULT_EXTRACTOR_RATE_KG_PER_SECOND) {
  const id = nextNodeId();
  const node = createExtractor({ id, occurrenceId, prototypeRateKgPerSecond: rateKgPerSecond });
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
} = {}) {
  if (typeof throughputKgPerSecond !== 'number' || !Number.isFinite(throughputKgPerSecond) || throughputKgPerSecond <= 0) {
    throw new Error('Crusher throughputKgPerSecond must be a finite positive number');
  }

  const id = nextNodeId();
  const node = {
    id,
    nodeType: 'crusher',
    processId: CRUSHING_PROCESS_ID,
    throughputKgPerSecond,
    targetParticleSizeMm,
    inputPortId: 'feed',
    outputPortId: 'product',
    lastError: null,
  };
  blueprint.nodes[id] = node;
  return node;
}

export function blueprintAddMagSep(blueprint, {
  fieldStrength = DEFAULT_MAG_SEP_FIELD_STRENGTH,
  throughputKgPerSecond = DEFAULT_MAG_SEP_THROUGHPUT_KG_PER_S,
} = {}) {
  if (typeof throughputKgPerSecond !== 'number' || !Number.isFinite(throughputKgPerSecond) || throughputKgPerSecond <= 0) {
    throw new Error('Magnetic Separator throughputKgPerSecond must be a finite positive number');
  }

  const processDefinition = getProcessDefinition(MAGNETIC_SEPARATION_PROCESS_ID);
  const id = nextNodeId();
  const node = {
    id,
    nodeType: 'magSep',
    processId: MAGNETIC_SEPARATION_PROCESS_ID,
    fieldStrength,
    throughputKgPerSecond,
    inputPortId: 'feed',
    concentratePortId: 'concentrate',
    tailingsPortId: 'tailings',
    maxFeedParticleSizeMm: processDefinition?.maxFeedParticleSizeMm ?? 25,
    lastError: null,
  };
  blueprint.nodes[id] = node;
  return node;
}

export function getNodePortDefinitions(node) {
  if (!node) return [];

  if (node.nodeType === 'extractor') {
    return [{ id: node.outputPortId, direction: 'output', kind: 'material', label: 'out' }];
  }
  if (node.nodeType === 'hopper') {
    return [
      { id: node.inputPortId, direction: 'input', kind: 'material', label: 'in' },
      { id: node.outputPortId, direction: 'output', kind: 'material', label: 'out' },
    ];
  }

  const processDefinition = getProcessDefinition(node.processId);
  if (!processDefinition) return [];
  return [
    ...(processDefinition.inputs ?? []).map(port => ({
      id: port.id,
      direction: 'input',
      kind: port.kind,
      label: port.id,
    })),
    ...(processDefinition.outputs ?? []).map(port => ({
      id: port.id,
      direction: 'output',
      kind: port.kind,
      label: port.id,
    })),
  ];
}

function supportedNodeTransition(sourceNode, targetNode) {
  const key = `${sourceNode.nodeType}->${targetNode.nodeType}`;
  return new Set([
    'extractor->hopper',
    'hopper->crusher',
    'crusher->hopper',
    'hopper->magSep',
    'magSep->hopper',
  ]).has(key);
}

export function checkBlueprintConnection(blueprint, sourceNodeId, sourcePortId, targetNodeId, targetPortId) {
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
  if (sourcePort.kind !== targetPort.kind) return { ok: false, reason: 'Port material kinds are incompatible' };

  for (const connection of Object.values(blueprint.connections ?? {})) {
    if (connection.sourceNodeId === sourceNodeId && connection.sourcePortId === sourcePortId) {
      return { ok: false, reason: 'This output port is already connected; use an explicit splitter for fan-out' };
    }
    if (connection.targetNodeId === targetNodeId && connection.targetPortId === targetPortId) {
      return { ok: false, reason: 'This input port is already connected' };
    }
  }

  if (!supportedNodeTransition(sourceNode, targetNode)) {
    return {
      ok: false,
      reason: `${sourceNode.nodeType} → ${targetNode.nodeType} is not supported by the current material-flow solver`,
    };
  }

  return { ok: true, reason: '' };
}

export function blueprintConnect(blueprint, sourceNodeId, sourcePortId, targetNodeId, targetPortId) {
  const compatibility = checkBlueprintConnection(blueprint, sourceNodeId, sourcePortId, targetNodeId, targetPortId);
  if (!compatibility.ok) return null;

  const id = nextConnectionId();
  const connection = { id, sourceNodeId, sourcePortId, targetNodeId, targetPortId, kind: 'material' };
  blueprint.connections[id] = connection;

  const streamId = nextStreamId();
  blueprint.streams[streamId] = createZeroStream({
    id: streamId,
    connectionId: id,
    sourceNodeId,
    sourcePortId,
    targetNodeId,
    targetPortId,
  });

  return connection;
}

export function blueprintDisconnect(blueprint, connectionId) {
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

function updateConnectionStream(blueprint, connection, rates, particleSizeMm = null) {
  if (!connection) return;
  const stream = getStreamForConnection(blueprint, connection.id);
  if (stream) setMaterialStreamState(stream, rates, particleSizeMm);
}

function zeroAllStreams(blueprint) {
  for (const stream of Object.values(blueprint.streams)) {
    setMaterialStreamState(stream, {}, null);
  }
}

function proportionalRatesFromHopper(hopper, requestedTotalRateKgPerSecond) {
  const storedMassKg = hopperStoredMassKg(hopper);
  if (storedMassKg <= HOPPER_TOLERANCE_KG || requestedTotalRateKgPerSecond <= 0) return {};

  return Object.fromEntries(
    Object.entries(hopper.storedComponentsKg).map(([componentId, kg]) => [
      componentId,
      (kg / storedMassKg) * requestedTotalRateKgPerSecond,
    ])
  );
}

function cloneHopperPhysicalState(hopper) {
  return {
    ...hopper,
    storedComponentsKg: { ...hopper.storedComponentsKg },
  };
}

function commitHopperPhysicalState(target, staged) {
  target.storedComponentsKg = { ...staged.storedComponentsKg };
  target.particleSizeMm = staged.particleSizeMm;
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
  const occurrence = world?.resourceOccurrences?.[node.occurrenceId];
  const outputConnection = findOutboundConnection(blueprint, node.id, node.outputPortId);
  if (!occurrence || !outputConnection) return 0;

  const targetHopper = blueprint.nodes[outputConnection.targetNodeId];
  if (!targetHopper || targetHopper.nodeType !== 'hopper') return 0;

  const baseOutput = extractorOutputRates(node, occurrence, 1);
  const baseTotalRate = totalMassFlowKgPerSecond(baseOutput.componentMassFlowKgPerSecond);
  const requestedKg = baseTotalRate * dt;
  const freeKg = hopperFreeCapacityKg(targetHopper);
  const throttle = requestedKg > 0 ? Math.max(0, Math.min(1, freeKg / requestedKg)) : 0;
  const plannedRates = scaleFlowRates(baseOutput.componentMassFlowKgPerSecond, throttle);
  const plannedKg = totalMassFlowKgPerSecond(plannedRates) * dt;
  if (plannedKg <= TRANSFER_TOLERANCE_KG) return 0;

  const acceptedKg = hopperReceiveInflow(targetHopper, plannedRates, baseOutput.particleSizeMm, dt);
  const acceptanceFactor = plannedKg > 0 ? Math.max(0, Math.min(1, acceptedKg / plannedKg)) : 0;
  const actualRates = scaleFlowRates(plannedRates, acceptanceFactor);
  updateConnectionStream(blueprint, outputConnection, actualRates, baseOutput.particleSizeMm);
  return acceptedKg;
}

function simulateCrusherNode(blueprint, node, dt) {
  const inputConnection = findInboundConnection(blueprint, node.id, node.inputPortId);
  const outputConnection = findOutboundConnection(blueprint, node.id, node.outputPortId);
  if (!inputConnection || !outputConnection) {
    node.lastError = 'Crusher requires connected feed and product ports';
    return;
  }

  const inputHopper = blueprint.nodes[inputConnection.sourceNodeId];
  const outputHopper = blueprint.nodes[outputConnection.targetNodeId];
  if (inputHopper?.nodeType !== 'hopper' || outputHopper?.nodeType !== 'hopper') return;

  const storedMassKg = hopperStoredMassKg(inputHopper);
  const freeOutputKg = hopperFreeCapacityKg(outputHopper);
  if (storedMassKg <= HOPPER_TOLERANCE_KG) {
    node.lastError = null;
    return;
  }
  if (freeOutputKg <= HOPPER_TOLERANCE_KG) {
    node.lastError = 'Product storage is full';
    return;
  }

  const feasibleRate = Math.min(
    node.throughputKgPerSecond,
    storedMassKg / dt,
    freeOutputKg / dt
  );
  if (feasibleRate <= 0) return;

  const particleSizeMm = inputHopper.particleSizeMm;
  const candidateRates = proportionalRatesFromHopper(inputHopper, feasibleRate);
  try {
    applyContinuousCrushing(
      { componentMassFlowKgPerSecond: candidateRates, particleSizeMm },
      node.targetParticleSizeMm,
      node.throughputKgPerSecond
    );
  } catch (error) {
    node.lastError = error.message;
    return;
  }

  const stagedInput = cloneHopperPhysicalState(inputHopper);
  const stagedOutput = cloneHopperPhysicalState(outputHopper);
  const withdrawal = hopperWithdraw(stagedInput, candidateRates, dt);
  if (withdrawal.actualTotalKg <= TRANSFER_TOLERANCE_KG) return;

  const actualFeed = {
    componentMassFlowKgPerSecond: withdrawal.actualRates,
    particleSizeMm,
  };
  const result = applyContinuousCrushing(actualFeed, node.targetParticleSizeMm, node.throughputKgPerSecond);
  const expectedOutputKg = totalMassFlowKgPerSecond(result.productRates.componentMassFlowKgPerSecond) * dt;
  const acceptedOutputKg = hopperReceiveInflow(
    stagedOutput,
    result.productRates.componentMassFlowKgPerSecond,
    result.productRates.particleSizeMm,
    dt
  );
  assertTransferAccepted(expectedOutputKg, acceptedOutputKg, 'Crusher');

  commitHopperPhysicalState(inputHopper, stagedInput);
  commitHopperPhysicalState(outputHopper, stagedOutput);
  updateConnectionStream(blueprint, inputConnection, withdrawal.actualRates, particleSizeMm);
  updateConnectionStream(
    blueprint,
    outputConnection,
    result.productRates.componentMassFlowKgPerSecond,
    result.productRates.particleSizeMm
  );
  node.lastError = null;
}

function simulateMagSepNode(blueprint, node, dt) {
  const inputConnection = findInboundConnection(blueprint, node.id, node.inputPortId);
  const concentrateConnection = findOutboundConnection(blueprint, node.id, node.concentratePortId);
  const tailingsConnection = findOutboundConnection(blueprint, node.id, node.tailingsPortId);
  if (!inputConnection || !concentrateConnection || !tailingsConnection) {
    node.lastError = 'Magnetic Separator requires feed, concentrate, and tailings connections';
    return;
  }

  const inputHopper = blueprint.nodes[inputConnection.sourceNodeId];
  const concentrateHopper = blueprint.nodes[concentrateConnection.targetNodeId];
  const tailingsHopper = blueprint.nodes[tailingsConnection.targetNodeId];
  if (
    inputHopper?.nodeType !== 'hopper' ||
    concentrateHopper?.nodeType !== 'hopper' ||
    tailingsHopper?.nodeType !== 'hopper'
  ) return;

  const storedMassKg = hopperStoredMassKg(inputHopper);
  if (storedMassKg <= HOPPER_TOLERANCE_KG) {
    node.lastError = null;
    return;
  }

  const particleSizeMm = inputHopper.particleSizeMm;
  const candidateRate = Math.min(node.throughputKgPerSecond, storedMassKg / dt);
  let candidateFeedRates = proportionalRatesFromHopper(inputHopper, candidateRate);
  let candidateResult;
  try {
    candidateResult = applyContinuousMagneticSeparation(
      { componentMassFlowKgPerSecond: candidateFeedRates, particleSizeMm },
      node.fieldStrength,
      node.maxFeedParticleSizeMm
    );
  } catch (error) {
    node.lastError = error.message;
    return;
  }

  const concentrateScale = capacityScaleForOutput(
    hopperFreeCapacityKg(concentrateHopper),
    candidateResult.concentrateRates.componentMassFlowKgPerSecond,
    dt
  );
  const tailingsScale = capacityScaleForOutput(
    hopperFreeCapacityKg(tailingsHopper),
    candidateResult.tailingsRates.componentMassFlowKgPerSecond,
    dt
  );
  const capacityScale = Math.min(concentrateScale, tailingsScale);
  if (capacityScale <= TRANSFER_TOLERANCE_KG) {
    node.lastError = 'One or more output hoppers are full';
    return;
  }

  if (capacityScale < 1) {
    candidateFeedRates = scaleFlowRates(candidateFeedRates, capacityScale);
  }

  const stagedInput = cloneHopperPhysicalState(inputHopper);
  const stagedConcentrate = cloneHopperPhysicalState(concentrateHopper);
  const stagedTailings = cloneHopperPhysicalState(tailingsHopper);
  const withdrawal = hopperWithdraw(stagedInput, candidateFeedRates, dt);
  if (withdrawal.actualTotalKg <= TRANSFER_TOLERANCE_KG) return;

  const result = applyContinuousMagneticSeparation(
    { componentMassFlowKgPerSecond: withdrawal.actualRates, particleSizeMm },
    node.fieldStrength,
    node.maxFeedParticleSizeMm
  );

  const expectedConcentrateKg = totalMassFlowKgPerSecond(result.concentrateRates.componentMassFlowKgPerSecond) * dt;
  const acceptedConcentrateKg = hopperReceiveInflow(
    stagedConcentrate,
    result.concentrateRates.componentMassFlowKgPerSecond,
    result.concentrateRates.particleSizeMm,
    dt
  );
  assertTransferAccepted(expectedConcentrateKg, acceptedConcentrateKg, 'Magnetic Separator concentrate');

  const expectedTailingsKg = totalMassFlowKgPerSecond(result.tailingsRates.componentMassFlowKgPerSecond) * dt;
  const acceptedTailingsKg = hopperReceiveInflow(
    stagedTailings,
    result.tailingsRates.componentMassFlowKgPerSecond,
    result.tailingsRates.particleSizeMm,
    dt
  );
  assertTransferAccepted(expectedTailingsKg, acceptedTailingsKg, 'Magnetic Separator tailings');

  commitHopperPhysicalState(inputHopper, stagedInput);
  commitHopperPhysicalState(concentrateHopper, stagedConcentrate);
  commitHopperPhysicalState(tailingsHopper, stagedTailings);
  updateConnectionStream(blueprint, inputConnection, withdrawal.actualRates, particleSizeMm);
  updateConnectionStream(
    blueprint,
    concentrateConnection,
    result.concentrateRates.componentMassFlowKgPerSecond,
    result.concentrateRates.particleSizeMm
  );
  updateConnectionStream(
    blueprint,
    tailingsConnection,
    result.tailingsRates.componentMassFlowKgPerSecond,
    result.tailingsRates.particleSizeMm
  );
  node.lastError = null;
}

export function simulationTick(blueprint, world, dt = SIMULATION_STEP_S) {
  if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) {
    throw new Error('Simulation dt must be a finite positive number');
  }

  zeroAllStreams(blueprint);
  let extractedThisTickKg = 0;

  for (const node of Object.values(blueprint.nodes)) {
    if (node.nodeType === 'extractor') {
      extractedThisTickKg += simulateExtractorNode(blueprint, world, node, dt);
    }
  }
  for (const node of Object.values(blueprint.nodes)) {
    if (node.nodeType === 'crusher') simulateCrusherNode(blueprint, node, dt);
  }
  for (const node of Object.values(blueprint.nodes)) {
    if (node.nodeType === 'magSep') simulateMagSepNode(blueprint, node, dt);
  }

  blueprint.simulationStats.elapsedSeconds += dt;
  blueprint.simulationStats.extractedKg += extractedThisTickKg;

  return { extractedKg: extractedThisTickKg };
}

export function simulationAdvance(blueprint, world, elapsedSeconds, dt = SIMULATION_STEP_S) {
  if (typeof elapsedSeconds !== 'number' || !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new Error('elapsedSeconds must be a finite non-negative number');
  }
  if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) {
    throw new Error('Simulation dt must be a finite positive number');
  }

  const ticks = Math.floor((elapsedSeconds + 1e-12) / dt);
  for (let i = 0; i < ticks; i++) simulationTick(blueprint, world, dt);
  return ticks;
}

export function createBlueprintLayout() {
  return { nodePositions: {} };
}

export function layoutMoveNode(layout, nodeId, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Layout coordinates must be finite numbers');
  layout.nodePositions[nodeId] = { x, y };
}
