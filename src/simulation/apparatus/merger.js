import { MERGING_PROCESS_ID } from '../../core/processes/definitions/index.js';
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
import { applyContinuousMerging } from '../continuousProcessing.js';
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

export function createMerger({
  id,
  throughputKgPerSecond,
  enabled = false,
} = {}) {
  if (typeof throughputKgPerSecond !== 'number' || !Number.isFinite(throughputKgPerSecond) || throughputKgPerSecond <= 0) {
    throw new Error('Material Merger throughputKgPerSecond must be a finite positive number');
  }
  if (typeof enabled !== 'boolean') throw new Error('Material Merger enabled must be boolean');

  return {
    id,
    nodeType: 'merger',
    systemType: 'merger',
    kind: 'primitive',
    processId: MERGING_PROCESS_ID,
    throughputKgPerSecond,
    inputAPortId: 'input-a',
    inputBPortId: 'input-b',
    outputPortId: 'product',
    ports: [
      { id: 'input-a', direction: 'input', kind: 'material', label: 'A', accepts: [PORT_CAPABILITIES.STORED_SOLID_PARTICULATE] },
      { id: 'input-b', direction: 'input', kind: 'material', label: 'B', accepts: [PORT_CAPABILITIES.STORED_SOLID_PARTICULATE] },
      { id: 'product', direction: 'output', kind: 'material', label: 'product', provides: [PORT_CAPABILITIES.SOLID_PARTICULATE] },
    ],
    lastError: null,
    enabled,
    operatingState: enabled ? 'idle' : 'off',
  };
}

export function simulateMergerNode(blueprint, node, dt) {
  if (!node.enabled) {
    node.operatingState = 'off';
    return;
  }

  const inputAConnection = findInboundConnection(blueprint, node.id, node.inputAPortId);
  const inputBConnection = findInboundConnection(blueprint, node.id, node.inputBPortId);
  const outputConnection = findOutboundConnection(blueprint, node.id, node.outputPortId);
  if (!inputAConnection || !inputBConnection || !outputConnection) {
    node.lastError = 'Material Merger requires input A, input B, and product connections';
    node.operatingState = 'blocked';
    return;
  }

  const inputAHopper = blueprint.nodes[inputAConnection.sourceNodeId];
  const inputBHopper = blueprint.nodes[inputBConnection.sourceNodeId];
  const outputHopper = blueprint.nodes[outputConnection.targetNodeId];
  if (inputAHopper?.nodeType !== 'hopper' || inputBHopper?.nodeType !== 'hopper' || outputHopper?.nodeType !== 'hopper') {
    node.lastError = 'Material Merger requires Hopper-compatible storage on both inputs and output';
    node.operatingState = 'blocked';
    return;
  }
  if (outputHopper.id === inputAHopper.id || outputHopper.id === inputBHopper.id) {
    node.lastError = 'Material Merger output storage must be distinct from both input Hoppers';
    node.operatingState = 'blocked';
    return;
  }

  const storedA = hopperStoredMassKg(inputAHopper);
  const storedB = hopperStoredMassKg(inputBHopper);
  const totalStored = storedA + storedB;
  if (totalStored <= HOPPER_TOLERANCE_KG) {
    node.lastError = null;
    node.operatingState = 'idle';
    return;
  }

  const candidateTotalRate = Math.min(node.throughputKgPerSecond, totalStored / dt);
  const candidateRateA = candidateTotalRate * (storedA / totalStored);
  const candidateRateB = candidateTotalRate * (storedB / totalStored);
  let candidateA = proportionalSolidStateFromHopper(inputAHopper, candidateRateA);
  let candidateB = proportionalSolidStateFromHopper(inputBHopper, candidateRateB);
  const candidateResult = applyContinuousMerging(candidateA, candidateB, node.throughputKgPerSecond);
  const capacityScale = capacityScaleForOutput(
    hopperFreeCapacityKg(outputHopper),
    candidateResult.productSolidState,
    dt,
  );
  if (capacityScale <= APPARATUS_TRANSFER_TOLERANCE_KG) {
    node.lastError = 'Material Merger product output is full';
    node.operatingState = 'blocked';
    return;
  }
  if (capacityScale < 1) {
    candidateA = multiplySolidMaterialState(candidateA, capacityScale);
    candidateB = multiplySolidMaterialState(candidateB, capacityScale);
  }

  const stagedA = cloneHopperMaterialState(inputAHopper);
  const stagedB = cloneHopperMaterialState(inputBHopper);
  const stagedOutput = cloneHopperMaterialState(outputHopper);
  const withdrawalA = hopperWithdraw(stagedA, totalSolidQuantity(candidateA), dt);
  const withdrawalB = hopperWithdraw(stagedB, totalSolidQuantity(candidateB), dt);
  const totalWithdrawn = withdrawalA.actualTotalKg + withdrawalB.actualTotalKg;
  if (totalWithdrawn <= APPARATUS_TRANSFER_TOLERANCE_KG) {
    node.lastError = null;
    node.operatingState = 'idle';
    return;
  }

  const actualA = multiplySolidMaterialState(withdrawalA.actualSolidState, 1 / dt);
  const actualB = multiplySolidMaterialState(withdrawalB.actualSolidState, 1 / dt);
  const result = applyContinuousMerging(actualA, actualB, node.throughputKgPerSecond);
  const expectedOutputKg = totalSolidQuantity(result.productSolidState) * dt;
  const acceptedOutputKg = hopperReceiveInflow(stagedOutput, result.productSolidState, dt);
  assertTransferAccepted(expectedOutputKg, acceptedOutputKg, 'Material Merger product');

  commitHopperMaterialState(inputAHopper, stagedA);
  commitHopperMaterialState(inputBHopper, stagedB);
  commitHopperMaterialState(outputHopper, stagedOutput);
  updateConnectionStream(blueprint, inputAConnection, actualA);
  updateConnectionStream(blueprint, inputBConnection, actualB);
  updateConnectionStream(blueprint, outputConnection, result.productSolidState);
  node.lastError = null;
  node.operatingState = 'running';
}
