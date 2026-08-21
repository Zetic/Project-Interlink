import {
  createSolidMaterialBody,
  createSolidMaterialState,
  multiplySolidMaterialState,
  totalSolidQuantity,
} from '../../core/materials/solids/solidMaterialState.js';
import {
  materialBodyHeatCapacityJPerK,
  materialBodyMassKg,
} from '../../core/materials/thermal/thermalMaterial.js';
import {
  THERMAL_ENERGY_TOLERANCE_J,
  sensibleEnthalpyJAtTemperature,
  temperatureKFromSensibleEnthalpy,
} from '../../core/materials/thermal/thermalState.js';
import {
  hopperStoredMassKg,
  HOPPER_TOLERANCE_KG,
} from '../hopperNode.js';

export const APPARATUS_TRANSFER_TOLERANCE_KG = 1e-8;

export function proportionalSolidStateFromHopper(hopper, requestedTotalRateKgPerSecond) {
  const storedMassKg = hopperStoredMassKg(hopper);
  if (storedMassKg <= HOPPER_TOLERANCE_KG || requestedTotalRateKgPerSecond <= 0) {
    return createSolidMaterialState();
  }
  return multiplySolidMaterialState(
    hopper.materialBody.solidState,
    requestedTotalRateKgPerSecond / storedMassKg,
  );
}

export function capacityScaleForOutput(freeCapacityKg, solidState, dt) {
  const requiredKg = totalSolidQuantity(solidState) * dt;
  if (requiredKg <= APPARATUS_TRANSFER_TOLERANCE_KG) return 1;
  return Math.max(0, Math.min(1, freeCapacityKg / requiredKg));
}

export function assertTransferAccepted(expectedKg, acceptedKg, context) {
  if (Math.abs(expectedKg - acceptedKg) > APPARATUS_TRANSFER_TOLERANCE_KG * Math.max(1, expectedKg)) {
    throw new Error(`${context} could not commit its planned output atomically`);
  }
}

export function solidBodyForWithdrawal(withdrawal) {
  return createSolidMaterialBody(withdrawal.actualSolidState, {
    sensibleEnthalpyJ: withdrawal.actualSensibleEnthalpyJ ?? 0,
  });
}

/**
 * Mechanical continuous processes are presently adiabatic and place all
 * outputs at one equilibrium temperature. Output states are rates (kg/s), so
 * never allocate a finite input inventory's joules directly across those rate
 * values. Instead derive the equilibrium temperature from the actual withdrawn
 * bodies and return an intensive J/kg value for each output composition.
 */
export function outputSpecificSensibleEnthalpies(inputBodies, outputSolidStates) {
  const totalInputSensibleEnthalpyJ = inputBodies.reduce(
    (sum, body) => sum + (body.thermalState?.sensibleEnthalpyJ ?? 0),
    0,
  );
  if (Math.abs(totalInputSensibleEnthalpyJ) <= THERMAL_ENERGY_TOLERANCE_J) {
    return outputSolidStates.map(() => 0);
  }
  const totalInputHeatCapacityJPerK = inputBodies.reduce(
    (sum, body) => sum + materialBodyHeatCapacityJPerK(body),
    0,
  );
  const equilibriumTemperatureK = temperatureKFromSensibleEnthalpy(
    totalInputSensibleEnthalpyJ,
    totalInputHeatCapacityJPerK,
  );
  return outputSolidStates.map(state => {
    const body = createSolidMaterialBody(state);
    const massKgPerSecond = materialBodyMassKg(body);
    if (massKgPerSecond <= 0) return 0;
    const sensibleEnthalpyFlowJPerSecond = sensibleEnthalpyJAtTemperature(
      equilibriumTemperatureK,
      materialBodyHeatCapacityJPerK(body),
    );
    return sensibleEnthalpyFlowJPerSecond / massKgPerSecond;
  });
}
