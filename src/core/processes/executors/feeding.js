import {
  createSolidMaterialBody,
  createSolidMaterialStateFromSpeciesQuantities,
} from '../../materials/solids/solidMaterialState.js';
import { feedSolidMaterialState } from '../physics/feeding.js';

function materialBodyForBatch(batch) {
  if (batch?.materialBody) return batch.materialBody;
  if (batch?.componentsKg && batch?.particleSizeMm) {
    return createSolidMaterialBody(
      createSolidMaterialStateFromSpeciesQuantities(batch.componentsKg, batch.particleSizeMm)
    );
  }
  throw new Error(`Input batch '${batch?.id ?? 'unknown'}' is missing materialBody`);
}

export function runFeeding(_processDefinition, inputBatchesByPort) {
  const input = materialBodyForBatch(inputBatchesByPort.feed);
  const product = feedSolidMaterialState(input.solidState);
  return {
    outputPortBatches: [
      { outputId: 'product', materialBody: createSolidMaterialBody(product), particleSizeMm: null, resourceId: null },
    ],
  };
}
