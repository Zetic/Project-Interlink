/**
 * Region generation for a planet.
 *
 * A Region is geographic/logistical context only. It owns Sites, not Features
 * or ResourceOccurrences. Regional resource potential is materialized as
 * physical access Sites/Features during generation.
 */

import { getResourceDefinition, resourcesByTags } from './generateResources.js';
import { generateLocalizedSites, makeRegionalResourceSite } from './generateFeatures.js';
import { rngFor } from './random.js';

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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function regionalResourceTags(region, planet) {
  const tags = [];
  const { heat, moisture, geologicActivity, localComposition } = region;

  if (heat > 0.6 && geologicActivity > 0.5) tags.push('volcanic', 'igneous');
  else if (moisture > 0.5) tags.push('sedimentary', 'wet');
  else tags.push('igneous', 'rock', 'loose');

  if (moisture > 0.6) tags.push('wet', 'liquid');
  if (heat < 0.3) tags.push('icy', 'volatile');
  if (Math.abs(region.latitude ?? 0) > 55) tags.push('icy');
  if (planet.biospherePresent && heat > 0.2 && heat < 0.8 && moisture > 0.3) tags.push('biological', 'organic');
  if (localComposition?.carbonCompounds > 5) tags.push('carbonRich');
  tags.push('atmosphere', 'gas', 'surface');
  return tags;
}

function regionalAccessResources(region, planet, rootSeed) {
  const resourceRng = rngFor(rootSeed, `region:${region.id}:regionalAccess`);
  let candidates = resourcesByTags(regionalResourceTags(region, planet), 'regional');
  if (!planet.biospherePresent) candidates = candidates.filter(resource => !resource.tags.includes('biological'));
  if ((planet.atmosphere?.pressureBar ?? 0) <= 0) candidates = candidates.filter(resource => resource.id !== 'atmospheric-gas');

  const atmospheric = candidates.find(resource => resource.id === 'atmospheric-gas') ?? null;
  const others = candidates.filter(resource => resource.id !== 'atmospheric-gas');
  resourceRng.shuffle(others);
  const requested = resourceRng.int(2, 5);
  const selected = others.slice(0, requested);
  if (!selected.length) {
    const fallback = getResourceDefinition('regolith') ?? getResourceDefinition('mixed-sediment');
    if (fallback) selected.push(fallback);
  }
  if (atmospheric) selected.unshift(atmospheric);
  return selected;
}

export function generateRegions(planet, rng, rootSeed) {
  const count = rng.int(4, 8);
  const regions = [];
  const usedNames = new Set();
  const latitudes = Array.from({ length: count }, () => rng.range(-85, 85)).sort((a, b) => a - b);
  const rawAreas = Array.from({ length: count }, () => rng.range(5, 30));
  const totalRaw = rawAreas.reduce((a, b) => a + b, 0);

  for (let i = 0; i < count; i++) {
    const regionId = `region-${i}`;
    const regionRng = rngFor(rootSeed, `region:${regionId}`);
    const latitude = parseFloat(latitudes[i].toFixed(1));
    const areaPercent = parseFloat(((rawAreas[i] / totalRaw) * 100).toFixed(1));
    const heatBase = clamp(planet.meanTemperatureK / 400, 0, 1);
    const polarFactor = Math.abs(latitude) / 90;
    const heat = clamp(heatBase - polarFactor * 0.4 + regionRng.range(-0.1, 0.1), 0, 1);
    const moisture = clamp((planet.volatileInventory?.waterIce || 0) / 30 + regionRng.range(-0.2, 0.4), 0, 1);
    const geologicActivity = clamp(planet.geologicActivity + regionRng.range(-0.2, 0.2), 0, 1);
    const relief = clamp(regionRng.range(0.1, 1.0), 0, 1);

    const region = {
      id: regionId,
      name: regionName(regionRng, usedNames),
      areaPercent,
      latitude,
      elevationKm: parseFloat(regionRng.range(-3, 8).toFixed(2)),
      relief: parseFloat(relief.toFixed(2)),
      localComposition: perturbComposition(planet.bulkComposition, regionRng),
      heat: parseFloat(heat.toFixed(2)),
      moisture: parseFloat(moisture.toFixed(2)),
      geologicActivity: parseFloat(geologicActivity.toFixed(2)),
      age: regionRng.pick(['Ancient', 'Old', 'Mature', 'Recent', 'Young', 'Active']),
      surfaceCover: chooseSurfaceCover(heat, moisture, geologicActivity, planet.biospherePresent, regionRng),
      sites: [],
    };

    region.sites.push(...generateLocalizedSites(region, planet, rootSeed));
    regionalAccessResources(region, planet, rootSeed).forEach((resource, index) => {
      region.sites.push(makeRegionalResourceSite(region, planet, rootSeed, resource, index));
    });

    regions.push(region);
  }

  const totalArea = regions.reduce((sum, region) => sum + region.areaPercent, 0);
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
  for (const [key, value] of Object.entries(base)) {
    const perturbed = Math.max(0, value + rng.range(-8, 8));
    result[key] = perturbed;
    total += perturbed;
  }
  for (const key of Object.keys(result)) result[key] = parseFloat(((result[key] / total) * 100).toFixed(1));
  return result;
}
