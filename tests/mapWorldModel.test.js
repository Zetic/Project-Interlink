import assert from 'node:assert/strict';
import test from 'node:test';

import { pointInPolygon } from '../dist/world/geometry.js';
import { generateWorld, PLANET_MAP_HEIGHT, PLANET_MAP_WIDTH, REGION_COUNT } from '../dist/world/generateWorld.js';

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

test('Phase 3 regions use irregular polygons surrounded by map-space ocean', () => {
  const world = generateWorld('irregular-geography');

  for (const region of world.planet.regions) {
    assert.ok(region.polygon.length > 4, `${region.id} is not a rectangle`);
    for (const point of region.polygon) {
      assert.ok(point.x >= 0 && point.x <= PLANET_MAP_WIDTH, `${region.id} x coordinate stays on-map`);
      assert.ok(point.y >= 0 && point.y <= PLANET_MAP_HEIGHT, `${region.id} y coordinate stays on-map`);
    }
  }

  const allPoints = world.planet.regions.flatMap(region => region.polygon);
  assert.ok(Math.min(...allPoints.map(point => point.x)) > 0, 'ocean remains west of the landmass');
  assert.ok(Math.max(...allPoints.map(point => point.x)) < PLANET_MAP_WIDTH, 'ocean remains east of the landmass');
  assert.ok(Math.min(...allPoints.map(point => point.y)) > 0, 'ocean remains north of the landmass');
  assert.ok(Math.max(...allPoints.map(point => point.y)) < PLANET_MAP_HEIGHT, 'ocean remains south of the landmass');
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
