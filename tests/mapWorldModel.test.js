import assert from 'node:assert/strict';
import test from 'node:test';

import { pointInPolygon } from '../dist/world/geometry.js';
import { generateWorld, PLANET_MAP_HEIGHT, PLANET_MAP_WIDTH, REGION_COUNT } from '../dist/world/generateWorld.js';
import {
  EARTH_SCALE_METERS_PER_WORLD_UNIT,
  EARTH_SCALE_PHYSICAL_HEIGHT_METERS,
  EARTH_SCALE_PHYSICAL_WIDTH_METERS,
  metersToWorldUnits,
  worldUnitsToMeters,
} from '../dist/world/scale.js';

function polygonArea(points) {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return Math.abs(twiceArea) / 2;
}

function assertResourcePlacement(world) {
  const regionIds = new Set(world.planet.regions.map(region => region.id));

  for (const node of world.planet.resourceNodes) {
    assert.ok(regionIds.has(node.regionId), `${node.id} references a real region`);
    const region = world.planet.regions.find(candidate => candidate.id === node.regionId);
    assert.ok(region, `${node.id} resolves its region`);
    assert.ok(region.resourceNodeIds.includes(node.id), `${node.id} is indexed by its region`);
    assert.equal(pointInPolygon(node.position, region.polygon), true, `${node.id} is physically inside ${region.id}`);
  }
}

test('new TypeScript world model generates exactly five geographic regions', () => {
  const world = generateWorld('phase-three-world');
  assert.equal(world.planet.regions.length, REGION_COUNT);
  assert.equal(REGION_COUNT, 5);
  assert.ok(world.planet.resourceNodes.length >= 15);
  assertResourcePlacement(world);
});

test('planet logical coordinates carry an Earth-scale physical interpretation', () => {
  const world = generateWorld('earth-scale-world');
  assert.equal(world.planet.physicalWidthMeters, EARTH_SCALE_PHYSICAL_WIDTH_METERS);
  assert.equal(world.planet.physicalHeightMeters, EARTH_SCALE_PHYSICAL_HEIGHT_METERS);
  assert.equal(worldUnitsToMeters(PLANET_MAP_WIDTH), EARTH_SCALE_PHYSICAL_WIDTH_METERS);
  assert.equal(worldUnitsToMeters(PLANET_MAP_HEIGHT), EARTH_SCALE_PHYSICAL_HEIGHT_METERS);
  assert.ok(Math.abs(EARTH_SCALE_METERS_PER_WORLD_UNIT - 9783.935546875) < 1e-9);
  assert.ok(Math.abs(worldUnitsToMeters(metersToWorldUnits(20)) - 20) < 1e-9);
});

test('Phase 3.5 regions partition the full map with irregular asymmetric boundaries', () => {
  const world = generateWorld('irregular-geography');

  for (const region of world.planet.regions) {
    assert.ok(region.polygon.length > 4, `${region.id} is not a rectangle`);
    for (const point of region.polygon) {
      assert.ok(point.x >= 0 && point.x <= PLANET_MAP_WIDTH, `${region.id} x coordinate stays on-map`);
      assert.ok(point.y >= 0 && point.y <= PLANET_MAP_HEIGHT, `${region.id} y coordinate stays on-map`);
    }
  }

  const totalRegionArea = world.planet.regions.reduce((sum, region) => sum + polygonArea(region.polygon), 0);
  assert.ok(Math.abs(totalRegionArea - PLANET_MAP_WIDTH * PLANET_MAP_HEIGHT) < 0.01, 'regions cover the complete map without ocean, gaps, or overlap');

  const allPoints = world.planet.regions.flatMap(region => region.polygon);
  assert.equal(Math.min(...allPoints.map(point => point.x)), 0, 'region coverage reaches the west map edge');
  assert.equal(Math.max(...allPoints.map(point => point.x)), PLANET_MAP_WIDTH, 'region coverage reaches the east map edge');
  assert.equal(Math.min(...allPoints.map(point => point.y)), 0, 'region coverage reaches the north map edge');
  assert.equal(Math.max(...allPoints.map(point => point.y)), PLANET_MAP_HEIGHT, 'region coverage reaches the south map edge');

  assert.ok(world.planet.regions.some(region => region.bounds.y > 0), 'at least one region begins away from the north edge');
  assert.ok(world.planet.regions.some(region => region.bounds.y + region.bounds.height < PLANET_MAP_HEIGHT), 'at least one region ends before the south edge');
});

test('resource deposits retain Feature-node resource-access contracts', () => {
  const world = generateWorld('resource-node-contract');

  for (const node of world.planet.resourceNodes) {
    assert.equal(node.nodeType, 'feature');
    assert.equal(node.featureType, 'mineral-deposit');
    assert.equal(node.resourceAccessPortId, 'resource-access');
    assert.deepEqual(node.ports, [{
      id: 'resource-access',
      direction: 'output',
      kind: 'resource-access',
      label: 'resources',
    }]);
  }
});

test('world generation is deterministic and namespaced by seed', () => {
  const first = generateWorld('repeatable-seed');
  const second = generateWorld('repeatable-seed');
  const different = generateWorld('different-seed');

  assert.deepEqual(second, first);
  assert.notDeepEqual(different, first);
});

test('new canonical model does not contain the retired recursive hierarchy', () => {
  const world = generateWorld('flat-world-model');
  const serialized = JSON.stringify(world);
  for (const retiredField of ['siteIds', 'featureIds', 'resourceOccurrences', 'childWorkspaceId', 'systemNodes']) {
    assert.equal(serialized.includes(retiredField), false, `${retiredField} must not exist in the new model`);
  }
});
