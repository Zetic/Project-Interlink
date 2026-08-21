import {
  MAGNETIC_SEPARATION_PROCESS_ID,
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
import { applyContinuousMagneticSeparation } from '../continuousProcessing.js';
import {
  findInboundConnection,
  findOutboundConnection,
  updateConnectionStream,
} from './blueprintHelpers.js';
import {
  APPARATUS_TRANSFER_TOLERANCE_KG,
  assertTransferAccepted,
  capacityScaleForOutput,
  outputSpecificSensibleEnthalpiesFromWithdrawals,
  proportionalSolidStateFromHopper,
  scaleSolidStateForRuntime,
  solidStateMassForRuntime,
} from './materialTransferHelpers.js';
import { assertHopperCanReceivePlannedSolidState } from './transactionHelpers.js';

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
      { id: 'feed', direction: 'input', kind: 'material', label: 'feed', accepts: [PORT_CAPABILITIES.STORED_SOLID_PARTICULATE] },
      { id: 'concentrate', direction: 'output', kind: 'material', label: 'concentrate', provides: [PORT_CAPABILITIES.SOLID_PARTICULATE] },
      { id: 'tailings', direction: 'output', kind: 'material', label: 'tailings', provides: [PORT_CAPABILITIES.SOLID_PARTICULATE] },
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
  const candidateFeed = proportionalSolidStateFromHopper(inputHopper, candidateRate);
  let candidateResult;
  try {
    candidateResult = applyContinuousMagneticSeparation(candidateFeed, node.fieldStrength, node.maxFeedParticleSizeMm);
  } catch (error) {
    node.lastError = error.message;
    node.operatingState = 'blocked';
    return;
  }

  const capacityScale = Math.min(
    capacityScaleForOutput(hopperFreeCapacityKg(concentrateHopper), candidateResult.concentrateSolidState, dt),
    capacityScaleForOutput(hopperFreeCapacityKg(tailingsHopper), candidateResult.tailingsSolidState, dt),
  );
  if (capacityScale <= APPARATUS_TRANSFER_TOLERANCE_KG) {
    node.lastError = 'One or more output hoppers are full';
    node.operatingState = 'blocked';
    return;
  }

  const actualFeedSolidState = capacityScale < 1
    ? scaleSolidStateForRuntime(candidateResult.actualFeedSolidState, capacityScale)
    : candidateResult.actualFeedSolidState;
  const concentrateSolidState = capacityScale < 1
    ? scaleSolidStateForRuntime(candidateResult.concentrateSolidState, capacityScale)
    : candidateResult.concentrateSolidState;
  const tailingsSolidState = capacityScale < 1
    ? scaleSolidStateForRuntime(candidateResult.tailingsSolidState, capacityScale)
    : candidateResult.tailingsSolidState;
  const plannedRate = solidStateMassForRuntime(actualFeedSolidState);
  const expectedConcentrateKg = solidStateMassForRuntime(concentrateSolidState) * dt;
  const expectedTailingsKg = solidStateMassForRuntime(tailingsSolidState) * dt;

  try {
    assertHopperCanReceivePlannedSolidState(concentrateHopper, concentrateSolidState, expectedConcentrateKg, 'Magnetic Separator concentrate');
    assertHopperCanReceivePlannedSolidState(tailingsHopper, tailingsSolidState, expectedTailingsKg, 'Magnetic Separator tailings');
  } catch (error) {
    node.lastError = error.message;
    node.operatingState = 'blocked';
    return;
  }

  const withdrawal = hopperWithdraw(inputHopper, plannedRate, dt);
  if (withdrawal.actualTotalKg <= APPARATUS_TRANSFER_TOLERANCE_KG) {
    node.operatingState = 'idle';
    return;
  }
  const actualFeed = scaleSolidStateForRuntime(withdrawal.actualSolidState, 1 / dt);
  const [concentrateSpecificSensibleEnthalpyJPerKg, tailingsSpecificSensibleEnthalpyJPerKg] = outputSpecificSensibleEnthalpiesFromWithdrawals(
    [withdrawal],
    [concentrateSolidState, tailingsSolidState],
  );

  const acceptedConcentrateKg = hopperReceiveInflow(
    concentrateHopper,
    concentrateSolidState,
    dt,
    concentrateSpecificSensibleEnthalpyJPerKg,
  );
  assertTransferAccepted(expectedConcentrateKg, acceptedConcentrateKg, 'Magnetic Separator concentrate');
  const acceptedTailingsKg = hopperReceiveInflow(
    tailingsHopper,
    tailingsSolidState,
    dt,
    tailingsSpecificSensibleEnthalpyJPerKg,
  );
  assertTransferAccepted(expectedTailingsKg, acceptedTailingsKg, 'Magnetic Separator tailings');

  updateConnectionStream(blueprint, inputConnection, actualFeed, withdrawal.actualSpecificSensibleEnthalpyJPerKg);
  updateConnectionStream(blueprint, concentrateConnection, concentrateSolidState, concentrateSpecificSensibleEnthalpyJPerKg);
  updateConnectionStream(blueprint, tailingsConnection, tailingsSolidState, tailingsSpecificSensibleEnthalpyJPerKg);
  node.lastError = null;
  node.operatingState = 'running';
}