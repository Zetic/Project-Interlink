/**
 * Region generation for a planet.
 */

import { resourcesByTags, makeRegionResource } from './generateResources.js';
import { generateFeatures } from './generateFeatures.js';

const REGION_PREFIXES = ['Veyra', 'Kharon', 'Namar', 'Eos', 'Talus', 'Irneth', 'Solen', 'Duras', 'Aethon', 'Mareth', 'Calyx', 'Vorn'];
const REGION_SUFFIXES = ['Highlands', 'Basin', 'Expanse', 'Shelf', 'Plain', 'Reach', 'Badlands', 'Rift', 'Plateau', 'Flats', 'Peaks', 'Delta', 'Wastes'];

function regionName(rng, usedNames) {
  let name;
  let tries = 0;
  do {
    name = `${rng.pick(REGION_PREFIXES)} ${rng.pick(REGION_SUFFIXES)}`;
    tries++;
  } while (usedNames.has(name) && tries < 20);
  usedNames.add(name);
  return name;
}

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

function regionResourceTags(region, planet) {
  const tags = [];
  const { heat, moisture, geologicActivity, localComposition } = region;

  // Rock/surface
  if (heat > 0.6 && geologicActivity > 0.5) {
    tags.push('volcanic', 'igneous');
  } else if (moisture > 0.5) {
    tags.push('sedimentary', 'wet');
  } else {
    tags.push('igneous', 'rock', 'loose');
  }

  if (moisture > 0.6) tags.push('wet', 'liquid');
  if (heat < 0.3) tags.push('icy', 'volatile');
  if (region.latitude !== undefined && Math.abs(region.latitude) > 55) tags.push('icy');
  if (planet.biospherePresent && heat > 0.2 && heat < 0.8 && moisture > 0.3) tags.push('biological', 'organic');
  if (localComposition?.carbonCompounds > 5) tags.push('carbonRich');

  // Always include atmosphere tag
  tags.push('atmosphere', 'gas', 'surface');

  return tags;
}

export function generateRegions(planet, rng) {
  const count = rng.int(4, 8);
  const regions = [];
  const usedNames = new Set();

  // Distribute latitudes roughly
  const latitudes = [];
  for (let i = 0; i < count; i++) {
    latitudes.push(rng.range(-85, 85));
  }
  latitudes.sort((a, b) => a - b);

  // Raw areas (will be normalised to sum to 100)
  const rawAreas = Array.from({ length: count }, () => rng.range(5, 30));
  const totalRaw = rawAreas.reduce((a, b) => a + b, 0);

  for (let i = 0; i < count; i++) {
    const latitude = parseFloat(latitudes[i].toFixed(1));
    const areaPercent = parseFloat(((rawAreas[i] / totalRaw) * 100).toFixed(1));

    // Regional conditions vary around planet baseline
    const heatBase = clamp(planet.meanTemperatureK / 400, 0, 1);
    const polarFactor = Math.abs(latitude) / 90;
    const heat = clamp(heatBase - polarFactor * 0.4 + rng.range(-0.1, 0.1), 0, 1);

    const moisture = clamp(
      (planet.volatileInventory?.waterIce || 0) / 30 +
      rng.range(-0.2, 0.4),
      0, 1
    );

    const geologicActivity = clamp(planet.geologicActivity + rng.range(-0.2, 0.2), 0, 1);
    const relief = clamp(rng.range(0.1, 1.0), 0, 1);
    const elevationKm = parseFloat(rng.range(-3, 8).toFixed(2));

    const age = rng.pick(['Ancient', 'Old', 'Mature', 'Recent', 'Young', 'Active']);
    const surfaceCover = chooseSurfaceCover(heat, moisture, geologicActivity, planet.biospherePresent, rng);

    // Local composition: planet composition ± perturbation
    const localComposition = perturbComposition(planet.bulkComposition, rng);

    const region = {
      id: `region-${i}`,
      name: regionName(rng, usedNames),
      areaPercent,
      latitude,
      elevationKm,
      relief: parseFloat(relief.toFixed(2)),
      localComposition,
      heat: parseFloat(heat.toFixed(2)),
      moisture: parseFloat(moisture.toFixed(2)),
      geologicActivity: parseFloat(geologicActivity.toFixed(2)),
      age,
      surfaceCover,
      backgroundResources: [],
      features: [],
    };

    // Background resources
    const tags = regionResourceTags(region, planet);
    let candidates = resourcesByTags(tags, 'region');
    if (!planet.biospherePresent) {
      candidates = candidates.filter(r => !r.tags.includes('biological'));
    }
    // Add atmospheric gas if atmosphere exists
    const atmoResource = candidates.find(r => r.id === 'atmospheric-gas');
    const others = candidates.filter(r => r.id !== 'atmospheric-gas');
    rng.shuffle(others);
    const numBg = rng.int(2, 5);
    const selected = others.slice(0, numBg);
    if (atmoResource && planet.atmosphere?.pressureBar > 0) {
      selected.unshift(atmoResource);
    }
    region.backgroundResources = selected.map(r => makeRegionResource(r, rng));

    // Features
    region.features = generateFeatures(region, planet, rng);

    regions.push(region);
  }

  // Normalize area to exactly 100
  const totalArea = regions.reduce((a, r) => a + r.areaPercent, 0);
  const scale = 100 / totalArea;
  let sum = 0;
  for (let i = 0; i < regions.length - 1; i++) {
    regions[i].areaPercent = parseFloat((regions[i].areaPercent * scale).toFixed(1));
    sum += regions[i].areaPercent;
  }
  regions[regions.length - 1].areaPercent = parseFloat((100 - sum).toFixed(1));

  return regions;
}

function chooseSurfaceCover(heat, moisture, geologicActivity, biosphere, rng) {
  if (heat > 0.7 && geologicActivity > 0.6) return rng.pick(['Lava Field', 'Volcanic Ash', 'Fumarolic Terrain']);
  if (heat < 0.25) return rng.pick(['Ice Sheet', 'Frost Plain', 'Permafrost']);
  if (moisture > 0.6 && biosphere) return rng.pick(['Dense Vegetation', 'Wetlands', 'Forest']);
  if (moisture > 0.4) return rng.pick(['Rocky Terrain', 'Gravel Plain', 'Shallow Lakes']);
  if (moisture < 0.2) return rng.pick(['Desert', 'Sand Dunes', 'Dry Regolith', 'Salt Flat']);
  return rng.pick(['Mixed Rock', 'Scrubland', 'Boulder Field', 'Open Plain']);
}

function perturbComposition(base, rng) {
  const result = {};
  let total = 0;
  for (const [k, v] of Object.entries(base)) {
    const perturbed = Math.max(0, v + rng.range(-8, 8));
    result[k] = perturbed;
    total += perturbed;
  }
  // Normalize to 100
  for (const k of Object.keys(result)) {
    result[k] = parseFloat(((result[k] / total) * 100).toFixed(1));
  }
  return result;
}
