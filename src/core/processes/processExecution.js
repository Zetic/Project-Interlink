import {
  MASS_TOLERANCE_KG,
  createMaterialBatch,
  validateComponentsKg,
  isMaterialBatchAvailable,
} from '../materials/materialBatches.js';
import {
  createSolidMaterialBody,
  createSolidMaterialStateFromSpeciesQuantities,
} from '../materials/solids/solidMaterialState.js';
import { validateMaterialBody } from '../materials/materialBody.js';
import { distributeSensibleEnthalpyAtEquilibrium } from '../materials/thermal/thermalMaterial.js';
import {
  getProcessDefinition,
  validateProcessParameters,
} from './definitions/index.js';
import { validateProcessConservation } from './conservation/conservation.js';
import { processExecutorFor } from './executors/index.js';

function assertWorldOrdinals(world) {
  if (!Number.isInteger(world.nextMaterialBatchOrdinal) || world.nextMaterialBatchOrdinal < 1) {
    throw new Error('World nextMaterialBatchOrdinal must be a positive integer');
  }
  if (!Number.isInteger(world.nextProcessRunOrdinal) || world.nextProcessRunOrdinal < 1) {
    throw new Error('World nextProcessRunOrdinal must be a positive integer');
  }
}

export { validateProcessParameters };

function validateInputBindings(processDefinition, inputBindings) {
  if (!inputBindings || typeof inputBindings !== 'object' || Array.isArray(inputBindings)) {
    throw new Error('inputBindings must be an object keyed by input port id');
  }

  const requiredInputIds = (processDefinition.inputs ?? []).map(input => input.id);

  for (const inputId of requiredInputIds) {
    const batchId = inputBindings[inputId];
    if (!batchId || typeof batchId !== 'string') {
      throw new Error(`Missing required input binding '${inputId}'`);
    }
  }

  for (const providedInputId of Object.keys(inputBindings)) {
    if (!requiredInputIds.includes(providedInputId)) {
      throw new Error(`Unknown input binding '${providedInputId}' for process '${processDefinition.id}'`);
    }
  }

  const boundBatchIds = requiredInputIds.map(inputId => inputBindings[inputId]);
  if (new Set(boundBatchIds).size !== boundBatchIds.length) {
    throw new Error(`Process '${processDefinition.id}' cannot bind the same physical batch to multiple input ports`);
  }
}

function materialBodyForBatchLike(batch) {
  if (batch?.materialBody) return batch.materialBody;
  if (batch?.componentsKg && batch?.particleSizeMm) {
    return createSolidMaterialBody(createSolidMaterialStateFromSpeciesQuantities(batch.componentsKg, batch.particleSizeMm));
  }
  throw new Error(`Input batch '${batch?.id ?? 'unknown'}' is missing materialBody`);
}

function resolveInputBatches(world, processDefinition, inputBindings) {
  validateInputBindings(processDefinition, inputBindings);

  const resolved = {};
  for (const input of processDefinition.inputs ?? []) {
    const batchId = inputBindings[input.id];
    const inputBatch = world.materialBatches[batchId];
    if (!inputBatch) {
      throw new Error(`Unknown input batch '${batchId}' for input '${input.id}'`);
    }
    if (!isMaterialBatchAvailable(inputBatch)) {
      throw new Error(`Input batch '${inputBatch.id}' is not available for processing`);
    }
    validateMaterialBody(materialBodyForBatchLike(inputBatch));
    if (!inputBatch.materialBody) inputBatch.materialBody = materialBodyForBatchLike(inputBatch);
    validateComponentsKg(inputBatch.componentsKg);
    resolved[input.id] = inputBatch;
  }

  return resolved;
}

function validateOutputPortBatches(processDefinition, outputPortBatches) {
  if (!Array.isArray(outputPortBatches)) {
    throw new Error(`Process '${processDefinition.id}' executor must return outputPortBatches as an array`);
  }

  const expectedOutputIds = (processDefinition.outputs ?? []).map(output => output.id);
  const expectedOutputIdSet = new Set(expectedOutputIds);
  const seenOutputIds = new Set();

  for (const output of outputPortBatches) {
    if (!output || typeof output !== 'object' || Array.isArray(output)) {
      throw new Error(`Process '${processDefinition.id}' returned an invalid output batch descriptor`);
    }
    if (!output.outputId || typeof output.outputId !== 'string') {
      throw new Error(`Process '${processDefinition.id}' returned an output without a valid outputId`);
    }
    if (!expectedOutputIdSet.has(output.outputId)) {
      throw new Error(`Process '${processDefinition.id}' returned unexpected output port '${output.outputId}'`);
    }
    if (seenOutputIds.has(output.outputId)) {
      throw new Error(`Process '${processDefinition.id}' returned duplicate output port '${output.outputId}'`);
    }
    seenOutputIds.add(output.outputId);
    validateMaterialBody(output.materialBody);
  }

  for (const expectedOutputId of expectedOutputIds) {
    if (!seenOutputIds.has(expectedOutputId)) {
      throw new Error(`Process '${processDefinition.id}' did not produce required output port '${expectedOutputId}'`);
    }
  }
}

