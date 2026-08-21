import { SCREENING_PROCESS_ID } from '../../core/processes/definitions/index.js';
import { PORT_CAPABILITIES } from '../../core/systems/ports.js';
import {
  hopperFreeCapacityKg,
  hopperReceiveInflow,
  hopperStoredMassKg,
  hopperWithdraw,
  HOPPER_TOLERANCE_KG,
} from '../hopperNode.js';
import { applyContinuousScreening } from '../continuousProcessing.js';
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

export function createScreen({
  id,
  apertureSizeMm,
  throughputKgPerSecond,
  enabled = false,
} = {}) {
  if (typeof throughputKgPerSecond !== 'number' || !Number.isFinite(throughputKgPerSecond) || throughputKgPerSecond <= 0) {
    throw new Error('Screen throughputKgPerSecond must be a finite positive number');
  }
  if (typeof enabled !== 'boolean') throw new Error('Screen enabled must be boolean');

  return {
    id,
    nodeType: 'screen',
    systemType: 'screen',
    kind: 'primitive',
    processId: SCREENING_PROCESS_ID,
    apertureSizeMm,
    throughputKgPerSecond,
    inputPortId: 'feed',
    undersizePortId: 'undersize',
    oversizePortId: 'oversize',
    ports: [
      { id: 'feed', direction: 'input', kind: 'material', label: 'feed', accepts: [PORT_CAPABILITIES.STORED_SOLID_PARTICULATE] },
      { id: 'undersize', direction: 'output', kind: 'material', label: 'undersize', provides: [PORT_CAPABILITIES.SOLID_PARTICULATE] },
      { id: 'oversize', direction: 'output', kind: 'material', label: 'oversize', provides: [PORT_CAPABILITIES.SOLID_PARTICULATE] },
    ],
    lastError: null,
    enabled,
    operatingState: enabled ? 'idle' : 'off',
  };
}

export function simulateScreenNode(blueprint, node, dt) {
  if (!node.enabled) {
    node.operatingState = 'off';
    return;
  }

  const inputConnection = findInboundConnection(blueprint, node.id, node.inputPortId);
  const undersizeConnection = findOutboundConnection(blueprint, node.id, node.undersizePortId);
  const oversizeConnection = findOutboundConnection(blueprint, node.id, node.oversizePortId);
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
  if (!undersizeConnection || !oversizeConnection) {
    node.lastError = 'Screen requires feed, undersize, and oversize connections';
    node.operatingState = 'blocked';
    return;
  }

  const undersizeHopper = blueprint.nodes[undersizeConnection.targetNodeId];
  const oversizeHopper = blueprint.nodes[oversizeConnection.targetNodeId];
  if (inputHopper?.nodeType !== 'hopper' || undersizeHopper?.nodeType !== 'hopper' || oversizeHopper?.nodeType !== 'hopper') {
    node.lastError = 'Screen requires Hopper-compatible storage on feed and both outputs';
    node.operatingState = 'blocked';
    return;
  }
  if (inputHopper.id === undersizeHopper.id || inputHopper.id === oversizeHopper.id) {
    node.lastError = 'Screen outputs must use storage distinct from the feed Hopper';
    node.operatingState = 'blocked';
    return;
  }

  const storedMassKg = hopperStoredMassKg(inputHopper);
  const candidateRate = Math.min(node.throughputKgPerSecond, storedMassKg / dt);
  const candidateFeed = proportionalSolidStateFromHopper(inputHopper, candidateRate);
  let candidateResult;
  try {
    candidateResult = applyContinuousScreening(candidateFeed, node.apertureSizeMm, node.throughputKgPerSecond);
  } catch (error) {
    node.lastError = error.message;
    node.operatingState = 'blocked';
    return;
  }

  const capacityScale = Math.min(
    capacityScaleForOutput(hopperFreeCapacityKg(undersizeHopper), candidateResult.undersizeSolidState, dt),
    capacityScaleForOutput(hopperFreeCapacityKg(oversizeHopper), candidateResult.oversizeSolidState, dt),
  );
  if (capacityScale <= APPARATUS_TRANSFER_TOLERANCE_KG) {
    node.lastError = 'One or more required Screen outputs are full';
    node.operatingState = 'blocked';
    return;
  }

  const actualFeedSolidState = capacityScale < 1
    ? scaleSolidStateForRuntime(candidateResult.actualFeedSolidState, capacityScale)
    : candidateResult.actualFeedSolidState;
  const undersizeSolidState = capacityScale < 1
    ? scaleSolidStateForRuntime(candidateResult.undersizeSolidState, capacityScale)
    : candidateResult.undersizeSolidState;
  const oversizeSolidState = capacityScale < 1
    ? scaleSolidStateForRuntime(candidateResult.oversizeSolidState, capacityScale)
    : candidateResult.oversizeSolidState;
  const plannedRate = solidStateMassForRuntime(actualFeedSolidState);
  const expectedUndersizeKg = solidStateMassForRuntime(undersizeSolidState) * dt;
  const expectedOversizeKg = solidStateMassForRuntime(oversizeSolidState) * dt;

  try {
    assertHopperCanReceivePlannedSolidState(undersizeHopper, undersizeSolidState, expectedUndersizeKg, 'Screen undersize');
    assertHopperCanReceivePlannedSolidState(oversizeHopper, oversizeSolidState, expectedOversizeKg, 'Screen oversize');
  } catch (error) {
    node.lastError = error.message;
    node.operatingState = 'blocked';
    return;
  }

  const withdrawal = hopperWithdraw(inputHopper, plannedRate, dt);
  if (withdrawal.actualTotalKg <= APPARATUS_TRANSFER_TOLERANCE_KG) {
    node.lastError = null;
    node.operatingState = 'idle';
    return;
  }
  const actualFeed = scaleSolidStateForRuntime(withdrawal.actualSolidState, 1 / dt);
  const [undersizeSpecificSensibleEnthalpyJPerKg, oversizeSpecificSensibleEnthalpyJPerKg] = outputSpecificSensibleEnthalpiesFromWithdrawals(
    [withdrawal],
    [undersizeSolidState, oversizeSolidState],
  );
  const acceptedUndersizeKg = hopperReceiveInflow(
    undersizeHopper,
    undersizeSolidState,
    dt,
    undersizeSpecificSensibleEnthalpyJPerKg,
  );
  assertTransferAccepted(expectedUndersizeKg, acceptedUndersizeKg, 'Screen undersize');
  const acceptedOversizeKg = hopperReceiveInflow(
    oversizeHopper,
    oversizeSolidState,
    dt,
    oversizeSpecificSensibleEnthalpyJPerKg,
  );
  assertTransferAccepted(expectedOversizeKg, acceptedOversizeKg, 'Screen oversize');

  updateConnectionStream(blueprint, inputConnection, actualFeed, withdrawal.actualSpecificSensibleEnthalpyJPerKg);
  updateConnectionStream(blueprint, undersizeConnection, undersizeSolidState, undersizeSpecificSensibleEnthalpyJPerKg);
  updateConnectionStream(blueprint, oversizeConnection, oversizeSolidState, oversizeSpecificSensibleEnthalpyJPerKg);
  node.lastError = null;
  node.operatingState = 'running';
}