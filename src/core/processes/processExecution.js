import {
  MASS_TOLERANCE_KG,
  createMaterialBatch,
  roundKg,
  sumComponentMassKg,
  validateComponentsKg,
  isMaterialBatchAvailable,
} from '../materials/materialBatches.js';
import {
  createSolidMaterialBody,
  createSolidMaterialStateFromSpeciesQuantities,
  summarizeSolidMaterialBySpecies,
  totalSolidQuantity,
  validateSolidMaterialBody,
} from '../materials/solidMaterialState.js';
import {
  CRUSHING_PROCESS_ID,
  getProcessDefinition,
  MAGNETIC_SEPARATION_PROCESS_ID,
} from './processDefinitions.js';
import { assertCrushingTarget, crushSolidMaterialState, splitMagneticSolidState } from './processPhysics.js';

function assertWorldOrdinals(world) {
  if (!Number.isInteger(world.nextMaterialBatchOrdinal) || world.nextMaterialBatchOrdinal < 1) {
    throw new Error('World nextMaterialBatchOrdinal must be a positive integer');
  }
  if (!Number.isInteger(world.nextProcessRunOrdinal) || world.nextProcessRunOrdinal < 1) {
    throw new Error('World nextProcessRunOrdinal must be a positive integer');
  }
}

function assertParameterWithinRange(parameterDefinition, value) {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new Error(`Process parameter '${parameterDefinition.id}' must be a finite number`);
  }
  if (value < parameterDefinition.min || value > parameterDefinition.max) {
    throw new Error(
      `Process parameter '${parameterDefinition.id}' must be within [${parameterDefinition.min}, ${parameterDefinition.max}]`
    );
  }
}

export function validateProcessParameters(processDefinition, parameters = {}) {
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
    throw new Error('Process parameters must be an object keyed by parameter id');
  }

  const parameterDefinitions = processDefinition.parameters ?? [];
  const definedParameterIds = new Set(parameterDefinitions.map(parameter => parameter.id));

  for (const providedParameterId of Object.keys(parameters)) {
    if (!definedParameterIds.has(providedParameterId)) {
      throw new Error(`Unknown process parameter '${providedParameterId}' for process '${processDefinition.id}'`);
    }
  }

  const normalized = {};
  for (const parameterDefinition of parameterDefinitions) {
    const providedValue = parameters[parameterDefinition.id] ?? parameterDefinition.defaultValue;
    assertParameterWithinRange(parameterDefinition, providedValue);
    normalized[parameterDefinition.id] = providedValue;
  }
  return normalized;
}

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
    validateSolidMaterialBody(materialBodyForBatchLike(inputBatch));
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
    validateSolidMaterialBody(output.materialBody);
  }

  for (const expectedOutputId of expectedOutputIds) {
    if (!seenOutputIds.has(expectedOutputId)) {
      throw new Error(`Process '${processDefinition.id}' did not produce required output port '${expectedOutputId}'`);
    }
  }
}

function runMagneticSeparation(processDefinition, inputBatchesByPort, normalizedParameters) {
  const inputBatch = inputBatchesByPort.feed;
  const inputMaterialBody = materialBodyForBatchLike(inputBatch);
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

function runCrushing(processDefinition, inputBatchesByPort, normalizedParameters) {
  const inputBatch = inputBatchesByPort.feed;
  const inputMaterialBody = materialBodyForBatchLike(inputBatch);
  const { targetParticleSizeMm } = normalizedParameters;
  assertCrushingTarget(inputMaterialBody.solidState, targetParticleSizeMm);

  return {
    outputPortBatches: [
      {
        outputId: 'product',
        materialBody: {
          physicalForm: inputMaterialBody.physicalForm,
          solidState: crushSolidMaterialState(inputMaterialBody.solidState, targetParticleSizeMm),
        },
        particleSizeMm: targetParticleSizeMm,
        resourceId: null,
      },
    ],
  };
}

const PROCESS_EXECUTORS = {
  [MAGNETIC_SEPARATION_PROCESS_ID]: runMagneticSeparation,
  [CRUSHING_PROCESS_ID]: runCrushing,
};

function aggregateComponentsFromBodies(bodies) {
  const aggregated = {};
  for (const body of bodies) {
    const summary = summarizeSolidMaterialBySpecies(body.solidState);
    for (const [componentId, massKg] of Object.entries(summary)) {
      aggregated[componentId] = roundKg((aggregated[componentId] ?? 0) + massKg);
    }
  }
  return aggregated;
}

function validateConservation(inputBatches, outputPortBatches, processId) {
  const inputComponents = aggregateComponentsFromBodies(inputBatches.map(batch => batch.materialBody));
  const outputComponents = aggregateComponentsFromBodies(outputPortBatches.map(batch => batch.materialBody));

  const allComponentIds = new Set([...Object.keys(inputComponents), ...Object.keys(outputComponents)]);
  for (const componentId of allComponentIds) {
    const inputMass = inputComponents[componentId] ?? 0;
    const outputMass = outputComponents[componentId] ?? 0;
    if (Math.abs(inputMass - outputMass) > MASS_TOLERANCE_KG) {
      throw new Error(`Process '${processId}' violates constituent conservation for '${componentId}'`);
    }
  }

  const massInKg = roundKg(inputBatches.reduce((sum, batch) => sum + totalSolidQuantity(batch.materialBody.solidState), 0));
  const massOutKg = roundKg(outputPortBatches.reduce((sum, batch) => sum + totalSolidQuantity(batch.materialBody.solidState), 0));

  return {
    massInKg,
    massOutKg,
    balanceErrorKg: roundKg(massInKg - massOutKg),
  };
}

export function executeProcess(processDefinition, inputBatchesByPort, parameters = {}) {
  const normalizedParameters = validateProcessParameters(processDefinition, parameters);

  const executor = PROCESS_EXECUTORS[processDefinition.id];
  if (!executor) {
    throw new Error(`Execution for process '${processDefinition.id}' is not implemented`);
  }

  const execution = executor(processDefinition, inputBatchesByPort, normalizedParameters);
  validateOutputPortBatches(processDefinition, execution.outputPortBatches);

  const inputBatches = (processDefinition.inputs ?? []).map(input => inputBatchesByPort[input.id]);
  const metrics = validateConservation(inputBatches, execution.outputPortBatches, processDefinition.id);

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
