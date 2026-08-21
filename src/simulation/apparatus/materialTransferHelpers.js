import {
  createSolidMaterialBody,
  createSolidMaterialState,
  multiplySolidMaterialState,
  totalSolidQuantity,
} from '../../core/materials/solids/solidMaterialState.js';
import {
  distributeSensibleEnthalpyAtEquilibrium,
  materialBodyMassKg,
} from '../../core/materials/thermal/thermalMaterial.js';
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

export function outputSpecificSensibleEnthalpies(inputBodies, outputSolidStates) {
  const outputBodies = distributeSensibleEnthalpyAtEquilibrium(
    inputBodies,
    outputSolidStates.map(state => createSolidMaterialBody(state)),
  );
  return outputBodies.map(body => {
    const massKg = materialBodyMassKg(body);
    return massKg <= 0 ? 0 : body.thermalState.sensibleEnthalpyJ / massKg;
  });
}
