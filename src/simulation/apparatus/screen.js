import { SCREENING_PROCESS_ID } from '../../core/processes/definitions/index.js';
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
import { applyContinuousScreening } from '../continuousProcessing.js';
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

function capacityScaleForOutput(freeCapacityKg, solidState, dt) {
  const requiredKg = totalSolidQuantity(solidState) * dt;
  if (requiredKg <= TRANSFER_TOLERANCE_KG) return 1;
  return Math.max(0, Math.min(1, freeCapacityKg / requiredKg));
}

function assertTransferAccepted(expectedKg, acceptedKg, context) {
  if (Math.abs(expectedKg - acceptedKg) > TRANSFER_TOLERANCE_KG * Math.max(1, expectedKg)) {
    throw new Error(`${context} could not commit its planned output atomically`);
  }
}

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
      {
        id: 'feed',
        direction: 'input',
        kind: 'material',
        label: 'feed',
        accepts: [PORT_CAPABILITIES.STORED_SOLID_PARTICULATE],
      },
      {
        id: 'undersize',
        direction: 'output',
        kind: 'material',
        label: 'undersize',
        provides: [PORT_CAPABILITIES.SOLID_PARTICULATE],
      },
      {
        id: 'oversize',
        direction: 'output',
        kind: 'material',
        label: 'oversize',
        provides: [PORT_CAPABILITIES.SOLID_PARTICULATE],
      },
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
  if (
    inputHopper?.nodeType !== 'hopper'
    || undersizeHopper?.nodeType !== 'hopper'
    || oversizeHopper?.nodeType !== 'hopper'
  ) {
    node.lastError = 'Screen requires Hopper-compatible storage on feed and both outputs';
    node.operatingState = 'blocked';
    return;
  }

  // A single Hopper cannot be staged as both feed and output without a separate
  // recirculation/transport contract. Reject that topology rather than risk an
  // ambiguous double-commit to one inventory owner.
  if (inputHopper.id === undersizeHopper.id || inputHopper.id === oversizeHopper.id) {
    node.lastError = 'Screen outputs must use storage distinct from the feed Hopper';
    node.operatingState = 'blocked';
    return;
  }

  const storedMassKg = hopperStoredMassKg(inputHopper);
  const candidateRate = Math.min(node.throughputKgPerSecond, storedMassKg / dt);
  let candidateFeed = proportionalSolidStateFromHopper(inputHopper, candidateRate);
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

  if (capacityScale <= TRANSFER_TOLERANCE_KG) {
    node.lastError = 'One or more required Screen outputs are full';
    node.operatingState = 'blocked';
    return;
  }
  if (capacityScale < 1) candidateFeed = multiplySolidMaterialState(candidateFeed, capacityScale);

  const stagedInput = cloneHopperMaterialState(inputHopper);
  const stagedUndersize = cloneHopperMaterialState(undersizeHopper);
  const stagedOversize = cloneHopperMaterialState(oversizeHopper);
  const withdrawal = hopperWithdraw(stagedInput, totalSolidQuantity(candidateFeed), dt);
  if (withdrawal.actualTotalKg <= TRANSFER_TOLERANCE_KG) {
    node.lastError = null;
    node.operatingState = 'idle';
    return;
  }

  const actualFeed = multiplySolidMaterialState(withdrawal.actualSolidState, 1 / dt);
  const result = applyContinuousScreening(actualFeed, node.apertureSizeMm, node.throughputKgPerSecond);
  const [undersizeSpecificSensibleEnthalpyJPerKg, oversizeSpecificSensibleEnthalpyJPerKg] = outputSpecificSensibleEnthalpies(
    [solidBodyForWithdrawal(withdrawal)],
    [result.undersizeSolidState, result.oversizeSolidState],
  );

  const expectedUndersizeKg = totalSolidQuantity(result.undersizeSolidState) * dt;
  const acceptedUndersizeKg = hopperReceiveInflow(
    stagedUndersize,
    result.undersizeSolidState,
    dt,
    undersizeSpecificSensibleEnthalpyJPerKg,
  );
  assertTransferAccepted(expectedUndersizeKg, acceptedUndersizeKg, 'Screen undersize');

  const expectedOversizeKg = totalSolidQuantity(result.oversizeSolidState) * dt;
  const acceptedOversizeKg = hopperReceiveInflow(
    stagedOversize,
    result.oversizeSolidState,
    dt,
    oversizeSpecificSensibleEnthalpyJPerKg,
  );
  assertTransferAccepted(expectedOversizeKg, acceptedOversizeKg, 'Screen oversize');

  commitHopperMaterialState(inputHopper, stagedInput);
  commitHopperMaterialState(undersizeHopper, stagedUndersize);
  commitHopperMaterialState(oversizeHopper, stagedOversize);
  updateConnectionStream(blueprint, inputConnection, actualFeed, withdrawal.actualSpecificSensibleEnthalpyJPerKg);
  updateConnectionStream(
    blueprint,
    undersizeConnection,
    result.undersizeSolidState,
    undersizeSpecificSensibleEnthalpyJPerKg,
  );
  updateConnectionStream(
    blueprint,
    oversizeConnection,
    result.oversizeSolidState,
    oversizeSpecificSensibleEnthalpyJPerKg,
  );
  node.lastError = null;
  node.operatingState = 'running';
}
