import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { WORLD_GENERATOR_VERSION, generateWorld, PLANET_MAP_HEIGHT, PLANET_MAP_WIDTH } from '../dist/world/generateWorld.js';
import { pointInPolygon, polygonArea } from '../dist/world/geometry.js';
import { resourceSuitability } from '../dist/world/generation/resourceFeatures.js';
import { environmentContextForPlanet, samplePlanetEnvironment } from '../dist/world/generation/surfaceField.js';
import { EARTH_SCALE_METERS_PER_WORLD_UNIT, EARTH_SCALE_PHYSICAL_HEIGHT_METERS, EARTH_SCALE_PHYSICAL_WIDTH_METERS, metersToWorldUnits, worldUnitsToMeters } from '../dist/world/scale.js';
import { createWorldSpatialIndex, worldSpatialIndexFor } from '../dist/world/spatialIndex.js';

test('generator v5 creates continuous land and ocean Regions at Earth scale', () => {
  const planet = generateWorld('phase-ten-one-world').planet;
  assert.equal(planet.generatorVersion, WORLD_GENERATOR_VERSION);
  assert.equal(WORLD_GENERATOR_VERSION, 5);
  assert.equal(planet.surfaceResolution.columns * planet.surfaceResolution.rows === planet.regions.length, false);
  assert.ok(planet.tectonicPlates.length >= 12 && planet.tectonicPlates.length <= 24);
  assert.ok(planet.continents.length >= 3 && planet.continents.length <= 8);
  assert.ok(planet.oceans.length >= 3 && planet.oceans.length <= 8);
  assert.ok(planet.regions.length >= 3_500 && planet.regions.length <= 10_000);
  const land = planet.regions.filter(region => region.surfaceType === 'land');
  assert.ok(land.length > planet.regions.length * 0.25 && land.length < planet.regions.length * 0.5);
  assert.ok(planet.resourceNodes.length > 100 && planet.resourceNodes.length < land.length);
  assert.equal(new Set(planet.regions.map(region => region.name)).size, planet.regions.length);
});

test('geographic parents and continuous Regions form one complete canonical surface', () => {
  const planet = generateWorld('bounded-geography-v5').planet;
  const environmentContext = environmentContextForPlanet(planet);
  const parents = new Map([...planet.continents, ...planet.oceans].map(parent => [parent.id, parent]));
  let totalArea = 0;
  for (const region of planet.regions) {
    assert.ok(region.polygon.length >= 3);
    assert.ok(polygonArea(region.polygon) > 0);
    totalArea += polygonArea(region.polygon);
    const parent = parents.get(region.parentId);
    assert.ok(parent, `${region.id} parent resolves`);
    assert.equal(parent.kind, region.parentKind);
    assert.equal(region.surfaceType, region.parentKind === 'continent' ? 'land' : 'ocean');
    assert.ok(parent.regionIds.includes(region.id));
    assert.ok(region.environment.meanElevationMeters >= 0 === (region.surfaceType === 'land'));
    for (const point of region.polygon) assert.ok(point.x >= 0 && point.x <= PLANET_MAP_WIDTH && point.y >= 0 && point.y <= PLANET_MAP_HEIGHT);
  }
  assert.ok(Math.abs(totalArea - PLANET_MAP_WIDTH * PLANET_MAP_HEIGHT) < 0.25, 'Regions tile the complete surface without material gaps');
  for (const parent of parents.values()) for (const id of parent.regionIds) assert.ok(planet.regions.some(region => region.id === id));
  for (let index = 0; index < planet.regions.length; index += 113) {
    const region = planet.regions[index];
    assert.equal(samplePlanetEnvironment(environmentContext, region.center).surfaceType, region.surfaceType, `${region.id} center sampling matches Region ownership`);
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

test('point-sampled resources remain land Features and preserve guaranteed Iron Ore', () => {
  const planet = generateWorld('resource-suitability-v5').planet;
  const regions = new Map(planet.regions.map(region => [region.id, region]));
  assert.equal(planet.resourceNodes[0].resourceId, 'iron-ore');
  for (const node of planet.resourceNodes) {
    const region = regions.get(node.regionId);
    assert.ok(region && region.surfaceType === 'land');
    assert.equal(region.parentKind, 'continent');
    assert.ok(region.resourceNodeIds.includes(node.id));
    assert.equal(pointInPolygon(node.position, region.polygon), true);
    assert.equal(node.nodeType, 'feature'); assert.equal(node.featureType, 'mineral-deposit');
  }
  const land = planet.regions.filter(region => region.surfaceType === 'land');
  const mostVolcanic = [...land].sort((left, right) => right.environment.volcanicActivity - left.environment.volcanicActivity)[0];
  const leastVolcanic = [...land].sort((left, right) => left.environment.volcanicActivity - right.environment.volcanicActivity)[0];
  assert.ok(resourceSuitability(mostVolcanic, 'copper-ore') > resourceSuitability(leastVolcanic, 'copper-ore'));
});

test('the shared chunk index resolves candidate-only geographic and Feature queries', () => {
  const planet = generateWorld('spatial-query-world-v5').planet;
  const index = createWorldSpatialIndex(planet);
  assert.equal(worldSpatialIndexFor(planet), worldSpatialIndexFor(planet));
  const feature = planet.resourceNodes[Math.floor(planet.resourceNodes.length / 2)];
  assert.equal(index.regionContaining(feature.position)?.id, feature.regionId);
  const tinyBounds = { x: feature.position.x - 10, y: feature.position.y - 10, width: 20, height: 20 };
  assert.ok(index.regionsIntersecting(tinyBounds).length < planet.regions.length / 100);
  assert.ok(index.resourceNodesIntersecting(tinyBounds).some(candidate => candidate.id === feature.id));
  const source = fs.readFileSync('src/world/spatialIndex.ts', 'utf8');
  assert.doesNotMatch(source, /this\.planet\.regions\.filter/);
  assert.doesNotMatch(source, /this\.planet\.resourceNodes\.filter/);
});

test('seed plus generator version deterministically identifies tectonic world truth', () => {
  const first = generateWorld('repeatable-v5');
  const second = generateWorld('repeatable-v5');
  const different = generateWorld('different-v5');
  assert.deepEqual(second, first);
  assert.notDeepEqual(different.planet.tectonicPlates, first.planet.tectonicPlates);
  assert.notDeepEqual(different.planet.continents, first.planet.continents);
});

test('generation stays split and does not restore retired geographic/workspace models', () => {
  const serialized = JSON.stringify(generateWorld('flat-world-model-v5'));
  for (const retiredField of ['landmasses', 'landmassId', 'siteIds', 'childWorkspaceId', 'systemNodes']) assert.equal(serialized.includes(retiredField), false);
  const orchestrator = fs.readFileSync('src/world/generateWorld.ts', 'utf8');
  assert.match(orchestrator, /generateTectonicPlates/); assert.match(orchestrator, /generateSurfaceField/); assert.match(orchestrator, /generateGeography/); assert.match(orchestrator, /generateRegions/); assert.match(orchestrator, /generateResourceFeatures/);
});
