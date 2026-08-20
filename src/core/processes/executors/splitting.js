import {
  createSolidMaterialBody,
  createSolidMaterialStateFromSpeciesQuantities,
} from '../../materials/solids/solidMaterialState.js';
import { splitSolidMaterialState } from '../physics/splitting.js';

function materialBodyForBatch(batch) {
  if (batch?.materialBody) return batch.materialBody;
  if (batch?.componentsKg && batch?.particleSizeMm) {
    return createSolidMaterialBody(
      createSolidMaterialStateFromSpeciesQuantities(batch.componentsKg, batch.particleSizeMm)
    );
  }
  throw new Error(`Input batch '${batch?.id ?? 'unknown'}' is missing materialBody`);
}

export function runSplitting(_processDefinition, inputBatchesByPort, normalizedParameters) {
  const inputMaterialBody = materialBodyForBatch(inputBatchesByPort.feed);
  const { outputA, outputB } = splitSolidMaterialState(
    inputMaterialBody.solidState,
    normalizedParameters.splitFractionToA,
  );
  return {
    outputPortBatches: [
      { outputId: 'output-a', materialBody: createSolidMaterialBody(outputA), particleSizeMm: null, resourceId: null },
      { outputId: 'output-b', materialBody: createSolidMaterialBody(outputB), particleSizeMm: null, resourceId: null },
    ],
  };
}
