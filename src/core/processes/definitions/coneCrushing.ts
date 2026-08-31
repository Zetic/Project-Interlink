export const CONE_CRUSHING_PROCESS_ID = 'cone-crushing';

export const CONE_CRUSHING_PROCESS_DEFINITION = {
  id: CONE_CRUSHING_PROCESS_ID,
  name: 'Cone Crushing',
  inputs: [{ id: 'feed', kind: 'material' }],
  outputs: [{ id: 'product', kind: 'material' }],
  conservationPolicy: 'species',
  parameters: [
    {
      id: 'coneProductSizeMm',
      label: 'Nominal product size',
      unit: 'mm',
      min: 5,
      max: 60,
      defaultValue: 25,
      controlType: 'number',
      playerConfigurable: true,
      choices: Object.freeze([
        Object.freeze({ value: 5, label: '5 mm' }),
        Object.freeze({ value: 15, label: '15 mm' }),
        Object.freeze({ value: 25, label: '25 mm' }),
        Object.freeze({ value: 60, label: '60 mm' }),
      ]),
    },
  ],
  maxFeedParticleSizeMm: 250,
};
