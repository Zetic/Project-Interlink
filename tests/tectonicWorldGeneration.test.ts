import assert from 'node:assert/strict';
import test from 'node:test';

import { generateWorld } from '../dist/world/generateWorld.js';
import { environmentContextForPlanet, samplePlanetEnvironment } from '../dist/world/generation/surfaceField.js';
import { resourcePotentialAt } from '../dist/world/generation/resourceFeatures.js';

const SEEDS = ['tectonic-a', 'tectonic-b', 'tectonic-c', 'tectonic-d', 'tectonic-e'];
const WORLDS = SEEDS.map(seed => generateWorld(seed).planet);

test('multi-seed tectonic models remain sane without fixed continent anchors', () => {
  const plateCounts = new Set(); const continentCounts = new Set(); const centroidSignatures = new Set(); const landFractions = new Set();
  let continental = 0; let oceanic = 0;
  for (const planet of WORLDS) {
    assert.ok(planet.tectonicPlates.length >= 12 && planet.tectonicPlates.length <= 24);
    plateCounts.add(planet.tectonicPlates.length); continentCounts.add(planet.continents.length);
    centroidSignatures.add(planet.continents.map(parent => `${Math.round(parent.center.x / 128)}:${Math.round(parent.center.y / 128)}`).join('|'));
    landFractions.add((planet.regions.filter(region => region.surfaceType === 'land').length / planet.regions.length).toFixed(2));
    const ids = new Set();
    for (const plate of planet.tectonicPlates) {
      assert.equal(ids.has(plate.id), false); ids.add(plate.id);
      assert.ok(plate.seedPoint.x >= 0 && plate.seedPoint.x <= planet.width && plate.seedPoint.y >= 0 && plate.seedPoint.y <= planet.height);
      assert.ok(Number.isFinite(plate.motion.x) && Number.isFinite(plate.motion.y));
      if (plate.crustType === 'continental') continental += 1; else oceanic += 1;
    }
  }
  assert.ok(continental > 0 && oceanic > 0);
  assert.ok(plateCounts.size > 1); assert.ok(continentCounts.size > 1); assert.ok(centroidSignatures.size === WORLDS.length); assert.ok(landFractions.size > 1);
});

test('canonical environment classifies representative points and exposes plate boundaries', () => {
  const planet = WORLDS[0]; const context = environmentContextForPlanet(planet);
  const types = new Set(); const boundaries = new Set();
  for (let y = 64; y < planet.height; y += 256) for (let x = 64; x < planet.width; x += 256) {
    const sample = samplePlanetEnvironment(context, { x, y });
    types.add(sample.surfaceType); boundaries.add(sample.boundaryType);
    assert.ok(Number.isFinite(sample.surfaceElevationMeters));
    assert.ok(planet.tectonicPlates.some(plate => plate.id === sample.plateId));
  }
  assert.deepEqual(types, new Set(['land', 'ocean']));
  assert.ok(boundaries.size >= 2);
});

test('resource-specific point potentials respond to canonical geology', () => {
  const planet = WORLDS[1]; const context = environmentContextForPlanet(planet);
  const land = planet.regions.filter(region => region.surfaceType === 'land');
  const volcanic = [...land].sort((left, right) => right.environment.volcanicActivity - left.environment.volcanicActivity).slice(0, 100);
  const quiet = [...land].sort((left, right) => left.environment.volcanicActivity - right.environment.volcanicActivity).slice(0, 100);
  const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  assert.ok(average(volcanic.map(region => resourcePotentialAt(context, region.center, 'copper-ore'))) > average(quiet.map(region => resourcePotentialAt(context, region.center, 'copper-ore'))));
  const cold = [...land].sort((left, right) => left.environment.thermalIndex - right.environment.thermalIndex).slice(0, 100);
  const warm = [...land].sort((left, right) => right.environment.thermalIndex - left.environment.thermalIndex).slice(0, 100);
  assert.ok(average(cold.map(region => resourcePotentialAt(context, region.center, 'water-ice'))) > average(warm.map(region => resourcePotentialAt(context, region.center, 'water-ice'))));
});
