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
import { validateMineralTextureProfile } from '../core/materials/solids/mineralTextures.js';
import { validateComminutionProperties } from '../core/materials/solids/comminutionProperties.js';

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

// Synthetic-world generation envelopes for real measured quantities. Values are
// deliberately resource-specific so a generated deposit remains geologically
// plausible without storing arbitrary "easy/hard" gameplay ratings.
const ORE_GRAIN_D50_RANGES_UM = Object.freeze({
  'iron-ore': Object.freeze([45, 450]),
  'copper-ore': Object.freeze([20, 250]),
  'aluminum-ore': Object.freeze([60, 600]),
  'zinc-ore': Object.freeze([20, 220]),
  'nickel-ore': Object.freeze([20, 280]),
  'titanium-ore': Object.freeze([50, 500]),
  'manganese-ore': Object.freeze([30, 400]),
  'rare-earth-ore': Object.freeze([20, 300]),
});

const ORE_COMMINUTION_RANGES = Object.freeze({
  'iron-ore': Object.freeze({ cwi: [6, 16], bwi: [9, 22], ai: [0.20, 0.65] }),
  'copper-ore': Object.freeze({ cwi: [7, 18], bwi: [10, 24], ai: [0.25, 0.75] }),
  'aluminum-ore': Object.freeze({ cwi: [4, 14], bwi: [7, 18], ai: [0.05, 0.35] }),
  'zinc-ore': Object.freeze({ cwi: [7, 18], bwi: [10, 22], ai: [0.20, 0.65] }),
  'nickel-ore': Object.freeze({ cwi: [8, 20], bwi: [10, 25], ai: [0.20, 0.70] }),
  'titanium-ore': Object.freeze({ cwi: [7, 18], bwi: [9, 22], ai: [0.25, 0.70] }),
  'manganese-ore': Object.freeze({ cwi: [5, 16], bwi: [8, 20], ai: [0.10, 0.50] }),
  'rare-earth-ore': Object.freeze({ cwi: [7, 19], bwi: [10, 25], ai: [0.20, 0.65] }),
});

function logUniform(rng, min, max) {
  return Math.exp(rng.range(Math.log(min), Math.log(max)));
}

function normalizedOccurrenceModes(rng, complexity) {
  const raw = {
    free: Math.max(0.05, (1.45 - 0.95 * complexity) * rng.range(0.85, 1.15)),
    boundary: Math.max(0.05, 1.0 * rng.range(0.85, 1.15)),
    intergrown: Math.max(0.05, (0.55 + 1.25 * complexity) * rng.range(0.85, 1.15)),
    included: Math.max(0.02, (0.15 + 0.85 * complexity) * rng.range(0.85, 1.15)),
  };
  const total = Object.values(raw).reduce((sum, value) => sum + value, 0);
  const result = {};
  let accumulated = 0;
  const keys = ['free', 'boundary', 'intergrown', 'included'];
  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      result[key] = parseFloat(Math.max(0, 1 - accumulated).toFixed(4));
    } else {
      result[key] = parseFloat((raw[key] / total).toFixed(4));
      accumulated += result[key];
    }
  });
  return result;
}

function featureMineralTexture(resource, composition, rng, occurrenceId) {
  if (resource.occurrenceFamily !== 'ore-body' || !composition) return null;
  const d50Range = ORE_GRAIN_D50_RANGES_UM[resource.id];
  if (!d50Range) throw new Error(`Ore resource '${resource.id}' is missing a mineral grain-size generation envelope`);

  // One shared occurrence scale keeps mineral textures correlated. Individual
  // species vary around that common geological fabric rather than being rolled
  // independently across the entire possible range.
  const occurrenceD50Um = logUniform(rng, d50Range[0], d50Range[1]);
  const complexity = rng.range(0.15, 0.85);
  const speciesTextures = {};
  for (const speciesId of Object.keys(composition)) {
    const d50 = occurrenceD50Um * logUniform(rng, 0.8, 1.25);
    const d10 = d50 * rng.range(0.30, 0.60);
    const d90 = d50 * rng.range(1.8, 3.5);
    speciesTextures[speciesId] = {
      grainSizeUm: {
        d10: parseFloat(d10.toFixed(1)),
        d50: parseFloat(d50.toFixed(1)),
        d90: parseFloat(d90.toFixed(1)),
      },
      occurrenceModes: normalizedOccurrenceModes(rng, complexity),
    };
  }

  const profile = {
    id: `texture-${occurrenceId}`,
    speciesTextures,
  };
  validateMineralTextureProfile(profile);
  return profile;
}

function featureComminutionProperties(resource, rng) {
  if (resource.occurrenceFamily !== 'ore-body') return null;
  const ranges = ORE_COMMINUTION_RANGES[resource.id];
  if (!ranges) throw new Error(`Ore resource '${resource.id}' is missing comminution-property generation envelopes`);
  const properties = {
    bondCrushingWorkIndexKWhPerT: parseFloat(rng.range(ranges.cwi[0], ranges.cwi[1]).toFixed(2)),
    bondBallMillWorkIndexKWhPerT: parseFloat(rng.range(ranges.bwi[0], ranges.bwi[1]).toFixed(2)),
    bondAbrasionIndex: parseFloat(rng.range(ranges.ai[0], ranges.ai[1]).toFixed(3)),
  };
  validateComminutionProperties(properties);
  return properties;
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
  const descriptor = featureDescriptor(resource, rng);
  const composition = featureComposition(resource, rng);
  const mineralTexture = featureMineralTexture(resource, composition, rng, occurrenceId);
  const comminutionProperties = featureComminutionProperties(resource, rng);
  return {
    id: occurrenceId,
    resourceId: resource.id,
    name: resource.name,
    concentrationPercent: concentration,
    quantityClass: quantityClass(qv),
    availabilityClass: availabilityClass(availabilityRoll),
    accessScope,
    descriptor,
    composition,
    ...(mineralTexture ? { mineralTexture } : {}),
    ...(comminutionProperties ? { comminutionProperties } : {}),
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
