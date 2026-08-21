import { MASS_TOLERANCE_KG, roundKg } from '../../materials/materialBatches.js';
import { materialBodyMassKg, materialBodySpeciesMassesKg } from '../../materials/thermal/thermalMaterial.js';
import { elementalMassesForSpeciesMass } from '../../materials/species/elementalComposition.js';

function elementalMassesForBodies(bodies) {
  const totals = {};
  for (const body of bodies) {
    for (const [speciesId, massKg] of Object.entries(materialBodySpeciesMassesKg(body))) {
      for (const [element, elementMassKg] of Object.entries(elementalMassesForSpeciesMass(speciesId, massKg))) {
        totals[element] = (totals[element] ?? 0) + elementMassKg;
      }
    }
  }
  return totals;
}

export function validateElementalConservation(inputBodies, outputBodies, processId) {
  const inputElements = elementalMassesForBodies(inputBodies);
  const outputElements = elementalMassesForBodies(outputBodies);
  for (const element of new Set([...Object.keys(inputElements), ...Object.keys(outputElements)])) {
    if (Math.abs((inputElements[element] ?? 0) - (outputElements[element] ?? 0)) > MASS_TOLERANCE_KG) {
      throw new Error(`Process '${processId}' violates elemental conservation for '${element}'`);
    }
  }
  const massInKg = inputBodies.reduce((sum, body) => sum + materialBodyMassKg(body), 0);
  const massOutKg = outputBodies.reduce((sum, body) => sum + materialBodyMassKg(body), 0);
  return {
    massInKg: roundKg(massInKg),
    massOutKg: roundKg(massOutKg),
    balanceErrorKg: roundKg(massInKg - massOutKg),
    elementalMassesInKg: inputElements,
    elementalMassesOutKg: outputElements,
  };
}