export function executeProcess(processDefinition, inputBatchesByPort, parameters = {}) {
  const normalizedParameters = validateProcessParameters(processDefinition, parameters);

  const executor = processExecutorFor(processDefinition.id);
  if (!executor) {
    throw new Error(`Execution for process '${processDefinition.id}' is not implemented`);
  }

  const execution = executor(processDefinition, inputBatchesByPort, normalizedParameters);
  validateOutputPortBatches(processDefinition, execution.outputPortBatches);

  const inputBatches = (processDefinition.inputs ?? []).map(input => inputBatchesByPort[input.id]);
  if ((processDefinition.conservationPolicy ?? 'species') === 'species') {
    const thermalOutputs = distributeSensibleEnthalpyAtEquilibrium(
      inputBatches.map(batch => batch.materialBody),
      execution.outputPortBatches.map(output => output.materialBody),
    );
    execution.outputPortBatches.forEach((output, index) => {
      output.materialBody = thermalOutputs[index];
    });
  }
  const metrics = validateProcessConservation(
    processDefinition,
    inputBatches.map(batch => batch.materialBody),
    execution.outputPortBatches.map(output => output.materialBody),
  );

  return {
    processId: processDefinition.id,
    inputBindings: (processDefinition.inputs ?? []).map(input => ({
      inputId: input.id,
      batchId: inputBatchesByPort[input.id].id,
    })),
    parameters: normalizedParameters,
    outputPortBatches: execution.outputPortBatches,
    metrics,
  };
}

function buildOutputProvenance(inputBatches, runId) {
  const sourceOccurrenceIds = [];
  const sourceBatchIds = [];

  for (const batch of inputBatches) {
    if (batch.sourceOccurrenceId && !sourceOccurrenceIds.includes(batch.sourceOccurrenceId)) {
      sourceOccurrenceIds.push(batch.sourceOccurrenceId);
    }
    for (const occurrenceId of batch.provenance?.sourceOccurrenceIds ?? []) {
      if (!sourceOccurrenceIds.includes(occurrenceId)) {
        sourceOccurrenceIds.push(occurrenceId);
      }
    }
    sourceBatchIds.push(batch.id);
  }

  return {
    sourceOccurrenceIds,
    sourceBatchIds,
    createdByProcessRunId: runId,
  };
}

export function runProcessAndCommit(world, processId, inputBindings, parameters = {}) {
  if (!world?.materialBatches) throw new Error('World materialBatches map is required');
  if (!world?.processResults) throw new Error('World processResults map is required');
  assertWorldOrdinals(world);

  const processDefinition = getProcessDefinition(processId);
  if (!processDefinition) throw new Error(`Unknown process '${processId}'`);

  const inputBatchesByPort = resolveInputBatches(world, processDefinition, inputBindings);
  const inputBatches = (processDefinition.inputs ?? []).map(input => inputBatchesByPort[input.id]);

  const executionResult = executeProcess(processDefinition, inputBatchesByPort, parameters);
  if (Math.abs(executionResult.metrics.balanceErrorKg) > MASS_TOLERANCE_KG) {
    throw new Error(`Process '${processId}' violates matter conservation`);
  }

  const runId = `process-run-${world.nextProcessRunOrdinal}`;
  if (world.processResults[runId]) {
    throw new Error(`Process result id '${runId}' already exists`);
  }

  const firstOutputOrdinal = world.nextMaterialBatchOrdinal;
  const outputProvenance = buildOutputProvenance(inputBatches, runId);

  const stagedOutputBatches = executionResult.outputPortBatches.map((output, index) => {
    const batchId = `batch-${firstOutputOrdinal + index}`;
    if (world.materialBatches[batchId]) {
      throw new Error(`Material batch id '${batchId}' already exists`);
    }

    const batch = createMaterialBatch({
      id: batchId,
      resourceId: output.resourceId ?? null,
      materialBody: output.materialBody,
      particleSizeMm: output.particleSizeMm ?? null,
      provenance: outputProvenance,
      status: 'available',
    });

    return {
      outputId: output.outputId,
      batchId,
      batch,
    };
  });

  const storedProcessResult = {
    id: runId,
    processId,
    inputBindings: executionResult.inputBindings,
    outputBatches: stagedOutputBatches.map(output => ({
      outputId: output.outputId,
      batchId: output.batchId,
    })),
    parameters: executionResult.parameters,
    metrics: executionResult.metrics,
  };

  for (const inputBatch of inputBatches) {
    inputBatch.status = 'consumed';
    inputBatch.consumedByProcessRunId = runId;
  }

  for (const output of stagedOutputBatches) {
    world.materialBatches[output.batchId] = output.batch;
  }

  world.processResults[runId] = storedProcessResult;
  world.nextMaterialBatchOrdinal += stagedOutputBatches.length;
  world.nextProcessRunOrdinal += 1;

  return {
    ...storedProcessResult,
    outputBatches: stagedOutputBatches,
  };
}
