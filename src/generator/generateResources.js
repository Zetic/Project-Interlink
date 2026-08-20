/** Resource-generation helpers. Resource distribution is a generator hint, not physical ownership. */

import {
  resources,
  getLocalizedResources,
  getRegionalResources,
  getResourceDefinition,
} from '../content/resources/resourceDefinitions.js';
import {
  RESOURCE_COMPOSITION_NOTES,
  RESOURCE_DESCRIPTORS,
} from '../content/resources/resourceDescriptors.js';
import { RESOURCE_COMPOSITION_TEMPLATES } from '../content/resources/resourceCompositions.js';

export { resources, getLocalizedResources, getRegionalResources, getResourceDefinition };

/**
 * Pick resource definitions matching any supplied tag.
 * `distribution` controls generation propensity only. Every generated occurrence
 * is ultimately owned by a physical Feature.
 */
export function resourcesByTags(tags, distribution = 'localized') {
  const pool = distribution === 'regional' ? getRegionalResources() : getLocalizedResources();
  const tagSet = new Set(tags);
  return pool.filter(resource => resource.tags.some(tag => tagSet.has(tag)));
}

/**
 * Pick resource definitions whose `occurrenceFamily` is in the supplied set.
 * This is the hard physical compatibility gate: only resources from valid families
 * are eligible regardless of environmental tags.
 */
export function resourcesByFamilies(familySet, distribution = 'localized') {
  const pool = distribution === 'regional' ? getRegionalResources() : getLocalizedResources();
  return pool.filter(resource => familySet.has(resource.occurrenceFamily));
}

const QUANTITY_CLASSES = ['Tiny', 'Small', 'Moderate', 'Large', 'Massive'];
const AVAILABILITY_CLASSES = ['Sparse', 'Limited', 'Moderate', 'Common', 'Abundant', 'Very Abundant'];

export function quantityClass(value) {
  const idx = Math.min(Math.floor(value * QUANTITY_CLASSES.length), QUANTITY_CLASSES.length - 1);
  return QUANTITY_CLASSES[idx];
}

export function availabilityClass(value) {
  const clamped = Math.max(0, Math.min(0.999999, value));
  const idx = Math.min(Math.floor(clamped * AVAILABILITY_CLASSES.length), AVAILABILITY_CLASSES.length - 1);
  return AVAILABILITY_CLASSES[idx];
}

/**
 * Generate a Feature-owned ResourceOccurrence. There are no Region-owned
 * occurrences: regional abundance is represented by access Sites/Features.
 */
export function makeFeatureResource(resource, rng, occurrenceId, featureId, {
  accessScope = 'localized',
  availabilityBias = 0,
} = {}) {
  if (!resource) throw new Error('Feature resource generation requires a ResourceDefinition');
  const concentration = parseFloat(rng.range(1, 80).toFixed(1));
  const qv = rng.random();
  const availabilityRoll = Math.max(0, Math.min(0.999999, rng.random() + availabilityBias));
  return {
    id: occurrenceId,
    resourceId: resource.id,
    name: resource.name,
    concentrationPercent: concentration,
    quantityClass: quantityClass(qv),
    availabilityClass: availabilityClass(availabilityRoll),
    accessScope,
    descriptor: featureDescriptor(resource, rng),
    composition: featureComposition(resource, rng),
    sourceType: 'feature',
    sourceId: featureId,
  };
}

function featureDescriptor(resource, rng) {
  return RESOURCE_DESCRIPTORS[resource.id]
    ? rng.pick(RESOURCE_DESCRIPTORS[resource.id])
    : RESOURCE_COMPOSITION_NOTES[resource.id] || resource.name;
}

/**
 * Composition templates use concrete chemical/mineral species only. Resource
 * classes such as "iron ore", "gangue", or "iron oxides" are never emitted as
 * material constituents. Solid resources all receive a concrete composition so
 * downstream property-driven apparatus can reason about every generated fraction.
 */
function featureComposition(resource, rng) {
  const template = RESOURCE_COMPOSITION_TEMPLATES[resource.id];
  if (!template) return null;
  const values = Object.fromEntries(Object.entries(template).map(([speciesId, value]) => [
    speciesId,
    Array.isArray(value) ? rng.int(value[0], value[1]) : value,
  ]));
  return Object.values(template).every(value => !Array.isArray(value)) ? values : normalise(values);
}

function normalise(obj) {
  const total = Object.values(obj).reduce((a, b) => a + b, 0);
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = parseFloat(((value / total) * 100).toFixed(1));
  }
  return result;
}
