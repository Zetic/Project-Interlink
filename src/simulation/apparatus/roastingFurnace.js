import { ROASTING_PROCESS_ID } from '../../core/processes/definitions/index.js';
import { validateElementalConservation } from '../../core/processes/conservation/elementalConservation.js';
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
  summarizeSolidMaterialBySpecies,
  totalSolidQuantity,
  withdrawSolidMaterialState,
} from '../../core/materials/solids/solidMaterialState.js';
import { applyGoethiteDehydroxylation } from '../../core/processes/physics/thermochemicalReactions.js';
import {
  materialBodyHeatCapacityJPerK,
  materialBodyTemperatureK,
} from '../../core/materials/thermal/thermalMaterial.js';
import {
  THERMAL_REFERENCE_TEMPERATURE_K,
  sensibleEnthalpyJAtTemperature,
} from '../../core/materials/thermal/thermalState.js';
import { PORT_CAPABILITIES } from '../../core/systems/ports.js';
import {
  cloneHopperMaterialState,
  commitHopperMaterialState,
  hopperFreeCapacityKg,
  hopperReceiveInflow,
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
const ENERGY_BALANCE_TOLERANCE_J = 1e-4;
export const DEFAULT_ROASTING_FURNACE_ZONE_COUNT = 4;

function assertFinitePositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be finite and positive`);
}

function emptySolidBody() {
  return createSolidMaterialBody(createSolidMaterialState());
}

function solidBodyMassKg(body) {
  return totalSolidQuantity(body.solidState);
}

function addSolidBody(target, source) {
  addSolidMaterialState(target.solidState, source.solidState);
  target.thermalState.sensibleEnthalpyJ += source.thermalState?.sensibleEnthalpyJ ?? 0;
  return target;
}

function withdrawSolidBody(body, requestedMassKg) {
  const storedMassKg = solidBodyMassKg(body);
  const solidState = withdrawSolidMaterialState(body.solidState, requestedMassKg);
  const massKg = totalSolidQuantity(solidState);
  const sensibleEnthalpyJ = storedMassKg <= 0
    ? 0
    : body.thermalState.sensibleEnthalpyJ * (massKg / storedMassKg);
  body.thermalState.sensibleEnthalpyJ -= sensibleEnthalpyJ;
  return {
    body: createSolidMaterialBody(solidState, { sensibleEnthalpyJ }),
    massKg,
    sensibleEnthalpyJ,
  };
}

function gasFlowState(gasState, dt) {
  return createGasMaterialState(Object.fromEntries(
    Object.entries(gasState.speciesMassKg).map(([speciesId, massKg]) => [speciesId, massKg / dt]),
  ));
}

function createZoneBodies(zoneCount) {
  return Array.from({ length: zoneCount }, () => emptySolidBody());
}

function ensureFurnaceState(node) {
  if (!Number.isInteger(node.internalZoneCount) || node.internalZoneCount <= 0) {
    node.internalZoneCount = DEFAULT_ROASTING_FURNACE_ZONE_COUNT;
  }
  if (!Array.isArray(node.zones) || node.zones.length !== node.internalZoneCount) {
    const legacyCharge = node.solidCharge ? cloneSolidMaterialBody(node.solidCharge) : null;
    node.zones = createZoneBodies(node.internalZoneCount);
    if (legacyCharge && solidBodyMassKg(legacyCharge) > TRANSFER_TOLERANCE_KG) {
      addSolidBody(node.zones[0], legacyCharge);
    }
    delete node.solidCharge;
  }
  if (!node.pendingFeed) node.pendingFeed = emptySolidBody();
  if (!node.gasInventory) node.gasInventory = createGasMaterialBody(createGasMaterialState());
  if (!Number.isFinite(node.incomingMassSinceLastSimulationKg)) node.incomingMassSinceLastSimulationKg = 0;
}

export function roastingFurnaceZoneCapacityKg(node) {
  ensureFurnaceState(node);
  return node.effectiveChamberHoldUpKg / node.internalZoneCount;
}

export function roastingFurnaceChargeMassKg(node) {
  ensureFurnaceState(node);
  return node.zones.reduce((sum, zone) => sum + solidBodyMassKg(zone), 0);
}

export function roastingFurnacePendingFeedMassKg(node) {
  ensureFurnaceState(node);
  return solidBodyMassKg(node.pendingFeed);
}

/**
 * Capacity of the short inlet staging buffer for this simulation step. The
 * retained process capacity lives in the zones; this buffer only lets upstream
 * metering machinery push against a full continuous reactor without deadlock.
 */
export function roastingFurnaceInputCapacityKg(node, dt) {
  ensureFurnaceState(node);
  if (!node.enabled) return 0;
  if (!Number.isFinite(dt) || dt <= 0) throw new Error('Furnace input-capacity dt must be finite and positive');
  const perStepTransportCapacityKg = node.maximumSolidThroughputKgPerSecond * dt;
  return Math.max(0, perStepTransportCapacityKg - roastingFurnacePendingFeedMassKg(node));
}

/** Receive a metered solid body into the furnace inlet staging buffer. */
export function roastingFurnaceReceiveFeed(node, incomingBody, dt) {
  ensureFurnaceState(node);
  const incomingMassKg = solidBodyMassKg(incomingBody);
  if (incomingMassKg <= TRANSFER_TOLERANCE_KG) return 0;
  const capacityKg = roastingFurnaceInputCapacityKg(node, dt);
  if (incomingMassKg > capacityKg + TRANSFER_TOLERANCE_KG) {
    throw new Error('Furnace inlet could not accept the requested metered feed atomically');
  }
  addSolidBody(node.pendingFeed, incomingBody);
  node.incomingMassSinceLastSimulationKg += incomingMassKg;
  return incomingMassKg;
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

function boundedHeatLossEnergyJ(body, requestedHeatLossEnergyJ) {
  if (requestedHeatLossEnergyJ <= 0) return requestedHeatLossEnergyJ;
  const heatCapacityJPerK = materialBodyHeatCapacityJPerK(body);
  const minimumSensibleEnthalpyJ = sensibleEnthalpyJAtTemperature(1, heatCapacityJPerK);
  return Math.min(
    requestedHeatLossEnergyJ,
    Math.max(0, body.thermalState.sensibleEnthalpyJ - minimumSensibleEnthalpyJ),
  );
}

function heatZones(node, zones, dt) {
  const zoneHeatLossCoefficientWPerK = node.heatLossCoefficientWPerK / node.internalZoneCount;
  const setpointK = Math.min(node.temperatureSetpointK, node.maximumOperatingTemperatureK);
  const requests = [];
  let totalHeatLossEnergyJ = 0;
  let totalRequestedHeaterEnergyJ = 0;

  for (const zone of zones) {
    if (solidBodyMassKg(zone) <= TRANSFER_TOLERANCE_KG) {
      requests.push({ zone, requestedHeaterEnergyJ: 0 });
      continue;
    }
    const temperatureBeforeK = materialBodyTemperatureK(zone);
    const requestedHeatLossEnergyJ = furnaceHeatLossEnergyJ(
      temperatureBeforeK,
      zoneHeatLossCoefficientWPerK,
      dt,
    );
    const heatLossEnergyJ = boundedHeatLossEnergyJ(zone, requestedHeatLossEnergyJ);
    zone.thermalState.sensibleEnthalpyJ -= heatLossEnergyJ;
    totalHeatLossEnergyJ += heatLossEnergyJ;

    const heatCapacityJPerK = materialBodyHeatCapacityJPerK(zone);
    const temperatureAfterLossK = materialBodyTemperatureK(zone);
    const requestedHeaterEnergyJ = Math.max(
      0,
      (setpointK - temperatureAfterLossK) * heatCapacityJPerK,
    );
    totalRequestedHeaterEnergyJ += requestedHeaterEnergyJ;
    requests.push({ zone, requestedHeaterEnergyJ });
  }

  const availableHeaterEnergyJ = node.ratedHeaterPowerKw * 1000 * dt;
  const heaterScale = totalRequestedHeaterEnergyJ <= 0
    ? 0
    : Math.min(1, availableHeaterEnergyJ / totalRequestedHeaterEnergyJ);
  let totalHeaterEnergyJ = 0;
  for (const request of requests) {
    const heaterEnergyJ = request.requestedHeaterEnergyJ * heaterScale;
    request.zone.thermalState.sensibleEnthalpyJ += heaterEnergyJ;
    totalHeaterEnergyJ += heaterEnergyJ;
  }
  return { totalHeaterEnergyJ, totalHeatLossEnergyJ };
}

function reactionEnergyCloses(inputBody, result) {
  const inputEnergyJ = inputBody.thermalState?.sensibleEnthalpyJ ?? 0;
  const outputEnergyJ = result.solidProductBody.thermalState.sensibleEnthalpyJ
    + result.gasProductBody.thermalState.sensibleEnthalpyJ
    + result.reactionEnergyDemandJ;
  return Math.abs(inputEnergyJ - outputEnergyJ) <= ENERGY_BALANCE_TOLERANCE_J
    * Math.max(1, Math.abs(inputEnergyJ));
}

function reactZones(zones, gasInventory, dt) {
  let totalReactionEnergyDemandJ = 0;
  let totalGoethiteBeforeKg = 0;
  let totalGoethiteConsumedKg = 0;

  for (let index = 0; index < zones.length; index += 1) {
    const zone = zones[index];
    if (solidBodyMassKg(zone) <= TRANSFER_TOLERANCE_KG) continue;
    const before = cloneSolidMaterialBody(zone);
    const goethiteBeforeKg = summarizeSolidMaterialBySpecies(before.solidState).goethite ?? 0;
    const reaction = applyGoethiteDehydroxylation(before, dt);
    validateElementalConservation(
      [before],
      [reaction.solidProductBody, reaction.gasProductBody],
      ROASTING_PROCESS_ID,
    );
    if (!reactionEnergyCloses(before, reaction)) {
      throw new Error('Thermochemical reaction violates the furnace energy balance');
    }
    zones[index] = reaction.solidProductBody;
    addGasMaterialState(gasInventory.gasState, reaction.gasProductBody.gasState);
    gasInventory.thermalState.sensibleEnthalpyJ += reaction.gasProductBody.thermalState.sensibleEnthalpyJ;
    totalReactionEnergyDemandJ += reaction.reactionEnergyDemandJ;
    const goethiteAfterKg = summarizeSolidMaterialBySpecies(reaction.solidProductBody.solidState).goethite ?? 0;
    totalGoethiteBeforeKg += goethiteBeforeKg;
    totalGoethiteConsumedKg += Math.max(0, goethiteBeforeKg - goethiteAfterKg);
  }

  return {
    totalReactionEnergyDemandJ,
    goethiteConversionFraction: totalGoethiteBeforeKg <= TRANSFER_TOLERANCE_KG
      ? 0
      : totalGoethiteConsumedKg / totalGoethiteBeforeKg,
  };
}

function averageZoneTemperatureK(zones) {
  let totalCapacityJPerK = 0;
  let totalSensibleEnthalpyJ = 0;
  for (const zone of zones) {
    if (solidBodyMassKg(zone) <= TRANSFER_TOLERANCE_KG) continue;
    totalCapacityJPerK += materialBodyHeatCapacityJPerK(zone);
    totalSensibleEnthalpyJ += zone.thermalState.sensibleEnthalpyJ;
  }
  if (totalCapacityJPerK <= 0) return THERMAL_REFERENCE_TEMPERATURE_K;
  return THERMAL_REFERENCE_TEMPERATURE_K + totalSensibleEnthalpyJ / totalCapacityJPerK;
}

function productTargetStage(blueprint, connection, sourceNode, dt) {
  if (!connection) return null;
  const target = blueprint.nodes[connection.targetNodeId];
  if (!target || target.id === sourceNode.id) return null;
  if (target.nodeType === 'hopper') {
    return {
      kind: 'hopper',
      target,
      stagedHopper: cloneHopperMaterialState(target),
      capacityKg: hopperFreeCapacityKg(target),
    };
  }
  if (target.nodeType === 'roastingFurnace') {
    ensureFurnaceState(target);
    return {
      kind: 'furnace',
      target,
      stagedPendingFeed: cloneSolidMaterialBody(target.pendingFeed),
      capacityKg: roastingFurnaceInputCapacityKg(target, dt),
    };
  }
  return null;
}

function receiveProductIntoStage(stage, body, dt) {
  const massKg = solidBodyMassKg(body);
  if (massKg <= TRANSFER_TOLERANCE_KG) return 0;
  if (!stage || massKg > stage.capacityKg + TRANSFER_TOLERANCE_KG) {
    throw new Error('Furnace solid product could not commit atomically');
  }
  if (stage.kind === 'hopper') {
    const productFlow = multiplySolidMaterialState(body.solidState, 1 / dt);
    const specificSensibleEnthalpyJPerKg = body.thermalState.sensibleEnthalpyJ / massKg;
    const acceptedKg = hopperReceiveInflow(
      stage.stagedHopper,
      productFlow,
      dt,
      specificSensibleEnthalpyJPerKg,
    );
    if (Math.abs(acceptedKg - massKg) > TRANSFER_TOLERANCE_KG) {
      throw new Error('Furnace solid product could not commit atomically');
    }
    return acceptedKg;
  }
  addSolidBody(stage.stagedPendingFeed, body);
  return massKg;
}

function commitProductStage(stage, receivedMassKg) {
  if (!stage) return;
  if (stage.kind === 'hopper') {
    commitHopperMaterialState(stage.target, stage.stagedHopper);
    return;
  }
  stage.target.pendingFeed = cloneSolidMaterialBody(stage.stagedPendingFeed);
  stage.target.incomingMassSinceLastSimulationKg += receivedMassKg;
}

function advancePendingFeed(node, zones, pendingFeed, productStage, dt) {
  const pendingMassKg = solidBodyMassKg(pendingFeed);
  if (pendingMassKg <= TRANSFER_TOLERANCE_KG) {
    return { introducedMassKg: 0, dischargedBody: emptySolidBody() };
  }

  const zoneCapacityKg = roastingFurnaceZoneCapacityKg(node);
  const totalZoneFreeCapacityKg = zones.reduce(
    (sum, zone) => sum + Math.max(0, zoneCapacityKg - solidBodyMassKg(zone)),
    0,
  );
  const outputCapacityKg = productStage?.capacityKg ?? 0;
  const admissibleMassKg = Math.min(
    pendingMassKg,
    node.maximumSolidThroughputKgPerSecond * dt,
    totalZoneFreeCapacityKg + outputCapacityKg,
  );
  if (admissibleMassKg <= TRANSFER_TOLERANCE_KG) {
    return { introducedMassKg: 0, dischargedBody: emptySolidBody() };
  }

  const incoming = withdrawSolidBody(pendingFeed, admissibleMassKg);
  addSolidBody(zones[0], incoming.body);
  let dischargedBody = emptySolidBody();

  for (let index = 0; index < zones.length; index += 1) {
    const overflowKg = Math.max(0, solidBodyMassKg(zones[index]) - zoneCapacityKg);
    if (overflowKg <= TRANSFER_TOLERANCE_KG) continue;
    const overflow = withdrawSolidBody(zones[index], overflowKg);
    if (index < zones.length - 1) {
      addSolidBody(zones[index + 1], overflow.body);
    } else {
      dischargedBody = overflow.body;
    }
  }

  return { introducedMassKg: admissibleMassKg, dischargedBody };
}

export function createRoastingFurnace({
  id,
  temperatureSetpointK,
  ratedHeaterPowerKw,
  maximumOperatingTemperatureK,
  maximumSolidThroughputKgPerSecond,
  effectiveChamberHoldUpKg,
  heatLossCoefficientWPerK,
  internalZoneCount = DEFAULT_ROASTING_FURNACE_ZONE_COUNT,
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
  if (!Number.isInteger(internalZoneCount) || internalZoneCount <= 0) {
    throw new Error('Furnace internalZoneCount must be a positive integer');
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
    internalZoneCount,
    inputPortId: 'feed',
    solidProductPortId: 'solid-product',
    gasExhaustPortId: 'gas-exhaust',
    ports: [
      {
        id: 'feed',
        direction: 'input',
        kind: 'material',
        label: 'feed',
        accepts: [PORT_CAPABILITIES.METERED_SOLID_PARTICULATE],
      },
      {
        id: 'solid-product',
        direction: 'output',
        kind: 'material',
        label: 'solid product',
        provides: [PORT_CAPABILITIES.SOLID_PARTICULATE, PORT_CAPABILITIES.METERED_SOLID_PARTICULATE],
      },
      {
        id: 'gas-exhaust',
        direction: 'output',
        kind: 'material',
        label: 'gas exhaust',
        provides: [PORT_CAPABILITIES.GAS],
      },
    ],
    zones: createZoneBodies(internalZoneCount),
    pendingFeed: emptySolidBody(),
    gasInventory: createGasMaterialBody(createGasMaterialState()),
    actualChargeTemperatureK: THERMAL_REFERENCE_TEMPERATURE_K,
    zoneTemperaturesK: Array(internalZoneCount).fill(THERMAL_REFERENCE_TEMPERATURE_K),
    lastHeaterEnergyJ: 0,
    lastHeatLossEnergyJ: 0,
    lastReactionEnergyDemandJ: 0,
    lastHeaterPowerKw: 0,
    lastHeatLossPowerKw: 0,
    lastReactionPowerKw: 0,
    lastFeedRateKgPerSecond: 0,
    lastProductRateKgPerSecond: 0,
    lastGoethiteConversionFraction: 0,
    incomingMassSinceLastSimulationKg: 0,
    lastError: null,
    enabled,
    operatingState: enabled ? 'idle' : 'off',
  };
}

export function simulateRoastingFurnaceNode(blueprint, _world, node, dt) {
  ensureFurnaceState(node);
  if (!node.enabled) {
    node.operatingState = 'off';
    node.lastFeedRateKgPerSecond = 0;
    node.lastProductRateKgPerSecond = 0;
    node.incomingMassSinceLastSimulationKg = 0;
    return;
  }

  const inputConnection = findInboundConnection(blueprint, node.id, node.inputPortId);
  const solidProductConnection = findOutboundConnection(blueprint, node.id, node.solidProductPortId);
  const gasExhaustConnection = findOutboundConnection(blueprint, node.id, node.gasExhaustPortId);
  const inputSource = inputConnection ? blueprint.nodes[inputConnection.sourceNodeId] : null;
  if (inputConnection && !['feeder', 'roastingFurnace'].includes(inputSource?.nodeType)) {
    node.lastError = 'Furnace feed requires a metered Feeder or upstream roasting furnace output';
    node.operatingState = 'blocked';
    return;
  }

  const productStage = productTargetStage(blueprint, solidProductConnection, node, dt);
  const vent = gasExhaustConnection ? blueprint.nodes[gasExhaustConnection.targetNodeId] : null;
  const ventReady = vent?.nodeType === 'exhaustVent';
  const outputsReady = Boolean(productStage && ventReady);

  const stagedZones = node.zones.map(zone => cloneSolidMaterialBody(zone));
  const stagedPendingFeed = cloneSolidMaterialBody(node.pendingFeed);
  const stagedGas = cloneGasMaterialBody(node.gasInventory);
  const stagedVentGas = ventReady ? cloneExhaustVentGasState(vent) : null;
  let productFlow = createSolidMaterialState();
  let productSpecificSensibleEnthalpyJPerKg = 0;
  let gasFlow = createGasMaterialState();
  let gasSpecificSensibleEnthalpyJPerKg = 0;

  try {
    const thermal = heatZones(node, stagedZones, dt);
    node.lastHeaterEnergyJ = thermal.totalHeaterEnergyJ;
    node.lastHeatLossEnergyJ = thermal.totalHeatLossEnergyJ;

    if (outputsReady && roastingFurnaceChargeMassKg({ ...node, zones: stagedZones, pendingFeed: stagedPendingFeed }) > TRANSFER_TOLERANCE_KG) {
      const reaction = reactZones(stagedZones, stagedGas, dt);
      node.lastReactionEnergyDemandJ = reaction.totalReactionEnergyDemandJ;
      node.lastGoethiteConversionFraction = reaction.goethiteConversionFraction;
    } else {
      node.lastReactionEnergyDemandJ = 0;
      node.lastGoethiteConversionFraction = 0;
    }

    const movement = advancePendingFeed(node, stagedZones, stagedPendingFeed, productStage, dt);
    const dischargedMassKg = solidBodyMassKg(movement.dischargedBody);
    if (dischargedMassKg > TRANSFER_TOLERANCE_KG) {
      receiveProductIntoStage(productStage, movement.dischargedBody, dt);
      productFlow = multiplySolidMaterialState(movement.dischargedBody.solidState, 1 / dt);
      productSpecificSensibleEnthalpyJPerKg = movement.dischargedBody.thermalState.sensibleEnthalpyJ
        / dischargedMassKg;
    }

    if (ventReady && totalGasMassKg(stagedGas.gasState) > TRANSFER_TOLERANCE_KG) {
      const gasMassKg = totalGasMassKg(stagedGas.gasState);
      gasFlow = gasFlowState(stagedGas.gasState, dt);
      gasSpecificSensibleEnthalpyJPerKg = stagedGas.thermalState.sensibleEnthalpyJ / gasMassKg;
      ventReceiveGas(stagedVentGas, stagedGas);
      stagedGas.gasState = createGasMaterialState();
      stagedGas.thermalState.sensibleEnthalpyJ = 0;
    }

    node.zones = stagedZones;
    node.pendingFeed = stagedPendingFeed;
    node.gasInventory = stagedGas;
    if (dischargedMassKg > TRANSFER_TOLERANCE_KG) commitProductStage(productStage, dischargedMassKg);
    if (stagedVentGas) commitExhaustVentGasState(vent, stagedVentGas);

    if (solidProductConnection) {
      updateConnectionStream(
        blueprint,
        solidProductConnection,
        productFlow,
        productSpecificSensibleEnthalpyJPerKg,
      );
    }
    if (gasExhaustConnection) {
      updateConnectionStream(
        blueprint,
        gasExhaustConnection,
        gasFlow,
        gasSpecificSensibleEnthalpyJPerKg,
      );
    }

    node.lastFeedRateKgPerSecond = movement.introducedMassKg / dt;
    node.lastProductRateKgPerSecond = dischargedMassKg / dt;
    node.lastHeaterPowerKw = node.lastHeaterEnergyJ / dt / 1000;
    node.lastHeatLossPowerKw = node.lastHeatLossEnergyJ / dt / 1000;
    node.lastReactionPowerKw = node.lastReactionEnergyDemandJ / dt / 1000;
    node.actualChargeTemperatureK = averageZoneTemperatureK(node.zones);
    node.zoneTemperaturesK = node.zones.map(zone => (
      solidBodyMassKg(zone) <= TRANSFER_TOLERANCE_KG
        ? THERMAL_REFERENCE_TEMPERATURE_K
        : materialBodyTemperatureK(zone)
    ));

    const hasMatter = roastingFurnaceChargeMassKg(node) + roastingFurnacePendingFeedMassKg(node)
      > TRANSFER_TOLERANCE_KG;
    if (hasMatter && !outputsReady) {
      node.lastError = 'Furnace requires connected solid-product and gas-exhaust destinations before reactions can proceed';
      node.operatingState = 'blocked';
    } else if (
      roastingFurnacePendingFeedMassKg(node) > TRANSFER_TOLERANCE_KG
      && movement.introducedMassKg <= TRANSFER_TOLERANCE_KG
    ) {
      node.lastError = 'Furnace solid product is backpressured';
      node.operatingState = 'blocked';
    } else {
      node.lastError = null;
      node.operatingState = hasMatter ? 'running' : 'idle';
    }
    node.incomingMassSinceLastSimulationKg = 0;
  } catch (error) {
    node.lastError = error.message;
    node.operatingState = 'blocked';
  }
}
