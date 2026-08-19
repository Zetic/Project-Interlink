/**
 * Tests: World State entity/reference integrity.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, validateWorld } from '../src/core/world/worldState.js';

function buildWorld(seed = 'integrity-test') {
  return createWorld(seed);
}

test('planetId resolves to a real planet', () => {
  const world = buildWorld();
  assert.ok(world.planets[world.planetId], 'world.planetId must resolve in world.planets');
});

test('every planet region ID resolves', () => {
  const world = buildWorld();
  const planet = world.planets[world.planetId];
  for (const rid of planet.regions) {
    assert.ok(world.regions[rid], `Planet region '${rid}' must resolve in world.regions`);
  }
});

test('every region feature ID resolves', () => {
  const world = buildWorld();
  for (const [rid, region] of Object.entries(world.regions)) {
    for (const fid of region.features) {
      assert.ok(world.features[fid], `Region '${rid}' feature '${fid}' must resolve in world.features`);
    }
  }
});

test('every feature regionId matches its containing region', () => {
  const world = buildWorld();
  for (const [rid, region] of Object.entries(world.regions)) {
    for (const fid of region.features) {
      const feature = world.features[fid];
      assert.strictEqual(
        feature.regionId, rid,
        `Feature '${fid}' regionId should be '${rid}', got '${feature.regionId}'`
      );
    }
  }
});

test('every feature resource-occurrence ID resolves', () => {
  const world = buildWorld();
  for (const [fid, feature] of Object.entries(world.features)) {
    for (const oid of feature.resourceOccurrences) {
      assert.ok(
        world.resourceOccurrences[oid],
        `Feature '${fid}' occurrence '${oid}' must resolve in world.resourceOccurrences`
      );
    }
  }
});

test('every generated feature belongs to an enterable Site', () => {
  const world = buildWorld('feature-sites');
  const featureIds = new Set(Object.values(world.sites).flatMap(site => site.featureIds));
  assert.equal(featureIds.size, Object.keys(world.features).length);
  for (const feature of Object.values(world.features)) {
    const site = Object.values(world.sites).find(candidate => candidate.featureIds.includes(feature.id));
    assert.ok(site, `Feature '${feature.id}' must have a Site`);
    assert.equal(site.regionId, feature.regionId);
  }
});

test('Site featureIds reference valid Features', () => {
  const world = buildWorld('site-feature-references');
  for (const site of Object.values(world.sites)) {
    assert.ok(Array.isArray(site.featureIds));
    for (const featureId of site.featureIds) assert.ok(world.features[featureId]);
  }
});

test('a zero-occurrence Feature retains its enterable Site association', () => {
  const world = buildWorld('zero-occurrence-feature-site');
  const feature = Object.values(world.features)[0];
  feature.resourceOccurrences = [];
  const site = Object.values(world.sites).find(candidate => candidate.featureIds.includes(feature.id));
  assert.ok(site, `Feature '${feature.id}' must retain a Site without occurrences`);
  assert.deepStrictEqual(site.featureIds, [feature.id]);
});

test('every region background resource-occurrence ID resolves', () => {
  const world = buildWorld();
  for (const [rid, region] of Object.entries(world.regions)) {
    for (const oid of (region.backgroundResourceOccurrences ?? [])) {
      assert.ok(
        world.resourceOccurrences[oid],
        `Region '${rid}' background occurrence '${oid}' must resolve in world.resourceOccurrences`
      );
    }
  }
});

test('all entity IDs are unique within a world', () => {
  const world = buildWorld('unique-ids-test');
  const allIds = [
    ...Object.keys(world.planets),
    ...Object.keys(world.regions),
    ...Object.keys(world.features),
    ...Object.keys(world.resourceOccurrences),
  ];
  const unique = new Set(allIds);
  assert.strictEqual(unique.size, allIds.length, 'All entity IDs should be unique');
});

test('physical features do not contain player-discovery state', () => {
  const world = buildWorld();
  for (const feature of Object.values(world.features)) {
    assert.ok(!('discovered' in feature), `Feature '${feature.id}' must not have 'discovered' property`);
    assert.ok(!('discoveryState' in feature), `Feature '${feature.id}' must not have 'discoveryState' property`);
  }
});

test('validateWorld returns no errors for a freshly generated world', () => {
  const world = buildWorld('validate-world-test');
  const errors = validateWorld(world);
  assert.deepStrictEqual(errors, [], `validateWorld returned errors: ${JSON.stringify(errors)}`);
});

test('each background occurrence sourceType is region', () => {
  const world = buildWorld();
  for (const [rid, region] of Object.entries(world.regions)) {
    for (const oid of (region.backgroundResourceOccurrences ?? [])) {
      const occ = world.resourceOccurrences[oid];
      assert.strictEqual(occ.sourceType, 'region', `Background occurrence '${oid}' should have sourceType 'region'`);
      assert.strictEqual(occ.sourceId, rid, `Background occurrence '${oid}' sourceId should be '${rid}'`);
    }
  }
});

test('each feature occurrence sourceType is feature', () => {
  const world = buildWorld();
  for (const [fid, feature] of Object.entries(world.features)) {
    for (const oid of feature.resourceOccurrences) {
      const occ = world.resourceOccurrences[oid];
      assert.strictEqual(occ.sourceType, 'feature', `Feature occurrence '${oid}' should have sourceType 'feature'`);
      assert.strictEqual(occ.sourceId, fid, `Feature occurrence '${oid}' sourceId should be '${fid}'`);
    }
  }
});
