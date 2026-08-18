import {
  MASS_TOLERANCE_KG,
  createMaterialBatch,
  roundKg,
  sumComponentMassKg,
  validateComponentsKg,
  isMaterialBatchAvailable,
} from '../materials/materialBatches.js';
import { getProcessDefinition, MAGNETIC_SEPARATION_PROCESS_ID } from './processDefinitions.js';

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

function validateInputBatchForProcess(processDefinition, inputBatch) {
  if (!inputBatch) throw new Error('Input batch is required');
  if (!isMaterialBatchAvailable(inputBatch)) {
    throw new Error(`Input batch '${inputBatch?.id}' is not available for processing`);
  }

  validateComponentsKg(inputBatch.componentsKg);

  if (processDefinition.supportedResourceIds && !processDefinition.supportedResourceIds.includes(inputBatch.resourceId)) {
    throw new Error(
      `Process '${processDefinition.id}' does not support resource '${inputBatch.resourceId}'`
    );
  }
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

export function executeProcess(processDefinition, inputBatch, parameters = {}) {
  const normalizedParameters = validateProcessParameters(processDefinition, parameters);
  validateInputBatchForProcess(processDefinition, inputBatch);

  if (processDefinition.id !== MAGNETIC_SEPARATION_PROCESS_ID) {
    throw new Error(`Execution for process '${processDefinition.id}' is not implemented`);
  }

  for (const componentId of Object.keys(inputBatch.componentsKg)) {
    if (!MAGNETIC_RESPONSE_BY_COMPONENT[componentId]) {
      throw new Error(`Process '${processDefinition.id}' does not support component '${componentId}'`);
    }
  }

  const { fieldStrength } = normalizedParameters;
  const { concentrateComponentsKg, tailingsComponentsKg } = buildOutputComponents(inputBatch.componentsKg, fieldStrength);

  const massInKg = roundKg(sumComponentMassKg(inputBatch.componentsKg));
  const massOutKg = roundKg(sumComponentMassKg(concentrateComponentsKg) + sumComponentMassKg(tailingsComponentsKg));

  return {
    processId: processDefinition.id,
    inputBatchIds: [inputBatch.id],
    parameters: normalizedParameters,
    outputPortBatches: [
      { outputId: 'concentrate', componentsKg: concentrateComponentsKg },
      { outputId: 'tailings', componentsKg: tailingsComponentsKg },
    ],
    metrics: {
      massInKg,
      massOutKg,
      balanceErrorKg: roundKg(massInKg - massOutKg),
    },
  };
}

export function runProcessAndCommit(world, processId, inputBatchId, parameters = {}) {
  if (!world?.materialBatches) throw new Error('World materialBatches map is required');
  if (!world?.processResults) throw new Error('World processResults map is required');
  assertWorldOrdinals(world);

  const processDefinition = getProcessDefinition(processId);
  if (!processDefinition) throw new Error(`Unknown process '${processId}'`);

  const inputBatch = world.materialBatches[inputBatchId];
  if (!inputBatch) throw new Error(`Unknown input batch '${inputBatchId}'`);

  const executionResult = executeProcess(processDefinition, inputBatch, parameters);
  if (Math.abs(executionResult.metrics.balanceErrorKg) > MASS_TOLERANCE_KG) {
    throw new Error(`Process '${processId}' violates matter conservation`);
  }

  // Stage every ID and output batch before mutating World State. If validation
  // fails anywhere below, the physical input batch and world counters remain unchanged.
  const runId = `process-run-${world.nextProcessRunOrdinal}`;
  if (world.processResults[runId]) {
    throw new Error(`Process result id '${runId}' already exists`);
  }

  const firstOutputOrdinal = world.nextMaterialBatchOrdinal;
  const stagedOutputBatches = executionResult.outputPortBatches.map((output, index) => {
    const batchId = `batch-${firstOutputOrdinal + index}`;
    if (world.materialBatches[batchId]) {
      throw new Error(`Material batch id '${batchId}' already exists`);
    }

    const batch = createMaterialBatch({
      id: batchId,
      sourceOccurrenceId: inputBatch.sourceOccurrenceId,
      resourceId: inputBatch.resourceId,
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
    inputBatchIds: [inputBatch.id],
    outputBatches: stagedOutputBatches.map(output => ({
      outputId: output.outputId,
      batchId: output.batchId,
    })),
    parameters: executionResult.parameters,
    metrics: executionResult.metrics,
  };

  // Commit only after the entire transition has been successfully validated.
  inputBatch.status = 'consumed';
  inputBatch.consumedByProcessRunId = runId;
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
