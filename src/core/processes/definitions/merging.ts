export const MERGING_PROCESS_ID = 'merging';

export const MERGING_PROCESS_DEFINITION = {
  id: MERGING_PROCESS_ID,
  name: 'Material Merging',
  inputs: [
    { id: 'input-a', kind: 'material' },
    { id: 'input-b', kind: 'material' },
  ],
  outputs: [{ id: 'product', kind: 'material' }],
  conservationPolicy: 'species',
  parameters: [],
};
