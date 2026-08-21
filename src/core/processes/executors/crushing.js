import {
  createSolidMaterialBody,
  createSolidMaterialStateFromSpeciesQuantities,
} from '../../materials/solids/solidMaterialState.js';
import { crushSolidMaterialState } from '../physics/crushing.js';

function materialBodyForBatch(batch) {
  if (batch?.materialBody) return batch.materialBody;
  if (batch?.componentsKg && batch?.particleSizeMm) {
    return createSolidMaterialBody(
      createSolidMaterialStateFromSpeciesQuantities(batch.componentsKg, batch.particleSizeMm)
    );
  }
  throw new Error(`Input batch '${batch?.id ?? 'unknown'}' is missing materialBody`);
}

export function runCrushing(processDefinition, inputBatchesByPort, normalizedParameters) {
  const inputBatch = inputBatchesByPort.feed;
  const inputMaterialBody = materialBodyForBatch(inputBatch);
  const { targetParticleSizeMm } = normalizedParameters;
  return {
    outputPortBatches: [{
      outputId: 'product',
      materialBody: createSolidMaterialBody(
        crushSolidMaterialState(inputMaterialBody.solidState, targetParticleSizeMm)
      ),
      particleSizeMm: targetParticleSizeMm,
      resourceId: null,
    }],
  };
}
