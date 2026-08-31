export const ROASTING_PROCESS_ID = 'thermochemical-roasting';

export const ROASTING_PROCESS_DEFINITION = Object.freeze({
  id: ROASTING_PROCESS_ID,
  name: 'Thermochemical Roasting',
  inputs: Object.freeze([{ id: 'feed', kind: 'material' }]),
  outputs: Object.freeze([
    { id: 'solid-product', kind: 'material' },
    { id: 'gas-exhaust', kind: 'material' },
  ]),
  conservationPolicy: 'elemental',
  parameters: Object.freeze([
    {
      id: 'temperatureSetpointK',
      label: 'Temperature setpoint',
      unit: 'K',
      min: 300,
      max: 1400,
      defaultValue: 900,
      controlType: 'number',
      playerConfigurable: true,
    },
  ]),
});
