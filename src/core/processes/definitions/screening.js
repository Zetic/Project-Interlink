export const SCREENING_PROCESS_ID = 'screening';

export const SCREENING_PROCESS_DEFINITION = {
  id: SCREENING_PROCESS_ID,
  name: 'Screening',
  inputs: [{ id: 'feed', kind: 'material' }],
  outputs: [
    { id: 'undersize', kind: 'material' },
    { id: 'oversize', kind: 'material' },
  ],
  conservationPolicy: 'species',
  parameters: [
    {
      id: 'apertureSizeMm',
      label: 'Aperture size',
      unit: 'mm',
      min: 1,
      max: 120,
      defaultValue: 25,
      controlType: 'number',
      playerConfigurable: true,
      choices: Object.freeze([
        Object.freeze({ value: 1, label: '≤1 mm' }),
        Object.freeze({ value: 5, label: '≤5 mm' }),
        Object.freeze({ value: 15, label: '≤15 mm' }),
        Object.freeze({ value: 25, label: '≤25 mm' }),
        Object.freeze({ value: 60, label: '≤60 mm' }),
        Object.freeze({ value: 120, label: '≤120 mm' }),
      ]),
    },
  ],
};
