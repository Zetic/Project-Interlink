export const FEATURE_TYPE_WEIGHT_RULES = Object.freeze([
  Object.freeze({
    when: Object.freeze({ heat: Object.freeze({ gt: 0.6 }), geologicActivity: Object.freeze({ gt: 0.6 }) }),
    add: Object.freeze({ 'Volcanic Vent': 5, 'Magma Chamber': 4, 'Hydrothermal System': 5, 'Mineral Deposit': 3 }),
  }),
  Object.freeze({
    when: Object.freeze({ moisture: Object.freeze({ gt: 0.5 }) }),
    add: Object.freeze({ Aquifer: 4, 'Cave / Cavern': 2 }),
  }),
  Object.freeze({
    when: Object.freeze({ heat: Object.freeze({ lt: 0.3 }) }),
    add: Object.freeze({ 'Ice Body': 4, 'Gas Reservoir': 2 }),
  }),
  Object.freeze({
    when: Object.freeze({ relief: Object.freeze({ gt: 0.6 }) }),
    add: Object.freeze({ Ravine: 4, Outcrop: 4, Fault: 2 }),
  }),
  Object.freeze({
    when: Object.freeze({ geologicActivity: Object.freeze({ gt: 0.5 }) }),
    add: Object.freeze({ Fault: 3, 'Mineral Deposit': 3 }),
  }),
  Object.freeze({
    when: Object.freeze({ moisture: Object.freeze({ lt: 0.3 }), heat: Object.freeze({ gt: 0.4 }) }),
    add: Object.freeze({ 'Salt Basin': 3 }),
  }),
  Object.freeze({
    when: Object.freeze({ latitude: Object.freeze({ absGt: 55 }) }),
    add: Object.freeze({ 'Ice Body': 3 }),
  }),
]);

export const FEATURE_AFFINITY_TAGS = Object.freeze({
  'Mineral Deposit': Object.freeze(['metallic', 'ore']),
  'Geological Formation': Object.freeze(['rock', 'igneous', 'sedimentary']),
  Aquifer: Object.freeze(['wet', 'liquid']),
  'Gas Reservoir': Object.freeze(['gas', 'hydrocarbon', 'carbonRich']),
  'Cave / Cavern': Object.freeze(['rock', 'carbonate', 'mineral']),
  Ravine: Object.freeze(['rock', 'igneous', 'sedimentary']),
  Fault: Object.freeze(['rock', 'metallic']),
  Crater: Object.freeze(['rock', 'metallic', 'mineral']),
  'Volcanic Vent': Object.freeze(['volcanic', 'mineral', 'gas']),
  'Hydrothermal System': Object.freeze(['volcanic', 'wet', 'liquid', 'metallic']),
  'Magma Chamber': Object.freeze(['volcanic', 'liquid']),
  'Ice Body': Object.freeze(['icy', 'volatile']),
  'Salt Basin': Object.freeze(['evaporite', 'saline']),
  Outcrop: Object.freeze(['rock', 'igneous', 'sedimentary']),
});

export function conditionMatches(value, condition) {
  if (condition.gt != null) return value > condition.gt;
  if (condition.lt != null) return value < condition.lt;
  if (condition.absGt != null) return Math.abs(value) > condition.absGt;
  return true;
}
