/**
 * Canonical occurrence-family vocabulary.
 *
 * A resource's `occurrenceFamily` declares its physical nature and is used as
 * a hard compatibility gate: only resources whose family appears in a Feature
 * type's `FEATURE_ALLOWED_FAMILIES` set are eligible to generate for that
 * Feature type. Tags then influence probability within the eligible pool.
 *
 * Keep this list small and stable. Add a new family only when an existing
 * family is genuinely physically wrong — not merely for flavour or
 * categorisation purposes.
 */
export const OCCURRENCE_FAMILIES = Object.freeze({
  ROCK_MASS:          'rock-mass',
  ORE_BODY:           'ore-body',
  MINERAL_BODY:       'mineral-body',
  SEDIMENT:           'sediment',
  EVAPORITE:          'evaporite',
  ICE_BODY:           'ice-body',
  AQUEOUS_FLUID:      'aqueous-fluid',
  HYDROTHERMAL_FLUID: 'hydrothermal-fluid',
  HYDROCARBON_LIQUID: 'hydrocarbon-liquid',
  MAGMA:              'magma',
  RESERVOIR_GAS:      'reservoir-gas',
  ATMOSPHERE:         'atmosphere',
  VEGETATION:         'vegetation',
  ORGANIC_SOIL:       'organic-soil',   // regional resources only; no localized Feature currently accepts this family
});

/** Set of all valid family string values, for catalog-integrity validation. */
export const OCCURRENCE_FAMILY_VALUES = new Set(Object.values(OCCURRENCE_FAMILIES));
