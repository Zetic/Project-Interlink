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

const FEATURE_TYPES = [
  'Mineral Deposit',
  'Geological Formation',
  'Aquifer',
  'Gas Reservoir',
  'Cave / Cavern',
  'Ravine',
  'Fault',
  'Crater',
  'Volcanic Vent',
  'Hydrothermal System',
  'Magma Chamber',
  'Ice Body',
  'Salt Basin',
  'Outcrop',
];

const FEATURE_FALLBACK_RESOURCE = Object.freeze({
  'Mineral Deposit': 'iron-ore',
  'Geological Formation': 'carbonate-rock',
  'Aquifer': 'groundwater',
  'Gas Reservoir': 'natural-gas',
  'Cave / Cavern': 'carbonate-rock',
  'Ravine': 'mixed-sediment',
  'Fault': 'quartz',
  'Crater': 'mixed-sediment',
  'Volcanic Vent': 'sulfur',
  'Hydrothermal System': 'geothermal-fluid',
  'Magma Chamber': 'magma',
  'Ice Body': 'water-ice',
  'Salt Basin': 'halite',
  'Outcrop': 'carbonate-rock',
});

const FEATURE_NAME_PARTS = {
  prefixes: ['Deep', 'High', 'Dark', 'Fire', 'Frost', 'Iron', 'Stone', 'Silent', 'Burning', 'Lost', 'Ancient', 'Bright', 'Salt', 'Red'],
  middles: ['rock', 'fire', 'frost', 'vein', 'vault', 'crack', 'rift', 'sink', 'well', 'vent', 'pool', 'shelf', 'dome', 'bed'],
  suffixes: ['Deposit', 'Formation', 'Chamber', 'Pocket', 'Seam', 'Rift', 'Hollow', 'Basin', 'Core', 'Lens', 'Body', 'System'],
};

const SITE_NAME_PARTS = {
  adjectives: ['Ancientwell', 'Blackglass', 'Clearwater', 'Deepstone', 'Ironfall', 'Saltmere', 'Ashfield', 'Greyspine', 'Redvault', 'Frostbreak', 'Darkcleft', 'Highreach', 'Stonewatch', 'Coldseam'],
  nouns: ['Rift', 'Outcrop', 'Basin', 'Hollow', 'Gorge', 'Shelf', 'Ridge', 'Cleft', 'Run', 'Cut', 'Spur', 'Sink', 'Reach', 'Draw'],
};

function generateFeatureName(rng) {
  return `${rng.pick(FEATURE_NAME_PARTS.prefixes)}${rng.pick(FEATURE_NAME_PARTS.middles)} ${rng.pick(FEATURE_NAME_PARTS.suffixes)}`;
}

function generateSiteName(rng) {
  return `${rng.pick(SITE_NAME_PARTS.adjectives)} ${rng.pick(SITE_NAME_PARTS.nouns)}`;
}

function weightedFeatureTypes(region) {
  const { heat, moisture, geologicActivity, relief, latitude } = region;
  const weights = Object.fromEntries(FEATURE_TYPES.map(type => [type, 1]));

  if (heat > 0.6 && geologicActivity > 0.6) {
    weights['Volcanic Vent'] += 5;
    weights['Magma Chamber'] += 4;
    weights['Hydrothermal System'] += 5;
    weights['Mineral Deposit'] += 3;
  }
  if (moisture > 0.5) {
    weights['Aquifer'] += 4;
    weights['Cave / Cavern'] += 2;
  }
  if (heat < 0.3) {
    weights['Ice Body'] += 4;
    weights['Gas Reservoir'] += 2;
  }
  if (relief > 0.6) {
    weights['Ravine'] += 4;
    weights['Outcrop'] += 4;
    weights['Fault'] += 2;
  }
  if (geologicActivity > 0.5) {
    weights['Fault'] += 3;
    weights['Mineral Deposit'] += 3;
  }
  if (moisture < 0.3 && heat > 0.4) weights['Salt Basin'] += 3;
  if (Math.abs(latitude) > 55) weights['Ice Body'] += 3;

  const pool = [];
  for (const [type, weight] of Object.entries(weights)) {
    for (let i = 0; i < weight; i++) pool.push(type);
  }
  return pool;
}

