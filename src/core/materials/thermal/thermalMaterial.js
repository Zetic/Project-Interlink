import { MATERIAL_FORMS } from '../materialForms.js';
import { totalGasMassKg } from '../gas/gasMaterialState.js';
import {
  createSolidMaterialBody,
  createSolidMaterialState,
  iterateSolidFractions,
  totalSolidQuantity,
} from '../solids/solidMaterialState.js';
import { createGasMaterialBody, createGasMaterialState } from '../gas/gasMaterialState.js';
import { cloneMaterialBody, validateMaterialBody } from '../materialBody.js';
import {
  THERMAL_ENERGY_TOLERANCE_J,
  THERMAL_REFERENCE_TEMPERATURE_K,
  heatCapacityJPerKForSpeciesMasses,
  sensibleEnthalpyJAtTemperature,
  temperatureKFromSensibleEnthalpy,
} from './thermalState.js';

export function materialBodySpeciesMassesKg(body) {
  validateMaterialBody(body);
  if (body.physicalForm === MATERIAL_FORMS.GAS) return { ...body.gasState.speciesMassKg };
  const masses = {};
  for (const fraction of iterateSolidFractions(body.solidState)) {
    masses[fraction.speciesId] = (masses[fraction.speciesId] ?? 0) + fraction.quantity;
  }
  return masses;
}

export function materialBodyMassKg(body) {
  validateMaterialBody(body);
  return body.physicalForm === MATERIAL_FORMS.GAS
    ? totalGasMassKg(body.gasState)
    : totalSolidQuantity(body.solidState);
}

export function materialBodyHeatCapacityJPerK(body) {
  return heatCapacityJPerKForSpeciesMasses(materialBodySpeciesMassesKg(body));
}

export function materialBodyTemperatureK(body) {
  const capacity = materialBodyHeatCapacityJPerK(body);
  return temperatureKFromSensibleEnthalpy(body.thermalState.sensibleEnthalpyJ, capacity);
}

export function setMaterialBodyTemperatureK(body, temperatureK) {
  const capacity = materialBodyHeatCapacityJPerK(body);
  body.thermalState.sensibleEnthalpyJ = sensibleEnthalpyJAtTemperature(temperatureK, capacity);
  return body;
}

export function proportionalMaterialBodyShare(body, requestedMassKg) {
  validateMaterialBody(body);
  if (!Number.isFinite(requestedMassKg) || requestedMassKg < 0) {
    throw new Error('requested material mass must be finite and non-negative');
  }
  const totalMassKg = materialBodyMassKg(body);
  const factor = totalMassKg <= 0 ? 0 : Math.min(1, requestedMassKg / totalMassKg);
  if (body.physicalForm === MATERIAL_FORMS.GAS) {
    const result = createGasMaterialBody(createGasMaterialState());
    for (const [speciesId, massKg] of Object.entries(body.gasState.speciesMassKg)) {
      result.gasState.speciesMassKg[speciesId] = massKg * factor;
    }
    result.thermalState.sensibleEnthalpyJ = body.thermalState.sensibleEnthalpyJ * factor;
    return result;
  }
  const result = createSolidMaterialBody(createSolidMaterialState([], {
    textureProfiles: body.solidState.textureProfiles ?? {},
  }));
  for (const fraction of iterateSolidFractions(body.solidState)) {
    const key = fraction.textureProfileId
      ? `${fraction.speciesId}|${fraction.sizeBinId}|${fraction.liberationClassId}|${fraction.textureProfileId}`
      : `${fraction.speciesId}|${fraction.sizeBinId}|${fraction.liberationClassId}`;
    result.solidState.fractions[key] = fraction.quantity * factor;
  }
  result.thermalState.sensibleEnthalpyJ = body.thermalState.sensibleEnthalpyJ * factor;
  return result;
}

/**
 * Allocate a conserved sensible-energy total to bodies at one equilibrium
 * temperature. Zero energy needs no property coverage and remains at Tref.
 */
export function distributeSensibleEnthalpyAtEquilibrium(inputBodies, outputBodies) {
  const totalEnergyJ = inputBodies.reduce((sum, body) => sum + body.thermalState.sensibleEnthalpyJ, 0);
  if (Math.abs(totalEnergyJ) <= THERMAL_ENERGY_TOLERANCE_J) {
    return outputBodies.map(body => {
      const output = cloneMaterialBody(body);
      output.thermalState.sensibleEnthalpyJ = 0;
      return output;
    });
  }
  const outputCapacity = outputBodies.reduce((sum, body) => sum + materialBodyHeatCapacityJPerK(body), 0);
  const temperatureK = temperatureKFromSensibleEnthalpy(totalEnergyJ, outputCapacity);
  return outputBodies.map(body => {
    const output = cloneMaterialBody(body);
    output.thermalState.sensibleEnthalpyJ = sensibleEnthalpyJAtTemperature(
      temperatureK,
      materialBodyHeatCapacityJPerK(output),
    );
    return output;
  });
}

export { THERMAL_REFERENCE_TEMPERATURE_K };
