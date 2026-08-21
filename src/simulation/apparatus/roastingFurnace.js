import { ROASTING_PROCESS_ID } from '../../core/processes/definitions/index.js';
import {
  addGasMaterialState,
  cloneGasMaterialBody,
  createGasMaterialBody,
  createGasMaterialState,
  totalGasMassKg,
} from '../../core/materials/gas/gasMaterialState.js';
import {
  addSolidMaterialState,
  cloneSolidMaterialBody,
  createSolidMaterialBody,
  createSolidMaterialState,
  multiplySolidMaterialState,
  totalSolidQuantity,
  withdrawSolidMaterialState,
} from '../../core/materials/solids/solidMaterialState.js';
import { applyGoethiteDehydroxylation } from '../../core/processes/physics/thermochemicalReactions.js';
import {
  materialBodyHeatCapacityJPerK,
  materialBodyTemperatureK,
} from '../../core/materials/thermal/thermalMaterial.js';
import { THERMAL_REFERENCE_TEMPERATURE_K } from '../../core/materials/thermal/thermalState.js';
import {
  cloneHopperMaterialState,
  commitHopperMaterialState,
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
  cloneExhaustVentGasState,
  commitExhaustVentGasState,
  ventReceiveGas,
} from './exhaustVent.js';

const TRANSFER_TOLERANCE_KG = 1e-9;

function assertFinitePositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be finite and positive`);
}

function gasFlowState(gasState, dt) {
  return createGasMaterialState(Object.fromEntries(
    Object.entries(gasState.speciesMassKg).map(([speciesId, massKg]) => [speciesId, massKg / dt]),
  ));
}

function withdrawSolidCharge(chargeBody, requestedMassKg) {
  const storedMassKg = totalSolidQuantity(chargeBody.solidState);
  const solidState = withdrawSolidMaterialState(chargeBody.solidState, requestedMassKg);
  const massKg = totalSolidQuantity(solidState);
  const sensibleEnthalpyJ = storedMassKg <= 0
    ? 0
    : chargeBody.thermalState.sensibleEnthalpyJ * (massKg / storedMassKg);
  chargeBody.thermalState.sensibleEnthalpyJ -= sensibleEnthalpyJ;
  return { solidState, massKg, sensibleEnthalpyJ };
}

export function furnaceHeatLossEnergyJ(
  temperatureK,
  heatLossCoefficientWPerK,
  dt,
  ambientTemperatureK = THERMAL_REFERENCE_TEMPERATURE_K,
) {
  if (![temperatureK, heatLossCoefficientWPerK, dt, ambientTemperatureK].every(Number.isFinite)) {
    throw new Error('Furnace heat-loss inputs must be finite');
  }
  return heatLossCoefficientWPerK * (temperatureK - ambientTemperatureK) * dt;
}

function heatCharge(node, chargeBody, dt) {
  const massKg = totalSolidQuantity(chargeBody.solidState);
  if (massKg <= TRANSFER_TOLERANCE_KG) {
    node.lastHeaterEnergyJ = 0;
    node.lastHeatLossEnergyJ = 0;
    node.actualChargeTemperatureK = THERMAL_REFERENCE_TEMPERATURE_K;
    return;
  }
  const heatCapacityJPerK = materialBodyHeatCapacityJPerK(chargeBody);
  const temperatureBeforeK = materialBodyTemperatureK(chargeBody);
  const heatLossEnergyJ = furnaceHeatLossEnergyJ(
    temperatureBeforeK,
    node.heatLossCoefficientWPerK,
    dt,
  );
  chargeBody.thermalState.sensibleEnthalpyJ -= heatLossEnergyJ;
  const temperatureAfterLossK = materialBodyTemperatureK(chargeBody);
  const setpointK = Math.min(node.temperatureSetpointK, node.maximumOperatingTemperatureK);
  const requestedHeaterEnergyJ = Math.max(0, (setpointK - temperatureAfterLossK) * heatCapacityJPerK);
  const heaterEnergyJ = Math.min(requestedHeaterEnergyJ, node.ratedHeaterPowerKw * 1000 * dt);
  chargeBody.thermalState.sensibleEnthalpyJ += heaterEnergyJ;
  node.lastHeaterEnergyJ = heaterEnergyJ;
  node.lastHeatLossEnergyJ = heatLossEnergyJ;
  node.actualChargeTemperatureK = materialBodyTemperatureK(chargeBody);
}

export function createRoastingFurnace({
  id,
  temperatureSetpointK,
  ratedHeaterPowerKw,
  maximumOperatingTemperatureK,
  maximumSolidThroughputKgPerSecond,
  effectiveChamberHoldUpKg,
  heatLossCoefficientWPerK,
  enabled = false,
} = {}) {
  for (const [value, label] of [
    [ratedHeaterPowerKw, 'Furnace ratedHeaterPowerKw'],
    [maximumOperatingTemperatureK, 'Furnace maximumOperatingTemperatureK'],
    [maximumSolidThroughputKgPerSecond, 'Furnace maximumSolidThroughputKgPerSecond'],
    [effectiveChamberHoldUpKg, 'Furnace effectiveChamberHoldUpKg'],
    [heatLossCoefficientWPerK, 'Furnace heatLossCoefficientWPerK'],
  ]) assertFinitePositive(value, label);
  if (!Number.isFinite(temperatureSetpointK) || temperatureSetpointK <= 0) {
    throw new Error('Furnace temperatureSetpointK must be finite and positive');
  }
  return {
    id,
    nodeType: 'roastingFurnace',
    systemType: 'electric-roasting-furnace',
    kind: 'primitive',
    processId: ROASTING_PROCESS_ID,
    temperatureSetpointK,
    ratedHeaterPowerKw,
    maximumOperatingTemperatureK,
    maximumSolidThroughputKgPerSecond,
    effectiveChamberHoldUpKg,
    heatLossCoefficientWPerK,
    inputPortId: 'feed',
    solidProductPortId: 'solid-product',
    gasExhaustPortId: 'gas-exhaust',
    solidCharge: createSolidMaterialBody(createSolidMaterialState()),
    gasInventory: createGasMaterialBody(createGasMaterialState()),
    actualChargeTemperatureK: THERMAL_REFERENCE_TEMPERATURE_K,
    lastHeaterEnergyJ: 0,
    lastHeatLossEnergyJ: 0,
    lastReactionEnergyDemandJ: 0,
    lastError: null,
    enabled,
    operatingState: enabled ? 'idle' : 'off',
  };
}

export function simulateRoastingFurnaceNode(blueprint, _world, node, dt) {
  if (!node.enabled) {
    node.operatingState = 'off';
    return;
  }
  const inputConnection = findInboundConnection(blueprint, node.id, node.inputPortId);
  const solidProductConnection = findOutboundConnection(blueprint, node.id, node.solidProductPortId);
  const gasExhaustConnection = findOutboundConnection(blueprint, node.id, node.gasExhaustPortId);
  const inputHopper = inputConnection ? blueprint.nodes[inputConnection.sourceNodeId] : null;
  const productHopper = solidProductConnection ? blueprint.nodes[solidProductConnection.targetNodeId] : null;
  const vent = gasExhaustConnection ? blueprint.nodes[gasExhaustConnection.targetNodeId] : null;
  const outputsReady = productHopper?.nodeType === 'hopper' && vent?.nodeType === 'exhaustVent';
  if (inputConnection && inputHopper?.nodeType !== 'hopper') {
    node.lastError = 'Furnace feed must originate from Hopper storage';
    node.operatingState = 'blocked';
    return;
  }

  const stagedCharge = cloneSolidMaterialBody(node.solidCharge);
  const stagedGas = cloneGasMaterialBody(node.gasInventory);
  try {
    heatCharge(node, stagedCharge, dt);
  } catch (error) {
    node.lastError = error.message;
    node.operatingState = 'blocked';
    return;
  }

  if (outputsReady && totalSolidQuantity(stagedCharge.solidState) > TRANSFER_TOLERANCE_KG) {
    try {
      const reaction = applyGoethiteDehydroxylation(stagedCharge, dt);
      stagedCharge.solidState = reaction.solidProductBody.solidState;
      stagedCharge.thermalState = reaction.solidProductBody.thermalState;
      addGasMaterialState(stagedGas.gasState, reaction.gasProductBody.gasState);
      stagedGas.thermalState.sensibleEnthalpyJ += reaction.gasProductBody.thermalState.sensibleEnthalpyJ;
      node.lastReactionEnergyDemandJ = reaction.reactionEnergyDemandJ;
      node.actualChargeTemperatureK = reaction.temperatureK;
    } catch (error) {
      node.lastError = error.message;
      node.operatingState = 'blocked';
      return;
    }
  } else {
    node.lastReactionEnergyDemandJ = 0;
  }

  const stagedInput = inputHopper ? cloneHopperMaterialState(inputHopper) : null;
  const stagedProduct = outputsReady ? cloneHopperMaterialState(productHopper) : null;
  const stagedVentGas = outputsReady ? cloneExhaustVentGasState(vent) : null;
  let productFlow = createSolidMaterialState();
  let productSpecificSensibleEnthalpyJPerKg = 0;
  let gasFlow = createGasMaterialState();
  let gasSpecificSensibleEnthalpyJPerKg = 0;

  if (outputsReady) {
    const keepChamberChargeKg = inputHopper && hopperStoredMassKg(inputHopper) > HOPPER_TOLERANCE_KG
      ? Math.max(0, node.effectiveChamberHoldUpKg - node.maximumSolidThroughputKgPerSecond * dt)
      : 0;
    const dischargeKg = Math.min(
      node.maximumSolidThroughputKgPerSecond * dt,
      Math.max(0, totalSolidQuantity(stagedCharge.solidState) - keepChamberChargeKg),
      hopperFreeCapacityKg(stagedProduct),
    );
    if (dischargeKg > TRANSFER_TOLERANCE_KG) {
      const discharge = withdrawSolidCharge(stagedCharge, dischargeKg);
      productFlow = multiplySolidMaterialState(discharge.solidState, 1 / dt);
      productSpecificSensibleEnthalpyJPerKg = discharge.massKg <= 0 ? 0 : discharge.sensibleEnthalpyJ / discharge.massKg;
      const acceptedKg = hopperReceiveInflow(
        stagedProduct,
        productFlow,
        dt,
        productSpecificSensibleEnthalpyJPerKg,
      );
      if (Math.abs(acceptedKg - discharge.massKg) > TRANSFER_TOLERANCE_KG) {
        throw new Error('Furnace solid product could not commit atomically');
      }
    }
    if (totalGasMassKg(stagedGas.gasState) > TRANSFER_TOLERANCE_KG) {
      gasFlow = gasFlowState(stagedGas.gasState, dt);
      gasSpecificSensibleEnthalpyJPerKg = stagedGas.thermalState.sensibleEnthalpyJ
        / totalGasMassKg(stagedGas.gasState);
      ventReceiveGas(stagedVentGas, stagedGas);
      stagedGas.gasState = createGasMaterialState();
      stagedGas.thermalState.sensibleEnthalpyJ = 0;
    }
  }

  let feedFlow = createSolidMaterialState();
  let feedSpecificSensibleEnthalpyJPerKg = 0;
  if (stagedInput) {
    const feedCapacityKg = Math.max(0, node.effectiveChamberHoldUpKg - totalSolidQuantity(stagedCharge.solidState));
    const feedKg = Math.min(
      feedCapacityKg,
      node.maximumSolidThroughputKgPerSecond * dt,
      hopperStoredMassKg(stagedInput),
    );
    if (feedKg > TRANSFER_TOLERANCE_KG) {
      const withdrawal = hopperWithdraw(stagedInput, feedKg / dt, dt);
      feedFlow = createSolidMaterialState();
      addSolidMaterialState(feedFlow, withdrawal.actualSolidState, 1 / dt);
      feedSpecificSensibleEnthalpyJPerKg = withdrawal.actualSpecificSensibleEnthalpyJPerKg;
      addSolidMaterialState(stagedCharge.solidState, withdrawal.actualSolidState);
      stagedCharge.thermalState.sensibleEnthalpyJ += withdrawal.actualSensibleEnthalpyJ;
    }
  }

  node.solidCharge = stagedCharge;
  node.gasInventory = stagedGas;
  if (stagedInput) commitHopperMaterialState(inputHopper, stagedInput);
  if (stagedProduct) commitHopperMaterialState(productHopper, stagedProduct);
  if (stagedVentGas) commitExhaustVentGasState(vent, stagedVentGas);
  if (inputConnection) {
    updateConnectionStream(blueprint, inputConnection, feedFlow, feedSpecificSensibleEnthalpyJPerKg);
  }
  if (solidProductConnection) {
    updateConnectionStream(blueprint, solidProductConnection, productFlow, productSpecificSensibleEnthalpyJPerKg);
  }
  if (gasExhaustConnection) {
    updateConnectionStream(
      blueprint,
      gasExhaustConnection,
      gasFlow,
      gasSpecificSensibleEnthalpyJPerKg,
    );
  }
  const hasCharge = totalSolidQuantity(node.solidCharge.solidState) > TRANSFER_TOLERANCE_KG;
  node.lastError = outputsReady || !hasCharge
    ? null
    : 'Furnace requires connected solid-product and gas-exhaust destinations before reactions can proceed';
  node.operatingState = hasCharge && outputsReady ? 'running' : (hasCharge ? 'blocked' : 'idle');
}
