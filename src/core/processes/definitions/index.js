import { CONE_CRUSHING_PROCESS_DEFINITION, CONE_CRUSHING_PROCESS_ID } from './coneCrushing.js';
import { CRUSHING_PROCESS_DEFINITION, CRUSHING_PROCESS_ID } from './crushing.js';
import { FEEDING_PROCESS_DEFINITION, FEEDING_PROCESS_ID } from './feeding.js';
import { JAW_CRUSHING_PROCESS_DEFINITION, JAW_CRUSHING_PROCESS_ID } from './jawCrushing.js';
import { MERGING_PROCESS_DEFINITION, MERGING_PROCESS_ID } from './merging.js';
import {
  MAGNETIC_SEPARATION_PROCESS_DEFINITION,
  MAGNETIC_SEPARATION_PROCESS_ID,
} from './magneticSeparation.js';
import { MILLING_PROCESS_DEFINITION, MILLING_PROCESS_ID } from './milling.js';
import { SCREENING_PROCESS_DEFINITION, SCREENING_PROCESS_ID } from './screening.js';
import { SPLITTING_PROCESS_DEFINITION, SPLITTING_PROCESS_ID } from './splitting.js';

export {
  CONE_CRUSHING_PROCESS_ID,
  CRUSHING_PROCESS_ID,
  FEEDING_PROCESS_ID,
  JAW_CRUSHING_PROCESS_ID,
  MAGNETIC_SEPARATION_PROCESS_ID,
  MERGING_PROCESS_ID,
  MILLING_PROCESS_ID,
  SCREENING_PROCESS_ID,
  SPLITTING_PROCESS_ID,
};

export const PROCESS_DEFINITIONS = Object.freeze({
  [CONE_CRUSHING_PROCESS_ID]: CONE_CRUSHING_PROCESS_DEFINITION,
  [CRUSHING_PROCESS_ID]: CRUSHING_PROCESS_DEFINITION,
  [FEEDING_PROCESS_ID]: FEEDING_PROCESS_DEFINITION,
  [JAW_CRUSHING_PROCESS_ID]: JAW_CRUSHING_PROCESS_DEFINITION,
  [MAGNETIC_SEPARATION_PROCESS_ID]: MAGNETIC_SEPARATION_PROCESS_DEFINITION,
  [MERGING_PROCESS_ID]: MERGING_PROCESS_DEFINITION,
  [MILLING_PROCESS_ID]: MILLING_PROCESS_DEFINITION,
  [SCREENING_PROCESS_ID]: SCREENING_PROCESS_DEFINITION,
  [SPLITTING_PROCESS_ID]: SPLITTING_PROCESS_DEFINITION,
});

export function listProcessDefinitions() {
  return Object.values(PROCESS_DEFINITIONS);
}

export function getProcessDefinition(processId) {
  return PROCESS_DEFINITIONS[processId] ?? null;
}

export function getProcessParameterDefinition(processId, parameterId) {
  return getProcessDefinition(processId)?.parameters?.find(parameter => parameter.id === parameterId) ?? null;
}

export function defaultProcessParameters(processId) {
  const processDefinition = getProcessDefinition(processId);
  if (!processDefinition) throw new Error(`Unknown process '${processId}'`);
  return Object.fromEntries(
    (processDefinition.parameters ?? []).map(parameter => [parameter.id, parameter.defaultValue])
  );
}

export function validateProcessParameter(parameter, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Process parameter '${parameter.id}' must be a finite number`);
  }
  if (value < parameter.min || value > parameter.max) {
    throw new Error(
      `Process parameter '${parameter.id}' must be within [${parameter.min}, ${parameter.max}]`
    );
  }
  if (parameter.choices?.length) {
    const allowedValues = parameter.choices.map(choice => choice.value);
    const legacyValues = parameter.legacyValues ?? [];
    if (!allowedValues.includes(value) && !legacyValues.includes(value)) {
      throw new Error(
        `Process parameter '${parameter.id}' must use a canonical value: ${allowedValues.join(', ')}`
      );
    }
  }
  return value;
}

export function validateProcessParameters(processDefinition, parameters = {}) {
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
    throw new Error('Process parameters must be an object keyed by parameter id');
  }

  const parameterDefinitions = processDefinition.parameters ?? [];
  const definedParameterIds = new Set(parameterDefinitions.map(parameter => parameter.id));
  for (const parameterId of Object.keys(parameters)) {
    if (!definedParameterIds.has(parameterId)) {
      throw new Error(`Unknown process parameter '${parameterId}' for process '${processDefinition.id}'`);
    }
  }

  const normalized = {};
  for (const parameter of parameterDefinitions) {
    const value = parameters[parameter.id] ?? parameter.defaultValue;
    normalized[parameter.id] = validateProcessParameter(parameter, value);
  }
  return normalized;
}
