import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { WORLD_GENERATOR_VERSION, generateWorld, PLANET_MAP_HEIGHT, PLANET_MAP_WIDTH } from '../dist/world/generateWorld.js';
import { pointInPolygon, polygonArea } from '../dist/world/geometry.js';
import { resourceSuitability } from '../dist/world/generation/resourceFeatures.js';
import {
  EARTH_SCALE_METERS_PER_WORLD_UNIT,
  EARTH_SCALE_PHYSICAL_HEIGHT_METERS,
  EARTH_SCALE_PHYSICAL_WIDTH_METERS,
  metersToWorldUnits,
  worldUnitsToMeters,
} from '../dist/world/scale.js';
import { createWorldSpatialIndex } from '../dist/world/spatialIndex.js';

function assertResourcePlacement(world) {
  const regions = new Map(world.planet.regions.map(region => [region.id, region]));
  for (const node of world.planet.resourceNodes) {
    const region = regions.get(node.regionId);
    assert.ok(region, `${node.id} references a real region`);
    assert.ok(region.resourceNodeIds.includes(node.id), `${node.id} is indexed by its region`);
    assert.equal(pointInPolygon(node.position, region.polygon), true, `${node.id} is physically inside ${region.id}`);
  }
}

test('generator v2 creates Earth-scale land Regions with meaningful ocean', () => {
  const world = generateWorld('phase-ten-world');
  const planet = world.planet;
  assert.equal(planet.generatorVersion, WORLD_GENERATOR_VERSION);
  assert.equal(WORLD_GENERATOR_VERSION, 2);
  assert.ok(planet.landmasses.length >= 5);
  assert.ok(planet.regions.length >= 1_500 && planet.regions.length <= 4_500, `generated ${planet.regions.length} Regions`);
  const flatLandArea = planet.regions.reduce((sum, region) => sum + polygonArea(region.polygon), 0);
  const planetArea = PLANET_MAP_WIDTH * PLANET_MAP_HEIGHT;
  assert.ok(flatLandArea > planetArea * 0.12, 'substantial land exists');
  assert.ok(flatLandArea < planetArea * 0.7, 'substantial ocean remains');
  assert.ok(planet.resourceNodes.length > 100);
  assert.ok(planet.resourceNodes.length < planet.regions.length, 'Feature count does not scale as several deposits per Region');
  assert.equal(new Set(planet.regions.map(region => region.name)).size, planet.regions.length, 'Region names remain unique at Earth scale');
  assertResourcePlacement(world);
});

test('land, Regions, and environment fields stay bounded and geographically named', () => {
  const planet = generateWorld('bounded-geography').planet;
  const suffixes = ['Volcanic Belt', 'Rift', 'Highlands', 'Plateau', 'Basin', 'Range', 'Flats', 'Lowlands', 'Plain', 'Reach'];
  for (const landmass of planet.landmasses) {
    assert.ok(landmass.polygon.length >= 24);
    for (const point of landmass.polygon) assert.ok(point.x >= 0 && point.x <= PLANET_MAP_WIDTH && point.y >= 0 && point.y <= PLANET_MAP_HEIGHT);
  }
  for (const region of planet.regions) {
    assert.equal(region.polygon.length, 4);
    assert.ok(region.approximateAreaSquareKm > 0);
    assert.ok(planet.landmasses.some(landmass => landmass.id === region.landmassId));
    assert.ok(suffixes.some(suffix => region.name.endsWith(suffix)), `${region.name} describes generated geography`);
    assert.ok(region.environment.latitudeDeg >= -90 && region.environment.latitudeDeg <= 90);
    assert.ok(region.environment.meanElevationMeters >= 0);
    assert.ok(region.environment.reliefMeters >= 0);
    for (const value of [region.environment.thermalIndex, region.environment.moistureIndex, region.environment.tectonicActivity, region.environment.volcanicActivity, region.environment.sedimentaryBasinFactor]) {
      assert.ok(value >= 0 && value <= 1);
    }
    for (const point of region.polygon) assert.ok(point.x >= 0 && point.x <= PLANET_MAP_WIDTH && point.y >= 0 && point.y <= PLANET_MAP_HEIGHT);
  }
});

