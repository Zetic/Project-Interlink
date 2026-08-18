export const MAGNETIC_SEPARATION_PROCESS_ID = 'magnetic-separation';

export const PROCESS_DEFINITIONS = {
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
        min: 0,
        max: 1,
        defaultValue: 0.6,
      },
    ],
    supportedResourceIds: ['iron-ore'],
  },
};

export function listProcessDefinitions() {
  return Object.values(PROCESS_DEFINITIONS);
}

export function getProcessDefinition(processId) {
  return PROCESS_DEFINITIONS[processId] ?? null;
}
