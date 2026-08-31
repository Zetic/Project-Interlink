import { MATERIAL_FORMS } from '../materialForms.js';
import { totalGasMassKg } from '../gas/gasMaterialState.js';
import {
  createSolidMaterialBody,
  createSolidMaterialState,
} from '../solids/solidMaterialState.js';
import { createGasMaterialBody, createGasMaterialState } from '../gas/gasMaterialState.js';
import { cloneMaterialBody, validateMaterialBody } from '../materialBody.js';
import {
  THERMAL_ENERGY_TOLERANCE_J,
  THERMAL_REFERENCE_TEMPERATURE_K,
  createThermalState,
  heatCapacityJPerKForSpeciesMasses,
  sensibleEnthalpyJAtTemperature,
  temperatureKFromSensibleEnthalpy,
} from './thermalState.js';

const SOLID_QUANTITY_TOLERANCE = 1e-9;

function bodySensibleEnthalpyJ(body) {
  return body?.thermalState?.sensibleEnthalpyJ ?? 0;
}

function ensureBodyThermalState(body) {
  if (!body.thermalState) body.thermalState = createThermalState();
  return body.thermalState;
}

function speciesIdFromFractionKey(key) {
  const separator = key.indexOf('|');
  return separator < 0 ? key : key.slice(0, separator);
}

/** Private reducers used only after the enclosing MaterialBody was validated. */
function solidSpeciesMassesUnchecked(state) {
  const masses = {};
  for (const [key, quantity] of Object.entries(state?.fractions ?? {})) {
    if (quantity <= SOLID_QUANTITY_TOLERANCE) continue;
    const speciesId = speciesIdFromFractionKey(key);
    masses[speciesId] = (masses[speciesId] ?? 0) + quantity;
  }
  return masses;
}

function solidMassUnchecked(state) {
  let total = 0;
  for (const quantity of Object.values(state?.fractions ?? {})) {
    if (quantity > SOLID_QUANTITY_TOLERANCE) total += quantity;
  }
  return total;
}

export function materialBodySpeciesMassesKg(body) {
  validateMaterialBody(body);
  if (body.physicalForm === MATERIAL_FORMS.GAS) return { ...body.gasState.speciesMassKg };
  return solidSpeciesMassesUnchecked(body.solidState);
}

export function materialBodyMassKg(body) {
  validateMaterialBody(body);
  return body.physicalForm === MATERIAL_FORMS.GAS
    ? totalGasMassKg(body.gasState)
    : solidMassUnchecked(body.solidState);
}

export function materialBodyHeatCapacityJPerK(body) {
  validateMaterialBody(body);
  const speciesMasses = body.physicalForm === MATERIAL_FORMS.GAS
    ? body.gasState.speciesMassKg
    : solidSpeciesMassesUnchecked(body.solidState);
  return heatCapacityJPerKForSpeciesMasses(speciesMasses);
}

export function materialBodyTemperatureK(body) {
  const sensibleEnthalpyJ = bodySensibleEnthalpyJ(body);
  if (Math.abs(sensibleEnthalpyJ) <= THERMAL_ENERGY_TOLERANCE_J) {
    return THERMAL_REFERENCE_TEMPERATURE_K;
  }
  const capacity = materialBodyHeatCapacityJPerK(body);
  return temperatureKFromSensibleEnthalpy(sensibleEnthalpyJ, capacity);
}

export function setMaterialBodyTemperatureK(body, temperatureK) {
  const capacity = materialBodyHeatCapacityJPerK(body);
  ensureBodyThermalState(body).sensibleEnthalpyJ = sensibleEnthalpyJAtTemperature(temperatureK, capacity);
  return body;
}

export function proportionalMaterialBodyShare(body, requestedMassKg) {
  validateMaterialBody(body);
  if (!Number.isFinite(requestedMassKg) || requestedMassKg < 0) {
    throw new Error('requested material mass must be finite and non-negative');
  }
  const totalMassKg = body.physicalForm === MATERIAL_FORMS.GAS
    ? totalGasMassKg(body.gasState)
    : solidMassUnchecked(body.solidState);
  const factor = totalMassKg <= 0 ? 0 : Math.min(1, requestedMassKg / totalMassKg);
  if (body.physicalForm === MATERIAL_FORMS.GAS) {
    const result = createGasMaterialBody(createGasMaterialState());
    for (const [speciesId, massKg] of Object.entries(body.gasState.speciesMassKg)) {
      result.gasState.speciesMassKg[speciesId] = massKg * factor;
    }
    result.thermalState.sensibleEnthalpyJ = bodySensibleEnthalpyJ(body) * factor;
    return result;
  }
  const result = createSolidMaterialBody(createSolidMaterialState([], {
    textureProfiles: body.solidState.textureProfiles ?? {},
  }));
  for (const [key, quantity] of Object.entries(body.solidState.fractions ?? {})) {
    if (quantity > SOLID_QUANTITY_TOLERANCE) result.solidState.fractions[key] = quantity * factor;
  }
  result.thermalState.sensibleEnthalpyJ = bodySensibleEnthalpyJ(body) * factor;
  return result;
}

/**
 * Allocate a conserved sensible-energy total to bodies at one equilibrium
 * temperature. Zero energy needs no property coverage and remains at Tref.
 */
export function distributeSensibleEnthalpyAtEquilibrium(inputBodies, outputBodies) {
  const totalEnergyJ = inputBodies.reduce((sum, body) => sum + bodySensibleEnthalpyJ(body), 0);
  if (Math.abs(totalEnergyJ) <= THERMAL_ENERGY_TOLERANCE_J) {
    return outputBodies.map(body => {
      const output = cloneMaterialBody(body);
      ensureBodyThermalState(output).sensibleEnthalpyJ = 0;
      return output;
    });
  }
  const outputCapacity = outputBodies.reduce((sum, body) => sum + materialBodyHeatCapacityJPerK(body), 0);
  const temperatureK = temperatureKFromSensibleEnthalpy(totalEnergyJ, outputCapacity);
  return outputBodies.map(body => {
    const output = cloneMaterialBody(body);
    ensureBodyThermalState(output).sensibleEnthalpyJ = sensibleEnthalpyJAtTemperature(
      temperatureK,
      materialBodyHeatCapacityJPerK(output),
    );
    return output;
  });
}

export { THERMAL_REFERENCE_TEMPERATURE_K };
