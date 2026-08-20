import {
  CONE_CRUSHING_PROCESS_ID,
  JAW_CRUSHING_PROCESS_ID,
  MILLING_PROCESS_ID,
  getProcessDefinition,
} from '../../core/processes/definitions/index.js';
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
import { applyContinuousStagedComminution } from '../continuousComminution.js';
import {
  findInboundConnection,
  findOutboundConnection,
  updateConnectionStream,
} from './blueprintHelpers.js';
import {
  APPARATUS_TRANSFER_TOLERANCE_KG,
  assertTransferAccepted,
  proportionalSolidStateFromHopper,
} from './materialTransferHelpers.js';

const MACHINE_CONFIG = Object.freeze({
  jawCrusher: Object.freeze({
    nodeType: 'jawCrusher',
    systemType: 'jaw-crusher',
    processId: JAW_CRUSHING_PROCESS_ID,
    parameterId: 'jawProductSizeMm',
    label: 'Jaw Crusher',
  }),
  coneCrusher: Object.freeze({
    nodeType: 'coneCrusher',
    systemType: 'cone-crusher',
    processId: CONE_CRUSHING_PROCESS_ID,
    parameterId: 'coneProductSizeMm',
    label: 'Cone Crusher',
  }),
  ballMill: Object.freeze({
    nodeType: 'ballMill',
    systemType: 'ball-mill',
    processId: MILLING_PROCESS_ID,
    parameterId: 'millProductSizeMm',
    label: 'Ball Mill',
  }),
});

function createComminutionNode(config, {
  id,
  throughputKgPerSecond,
  ratedPowerKw,
  enabled = false,
  ...parameters
} = {}) {
  if (typeof throughputKgPerSecond !== 'number' || !Number.isFinite(throughputKgPerSecond) || throughputKgPerSecond <= 0) {
    throw new Error(`${config.label} throughputKgPerSecond must be a finite positive number`);
  }
  if (typeof ratedPowerKw !== 'number' || !Number.isFinite(ratedPowerKw) || ratedPowerKw <= 0) {
    throw new Error(`${config.label} ratedPowerKw must be a finite positive number`);
  }
  if (typeof enabled !== 'boolean') throw new Error(`${config.label} enabled must be boolean`);
  const targetParticleSizeMm = parameters[config.parameterId];
  const processDefinition = getProcessDefinition(config.processId);
  return {
    id,
    nodeType: config.nodeType,
    systemType: config.systemType,
    kind: 'primitive',
    processId: config.processId,
    throughputKgPerSecond,
    ratedPowerKw,
    maxFeedParticleSizeMm: processDefinition?.maxFeedParticleSizeMm ?? null,
    [config.parameterId]: targetParticleSizeMm,
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
    lastSpecificEnergyKWhPerT: 0,
    lastPowerKw: 0,
    lastBondAbrasionIndex: 0,
    abrasionExposureTonneAi: 0,
    lastError: null,
    enabled,
    operatingState: enabled ? 'idle' : 'off',
  };
}

function setIdleDiagnostics(node) {
  node.lastSpecificEnergyKWhPerT = 0;
  node.lastPowerKw = 0;
}

