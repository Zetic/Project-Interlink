import { FEEDING_PROCESS_ID } from '../../core/processes/definitions/index.js';
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
import { applyContinuousFeeding } from '../continuousProcessing.js';
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

export function createFeeder({
  id,
  flowRateKgPerSecond,
  throughputKgPerSecond,
  enabled = false,
} = {}) {
  if (typeof flowRateKgPerSecond !== 'number' || !Number.isFinite(flowRateKgPerSecond) || flowRateKgPerSecond < 0) {
    throw new Error('Feeder flowRateKgPerSecond must be a finite non-negative number');
  }
  if (typeof throughputKgPerSecond !== 'number' || !Number.isFinite(throughputKgPerSecond) || throughputKgPerSecond <= 0) {
    throw new Error('Feeder throughputKgPerSecond must be a finite positive number');
  }
  if (typeof enabled !== 'boolean') throw new Error('Feeder enabled must be boolean');

  return {
    id,
    nodeType: 'feeder',
    systemType: 'feeder',
    kind: 'primitive',
    processId: FEEDING_PROCESS_ID,
    flowRateKgPerSecond,
    throughputKgPerSecond,
    inputPortId: 'feed',
    outputPortId: 'product',
    ports: [
      { id: 'feed', direction: 'input', kind: 'material', label: 'feed', accepts: [PORT_CAPABILITIES.STORED_SOLID_PARTICULATE] },
      { id: 'product', direction: 'output', kind: 'material', label: 'product', provides: [PORT_CAPABILITIES.SOLID_PARTICULATE] },
    ],
    lastError: null,
    enabled,
    operatingState: enabled ? 'idle' : 'off',
  };
}

export function simulateFeederNode(blueprint, node, dt) {
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
    node.lastError = 'Feeder requires feed and product connections';
    node.operatingState = 'blocked';
    return;
  }

  const outputHopper = blueprint.nodes[outputConnection.targetNodeId];
  if (inputHopper?.nodeType !== 'hopper' || outputHopper?.nodeType !== 'hopper') {
    node.lastError = 'Feeder requires Hopper-compatible storage on feed and output';
    node.operatingState = 'blocked';
    return;
  }
  if (inputHopper.id === outputHopper.id) {
    node.lastError = 'Feeder output storage must be distinct from the feed Hopper';
    node.operatingState = 'blocked';
    return;
  }
  if (node.flowRateKgPerSecond <= APPARATUS_TRANSFER_TOLERANCE_KG) {
    node.lastError = null;
    node.operatingState = 'idle';
    return;
  }

  const candidateRate = Math.min(
    node.flowRateKgPerSecond,
    node.throughputKgPerSecond,
    hopperStoredMassKg(inputHopper) / dt,
  );
  let candidateFeed = proportionalSolidStateFromHopper(inputHopper, candidateRate);
  const candidateResult = applyContinuousFeeding(
    candidateFeed,
    node.flowRateKgPerSecond,
    node.throughputKgPerSecond,
  );
  const capacityScale = capacityScaleForOutput(
    hopperFreeCapacityKg(outputHopper),
    candidateResult.productSolidState,
    dt,
  );
  if (capacityScale <= APPARATUS_TRANSFER_TOLERANCE_KG) {
    node.lastError = 'Feeder product output is full';
    node.operatingState = 'blocked';
    return;
  }
  if (capacityScale < 1) candidateFeed = multiplySolidMaterialState(candidateFeed, capacityScale);

  const stagedInput = cloneHopperMaterialState(inputHopper);
  const stagedOutput = cloneHopperMaterialState(outputHopper);
  const withdrawal = hopperWithdraw(stagedInput, totalSolidQuantity(candidateFeed), dt);
  if (withdrawal.actualTotalKg <= APPARATUS_TRANSFER_TOLERANCE_KG) {
    node.lastError = null;
    node.operatingState = 'idle';
    return;
  }

  const actualFeed = multiplySolidMaterialState(withdrawal.actualSolidState, 1 / dt);
  const result = applyContinuousFeeding(actualFeed, node.flowRateKgPerSecond, node.throughputKgPerSecond);
  const expectedOutputKg = totalSolidQuantity(result.productSolidState) * dt;
  const acceptedOutputKg = hopperReceiveInflow(stagedOutput, result.productSolidState, dt);
  assertTransferAccepted(expectedOutputKg, acceptedOutputKg, 'Feeder product');

  commitHopperMaterialState(inputHopper, stagedInput);
  commitHopperMaterialState(outputHopper, stagedOutput);
  updateConnectionStream(blueprint, inputConnection, actualFeed);
  updateConnectionStream(blueprint, outputConnection, result.productSolidState);
  node.lastError = null;
  node.operatingState = 'running';
}
