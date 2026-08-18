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
        min: 1,
        max: 120,
        defaultValue: 15,
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
        min: 0,
        max: 1,
        defaultValue: 0.6,
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
