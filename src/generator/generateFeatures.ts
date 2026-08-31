/**
 * Site/Feature generation for planet regions.
 *
 * Regions do not own resources or Features directly. Generation produces
 * player-addressable Sites; each Site owns one or more physical Features and
 * every ResourceOccurrence is owned by one Feature.
 */

import {
  getResourceDefinition,
  makeFeatureResource,
  resourcesByFamilies,
} from './generateResources.js';
import { rngFor } from './random.js';
import { OCCURRENCE_FAMILIES, OCCURRENCE_FAMILY_VALUES } from '../content/resources/occurrenceFamilies.js';
import { FEATURE_TYPES, FEATURE_FALLBACK_RESOURCE } from '../content/features/featureTypes.js';
import { FEATURE_NAME_PARTS, SITE_NAME_PARTS } from '../content/features/featureNames.js';
import { FEATURE_ALLOWED_FAMILIES, allowedPhysicalStates } from '../content/features/featureCompatibility.js';
import {
  FEATURE_AFFINITY_TAGS,
  FEATURE_TYPE_WEIGHT_RULES,
  conditionMatches,
} from '../content/features/featureGeneration.js';

export { OCCURRENCE_FAMILIES, OCCURRENCE_FAMILY_VALUES };

function generateFeatureName(rng) {
  return `${rng.pick(FEATURE_NAME_PARTS.prefixes)}${rng.pick(FEATURE_NAME_PARTS.middles)} ${rng.pick(FEATURE_NAME_PARTS.suffixes)}`;
}

function generateSiteName(rng) {
  return `${rng.pick(SITE_NAME_PARTS.adjectives)} ${rng.pick(SITE_NAME_PARTS.nouns)}`;
}

function weightedFeatureTypes(region) {
  const weights = Object.fromEntries(FEATURE_TYPES.map(type => [type, 1]));
  for (const rule of FEATURE_TYPE_WEIGHT_RULES) {
    const matches = Object.entries(rule.when).every(([key, condition]) =>
      conditionMatches(region[key], condition)
    );
    if (!matches) continue;
    for (const [type, weight] of Object.entries(rule.add)) weights[type] += weight;
  }

  const pool = [];
  for (const [type, weight] of Object.entries(weights)) {
    for (let i = 0; i < weight; i++) pool.push(type);
  }
  return pool;
}

export { FEATURE_ALLOWED_FAMILIES };

function featureAffinityTags(featureType, region, planetComposition) {
  const tags = [...(FEATURE_AFFINITY_TAGS[featureType] ?? ['rock', 'mineral'])];

  // Planet-wide context influences tag affinity only — it never overrides family compatibility.
  if (featureType === 'Mineral Deposit' && region.heat > 0.5) tags.push('volcanic');
  if (featureType === 'Cave / Cavern' && region.moisture > 0.4) tags.push('wet');
  if (planetComposition?.ironMetals > 20) tags.push('metallic');
  if (planetComposition?.waterVolatiles > 15) tags.push('wet', 'icy');
  if (planetComposition?.carbonCompounds > 5) tags.push('carbonRich');
  return tags;
}

/**
 * Select a ResourceDefinition for a Feature in two stages:
 *   1. Hard gate: only resources whose occurrenceFamily is physically compatible are eligible.
 *   2. Soft weighting: among eligible resources, those matching affinity tags are preferred.
 * This ensures e.g. Groundwater never appears in an Outcrop even on a water-rich planet.
 */
function selectFeatureResource(featureType, affinityTags, distribution, planet) {
  const allowedFamilies = FEATURE_ALLOWED_FAMILIES[featureType];
  // Stage 1: family-compatible pool (hard gate).
  let compatible = resourcesByFamilies(allowedFamilies, distribution);
  if (!planet.biospherePresent) compatible = compatible.filter(r => !r.tags.includes('biological'));

  if (!compatible.length) {
    // Fallback to the known-safe fallback resource for this feature type; wrap in array for uniform API.
    const fallback = getResourceDefinition(FEATURE_FALLBACK_RESOURCE[featureType] ?? 'mixed-sediment');
    return fallback ? [fallback] : [];
  }

  // Stage 2: weight by tag affinity — matching resources appear multiple times in the pool.
  const affinitySet = new Set(affinityTags);
  const weighted = [];
  for (const resource of compatible) {
    const matches = resource.tags.filter(t => affinitySet.has(t)).length;
    // Base weight 1 + 2 per matching affinity tag.
    const weight = 1 + matches * 2;
    for (let w = 0; w < weight; w++) weighted.push(resource);
  }
  return weighted;
}

function siteForFeature(feature, siteName = feature.name, siteKind = 'localized') {
  const siteId = `site-${feature.id}`;
  feature.siteId = siteId;
  return {
    id: siteId,
    name: siteName,
    regionId: feature.regionId,
    siteKind,
    features: [feature],
  };
}

/**
 * Generate one localized Site containing 1–3 distinct physical Features.
 * Each Feature has exactly one ResourceOccurrence (one physical source/body).
 * Multiple independent source types at a Site become separate Features.
 */
