export const JAW_CRUSHING_PROCESS_ID = 'jaw-crushing';

export const JAW_CRUSHING_PROCESS_DEFINITION = {
  id: JAW_CRUSHING_PROCESS_ID,
  name: 'Jaw Crushing',
  inputs: [{ id: 'feed', kind: 'material' }],
  outputs: [{ id: 'product', kind: 'material' }],
  conservationPolicy: 'species',
  parameters: [
    {
      id: 'jawProductSizeMm',
      label: 'Nominal product size',
      unit: 'mm',
      min: 120,
      max: 250,
      defaultValue: 120,
      controlType: 'number',
      playerConfigurable: true,
      choices: Object.freeze([
        Object.freeze({ value: 120, label: '120 mm' }),
        Object.freeze({ value: 250, label: '250 mm' }),
      ]),
    },
  ],
  maxFeedParticleSizeMm: 1000,
};
