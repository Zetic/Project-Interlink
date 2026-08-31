export const MAGNETIC_SEPARATION_PROCESS_ID = 'magnetic-separation';

export const MAGNETIC_SEPARATION_PROCESS_DEFINITION = {
  id: MAGNETIC_SEPARATION_PROCESS_ID,
  name: 'Magnetic Separation',
  inputs: [{ id: 'feed', kind: 'material' }],
  outputs: [
    { id: 'concentrate', kind: 'material' },
    { id: 'tailings', kind: 'material' },
  ],
  conservationPolicy: 'species',
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
  maxFeedParticleSizeMm: 25,
};
