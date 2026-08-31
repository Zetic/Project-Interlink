import { getProcessDefinition } from '../../processes/definitions/index.js';
import {
  isNonEmptyString,
  validateReferenceIdArray,
  worldCollections,
} from './helpers.js';
import {
  summarizeSolidMaterialBySpecies,
  totalSolidQuantity,
  validateSolidMaterialBody,
} from '../../materials/solids/solidMaterialState.js';

/** Validate discrete MaterialBatch provenance and process-result history. */
export function validateProcessHistory(world) {
  if (!world || typeof world !== 'object' || Array.isArray(world)) return [];
  const {
    resourceOccurrences,
    materialBatches,
    processResults,
  } = worldCollections(world);
  const errors = [];

  for (const [bid, batch] of Object.entries(materialBatches)) {
    if (batch.sourceOccurrenceId && !resourceOccurrences[batch.sourceOccurrenceId]) {
      errors.push(`Material batch '${bid}' references unknown source occurrence '${batch.sourceOccurrenceId}'`);
    }

    if (!batch.provenance || typeof batch.provenance !== 'object' || Array.isArray(batch.provenance)) {
      errors.push(`Material batch '${bid}' is missing a valid provenance object`);
    } else {
      validateReferenceIdArray(
        batch.provenance.sourceOccurrenceIds,
        `Material batch '${bid}' provenance.sourceOccurrenceIds`,
        resourceOccurrences,
        errors,
      );
      validateReferenceIdArray(
        batch.provenance.sourceBatchIds,
        `Material batch '${bid}' provenance.sourceBatchIds`,
        materialBatches,
        errors,
      );

      const createdByProcessRunId = batch.provenance.createdByProcessRunId;
      if (createdByProcessRunId != null) {
        if (!isNonEmptyString(createdByProcessRunId)) {
          errors.push(`Material batch '${bid}' provenance.createdByProcessRunId must be a non-empty string or null`);
        } else if (!processResults[createdByProcessRunId]) {
          errors.push(`Material batch '${bid}' provenance references unknown process run '${createdByProcessRunId}'`);
        }
      }
    }

    try {
      validateSolidMaterialBody(batch.materialBody);
    } catch (error) {
      errors.push(`Material batch '${bid}' has invalid materialBody: ${error.message}`);
      continue;
    }

    if (!batch.componentsKg || typeof batch.componentsKg !== 'object' || Array.isArray(batch.componentsKg)) {
      errors.push(`Material batch '${bid}' is missing componentsKg`);
      continue;
    }

    const componentEntries = Object.entries(batch.componentsKg);
    let massSum = 0;
    for (const [componentId, massKg] of componentEntries) {
      if (typeof massKg !== 'number' || Number.isNaN(massKg) || !Number.isFinite(massKg)) {
        errors.push(`Material batch '${bid}' component '${componentId}' has invalid mass '${massKg}'`);
        continue;
      }
      if (massKg < 0) errors.push(`Material batch '${bid}' component '${componentId}' has negative mass '${massKg}'`);
      massSum += massKg;
    }

    if (componentEntries.length === 0) errors.push(`Material batch '${bid}' has no components`);

    const derivedComponents = summarizeSolidMaterialBySpecies(batch.materialBody.solidState);
    const derivedMassSum = totalSolidQuantity(batch.materialBody.solidState);
    if (JSON.stringify(batch.componentsKg) !== JSON.stringify(derivedComponents)) {
      errors.push(`Material batch '${bid}' componentsKg does not match derived material-body species summary`);
    }

    if (
      typeof batch.totalMassKg !== 'number'
      || Number.isNaN(batch.totalMassKg)
      || !Number.isFinite(batch.totalMassKg)
    ) {
      errors.push(`Material batch '${bid}' has invalid totalMassKg '${batch.totalMassKg}'`);
    } else if (Math.abs(batch.totalMassKg - derivedMassSum) > 1e-6 || Math.abs(batch.totalMassKg - massSum) > 1e-6) {
      errors.push(`Material batch '${bid}' totalMassKg '${batch.totalMassKg}' does not match component/material-body sum '${derivedMassSum}'`);
    }
  }

  for (const [runId, result] of Object.entries(processResults)) {
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      errors.push(`Process result '${runId}' must be an object`);
      continue;
    }

    const processDefinition = isNonEmptyString(result.processId) ? getProcessDefinition(result.processId) : null;
    if (!isNonEmptyString(result.processId)) errors.push(`Process result '${runId}' has invalid processId`);
    else if (!processDefinition) errors.push(`Process result '${runId}' references unknown process '${result.processId}'`);

    const expectedInputIds = new Set((processDefinition?.inputs ?? []).map(input => input.id));
    const seenInputIds = new Set();
    const seenInputBatchIds = new Set();

    if (!Array.isArray(result.inputBindings)) {
      errors.push(`Process result '${runId}' inputBindings must be an array`);
    } else {
      for (const inputBinding of result.inputBindings) {
        if (!inputBinding || typeof inputBinding !== 'object' || Array.isArray(inputBinding)) {
          errors.push(`Process result '${runId}' has invalid input binding`);
          continue;
        }
        const { inputId, batchId } = inputBinding;
        if (!isNonEmptyString(inputId)) {
          errors.push(`Process result '${runId}' has invalid input binding id`);
        } else {
          if (seenInputIds.has(inputId)) errors.push(`Process result '${runId}' has duplicate input binding '${inputId}'`);
          seenInputIds.add(inputId);
          if (processDefinition && !expectedInputIds.has(inputId)) {
            errors.push(`Process result '${runId}' has unexpected input binding '${inputId}'`);
          }
        }
        if (!isNonEmptyString(batchId)) {
          errors.push(`Process result '${runId}' has invalid input batch id`);
        } else {
          if (seenInputBatchIds.has(batchId)) errors.push(`Process result '${runId}' binds input batch '${batchId}' more than once`);
          seenInputBatchIds.add(batchId);
          if (!materialBatches[batchId]) errors.push(`Process result '${runId}' references unknown input batch '${batchId}'`);
        }
      }
    }

    if (processDefinition) {
      for (const expectedInputId of expectedInputIds) {
        if (!seenInputIds.has(expectedInputId)) errors.push(`Process result '${runId}' is missing required input binding '${expectedInputId}'`);
      }
    }

    const expectedOutputIds = new Set((processDefinition?.outputs ?? []).map(output => output.id));
    const seenOutputIds = new Set();
    const seenOutputBatchIds = new Set();

    if (!Array.isArray(result.outputBatches)) {
      errors.push(`Process result '${runId}' outputBatches must be an array`);
    } else {
      for (const output of result.outputBatches) {
        if (!output || typeof output !== 'object' || Array.isArray(output)) {
          errors.push(`Process result '${runId}' has invalid output binding`);
          continue;
        }
        const { outputId, batchId } = output;
        if (!isNonEmptyString(outputId)) {
          errors.push(`Process result '${runId}' has invalid output binding id`);
        } else {
          if (seenOutputIds.has(outputId)) errors.push(`Process result '${runId}' has duplicate output binding '${outputId}'`);
          seenOutputIds.add(outputId);
          if (processDefinition && !expectedOutputIds.has(outputId)) {
            errors.push(`Process result '${runId}' has unexpected output binding '${outputId}'`);
          }
        }
        if (!isNonEmptyString(batchId)) {
          errors.push(`Process result '${runId}' has invalid output batch id`);
        } else {
          if (seenOutputBatchIds.has(batchId)) errors.push(`Process result '${runId}' references output batch '${batchId}' more than once`);
          seenOutputBatchIds.add(batchId);
          if (!materialBatches[batchId]) errors.push(`Process result '${runId}' references unknown output batch '${batchId}'`);
        }
      }
    }

    if (processDefinition) {
      for (const expectedOutputId of expectedOutputIds) {
        if (!seenOutputIds.has(expectedOutputId)) errors.push(`Process result '${runId}' is missing required output binding '${expectedOutputId}'`);
      }
    }
  }

  return errors;
}
