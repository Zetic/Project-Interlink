import assert from 'node:assert/strict';
import test from 'node:test';

import { generateWorld, REGION_COUNT } from '../dist/world/generateWorld.js';

function assertResourcePlacement(world) {
  const regionIds = new Set(world.planet.regions.map(region => region.id));

  for (const node of world.planet.resourceNodes) {
    assert.ok(regionIds.has(node.regionId), `${node.id} references a real region`);
    const region = world.planet.regions.find(candidate => candidate.id === node.regionId);
    assert.ok(region, `${node.id} resolves its region`);
    assert.ok(region.resourceNodeIds.includes(node.id), `${node.id} is indexed by its region`);
    assert.ok(node.position.x >= region.bounds.x);
    assert.ok(node.position.x <= region.bounds.x + region.bounds.width);
    assert.ok(node.position.y >= region.bounds.y);
    assert.ok(node.position.y <= region.bounds.y + region.bounds.height);
  }
}

test('new TypeScript world model generates exactly five geographic regions', () => {
  const world = generateWorld('phase-two-world');
  assert.equal(world.planet.regions.length, REGION_COUNT);
  assert.equal(REGION_COUNT, 5);
  assert.ok(world.planet.resourceNodes.length >= 15);
  assertResourcePlacement(world);
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
