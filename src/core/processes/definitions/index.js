import { CRUSHING_PROCESS_DEFINITION, CRUSHING_PROCESS_ID } from './crushing.js';
import {
  MAGNETIC_SEPARATION_PROCESS_DEFINITION,
  MAGNETIC_SEPARATION_PROCESS_ID,
} from './magneticSeparation.js';
import { SCREENING_PROCESS_DEFINITION, SCREENING_PROCESS_ID } from './screening.js';

export { CRUSHING_PROCESS_ID, MAGNETIC_SEPARATION_PROCESS_ID, SCREENING_PROCESS_ID };

export const PROCESS_DEFINITIONS = Object.freeze({
  [CRUSHING_PROCESS_ID]: CRUSHING_PROCESS_DEFINITION,
  [MAGNETIC_SEPARATION_PROCESS_ID]: MAGNETIC_SEPARATION_PROCESS_DEFINITION,
  [SCREENING_PROCESS_ID]: SCREENING_PROCESS_DEFINITION,
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
