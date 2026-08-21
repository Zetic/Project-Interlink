import {
  MAGNETIC_SEPARATION_PROCESS_ID,
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
import { applyContinuousMagneticSeparation } from '../continuousProcessing.js';
import {
  findInboundConnection,
  findOutboundConnection,
  updateConnectionStream,
} from './blueprintHelpers.js';
import {
  outputSpecificSensibleEnthalpies,
  solidBodyForWithdrawal,
} from './materialTransferHelpers.js';

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

function capacityScaleForOutput(freeCapacityKg, componentRates, dt) {
  const requiredKg = totalSolidQuantity(componentRates) * dt;
  if (requiredKg <= TRANSFER_TOLERANCE_KG) return 1;
  return Math.max(0, Math.min(1, freeCapacityKg / requiredKg));
}

function assertTransferAccepted(expectedKg, acceptedKg, context) {
  if (Math.abs(expectedKg - acceptedKg) > TRANSFER_TOLERANCE_KG * Math.max(1, expectedKg)) {
    throw new Error(`${context} could not commit its planned output atomically`);
  }
}

export function createMagneticSeparator({
  id,
  fieldStrength,
  throughputKgPerSecond,
  enabled = false,
} = {}) {
  if (typeof throughputKgPerSecond !== 'number' || !Number.isFinite(throughputKgPerSecond) || throughputKgPerSecond <= 0) {
    throw new Error('Magnetic Separator throughputKgPerSecond must be a finite positive number');
  }
  if (typeof enabled !== 'boolean') throw new Error('Magnetic Separator enabled must be boolean');
  const processDefinition = getProcessDefinition(MAGNETIC_SEPARATION_PROCESS_ID);
  return {
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
    ports: [
      {
        id: 'feed',
        direction: 'input',
        kind: 'material',
        label: 'feed',
        accepts: [PORT_CAPABILITIES.STORED_SOLID_PARTICULATE],
      },
      {
        id: 'concentrate',
        direction: 'output',
        kind: 'material',
        label: 'concentrate',
        provides: [PORT_CAPABILITIES.SOLID_PARTICULATE],
      },
      {
        id: 'tailings',
        direction: 'output',
        kind: 'material',
        label: 'tailings',
        provides: [PORT_CAPABILITIES.SOLID_PARTICULATE],
      },
    ],
    maxFeedParticleSizeMm: processDefinition?.maxFeedParticleSizeMm ?? 25,
    lastError: null,
    enabled,
    operatingState: enabled ? 'idle' : 'off',
  };
}

export function simulateMagSepNode(blueprint, node, dt) {
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
    candidateResult = applyContinuousMagneticSeparation(candidateFeedRates, node.fieldStrength, node.maxFeedParticleSizeMm);
  } catch (error) {
    node.lastError = error.message;
    node.operatingState = 'blocked';
    return;
  }

  const capacityScale = Math.min(
    capacityScaleForOutput(hopperFreeCapacityKg(concentrateHopper), candidateResult.concentrateSolidState, dt),
    capacityScaleForOutput(hopperFreeCapacityKg(tailingsHopper), candidateResult.tailingsSolidState, dt),
  );
  if (capacityScale <= TRANSFER_TOLERANCE_KG) {
    node.lastError = 'One or more output hoppers are full';
    node.operatingState = 'blocked';
    return;
  }
  if (capacityScale < 1) candidateFeedRates = multiplySolidMaterialState(candidateFeedRates, capacityScale);

  const stagedInput = cloneHopperMaterialState(inputHopper);
  const stagedConcentrate = cloneHopperMaterialState(concentrateHopper);
  const stagedTailings = cloneHopperMaterialState(tailingsHopper);
  const withdrawal = hopperWithdraw(stagedInput, totalSolidQuantity(candidateFeedRates), dt);
  if (withdrawal.actualTotalKg <= TRANSFER_TOLERANCE_KG) {
    node.operatingState = 'idle';
    return;
  }

  const actualFeed = multiplySolidMaterialState(withdrawal.actualSolidState, 1 / dt);
  const result = applyContinuousMagneticSeparation(actualFeed, node.fieldStrength, node.maxFeedParticleSizeMm);
  const [concentrateSpecificSensibleEnthalpyJPerKg, tailingsSpecificSensibleEnthalpyJPerKg] = outputSpecificSensibleEnthalpies(
    [solidBodyForWithdrawal(withdrawal)],
    [result.concentrateSolidState, result.tailingsSolidState],
  );
  const expectedConcentrateKg = totalSolidQuantity(result.concentrateSolidState) * dt;
  const acceptedConcentrateKg = hopperReceiveInflow(
    stagedConcentrate,
    result.concentrateSolidState,
    dt,
    concentrateSpecificSensibleEnthalpyJPerKg,
  );
  assertTransferAccepted(expectedConcentrateKg, acceptedConcentrateKg, 'Magnetic Separator concentrate');
  const expectedTailingsKg = totalSolidQuantity(result.tailingsSolidState) * dt;
  const acceptedTailingsKg = hopperReceiveInflow(
    stagedTailings,
    result.tailingsSolidState,
    dt,
    tailingsSpecificSensibleEnthalpyJPerKg,
  );
  assertTransferAccepted(expectedTailingsKg, acceptedTailingsKg, 'Magnetic Separator tailings');

  commitHopperMaterialState(inputHopper, stagedInput);
  commitHopperMaterialState(concentrateHopper, stagedConcentrate);
  commitHopperMaterialState(tailingsHopper, stagedTailings);
  updateConnectionStream(blueprint, inputConnection, actualFeed, withdrawal.actualSpecificSensibleEnthalpyJPerKg);
  updateConnectionStream(
    blueprint,
    concentrateConnection,
    result.concentrateSolidState,
    concentrateSpecificSensibleEnthalpyJPerKg,
  );
  updateConnectionStream(
    blueprint,
    tailingsConnection,
    result.tailingsSolidState,
    tailingsSpecificSensibleEnthalpyJPerKg,
  );
  node.lastError = null;
  node.operatingState = 'running';
}
