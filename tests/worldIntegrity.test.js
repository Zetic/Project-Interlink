/** Tests: canonical World State entity/reference and ownership integrity. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, validateWorld } from '../src/core/world/worldState.js';
import { SCHEMA_VERSION, GENERATOR_VERSION } from '../src/core/world/versions.js';

function buildWorld(seed = 'integrity-test') {
  return createWorld(seed);
}

test('world uses the Site/Feature resource schema and generator versions', () => {
  const world = buildWorld();
  assert.equal(SCHEMA_VERSION, 7);
  assert.equal(GENERATOR_VERSION, 3);
  assert.equal(world.schemaVersion, 7);
  assert.equal(world.generatorVersion, 3);
});

test('planetId and every planet region ID resolve', () => {
  const world = buildWorld();
  const planet = world.planets[world.planetId];
  assert.ok(planet, 'world.planetId must resolve in world.planets');
  for (const regionId of planet.regions) {
    assert.ok(world.regions[regionId], `Planet region '${regionId}' must resolve`);
  }
});

test('Regions own Sites only, not Features or ResourceOccurrences', () => {
  const world = buildWorld('region-site-only');
  for (const [regionId, region] of Object.entries(world.regions)) {
    assert.ok(Array.isArray(region.siteIds));
    assert.ok(region.siteIds.length > 0, `Region '${regionId}' must contain Sites`);
    assert.equal('features' in region, false, `Region '${regionId}' must not own Features directly`);
    assert.equal(
      'backgroundResourceOccurrences' in region,
      false,
      `Region '${regionId}' must not own ResourceOccurrences directly`,
    );
    for (const siteId of region.siteIds) {
      const site = world.sites[siteId];
      assert.ok(site, `Region '${regionId}' Site '${siteId}' must resolve`);
      assert.equal(site.regionId, regionId);
    }
  }
});

test('Sites own Features and do not duplicate ResourceOccurrence ownership', () => {
  const world = buildWorld('site-feature-ownership');
  for (const [siteId, site] of Object.entries(world.sites)) {
    assert.equal(typeof site.name, 'string');
    assert.ok(site.name.length > 0, `Site '${siteId}' must have a name`);
    assert.ok(Array.isArray(site.featureIds));
    assert.ok(site.featureIds.length > 0, `Site '${siteId}' must contain Features`);
    assert.equal(
      'resourceOccurrenceIds' in site,
      false,
      `Site '${siteId}' must derive resources through its Features`,
    );
    for (const featureId of site.featureIds) {
      const feature = world.features[featureId];
      assert.ok(feature, `Site '${siteId}' Feature '${featureId}' must resolve`);
      assert.equal(feature.siteId, siteId);
      assert.equal(feature.regionId, site.regionId);
    }
  }
});

test('every Feature belongs to exactly one Site and has at least one resource', () => {
  const world = buildWorld('feature-site-resource-ownership');
  const ownerCount = new Map();
  for (const site of Object.values(world.sites)) {
    for (const featureId of site.featureIds) {
      ownerCount.set(featureId, (ownerCount.get(featureId) ?? 0) + 1);
    }
  }

  for (const [featureId, feature] of Object.entries(world.features)) {
    assert.equal(ownerCount.get(featureId), 1, `Feature '${featureId}' must have exactly one Site owner`);
    assert.ok(world.sites[feature.siteId], `Feature '${featureId}' siteId must resolve`);
    assert.ok(Array.isArray(feature.resourceOccurrences));
    assert.ok(feature.resourceOccurrences.length > 0, `Feature '${featureId}' must expose a resource/opportunity`);
  }
});

test('every ResourceOccurrence is owned by exactly one Feature', () => {
  const world = buildWorld('occurrence-feature-ownership');
  const ownerCount = new Map();

  for (const [featureId, feature] of Object.entries(world.features)) {
    for (const occurrenceId of feature.resourceOccurrences) {
      const occurrence = world.resourceOccurrences[occurrenceId];
      assert.ok(occurrence, `Feature '${featureId}' occurrence '${occurrenceId}' must resolve`);
      assert.equal(occurrence.sourceType, 'feature');
      assert.equal(occurrence.sourceId, featureId);
      ownerCount.set(occurrenceId, (ownerCount.get(occurrenceId) ?? 0) + 1);
    }
  }

  for (const occurrenceId of Object.keys(world.resourceOccurrences)) {
    assert.equal(ownerCount.get(occurrenceId), 1, `Occurrence '${occurrenceId}' must have one Feature owner`);
  }
});

test('regional resource potential materializes as access Sites and Feature-owned occurrences', () => {
  const world = buildWorld('regional-access-sites');
  const regionalSites = Object.values(world.sites).filter(site => site.siteKind === 'regional-access');
  assert.ok(regionalSites.length > 0, 'Generated world should include regional-access Sites');

  for (const site of regionalSites) {
    assert.ok(site.name, 'Regional access Site must have a player-facing name');
    for (const featureId of site.featureIds) {
      const feature = world.features[featureId];
      assert.equal(feature.regionalAccess, true);
      for (const occurrenceId of feature.resourceOccurrences) {
        const occurrence = world.resourceOccurrences[occurrenceId];
        assert.equal(occurrence.sourceType, 'feature');
        assert.equal(occurrence.sourceId, featureId);
        assert.equal(occurrence.accessScope, 'regional');
      }
    }
  }
});

test('physical Features do not contain player-discovery state', () => {
  const world = buildWorld();
  for (const feature of Object.values(world.features)) {
    assert.equal('discovered' in feature, false);
    assert.equal('discoveryState' in feature, false);
  }
});

test('all entity IDs are unique within a world', () => {
  const world = buildWorld('unique-ids-test');
  const allIds = [
    ...Object.keys(world.planets),
    ...Object.keys(world.regions),
    ...Object.keys(world.sites),
    ...Object.keys(world.features),
    ...Object.keys(world.resourceOccurrences),
  ];
  assert.equal(new Set(allIds).size, allIds.length, 'All entity IDs should be globally unique');
});

test('validateWorld rejects legacy Region or Site resource ownership shapes', () => {
  const world = buildWorld('legacy-shape-rejection');
  const region = Object.values(world.regions)[0];
  const site = world.sites[region.siteIds[0]];

  region.backgroundResourceOccurrences = [];
  region.features = [];
  site.resourceOccurrenceIds = [];
  const errors = validateWorld(world);
  assert.ok(errors.some(error => error.includes('must not own ResourceOccurrences')));
  assert.ok(errors.some(error => error.includes('must not own a features collection')));
  assert.ok(errors.some(error => error.includes('must not duplicate ResourceOccurrence ownership')));
});

test('validateWorld returns no errors for a freshly generated world', () => {
  const world = buildWorld('validate-world-test');
  assert.deepStrictEqual(validateWorld(world), []);
});
