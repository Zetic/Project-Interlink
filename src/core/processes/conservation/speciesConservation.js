import {
  roundKg,
  MASS_TOLERANCE_KG,
} from '../../materials/materialBatches.js';
import {
  summarizeSolidMaterialBySpecies,
  totalSolidQuantity,
} from '../../materials/solids/solidMaterialState.js';

function aggregateComponentsFromBodies(bodies) {
  const aggregated = {};
  for (const body of bodies) {
    const summary = summarizeSolidMaterialBySpecies(body.solidState);
    for (const [componentId, massKg] of Object.entries(summary)) {
      aggregated[componentId] = roundKg((aggregated[componentId] ?? 0) + massKg);
    }
  }
  return aggregated;
}

export function validateSpeciesConservation(inputBodies, outputBodies, processId) {
  const inputComponents = aggregateComponentsFromBodies(inputBodies);
  const outputComponents = aggregateComponentsFromBodies(outputBodies);
  const allComponentIds = new Set([...Object.keys(inputComponents), ...Object.keys(outputComponents)]);
  for (const componentId of allComponentIds) {
    const inputMass = inputComponents[componentId] ?? 0;
    const outputMass = outputComponents[componentId] ?? 0;
    if (Math.abs(inputMass - outputMass) > MASS_TOLERANCE_KG) {
      throw new Error(`Process '${processId}' violates constituent conservation for '${componentId}'`);
    }
  }
  const massInKg = roundKg(inputBodies.reduce((sum, body) => sum + totalSolidQuantity(body.solidState), 0));
  const massOutKg = roundKg(outputBodies.reduce((sum, body) => sum + totalSolidQuantity(body.solidState), 0));
  return { massInKg, massOutKg, balanceErrorKg: roundKg(massInKg - massOutKg) };
}
