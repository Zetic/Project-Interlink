/**
 * Feature generation for planet regions.
 */

import { resourcesByTags, makeFeatureResource } from './generateResources.js';
import { createRNG } from './random.js';

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

const FEATURE_NAME_PARTS = {
  prefixes: ['Deep', 'High', 'Dark', 'Fire', 'Frost', 'Iron', 'Stone', 'Silent', 'Burning', 'Lost', 'Ancient', 'Bright', 'Salt', 'Red'],
  middles: ['rock', 'fire', 'frost', 'vein', 'vault', 'crack', 'rift', 'sink', 'well', 'vent', 'pool', 'shelf', 'dome', 'bed'],
  suffixes: ['Deposit', 'Formation', 'Chamber', 'Pocket', 'Seam', 'Rift', 'Hollow', 'Basin', 'Core', 'Lens', 'Body', 'System'],
};

function generateFeatureName(rng) {
  const p = rng.pick(FEATURE_NAME_PARTS.prefixes);
  const m = rng.pick(FEATURE_NAME_PARTS.middles);
  const s = rng.pick(FEATURE_NAME_PARTS.suffixes);
  return `${p}${m} ${s}`;
}

/**
 * Determine which feature types are likely given regional conditions.
 */
function weightedFeatureTypes(region, biospherePresent) {
  const { heat, moisture, geologicActivity, relief, latitude, elevationKm } = region;

  const weights = {};
  for (const t of FEATURE_TYPES) weights[t] = 1;

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
  if (moisture < 0.3 && heat > 0.4) {
    weights['Salt Basin'] += 3;
  }
  if (Math.abs(latitude) > 55) {
    weights['Ice Body'] += 3;
    weights['Permafrost'] += 2;
  }

  // Build weighted pool
  const pool = [];
  for (const [type, w] of Object.entries(weights)) {
    for (let i = 0; i < w; i++) pool.push(type);
  }
  return pool;
}

/**
 * Determine which resource tags are appropriate for this feature type + region.
 */
function featureResourceTags(featureType, region, planetComposition) {
  const { heat, moisture, geologicActivity } = region;
  const tags = [];

  switch (featureType) {
    case 'Mineral Deposit':
      tags.push('metallic', 'ore', 'mineral');
      if (heat > 0.5) tags.push('volcanic');
      if (region.localComposition?.ironMetals > 25) tags.push('metallic');
      break;
    case 'Geological Formation':
      tags.push('rock', 'igneous', 'sedimentary');
      break;
    case 'Aquifer':
      tags.push('wet', 'liquid');
      break;
    case 'Gas Reservoir':
      tags.push('gas', 'hydrocarbon', 'carbonRich');
      break;
    case 'Cave / Cavern':
      tags.push('rock', 'carbonate', 'mineral');
      if (moisture > 0.4) tags.push('wet');
      break;
    case 'Ravine':
      tags.push('rock', 'igneous');
      break;
    case 'Fault':
      tags.push('rock', 'metallic');
      break;
    case 'Crater':
      tags.push('rock', 'metallic', 'mineral');
      break;
    case 'Volcanic Vent':
      tags.push('volcanic', 'mineral', 'gas');
      break;
    case 'Hydrothermal System':
      tags.push('volcanic', 'wet', 'liquid', 'metallic');
      break;
    case 'Magma Chamber':
      tags.push('volcanic', 'liquid');
      break;
    case 'Ice Body':
      tags.push('icy', 'volatile');
      break;
    case 'Salt Basin':
      tags.push('evaporite', 'saline');
      break;
    case 'Outcrop':
      tags.push('rock', 'igneous', 'sedimentary');
      break;
    default:
      tags.push('rock', 'mineral');
  }

  // Add composition-based tags
  if (planetComposition) {
    if (planetComposition.ironMetals > 20) tags.push('metallic');
    if (planetComposition.waterVolatiles > 15) tags.push('wet', 'icy');
    if (planetComposition.carbonCompounds > 5) tags.push('carbonRich');
  }

  return tags;
}

let featureCounter = 0;

export function generateFeatures(region, planet, rng) {
  const count = rng.int(2, 4);
  const pool = weightedFeatureTypes(region, planet.biospherePresent);
  const features = [];

  for (let i = 0; i < count; i++) {
    featureCounter++;
    const featureType = rng.pick(pool);
    const name = generateFeatureName(rng);
    const depthM = parseFloat(rng.range(10, 4000).toFixed(0));
    const geometry = rng.pick(['Tabular', 'Lenticular', 'Nodular', 'Vein', 'Massive', 'Layered', 'Irregular', 'Pipe-like']);
    const accessibility = rng.pick(['Easy', 'Moderate', 'Difficult', 'Extreme']);
    const physicalState = rng.pick(['Solid', 'Liquid', 'Mixed', 'Gaseous', 'Plastic']);
    const tempOffset = rng.range(-20, 80);
    const temperatureK = parseFloat((planet.meanTemperatureK + tempOffset).toFixed(1));
    const pressureBar = parseFloat(rng.range(0.1, 50).toFixed(2));
    const qv = rng.random();
    const qClass = ['Tiny', 'Small', 'Moderate', 'Large', 'Massive'][Math.min(Math.floor(qv * 5), 4)];

    // Pick resources
    const tags = featureResourceTags(featureType, region, planet.bulkComposition);
    let candidateResources = resourcesByTags(tags, 'feature');

    // Filter biological resources if no biosphere
    if (!planet.biospherePresent) {
      candidateResources = candidateResources.filter(r => !r.tags.includes('biological'));
    }

    // Deduplicate and pick 1-3
    const numResources = rng.int(1, Math.min(3, candidateResources.length || 1));
    const shuffled = [...candidateResources];
    rng.shuffle(shuffled);
    const picked = shuffled.slice(0, numResources);
    const featureResources = picked.map(r => makeFeatureResource(r, rng));

    features.push({
      id: `feature-${region.id}-${i}`,
      name,
      type: featureType,
      discovered: false,
      depthM,
      geometry,
      accessibility,
      physicalState,
      temperatureK,
      pressureBar,
      quantityClass: qClass,
      resources: featureResources,
    });
  }

  return features;
}

export function resetFeatureCounter() {
  featureCounter = 0;
}
