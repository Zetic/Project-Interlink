import {
  createSolidMaterialBody,
  createSolidMaterialStateFromSpeciesQuantities,
} from '../../materials/solids/solidMaterialState.js';
import { splitMagneticSolidState } from '../physics/magneticSeparation.js';

function materialBodyForBatch(batch) {
  if (batch?.materialBody) return batch.materialBody;
  if (batch?.componentsKg && batch?.particleSizeMm) {
    return createSolidMaterialBody(
      createSolidMaterialStateFromSpeciesQuantities(batch.componentsKg, batch.particleSizeMm)
    );
  }
  throw new Error(`Input batch '${batch?.id ?? 'unknown'}' is missing materialBody`);
}

export function runMagneticSeparation(processDefinition, inputBatchesByPort, normalizedParameters) {
  const inputBatch = inputBatchesByPort.feed;
  const inputMaterialBody = materialBodyForBatch(inputBatch);
  const { fieldStrength } = normalizedParameters;
  const { concentrate, tailings } = splitMagneticSolidState(
    inputMaterialBody.solidState,
    fieldStrength,
    processDefinition.maxFeedParticleSizeMm ?? 25,
  );
  return {
    outputPortBatches: [
      {
        outputId: 'concentrate',
        materialBody: { physicalForm: inputMaterialBody.physicalForm, solidState: concentrate },
        particleSizeMm: inputBatch.particleSizeMm ?? null,
        resourceId: null,
      },
      {
        outputId: 'tailings',
        materialBody: { physicalForm: inputMaterialBody.physicalForm, solidState: tailings },
        particleSizeMm: inputBatch.particleSizeMm ?? null,
        resourceId: null,
      },
    ],
  };
}
