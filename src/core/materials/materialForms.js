import { getResourceDefinition } from '../../content/resources/resourceDefinitions.js';

export const MATERIAL_FORMS = Object.freeze({
  SOLID_PARTICULATE: 'solid-particulate',
  LIQUID: 'liquid',
  GAS: 'gas',
});

const SOLID_OCCURRENCE_FAMILIES = new Set([
  'rock-mass',
  'sediment',
  'ice-body',
  'vegetation',
  'organic-soil',
  'ore-body',
  'mineral-body',
  'evaporite',
]);

const LIQUID_OCCURRENCE_FAMILIES = new Set([
  'aqueous-fluid',
  'hydrocarbon-liquid',
  'magma',
  'hydrothermal-fluid',
]);

const GAS_OCCURRENCE_FAMILIES = new Set([
  'atmosphere',
  'reservoir-gas',
]);

export function physicalFormForResource(resourceOrId) {
  const resource = typeof resourceOrId === 'string' ? getResourceDefinition(resourceOrId) : resourceOrId;
  if (!resource) return null;
  if (SOLID_OCCURRENCE_FAMILIES.has(resource.occurrenceFamily)) return MATERIAL_FORMS.SOLID_PARTICULATE;
  if (LIQUID_OCCURRENCE_FAMILIES.has(resource.occurrenceFamily)) return MATERIAL_FORMS.LIQUID;
  if (GAS_OCCURRENCE_FAMILIES.has(resource.occurrenceFamily)) return MATERIAL_FORMS.GAS;
  return null;
}

export function physicalFormForOccurrence(occurrence) {
  return physicalFormForResource(occurrence?.resourceId ?? null);
}