function generateLocalizedSite(region, planet, rootSeed, siteIndex) {
  const siteId = `site-${region.id}-${siteIndex}`;
  const siteRng = rngFor(rootSeed, `site:${siteId}`);
  const siteName = generateSiteName(siteRng);
  const pool = weightedFeatureTypes(region);

  const featureCount = siteRng.int(1, 3);
  const features = [];

  for (let fi = 0; fi < featureCount; fi++) {
    const featureId = `feature-${region.id}-${siteIndex}-${fi}`;
    const featureRng = rngFor(rootSeed, `feature:${featureId}`);
    const featureType = featureRng.pick(pool);
    const featureName = generateFeatureName(featureRng);
    const stateOptions = allowedPhysicalStates(featureType) ?? ['Solid', 'Liquid', 'Mixed', 'Gaseous', 'Plastic'];

    const feature = {
      id: featureId,
      siteId,
      regionId: region.id,
      name: featureName,
      type: featureType,
      depthM: parseFloat(featureRng.range(10, 4000).toFixed(0)),
      geometry: featureRng.pick(['Tabular', 'Lenticular', 'Nodular', 'Vein', 'Massive', 'Layered', 'Irregular', 'Pipe-like']),
      accessibility: featureRng.pick(['Easy', 'Moderate', 'Difficult', 'Extreme']),
      physicalState: featureRng.pick(stateOptions),
      temperatureK: parseFloat((planet.meanTemperatureK + featureRng.range(-20, 80)).toFixed(1)),
      pressureBar: parseFloat(featureRng.range(0.1, 50).toFixed(2)),
      quantityClass: featureRng.pick(['Tiny', 'Small', 'Moderate', 'Large', 'Massive']),
      resourceOccurrences: [],
    };

    // Stage 1 (hard gate) + Stage 2 (tag-weighted selection). Always returns an array.
    const resourceRng = rngFor(rootSeed, `feature:${featureId}:resources`);
    const affinityTags = featureAffinityTags(featureType, region, planet.bulkComposition);
    const weightedPool = selectFeatureResource(featureType, affinityTags, 'localized', planet);

    if (!weightedPool.length) {
      throw new Error(`Feature '${featureId}' (${featureType}) generated without any compatible ResourceDefinitions`);
    }
    const shuffled = [...weightedPool];
    resourceRng.shuffle(shuffled);

    // Exactly one ResourceOccurrence per Feature: one physical source/body per independently exploitable source.
    feature.resourceOccurrences = [
      makeFeatureResource(shuffled[0], resourceRng, `${featureId}-occ-0`, featureId, { accessScope: 'localized' }),
    ];
    features.push(feature);
  }

  return {
    id: siteId,
    name: siteName,
    regionId: region.id,
    siteKind: 'localized',
    features,
  };
}

/** Generate the ordinary localized physical Features for a Region as Sites. */
export function generateLocalizedSites(region, planet, rootSeed) {
  const countRng = rngFor(rootSeed, `region:${region.id}:siteCount`);
  const count = countRng.int(2, 4);
  const sites = [];

  for (let i = 0; i < count; i++) {
    sites.push(generateLocalizedSite(region, planet, rootSeed, i));
  }

  return sites;
}

function regionalAccessPresentation(resource, region) {
  const root = region.name.split(/\s+/)[0] || region.name;
  const specs = {
    'wood': ['Forest', `Forest of ${root}`, `Great Forest of ${root}`],
    'plant-biomass': ['Vegetation Zone', `${root} Vegetation`, `${root} Greenlands`],
    'peat': ['Peatland', `${root} Peatland`, `${root} Peatlands`],
    'organic-soil': ['Soil Field', `${root} Rich Soils`, `${root} Fertile Fields`],
    'fresh-water': ['Water Body', `${root} Fresh Waters`, `Waters of ${root}`],
    'saline-water': ['Water Body', `${root} Saline Waters`, `${root} Saltwater Basin`],
    'atmospheric-gas': ['Atmospheric Zone', `${root} Atmosphere`, `Open Atmosphere of ${root}`],
    'clay': ['Surface Deposit', `${root} Clay Field`, `${root} Clay Fields`],
    'sand': ['Surface Deposit', `${root} Sand Field`, `${root} Sand Fields`],
    'regolith': ['Surface Deposit', `${root} Regolith`, `${root} Regolith Fields`],
    'water-ice': ['Ice Field', `${root} Ice Field`, `${root} Ice Fields`],
    'permafrost': ['Ice Field', `${root} Permafrost`, `${root} Permafrost Fields`],
  };
  if (specs[resource.id]) return specs[resource.id];
  if (resource.tags.includes('rock')) return ['Rock Field', `${root} ${resource.name} Exposures`, `${resource.name} Fields of ${root}`];
  return ['Resource Field', `${root} ${resource.name}`, `${resource.name} Fields of ${root}`];
}

/**
 * Materialize a broad/regional generation result as a real Site + Feature.
 * The Region remains only a geographic grouping; the occurrence is Feature-owned.
 */
export function makeRegionalResourceSite(region, planet, rootSeed, resource, index) {
  const safeResourceId = resource.id.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const featureId = `feature-${region.id}-regional-${safeResourceId}-${index}`;
  const featureRng = rngFor(rootSeed, `feature:${featureId}`);
  const [type, featureName, siteName] = regionalAccessPresentation(resource, region);
  const feature = {
    id: featureId,
    regionId: region.id,
    name: featureName,
    type,
    depthM: 0,
    geometry: 'Distributed',
    accessibility: 'Broad access',
    physicalState: resource.tags.includes('liquid') ? 'Liquid' : resource.tags.includes('gas') ? 'Gaseous' : 'Solid',
    temperatureK: planet.meanTemperatureK,
    pressureBar: resource.id === 'atmospheric-gas' ? (planet.atmosphere?.pressureBar ?? 0) : 1,
    quantityClass: 'Regional',
    regionalAccess: true,
    resourceOccurrences: [
      makeFeatureResource(resource, featureRng, `${featureId}-occ-0`, featureId, {
        accessScope: 'regional',
        availabilityBias: 0.35,
      }),
    ],
  };
  return siteForFeature(feature, siteName, 'regional-access');
}

// Compatibility export for any generator-only callers; final World State still owns Features through Sites.
export function generateFeatures(region, planet, rootSeed) {
  return generateLocalizedSites(region, planet, rootSeed).flatMap(site => site.features);
}
