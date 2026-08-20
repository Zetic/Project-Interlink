import {
  createSolidMaterialBody,
  createSolidMaterialStateFromSpeciesQuantities,
} from '../../materials/solids/solidMaterialState.js';
import { splitScreenedSolidState } from '../physics/screening.js';

function materialBodyForBatch(batch) {
  if (batch?.materialBody) return batch.materialBody;
  if (batch?.componentsKg && batch?.particleSizeMm) {
    return createSolidMaterialBody(
      createSolidMaterialStateFromSpeciesQuantities(batch.componentsKg, batch.particleSizeMm)
    );
  }
  throw new Error(`Input batch '${batch?.id ?? 'unknown'}' is missing materialBody`);
}

export function runScreening(_processDefinition, inputBatchesByPort, normalizedParameters) {
  const inputBatch = inputBatchesByPort.feed;
  const inputMaterialBody = materialBodyForBatch(inputBatch);
  const { apertureSizeMm } = normalizedParameters;
  const { undersize, oversize } = splitScreenedSolidState(inputMaterialBody.solidState, apertureSizeMm);

  return {
    outputPortBatches: [
      {
        outputId: 'undersize',
        materialBody: createSolidMaterialBody(undersize),
        particleSizeMm: null,
        resourceId: null,
      },
      {
        outputId: 'oversize',
        materialBody: createSolidMaterialBody(oversize),
        particleSizeMm: null,
        resourceId: null,
      },
    ],
  };
}
