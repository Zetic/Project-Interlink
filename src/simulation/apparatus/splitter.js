import { SPLITTING_PROCESS_ID } from '../../core/processes/definitions/index.js';
import { PORT_CAPABILITIES } from '../../core/systems/ports.js';
import {
  multiplySolidMaterialState,
  totalSolidQuantity,
} from '../../core/materials/solids/solidMaterialState.js';
import {
  cloneHopperMaterialState,
  commitHopperMaterialState,
  hopperFreeCapacityKg,
  hopperReceiveInflow,
  hopperStoredMassKg,
  hopperWithdraw,
  HOPPER_TOLERANCE_KG,
} from '../hopperNode.js';
import { applyContinuousSplitting } from '../continuousProcessing.js';
import {
  findInboundConnection,
  findOutboundConnection,
  updateConnectionStream,
} from './blueprintHelpers.js';
import {
  APPARATUS_TRANSFER_TOLERANCE_KG,
  assertTransferAccepted,
  capacityScaleForOutput,
  proportionalSolidStateFromHopper,
} from './materialTransferHelpers.js';

export function createSplitter({
  id,
  splitFractionToA,
  throughputKgPerSecond,
  enabled = false,
} = {}) {
  if (typeof splitFractionToA !== 'number' || !Number.isFinite(splitFractionToA) || splitFractionToA < 0 || splitFractionToA > 1) {
    throw new Error('Splitter splitFractionToA must be a finite number in [0, 1]');
  }
  if (typeof throughputKgPerSecond !== 'number' || !Number.isFinite(throughputKgPerSecond) || throughputKgPerSecond <= 0) {
    throw new Error('Splitter throughputKgPerSecond must be a finite positive number');
  }
  if (typeof enabled !== 'boolean') throw new Error('Splitter enabled must be boolean');

  return {
    id,
    nodeType: 'splitter',
    systemType: 'splitter',
    kind: 'primitive',
    processId: SPLITTING_PROCESS_ID,
    splitFractionToA,
    throughputKgPerSecond,
    inputPortId: 'feed',
    outputAPortId: 'output-a',
    outputBPortId: 'output-b',
    ports: [
      { id: 'feed', direction: 'input', kind: 'material', label: 'feed', accepts: [PORT_CAPABILITIES.STORED_SOLID_PARTICULATE] },
      { id: 'output-a', direction: 'output', kind: 'material', label: 'A', provides: [PORT_CAPABILITIES.SOLID_PARTICULATE] },
      { id: 'output-b', direction: 'output', kind: 'material', label: 'B', provides: [PORT_CAPABILITIES.SOLID_PARTICULATE] },
    ],
    lastError: null,
    enabled,
    operatingState: enabled ? 'idle' : 'off',
  };
}

export function simulateSplitterNode(blueprint, node, dt) {
  if (!node.enabled) {
    node.operatingState = 'off';
    return;
  }

  const inputConnection = findInboundConnection(blueprint, node.id, node.inputPortId);
  const outputAConnection = findOutboundConnection(blueprint, node.id, node.outputAPortId);
  const outputBConnection = findOutboundConnection(blueprint, node.id, node.outputBPortId);
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
  if (!outputAConnection || !outputBConnection) {
    node.lastError = 'Splitter requires feed, output A, and output B connections';
    node.operatingState = 'blocked';
    return;
  }

  const outputAHopper = blueprint.nodes[outputAConnection.targetNodeId];
  const outputBHopper = blueprint.nodes[outputBConnection.targetNodeId];
  if (inputHopper?.nodeType !== 'hopper' || outputAHopper?.nodeType !== 'hopper' || outputBHopper?.nodeType !== 'hopper') {
    node.lastError = 'Splitter requires Hopper-compatible storage on feed and both outputs';
    node.operatingState = 'blocked';
    return;
  }
  if (inputHopper.id === outputAHopper.id || inputHopper.id === outputBHopper.id) {
    node.lastError = 'Splitter outputs must use storage distinct from the feed Hopper';
    node.operatingState = 'blocked';
    return;
  }

  const storedMassKg = hopperStoredMassKg(inputHopper);
  const candidateRate = Math.min(node.throughputKgPerSecond, storedMassKg / dt);
  let candidateFeed = proportionalSolidStateFromHopper(inputHopper, candidateRate);
  let candidateResult;
  try {
    candidateResult = applyContinuousSplitting(candidateFeed, node.splitFractionToA, node.throughputKgPerSecond);
  } catch (error) {
    node.lastError = error.message;
    node.operatingState = 'blocked';
    return;
  }

  const capacityScale = Math.min(
    capacityScaleForOutput(hopperFreeCapacityKg(outputAHopper), candidateResult.outputASolidState, dt),
    capacityScaleForOutput(hopperFreeCapacityKg(outputBHopper), candidateResult.outputBSolidState, dt),
  );
  if (capacityScale <= APPARATUS_TRANSFER_TOLERANCE_KG) {
    node.lastError = 'One or more required Splitter outputs are full';
    node.operatingState = 'blocked';
    return;
  }
  if (capacityScale < 1) candidateFeed = multiplySolidMaterialState(candidateFeed, capacityScale);

  const stagedInput = cloneHopperMaterialState(inputHopper);
  const stagedA = cloneHopperMaterialState(outputAHopper);
  const stagedB = cloneHopperMaterialState(outputBHopper);
  const withdrawal = hopperWithdraw(stagedInput, totalSolidQuantity(candidateFeed), dt);
  if (withdrawal.actualTotalKg <= APPARATUS_TRANSFER_TOLERANCE_KG) {
    node.lastError = null;
    node.operatingState = 'idle';
    return;
  }

  const actualFeed = multiplySolidMaterialState(withdrawal.actualSolidState, 1 / dt);
  const result = applyContinuousSplitting(actualFeed, node.splitFractionToA, node.throughputKgPerSecond);
  const expectedAKg = totalSolidQuantity(result.outputASolidState) * dt;
  const acceptedAKg = hopperReceiveInflow(stagedA, result.outputASolidState, dt);
  assertTransferAccepted(expectedAKg, acceptedAKg, 'Splitter output A');
  const expectedBKg = totalSolidQuantity(result.outputBSolidState) * dt;
  const acceptedBKg = hopperReceiveInflow(stagedB, result.outputBSolidState, dt);
  assertTransferAccepted(expectedBKg, acceptedBKg, 'Splitter output B');

  commitHopperMaterialState(inputHopper, stagedInput);
  commitHopperMaterialState(outputAHopper, stagedA);
  commitHopperMaterialState(outputBHopper, stagedB);
  updateConnectionStream(blueprint, inputConnection, actualFeed);
  updateConnectionStream(blueprint, outputAConnection, result.outputASolidState);
  updateConnectionStream(blueprint, outputBConnection, result.outputBSolidState);
  node.lastError = null;
  node.operatingState = 'running';
}
