import { applyGoethiteDehydroxylation } from '../physics/thermochemicalReactions.js';

export function runRoasting(_processDefinition, inputBatchesByPort, normalizedParameters) {
  const feedBody = inputBatchesByPort.feed?.materialBody;
  if (!feedBody) throw new Error('Roasting feed is missing materialBody');
  const result = applyGoethiteDehydroxylation(feedBody, normalizedParameters.residenceTimeSeconds);
  return {
    outputPortBatches: [
      { outputId: 'solid-product', materialBody: result.solidProductBody, resourceId: null },
      { outputId: 'gas-exhaust', materialBody: result.gasProductBody, resourceId: null },
    ],
  };
}
