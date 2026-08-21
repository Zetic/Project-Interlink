import {
  createSolidMaterialBody,
  createSolidMaterialStateFromSpeciesQuantities,
} from '../../materials/solids/solidMaterialState.js';
import {
  CONE_CRUSHING_PROCESS_ID,
  JAW_CRUSHING_PROCESS_ID,
  MILLING_PROCESS_ID,
} from '../definitions/index.js';
import {
  coneCrushSolidMaterialState,
  jawCrushSolidMaterialState,
  millSolidMaterialState,
} from '../physics/comminution.js';

function materialBodyForBatch(batch) {
  if (batch?.materialBody) return batch.materialBody;
  if (batch?.componentsKg && batch?.particleSizeMm) {
    return createSolidMaterialBody(
      createSolidMaterialStateFromSpeciesQuantities(batch.componentsKg, batch.particleSizeMm)
    );
  }
  throw new Error(`Input batch '${batch?.id ?? 'unknown'}' is missing materialBody`);
}

const PROCESS_CONFIG = Object.freeze({
  [JAW_CRUSHING_PROCESS_ID]: Object.freeze({
    parameterId: 'jawProductSizeMm',
    execute: jawCrushSolidMaterialState,
  }),
  [CONE_CRUSHING_PROCESS_ID]: Object.freeze({
    parameterId: 'coneProductSizeMm',
    execute: coneCrushSolidMaterialState,
  }),
  [MILLING_PROCESS_ID]: Object.freeze({
    parameterId: 'millProductSizeMm',
    execute: millSolidMaterialState,
  }),
});

export function runStagedComminution(processDefinition, inputBatchesByPort, normalizedParameters) {
  const config = PROCESS_CONFIG[processDefinition.id];
  if (!config) throw new Error(`Unsupported staged comminution process '${processDefinition.id}'`);
  const inputBatch = inputBatchesByPort.feed;
  const inputMaterialBody = materialBodyForBatch(inputBatch);
  const targetParticleSizeMm = normalizedParameters[config.parameterId];
  return {
    outputPortBatches: [{
      outputId: 'product',
      materialBody: createSolidMaterialBody(
        config.execute(inputMaterialBody.solidState, targetParticleSizeMm)
      ),
      particleSizeMm: targetParticleSizeMm,
      resourceId: null,
    }],
  };
}