test('planet logical coordinates retain an Earth-scale physical interpretation', () => {
  const planet = generateWorld('earth-scale-world').planet;
  assert.equal(planet.physicalWidthMeters, EARTH_SCALE_PHYSICAL_WIDTH_METERS);
  assert.equal(planet.physicalHeightMeters, EARTH_SCALE_PHYSICAL_HEIGHT_METERS);
  assert.equal(worldUnitsToMeters(PLANET_MAP_WIDTH), EARTH_SCALE_PHYSICAL_WIDTH_METERS);
  assert.equal(worldUnitsToMeters(PLANET_MAP_HEIGHT), EARTH_SCALE_PHYSICAL_HEIGHT_METERS);
  assert.ok(Math.abs(EARTH_SCALE_METERS_PER_WORLD_UNIT - 9783.935546875) < 1e-9);
  assert.ok(Math.abs(worldUnitsToMeters(metersToWorldUnits(20)) - 20) < 1e-9);
});

test('resource placement is suitability-driven and preserves the starting Iron Ore source', () => {
  const planet = generateWorld('resource-suitability').planet;
  assert.equal(planet.resourceNodes[0].resourceId, 'iron-ore');
  assert.equal(planet.resourceNodes[0].name.startsWith('Iron Ore Deposit'), true);
  const mostVolcanic = [...planet.regions].sort((left, right) => right.environment.volcanicActivity - left.environment.volcanicActivity)[0];
  const leastVolcanic = [...planet.regions].sort((left, right) => left.environment.volcanicActivity - right.environment.volcanicActivity)[0];
  assert.ok(resourceSuitability(mostVolcanic, 'copper-ore') > resourceSuitability(leastVolcanic, 'copper-ore'));
  const warmest = [...planet.regions].sort((left, right) => right.environment.thermalIndex - left.environment.thermalIndex)[0];
  const coldest = [...planet.regions].sort((left, right) => left.environment.thermalIndex - right.environment.thermalIndex)[0];
  assert.ok(resourceSuitability(coldest, 'water-ice') > resourceSuitability(warmest, 'water-ice'));
  for (const node of planet.resourceNodes) {
    assert.equal(node.nodeType, 'feature'); assert.equal(node.featureType, 'mineral-deposit'); assert.equal(node.resourceAccessPortId, 'resource-access');
    assert.deepEqual(node.ports, [{ id: 'resource-access', direction: 'output', kind: 'resource-access', medium: 'resource', label: 'resources' }]);
  }
});

test('the chunk index resolves containing, visible, nearby, and Feature queries without returning the planet', () => {
  const planet = generateWorld('spatial-query-world').planet;
  const index = createWorldSpatialIndex(planet);
  const feature = planet.resourceNodes[Math.floor(planet.resourceNodes.length / 2)];
  assert.equal(index.regionContaining(feature.position)?.id, feature.regionId);
  const tinyBounds = { x: feature.position.x - 10, y: feature.position.y - 10, width: 20, height: 20 };
  const visibleRegions = index.regionsIntersecting(tinyBounds);
  assert.ok(visibleRegions.length > 0 && visibleRegions.length < planet.regions.length / 20);
  assert.ok(index.resourceNodesIntersecting(tinyBounds).some(candidate => candidate.id === feature.id));
  assert.equal(index.nearbyRegions(feature.position, 5).length, 5);
  assert.ok(index.nearbyFeatures(feature.position, 3).length <= 3);
});

test('seed plus generator version deterministically identifies world truth', () => {
  const first = generateWorld('repeatable-seed');
  const second = generateWorld('repeatable-seed');
  const different = generateWorld('different-seed');
  assert.deepEqual(second, first);
  assert.notDeepEqual(different.planet.landmasses, first.planet.landmasses);
  assert.notEqual(different.planet.regions.length, first.planet.regions.length);
});

test('canonical geography does not restore the retired recursive hierarchy', () => {
  const serialized = JSON.stringify(generateWorld('flat-world-model'));
  for (const retiredField of ['siteIds', 'featureIds', 'resourceOccurrences', 'childWorkspaceId', 'systemNodes']) {
    assert.equal(serialized.includes(retiredField), false, `${retiredField} must not exist in the new model`);
  }
});

test('generation responsibilities are split and resource identity is not uniformly picked', () => {
  const orchestrator = fs.readFileSync('src/world/generateWorld.ts', 'utf8');
  const features = fs.readFileSync('src/world/generation/resourceFeatures.ts', 'utf8');
  assert.match(orchestrator, /generateLandmasses/); assert.match(orchestrator, /generateRegions/); assert.match(orchestrator, /generateResourceFeatures/);
  assert.match(features, /resourceSuitability/); assert.match(features, /weightedResource/);
  assert.doesNotMatch(features, /rng\.pick\(RESOURCE_DEFINITIONS\)/);
});
