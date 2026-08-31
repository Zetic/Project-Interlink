export const CRUSHING_PROCESS_ID = 'crushing';

export const CRUSHING_PROCESS_DEFINITION = {
  id: CRUSHING_PROCESS_ID,
  name: 'Crushing',
  inputs: [{ id: 'feed', kind: 'material' }],
  outputs: [{ id: 'product', kind: 'material' }],
  conservationPolicy: 'species',
  parameters: [
    {
      id: 'targetParticleSizeMm',
      label: 'Nominal product size',
      unit: 'mm',
      min: 1,
      max: 120,
      defaultValue: 15,
      controlType: 'number',
      playerConfigurable: true,
      choices: Object.freeze([
        Object.freeze({ value: 1, label: '1 mm' }),
        Object.freeze({ value: 5, label: '5 mm' }),
        Object.freeze({ value: 15, label: '15 mm' }),
        Object.freeze({ value: 25, label: '25 mm' }),
        Object.freeze({ value: 60, label: '60 mm' }),
        Object.freeze({ value: 120, label: '120 mm' }),
      ]),
      legacyValues: Object.freeze([10, 12]),
    },
  ],
};
