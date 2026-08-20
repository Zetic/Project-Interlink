export const FEEDING_PROCESS_ID = 'feeding';

export const FEEDER_RATED_THROUGHPUT_KG_PER_SECOND = 10;

export const FEEDING_PROCESS_DEFINITION = {
  id: FEEDING_PROCESS_ID,
  name: 'Controlled Feeding',
  inputs: [{ id: 'feed', kind: 'material' }],
  outputs: [{ id: 'product', kind: 'material' }],
  conservationPolicy: 'species',
  parameters: [
    {
      id: 'flowRateKgPerSecond',
      label: 'Feed rate',
      unit: 'kg/s',
      min: 0,
      max: FEEDER_RATED_THROUGHPUT_KG_PER_SECOND,
      defaultValue: 4,
      controlType: 'number',
      playerConfigurable: true,
    },
  ],
};
