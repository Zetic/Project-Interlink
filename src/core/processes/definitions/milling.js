export const MILLING_PROCESS_ID = 'milling';

export const MILLING_PROCESS_DEFINITION = {
  id: MILLING_PROCESS_ID,
  name: 'Milling',
  inputs: [{ id: 'feed', kind: 'material' }],
  outputs: [{ id: 'product', kind: 'material' }],
  conservationPolicy: 'species',
  parameters: [
    {
      id: 'millProductSizeMm',
      label: 'Nominal product size',
      unit: 'mm',
      min: 0.032,
      max: 0.5,
      defaultValue: 0.25,
      controlType: 'number',
      playerConfigurable: true,
      choices: Object.freeze([
        Object.freeze({ value: 0.5, label: '500 µm' }),
        Object.freeze({ value: 0.25, label: '250 µm' }),
        Object.freeze({ value: 0.125, label: '125 µm' }),
        Object.freeze({ value: 0.063, label: '63 µm' }),
        Object.freeze({ value: 0.032, label: '32 µm' }),
      ]),
    },
  ],
  maxFeedParticleSizeMm: 25,
};
