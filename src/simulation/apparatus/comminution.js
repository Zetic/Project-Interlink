import {
  CONE_CRUSHING_PROCESS_ID,
  JAW_CRUSHING_PROCESS_ID,
  MILLING_PROCESS_ID,
  getProcessDefinition,
} from '../../core/processes/definitions/index.js';
import { PORT_CAPABILITIES } from '../../core/systems/ports.js';
import {
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
  outputSpecificSensibleEnthalpiesFromWithdrawals,
  proportionalSolidStateFromHopper,
  scaleSolidStateForRuntime,
  solidStateMassForRuntime,
} from './materialTransferHelpers.js';
import { assertHopperCanReceivePlannedSolidState } from './transactionHelpers.js';

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
  let result;
  try {
    // The process kernel is deterministic for this feed and machine state. The
    // old runtime ran it once to plan power/throughput and then again after
    // cloning/withdrawing an identical proportional feed. Execute it once and
    // preflight the resulting transaction before authoritative withdrawal.
    result = applyContinuousStagedComminution(
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

  const plannedRate = solidStateMassForRuntime(result.actualFeedSolidState);
  if (plannedRate <= APPARATUS_TRANSFER_TOLERANCE_KG) {
    node.lastError = null;
    node.operatingState = 'idle';
    setIdleDiagnostics(node);
    return;
  }
  const expectedOutputKg = solidStateMassForRuntime(result.productSolidState) * dt;
  try {
    assertHopperCanReceivePlannedSolidState(outputHopper, result.productSolidState, expectedOutputKg, config.label);
  } catch (error) {
    node.lastError = error.message;
    node.operatingState = 'blocked';
    setIdleDiagnostics(node);
    return;
  }

  const withdrawal = hopperWithdraw(inputHopper, plannedRate, dt);
  if (withdrawal.actualTotalKg <= APPARATUS_TRANSFER_TOLERANCE_KG) {
    node.lastError = null;
    node.operatingState = 'idle';
    setIdleDiagnostics(node);
    return;
  }
  if (Math.abs(withdrawal.actualTotalKg / dt - plannedRate) > APPARATUS_TRANSFER_TOLERANCE_KG) {
    throw new Error(`${config.label} staged withdrawal no longer matches its deterministic plan`);
  }
  const actualFeed = scaleSolidStateForRuntime(withdrawal.actualSolidState, 1 / dt);
  const [productSpecificSensibleEnthalpyJPerKg] = outputSpecificSensibleEnthalpiesFromWithdrawals(
    [withdrawal],
    [result.productSolidState],
  );
  const acceptedOutputKg = hopperReceiveInflow(
    outputHopper,
    result.productSolidState,
    dt,
    productSpecificSensibleEnthalpyJPerKg,
  );
  assertTransferAccepted(expectedOutputKg, acceptedOutputKg, config.label);

  updateConnectionStream(
    blueprint,
    inputConnection,
    actualFeed,
    withdrawal.actualSpecificSensibleEnthalpyJPerKg,
  );
  updateConnectionStream(
    blueprint,
    outputConnection,
    result.productSolidState,
    productSpecificSensibleEnthalpyJPerKg,
  );
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