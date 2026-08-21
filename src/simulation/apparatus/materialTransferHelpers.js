import {
  createSolidMaterialBody,
  createSolidMaterialState,
} from '../../core/materials/solids/solidMaterialState.js';
import {
  materialBodyHeatCapacityJPerK,
  materialBodyMassKg,
} from '../../core/materials/thermal/thermalMaterial.js';
import {
  THERMAL_ENERGY_TOLERANCE_J,
  heatCapacityJPerKForSpeciesMasses,
  sensibleEnthalpyJAtTemperature,
  temperatureKFromSensibleEnthalpy,
} from '../../core/materials/thermal/thermalState.js';
import {
  hopperStoredMassKg,
  HOPPER_TOLERANCE_KG,
} from '../hopperNode.js';

export const APPARATUS_TRANSFER_TOLERANCE_KG = 1e-8;
const RUNTIME_SOLID_TOLERANCE = 1e-9;

/**
 * Scale a simulation-owned canonical solid state without re-validating every
 * fraction or deep-cloning immutable texture definitions. The returned map is
 * independent, while texture-profile objects are shared as read-only lineage
 * metadata. Public material APIs retain their defensive validation behavior.
 */
export function scaleSolidStateForRuntime(state, factor) {
  if (!Number.isFinite(factor) || factor < 0) {
    throw new Error('runtime solid-state scale factor must be finite and non-negative');
  }
  const fractions = {};
  for (const [key, quantity] of Object.entries(state?.fractions ?? {})) {
    const scaled = quantity * factor;
    if (scaled > RUNTIME_SOLID_TOLERANCE) fractions[key] = scaled;
  }
  return {
    fractions,
    textureProfiles: { ...(state?.textureProfiles ?? {}) },
  };
}

export function solidStateMassForRuntime(state) {
  let total = 0;
  for (const quantity of Object.values(state?.fractions ?? {})) {
    if (quantity > RUNTIME_SOLID_TOLERANCE) total += quantity;
  }
  return total;
}

function solidStateSpeciesMassesForRuntime(state) {
  const masses = {};
  for (const [key, quantity] of Object.entries(state?.fractions ?? {})) {
    if (quantity <= RUNTIME_SOLID_TOLERANCE) continue;
    const separator = key.indexOf('|');
    const speciesId = separator < 0 ? key : key.slice(0, separator);
    masses[speciesId] = (masses[speciesId] ?? 0) + quantity;
  }
  return masses;
}

export function solidStateHeatCapacityForRuntime(state) {
  return heatCapacityJPerKForSpeciesMasses(solidStateSpeciesMassesForRuntime(state));
}

export function proportionalSolidStateFromHopper(hopper, requestedTotalRateKgPerSecond) {
  const storedMassKg = hopperStoredMassKg(hopper);
  if (storedMassKg <= HOPPER_TOLERANCE_KG || requestedTotalRateKgPerSecond <= 0) {
    return createSolidMaterialState();
  }
  return scaleSolidStateForRuntime(
    hopper.materialBody.solidState,
    requestedTotalRateKgPerSecond / storedMassKg,
  );
}

export function capacityScaleForOutput(freeCapacityKg, solidState, dt) {
  const requiredKg = solidStateMassForRuntime(solidState) * dt;
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
 * Compatibility path for discrete/external callers that already have full
 * MaterialBodies. Continuous apparatus should use the withdrawal-based helper
 * below to avoid creating temporary bodies solely for temperature transport.
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

/**
 * Allocation-light equivalent used by continuous apparatus. Withdrawals are
 * already canonical finite states, so heat capacity and output specific energy
 * can be derived directly from sparse fraction maps without constructing and
 * validating temporary MaterialBodies.
 */
export function outputSpecificSensibleEnthalpiesFromWithdrawals(withdrawals, outputSolidStates) {
  const totalInputSensibleEnthalpyJ = withdrawals.reduce(
    (sum, withdrawal) => sum + (withdrawal.actualSensibleEnthalpyJ ?? 0),
    0,
  );
  if (Math.abs(totalInputSensibleEnthalpyJ) <= THERMAL_ENERGY_TOLERANCE_J) {
    return outputSolidStates.map(() => 0);
  }
  const totalInputHeatCapacityJPerK = withdrawals.reduce(
    (sum, withdrawal) => sum + solidStateHeatCapacityForRuntime(withdrawal.actualSolidState),
    0,
  );
  const equilibriumTemperatureK = temperatureKFromSensibleEnthalpy(
    totalInputSensibleEnthalpyJ,
    totalInputHeatCapacityJPerK,
  );
  return outputSolidStates.map(state => {
    const massKgPerSecond = solidStateMassForRuntime(state);
    if (massKgPerSecond <= 0) return 0;
    const capacityJPerKPerSecond = solidStateHeatCapacityForRuntime(state);
    return sensibleEnthalpyJAtTemperature(equilibriumTemperatureK, capacityJPerKPerSecond)
      / massKgPerSecond;
  });
}
