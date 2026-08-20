export const MAGNETIC_SEPARATION_PROCESS_ID = 'magnetic-separation';
export const CRUSHING_PROCESS_ID = 'crushing';

export const PROCESS_DEFINITIONS = {
  [CRUSHING_PROCESS_ID]: {
    id: CRUSHING_PROCESS_ID,
    name: 'Crushing',
    inputs: [{ id: 'feed', kind: 'material' }],
    outputs: [{ id: 'product', kind: 'material' }],
    parameters: [
      {
        id: 'targetParticleSizeMm',
        label: 'Target particle size',
        unit: 'mm',
        min: 1,
        max: 120,
        defaultValue: 15,
        controlType: 'number',
        playerConfigurable: true,
      },
    ],
  },
  [MAGNETIC_SEPARATION_PROCESS_ID]: {
    id: MAGNETIC_SEPARATION_PROCESS_ID,
    name: 'Magnetic Separation',
    inputs: [{ id: 'feed', kind: 'material' }],
    outputs: [
      { id: 'concentrate', kind: 'material' },
      { id: 'tailings', kind: 'material' },
    ],
    parameters: [
      {
        id: 'fieldStrength',
        label: 'Field strength',
        min: 0,
        max: 1,
        defaultValue: 0.6,
        controlType: 'number',
        playerConfigurable: true,
      },
    ],
    // Prototype approximation: feed above this size is too coarse to separate.
    maxFeedParticleSizeMm: 25,
  },
};

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
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Process parameter '${parameter.id}' must be a finite number`);
    }
    if (value < parameter.min || value > parameter.max) {
      throw new Error(
        `Process parameter '${parameter.id}' must be within [${parameter.min}, ${parameter.max}]`
      );
    }
    normalized[parameter.id] = value;
  }
  return normalized;
}