/**
 * Physical occurrence-family taxonomy.
 * A Feature type maps to allowed families — this is a hard physical compatibility gate.
 * Tags are then used only for weighting/probability within the compatible pool.
 *
 * Families:
 *   solid: rock-mass, ore-body, mineral-body, sediment, evaporite, ice-body
 *   fluid: aqueous-fluid, hydrothermal-fluid, magma, reservoir-gas, atmosphere
 *   organic: vegetation, organic-soil
 *
 * Exported for test coverage of the compatibility contract.
 */
export const FEATURE_ALLOWED_FAMILIES = Object.freeze({
  'Mineral Deposit':      new Set(['ore-body', 'mineral-body']),
  'Geological Formation': new Set(['rock-mass', 'sediment', 'mineral-body']),
  'Aquifer':              new Set(['aqueous-fluid']),
  'Gas Reservoir':        new Set(['reservoir-gas']),
  'Cave / Cavern':        new Set(['rock-mass', 'sediment', 'mineral-body']),
  'Ravine':               new Set(['rock-mass', 'sediment']),
  'Fault':                new Set(['rock-mass', 'ore-body', 'mineral-body']),
  'Crater':               new Set(['rock-mass', 'sediment', 'ore-body']),
  'Volcanic Vent':        new Set(['mineral-body', 'rock-mass']),
  'Hydrothermal System':  new Set(['aqueous-fluid', 'hydrothermal-fluid', 'ore-body', 'mineral-body']),
  'Magma Chamber':        new Set(['magma', 'hydrothermal-fluid']),
  'Ice Body':             new Set(['ice-body']),
  'Salt Basin':           new Set(['evaporite', 'aqueous-fluid']),
  'Outcrop':              new Set(['rock-mass', 'ore-body', 'mineral-body']),
});

function featureAffinityTags(featureType, region, planetComposition) {
  const { heat, moisture } = region;
  const tags = [];

  switch (featureType) {
    case 'Mineral Deposit':
      tags.push('metallic', 'ore');
      if (heat > 0.5) tags.push('volcanic');
      break;
    case 'Geological Formation': tags.push('rock', 'igneous', 'sedimentary'); break;
    case 'Aquifer': tags.push('wet', 'liquid'); break;
    case 'Gas Reservoir': tags.push('gas', 'hydrocarbon', 'carbonRich'); break;
    case 'Cave / Cavern':
      tags.push('rock', 'carbonate', 'mineral');
      if (moisture > 0.4) tags.push('wet');
      break;
    case 'Ravine': tags.push('rock', 'igneous', 'sedimentary'); break;
    case 'Fault': tags.push('rock', 'metallic'); break;
    case 'Crater': tags.push('rock', 'metallic', 'mineral'); break;
    case 'Volcanic Vent': tags.push('volcanic', 'mineral', 'gas'); break;
    case 'Hydrothermal System': tags.push('volcanic', 'wet', 'liquid', 'metallic'); break;
    case 'Magma Chamber': tags.push('volcanic', 'liquid'); break;
    case 'Ice Body': tags.push('icy', 'volatile'); break;
    case 'Salt Basin': tags.push('evaporite', 'saline'); break;
    case 'Outcrop': tags.push('rock', 'igneous', 'sedimentary'); break;
    default: tags.push('rock', 'mineral');
  }

  // Planet-wide context influences tag affinity only — it never overrides family compatibility.
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

function allowedPhysicalStates(featureType) {
  switch (featureType) {
    case 'Aquifer': return ['Liquid', 'Mixed'];
    case 'Gas Reservoir': return ['Gaseous', 'Mixed'];
    case 'Magma Chamber': return ['Liquid'];
    case 'Ice Body': return ['Solid'];
    case 'Hydrothermal System': return ['Liquid', 'Mixed'];
    default: return null;
  }
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
