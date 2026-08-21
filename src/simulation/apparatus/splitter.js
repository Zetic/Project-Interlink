import { SPLITTING_PROCESS_ID } from '../../core/processes/definitions/index.js';
import { PORT_CAPABILITIES } from '../../core/systems/ports.js';
import {
  hopperFreeCapacityKg,
  hopperReceiveInflow,
  hopperStoredMassKg,
  hopperWithdraw,
  HOPPER_TOLERANCE_KG,
} from '../hopperNode.js';
import {
  findInboundConnection,
  findOutboundConnection,
  updateConnectionStream,
} from './blueprintHelpers.js';
import {
  APPARATUS_TRANSFER_TOLERANCE_KG,
  assertTransferAccepted,
  outputSpecificSensibleEnthalpiesFromWithdrawals,
  scaleSolidStateForRuntime,
  solidStateMassForRuntime,
} from './materialTransferHelpers.js';
import { assertHopperCanReceivePlannedSolidState } from './transactionHelpers.js';

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
  const requestedAKg = candidateRate * node.splitFractionToA * dt;
  const requestedBKg = candidateRate * (1 - node.splitFractionToA) * dt;
  const scaleA = requestedAKg <= APPARATUS_TRANSFER_TOLERANCE_KG
    ? 1
    : hopperFreeCapacityKg(outputAHopper) / requestedAKg;
  const scaleB = requestedBKg <= APPARATUS_TRANSFER_TOLERANCE_KG
    ? 1
    : hopperFreeCapacityKg(outputBHopper) / requestedBKg;
  const capacityScale = Math.max(0, Math.min(1, scaleA, scaleB));
  if (capacityScale <= APPARATUS_TRANSFER_TOLERANCE_KG) {
    node.lastError = 'One or more required Splitter outputs are full';
    node.operatingState = 'blocked';
    return;
  }

  const plannedRate = candidateRate * capacityScale;
  const plannedFeed = scaleSolidStateForRuntime(
    inputHopper.materialBody.solidState,
    plannedRate / storedMassKg,
  );
  const outputASolidState = scaleSolidStateForRuntime(plannedFeed, node.splitFractionToA);
  const outputBSolidState = scaleSolidStateForRuntime(plannedFeed, 1 - node.splitFractionToA);
  const expectedAKg = solidStateMassForRuntime(outputASolidState) * dt;
  const expectedBKg = solidStateMassForRuntime(outputBSolidState) * dt;

  try {
    assertHopperCanReceivePlannedSolidState(outputAHopper, outputASolidState, expectedAKg, 'Splitter output A');
    assertHopperCanReceivePlannedSolidState(outputBHopper, outputBSolidState, expectedBKg, 'Splitter output B');
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
  const [outputASpecificSensibleEnthalpyJPerKg, outputBSpecificSensibleEnthalpyJPerKg] = outputSpecificSensibleEnthalpiesFromWithdrawals(
    [withdrawal],
    [outputASolidState, outputBSolidState],
  );

  const acceptedAKg = hopperReceiveInflow(
    outputAHopper,
    outputASolidState,
    dt,
    outputASpecificSensibleEnthalpyJPerKg,
  );
  assertTransferAccepted(expectedAKg, acceptedAKg, 'Splitter output A');
  const acceptedBKg = hopperReceiveInflow(
    outputBHopper,
    outputBSolidState,
    dt,
    outputBSpecificSensibleEnthalpyJPerKg,
  );
  assertTransferAccepted(expectedBKg, acceptedBKg, 'Splitter output B');

  updateConnectionStream(blueprint, inputConnection, actualFeed, withdrawal.actualSpecificSensibleEnthalpyJPerKg);
  updateConnectionStream(blueprint, outputAConnection, outputASolidState, outputASpecificSensibleEnthalpyJPerKg);
  updateConnectionStream(blueprint, outputBConnection, outputBSolidState, outputBSpecificSensibleEnthalpyJPerKg);
  node.lastError = null;
  node.operatingState = 'running';
}