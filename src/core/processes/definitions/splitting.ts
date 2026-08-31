export const SPLITTING_PROCESS_ID = 'splitting';

export const SPLITTING_PROCESS_DEFINITION = {
  id: SPLITTING_PROCESS_ID,
  name: 'Material Splitting',
  inputs: [{ id: 'feed', kind: 'material' }],
  outputs: [
    { id: 'output-a', kind: 'material' },
    { id: 'output-b', kind: 'material' },
  ],
  conservationPolicy: 'species',
  parameters: [
    {
      id: 'splitFractionToA',
      label: 'Split to output A',
      min: 0,
      max: 1,
      defaultValue: 0.5,
      controlType: 'number',
      playerConfigurable: true,
    },
  ],
};
