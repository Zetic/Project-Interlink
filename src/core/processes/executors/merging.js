import {
  createSolidMaterialBody,
  createSolidMaterialStateFromSpeciesQuantities,
} from '../../materials/solids/solidMaterialState.js';
import { mergeSolidMaterialStates } from '../physics/merging.js';

function materialBodyForBatch(batch) {
  if (batch?.materialBody) return batch.materialBody;
  if (batch?.componentsKg && batch?.particleSizeMm) {
    return createSolidMaterialBody(
      createSolidMaterialStateFromSpeciesQuantities(batch.componentsKg, batch.particleSizeMm)
    );
  }
  throw new Error(`Input batch '${batch?.id ?? 'unknown'}' is missing materialBody`);
}

export function runMerging(_processDefinition, inputBatchesByPort) {
  const inputA = materialBodyForBatch(inputBatchesByPort['input-a']);
  const inputB = materialBodyForBatch(inputBatchesByPort['input-b']);
  const product = mergeSolidMaterialStates(inputA.solidState, inputB.solidState);
  return {
    outputPortBatches: [
      { outputId: 'product', materialBody: createSolidMaterialBody(product), particleSizeMm: null, resourceId: null },
    ],
  };
}
