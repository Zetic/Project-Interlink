import { MASS_TOLERANCE_KG, createMaterialBatch, roundKg, sumComponentMassKg, validateComponentsKg, isMaterialBatchAvailable } from '../materials/materialBatches.js';
import { CRUSHING_PROCESS_ID, getProcessDefinition, MAGNETIC_SEPARATION_PROCESS_ID } from './processDefinitions.js';

const MAGNETIC_RESPONSE_BY_COMPONENT = {
  magnetite: { baseRecovery: 0.2, variableRecovery: 0.75 },
  hematite: { baseRecovery: 0.08, variableRecovery: 0.32 },
  goethite: { baseRecovery: 0.05, variableRecovery: 0.18 },
  quartzAndGangue: { baseRecovery: 0.01, variableRecovery: 0.04 },
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

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
  const normalized = {};
  for (const parameterDefinition of processDefinition.parameters ?? []) {
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
    validateComponentsKg(inputBatch.componentsKg);
    if (typeof inputBatch.particleSizeMm !== 'number' || !Number.isFinite(inputBatch.particleSizeMm) || inputBatch.particleSizeMm <= 0) {
      throw new Error(`Input batch '${inputBatch.id}' has invalid particle size`);
    }
    resolved[input.id] = inputBatch;
  }

  return resolved;
}

function buildOutputComponents(inputComponentsKg, fieldStrength) {
  const concentrateComponentsKg = {};
  const tailingsComponentsKg = {};

  for (const [componentId, inputMassKg] of Object.entries(inputComponentsKg)) {
    const response = MAGNETIC_RESPONSE_BY_COMPONENT[componentId];
    const recovery = clamp(response.baseRecovery + response.variableRecovery * fieldStrength, 0, 1);

    const concentrateMassKg = roundKg(inputMassKg * recovery);
    const tailingsMassKg = roundKg(inputMassKg - concentrateMassKg);

    concentrateComponentsKg[componentId] = concentrateMassKg;
    tailingsComponentsKg[componentId] = tailingsMassKg;
  }

  return {
    concentrateComponentsKg,
    tailingsComponentsKg,
  };
}

function runMagneticSeparation(processDefinition, inputBatchesByPort, normalizedParameters) {
  const inputBatch = inputBatchesByPort.feed;
  const maxFeedParticleSizeMm = processDefinition.maxFeedParticleSizeMm ?? Infinity;
  if (inputBatch.particleSizeMm > maxFeedParticleSizeMm) {
    throw new Error(
      `Process '${processDefinition.id}' requires feed particle size <= ${maxFeedParticleSizeMm} mm (got ${inputBatch.particleSizeMm} mm)`
    );
  }

  for (const componentId of Object.keys(inputBatch.componentsKg)) {
    if (!MAGNETIC_RESPONSE_BY_COMPONENT[componentId]) {
      throw new Error(`Process '${processDefinition.id}' does not support component '${componentId}'`);
    }
  }

  const { fieldStrength } = normalizedParameters;
  const { concentrateComponentsKg, tailingsComponentsKg } = buildOutputComponents(inputBatch.componentsKg, fieldStrength);

  return {
    outputPortBatches: [
      {
        outputId: 'concentrate',
        componentsKg: concentrateComponentsKg,
        particleSizeMm: inputBatch.particleSizeMm,
        resourceId: null,
      },
      {
        outputId: 'tailings',
        componentsKg: tailingsComponentsKg,
        particleSizeMm: inputBatch.particleSizeMm,
        resourceId: null,
      },
    ],
  };
}

function runCrushing(processDefinition, inputBatchesByPort, normalizedParameters) {
  const inputBatch = inputBatchesByPort.feed;
  const { targetParticleSizeMm } = normalizedParameters;

  if (targetParticleSizeMm >= inputBatch.particleSizeMm) {
    throw new Error(
      `Process '${processDefinition.id}' requires targetParticleSizeMm below current feed size (${inputBatch.particleSizeMm} mm)`
    );
  }

  return {
    outputPortBatches: [
      {
        outputId: 'product',
        componentsKg: { ...inputBatch.componentsKg },
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

function aggregateComponents(batches) {
  const aggregated = {};
  for (const batch of batches) {
    for (const [componentId, massKg] of Object.entries(batch.componentsKg)) {
      aggregated[componentId] = roundKg((aggregated[componentId] ?? 0) + massKg);
    }
  }
  return aggregated;
}

function validateConservation(inputBatches, outputPortBatches, processId) {
  const inputComponents = aggregateComponents(inputBatches);
  const outputComponents = aggregateComponents(outputPortBatches);

  const allComponentIds = new Set([...Object.keys(inputComponents), ...Object.keys(outputComponents)]);
  for (const componentId of allComponentIds) {
    const inputMass = inputComponents[componentId] ?? 0;
    const outputMass = outputComponents[componentId] ?? 0;
    if (Math.abs(inputMass - outputMass) > MASS_TOLERANCE_KG) {
      throw new Error(`Process '${processId}' violates constituent conservation for '${componentId}'`);
    }
  }

  const massInKg = roundKg(inputBatches.reduce((sum, batch) => sum + sumComponentMassKg(batch.componentsKg), 0));
  const massOutKg = roundKg(outputPortBatches.reduce((sum, batch) => sum + sumComponentMassKg(batch.componentsKg), 0));

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
  const inputBatches = (processDefinition.inputs ?? []).map(input => inputBatchesByPort[input.id]);

  const metrics = validateConservation(inputBatches, execution.outputPortBatches, processDefinition.id);

  return {
    processId: processDefinition.id,
    inputBindings: (processDefinition.inputs ?? []).map(input => ({ inputId: input.id, batchId: inputBatchesByPort[input.id].id })),
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

  // Stage every ID and output batch before mutating World State. If validation
  // fails anywhere below, the physical input batches and world counters remain unchanged.
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
      particleSizeMm: output.particleSizeMm,
      provenance: outputProvenance,
      status: 'available',
      componentsKg: output.componentsKg,
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

  // Commit only after the entire transition has been successfully validated.
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
