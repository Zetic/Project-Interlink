import { CRUSHING_PROCESS_ID } from '../../core/processes/definitions/index.js';
import { PORT_CAPABILITIES } from '../../core/systems/ports.js';
import { multiplySolidMaterialState, totalSolidQuantity } from '../../core/materials/solids/solidMaterialState.js';
import {
  cloneHopperMaterialState,
  commitHopperMaterialState,
  hopperFreeCapacityKg,
  hopperReceiveInflow,
  hopperStoredMassKg,
  hopperWithdraw,
  HOPPER_TOLERANCE_KG,
} from '../hopperNode.js';
import { applyContinuousCrushing } from '../continuousProcessing.js';
import {
  findInboundConnection,
  findOutboundConnection,
  updateConnectionStream,
} from './blueprintHelpers.js';

const TRANSFER_TOLERANCE_KG = 1e-8;

function proportionalSolidStateFromHopper(hopper, requestedTotalRateKgPerSecond) {
  const storedMassKg = hopperStoredMassKg(hopper);
  if (storedMassKg <= HOPPER_TOLERANCE_KG || requestedTotalRateKgPerSecond <= 0) {
    return { fractions: {} };
  }
  return multiplySolidMaterialState(
    hopper.materialBody.solidState,
    requestedTotalRateKgPerSecond / storedMassKg,
  );
}

function assertTransferAccepted(expectedKg, acceptedKg) {
  if (Math.abs(expectedKg - acceptedKg) > TRANSFER_TOLERANCE_KG * Math.max(1, expectedKg)) {
    throw new Error('Crusher could not commit its planned output atomically');
  }
}

export function createCrusher({
  id,
  throughputKgPerSecond,
  targetParticleSizeMm,
  enabled = false,
} = {}) {
  if (typeof throughputKgPerSecond !== 'number' || !Number.isFinite(throughputKgPerSecond) || throughputKgPerSecond <= 0) {
    throw new Error('Crusher throughputKgPerSecond must be a finite positive number');
  }
  if (typeof enabled !== 'boolean') throw new Error('Crusher enabled must be boolean');
  return {
    id,
    nodeType: 'crusher',
    systemType: 'crusher',
    kind: 'primitive',
    processId: CRUSHING_PROCESS_ID,
    throughputKgPerSecond,
    targetParticleSizeMm,
    inputPortId: 'feed',
    outputPortId: 'product',
    ports: [
      {
        id: 'feed',
        direction: 'input',
        kind: 'material',
        label: 'feed',
        accepts: [PORT_CAPABILITIES.STORED_SOLID_PARTICULATE],
      },
      {
        id: 'product',
        direction: 'output',
        kind: 'material',
        label: 'product',
        provides: [PORT_CAPABILITIES.SOLID_PARTICULATE],
      },
    ],
    lastError: null,
    enabled,
    operatingState: enabled ? 'idle' : 'off',
  };
}

export function simulateCrusherNode(blueprint, node, dt) {
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
  const expectedOutputKg = totalSolidQuantity(result.productSolidState) * dt;
  const acceptedOutputKg = hopperReceiveInflow(stagedOutput, result.productSolidState, dt);
  assertTransferAccepted(expectedOutputKg, acceptedOutputKg);

  commitHopperMaterialState(inputHopper, stagedInput);
  commitHopperMaterialState(outputHopper, stagedOutput);
  updateConnectionStream(blueprint, inputConnection, actualFeed);
  updateConnectionStream(blueprint, outputConnection, result.productSolidState);
  node.lastError = null;
  node.operatingState = 'running';
}
