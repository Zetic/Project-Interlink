import { FEEDING_PROCESS_ID } from '../../core/processes/definitions/index.js';
import { PORT_CAPABILITIES } from '../../core/systems/ports.js';
import { createSolidMaterialBody } from '../../core/materials/solids/solidMaterialState.js';
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
  scaleSolidStateForRuntime,
  solidStateMassForRuntime,
} from './materialTransferHelpers.js';
import { assertHopperCanReceivePlannedSolidState } from './transactionHelpers.js';
import {
  roastingFurnaceInputCapacityKg,
  roastingFurnaceReceiveFeed,
} from './roastingFurnace.js';

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
      {
        id: 'product',
        direction: 'output',
        kind: 'material',
        label: 'product',
        provides: [PORT_CAPABILITIES.SOLID_PARTICULATE, PORT_CAPABILITIES.METERED_SOLID_PARTICULATE],
      },
    ],
    lastError: null,
    enabled,
    operatingState: enabled ? 'idle' : 'off',
  };
}

function targetCapacityKg(outputTarget, dt) {
  if (outputTarget?.nodeType === 'hopper') return hopperFreeCapacityKg(outputTarget);
  if (outputTarget?.nodeType === 'roastingFurnace') return roastingFurnaceInputCapacityKg(outputTarget, dt);
  return 0;
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

  const outputTarget = blueprint.nodes[outputConnection.targetNodeId];
  if (inputHopper?.nodeType !== 'hopper' || !['hopper', 'roastingFurnace'].includes(outputTarget?.nodeType)) {
    node.lastError = 'Feeder requires Hopper storage on feed and a compatible solid receiver on output';
    node.operatingState = 'blocked';
    return;
  }
  if (inputHopper.id === outputTarget.id) {
    node.lastError = 'Feeder output must be distinct from the feed Hopper';
    node.operatingState = 'blocked';
    return;
  }
  if (node.flowRateKgPerSecond <= APPARATUS_TRANSFER_TOLERANCE_KG) {
    node.lastError = null;
    node.operatingState = 'idle';
    return;
  }

  const storedMassKg = hopperStoredMassKg(inputHopper);
  const availableOutputCapacityKg = targetCapacityKg(outputTarget, dt);
  if (availableOutputCapacityKg <= APPARATUS_TRANSFER_TOLERANCE_KG) {
    node.lastError = outputTarget.nodeType === 'roastingFurnace'
      ? 'Feeder downstream furnace cannot accept additional feed this tick'
      : 'Feeder product output is full';
    node.operatingState = 'blocked';
    return;
  }

  const plannedRate = Math.min(
    node.flowRateKgPerSecond,
    node.throughputKgPerSecond,
    storedMassKg / dt,
    availableOutputCapacityKg / dt,
  );
  if (plannedRate <= APPARATUS_TRANSFER_TOLERANCE_KG) {
    node.lastError = null;
    node.operatingState = 'idle';
    return;
  }

  const plannedProduct = scaleSolidStateForRuntime(
    inputHopper.materialBody.solidState,
    plannedRate / storedMassKg,
  );
  const plannedOutputKg = solidStateMassForRuntime(plannedProduct) * dt;
  if (outputTarget.nodeType === 'hopper') {
    try {
      assertHopperCanReceivePlannedSolidState(outputTarget, plannedProduct, plannedOutputKg, 'Feeder product');
    } catch (error) {
      node.lastError = error.message;
      node.operatingState = 'blocked';
      return;
    }
  }

  const withdrawal = hopperWithdraw(inputHopper, plannedRate, dt);
  if (withdrawal.actualTotalKg <= APPARATUS_TRANSFER_TOLERANCE_KG) {
    node.lastError = null;
    node.operatingState = 'idle';
    return;
  }
  const actualFeed = scaleSolidStateForRuntime(withdrawal.actualSolidState, 1 / dt);
  // Feeding is an identity process: the product composition and specific
  // sensible enthalpy are exactly those of the withdrawn feed.
  const productSolidState = actualFeed;
  const productSpecificSensibleEnthalpyJPerKg = withdrawal.actualSpecificSensibleEnthalpyJPerKg;
  const expectedOutputKg = withdrawal.actualTotalKg;

  if (outputTarget.nodeType === 'hopper') {
    const acceptedOutputKg = hopperReceiveInflow(
      outputTarget,
      productSolidState,
      dt,
      productSpecificSensibleEnthalpyJPerKg,
    );
    assertTransferAccepted(expectedOutputKg, acceptedOutputKg, 'Feeder product');
  } else {
    const productInventoryState = scaleSolidStateForRuntime(productSolidState, dt);
    const productBody = createSolidMaterialBody(productInventoryState, {
      sensibleEnthalpyJ: expectedOutputKg * productSpecificSensibleEnthalpyJPerKg,
    });
    const acceptedOutputKg = roastingFurnaceReceiveFeed(outputTarget, productBody, dt);
    assertTransferAccepted(expectedOutputKg, acceptedOutputKg, 'Feeder furnace feed');
  }

  updateConnectionStream(
    blueprint,
    inputConnection,
    actualFeed,
    withdrawal.actualSpecificSensibleEnthalpyJPerKg,
  );
  updateConnectionStream(
    blueprint,
    outputConnection,
    productSolidState,
    productSpecificSensibleEnthalpyJPerKg,
  );
  node.lastError = null;
  node.operatingState = 'running';
}