function simulateComminutionNode(blueprint, node, dt, config) {
  if (!node.enabled) {
    node.operatingState = 'off';
    node.lastError = null;
    setIdleDiagnostics(node);
    return;
  }

  const inputConnection = findInboundConnection(blueprint, node.id, node.inputPortId);
  const outputConnection = findOutboundConnection(blueprint, node.id, node.outputPortId);
  if (!inputConnection) {
    node.lastError = null;
    node.operatingState = 'idle';
    setIdleDiagnostics(node);
    return;
  }

  const inputHopper = blueprint.nodes[inputConnection.sourceNodeId];
  if (inputHopper?.nodeType === 'hopper' && hopperStoredMassKg(inputHopper) <= HOPPER_TOLERANCE_KG) {
    node.lastError = null;
    node.operatingState = 'idle';
    setIdleDiagnostics(node);
    return;
  }
  if (!outputConnection) {
    node.lastError = `${config.label} requires connected feed and product ports`;
    node.operatingState = 'blocked';
    setIdleDiagnostics(node);
    return;
  }

  const outputHopper = blueprint.nodes[outputConnection.targetNodeId];
  if (inputHopper?.nodeType !== 'hopper' || outputHopper?.nodeType !== 'hopper' || inputHopper.id === outputHopper.id) {
    node.lastError = `${config.label} requires distinct input and output storage`;
    node.operatingState = 'blocked';
    setIdleDiagnostics(node);
    return;
  }

  const storedMassKg = hopperStoredMassKg(inputHopper);
  const freeOutputKg = hopperFreeCapacityKg(outputHopper);
  if (freeOutputKg <= HOPPER_TOLERANCE_KG) {
    node.lastError = 'Product storage is full';
    node.operatingState = 'blocked';
    setIdleDiagnostics(node);
    return;
  }

  const mechanicalRate = Math.min(node.throughputKgPerSecond, storedMassKg / dt, freeOutputKg / dt);
  if (mechanicalRate <= 0) {
    node.operatingState = 'blocked';
    setIdleDiagnostics(node);
    return;
  }

  const candidateFeed = proportionalSolidStateFromHopper(inputHopper, mechanicalRate);
  const targetParticleSizeMm = node[config.parameterId];
  let planned;
  try {
    planned = applyContinuousStagedComminution(
      candidateFeed,
      config.processId,
      targetParticleSizeMm,
      node.throughputKgPerSecond,
      node.ratedPowerKw,
    );
  } catch (error) {
    node.lastError = error.message;
    node.operatingState = 'blocked';
    setIdleDiagnostics(node);
    return;
  }

  const plannedRate = totalSolidQuantity(planned.actualFeedSolidState);
  if (plannedRate <= APPARATUS_TRANSFER_TOLERANCE_KG) {
    node.lastError = null;
    node.operatingState = 'idle';
    setIdleDiagnostics(node);
    return;
  }

  const stagedInput = cloneHopperMaterialState(inputHopper);
  const stagedOutput = cloneHopperMaterialState(outputHopper);
  const withdrawal = hopperWithdraw(stagedInput, plannedRate, dt);
  if (withdrawal.actualTotalKg <= APPARATUS_TRANSFER_TOLERANCE_KG) {
    node.lastError = null;
    node.operatingState = 'idle';
    setIdleDiagnostics(node);
    return;
  }

  const actualFeed = multiplySolidMaterialState(withdrawal.actualSolidState, 1 / dt);
  let result;
  try {
    result = applyContinuousStagedComminution(
      actualFeed,
      config.processId,
      targetParticleSizeMm,
      node.throughputKgPerSecond,
      node.ratedPowerKw,
    );
  } catch (error) {
    node.lastError = error.message;
    node.operatingState = 'blocked';
    setIdleDiagnostics(node);
    return;
  }

  const actuallyProcessedRate = totalSolidQuantity(result.actualFeedSolidState);
  if (Math.abs(actuallyProcessedRate - totalSolidQuantity(actualFeed)) > APPARATUS_TRANSFER_TOLERANCE_KG) {
    throw new Error(`${config.label} power planning changed after staged withdrawal`);
  }

  const expectedOutputKg = totalSolidQuantity(result.productSolidState) * dt;
  const acceptedOutputKg = hopperReceiveInflow(stagedOutput, result.productSolidState, dt);
  assertTransferAccepted(expectedOutputKg, acceptedOutputKg, config.label);

  commitHopperMaterialState(inputHopper, stagedInput);
  commitHopperMaterialState(outputHopper, stagedOutput);
  updateConnectionStream(blueprint, inputConnection, result.actualFeedSolidState);
  updateConnectionStream(blueprint, outputConnection, result.productSolidState);
  node.lastSpecificEnergyKWhPerT = result.specificEnergyKWhPerT;
  node.lastPowerKw = result.actualPowerKw;
  node.lastBondAbrasionIndex = result.comminutionProperties.bondAbrasionIndex;
  node.abrasionExposureTonneAi += (expectedOutputKg / 1000) * node.lastBondAbrasionIndex;
  node.lastError = null;
  node.operatingState = 'running';
}

export function createJawCrusher(parameters = {}) {
  return createComminutionNode(MACHINE_CONFIG.jawCrusher, parameters);
}

export function createConeCrusher(parameters = {}) {
  return createComminutionNode(MACHINE_CONFIG.coneCrusher, parameters);
}

export function createBallMill(parameters = {}) {
  return createComminutionNode(MACHINE_CONFIG.ballMill, parameters);
}

export function simulateJawCrusherNode(blueprint, node, dt) {
  return simulateComminutionNode(blueprint, node, dt, MACHINE_CONFIG.jawCrusher);
}

export function simulateConeCrusherNode(blueprint, node, dt) {
  return simulateComminutionNode(blueprint, node, dt, MACHINE_CONFIG.coneCrusher);
}

export function simulateBallMillNode(blueprint, node, dt) {
  return simulateComminutionNode(blueprint, node, dt, MACHINE_CONFIG.ballMill);
}
