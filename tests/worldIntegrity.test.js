/** Tests: canonical World State entity/reference and ownership integrity. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, validateWorld } from '../src/core/world/worldState.js';
import { SCHEMA_VERSION, GENERATOR_VERSION } from '../src/core/world/versions.js';
import { FEATURE_ALLOWED_FAMILIES } from '../src/generator/generateFeatures.js';
import { getResourceDefinition } from '../src/generator/generateResources.js';
import { RESOURCE_COMPOSITION_TEMPLATES } from '../src/content/resources/resourceCompositions.js';

function buildWorld(seed = 'integrity-test') {
  return createWorld(seed);
}

test('world uses the Site/Feature resource schema and generator versions', () => {
  const world = buildWorld();
  assert.equal(SCHEMA_VERSION, 10);
  assert.equal(GENERATOR_VERSION, 7);
  assert.equal(world.schemaVersion, 10);
  assert.equal(world.generatorVersion, 7);
});

test('planetId and every planet region ID resolve', () => {
  const world = buildWorld();
  const planet = world.planets[world.planetId];
  assert.ok(planet);
  for (const regionId of planet.regions) assert.ok(world.regions[regionId]);
});

test('Regions own Sites only, not Features or ResourceOccurrences', () => {
  const world = buildWorld('region-site-only');
  for (const [regionId, region] of Object.entries(world.regions)) {
    assert.ok(Array.isArray(region.siteIds));
    assert.ok(region.siteIds.length > 0);
    assert.equal('features' in region, false);
    assert.equal('backgroundResourceOccurrences' in region, false);
    for (const siteId of region.siteIds) {
      assert.ok(world.sites[siteId]);
      assert.equal(world.sites[siteId].regionId, regionId);
    }
  }
});

test('Sites own Features and do not duplicate ResourceOccurrence ownership', () => {
  for (const [siteId, site] of Object.entries(buildWorld('site-feature-ownership').sites)) {
    assert.ok(site.name);
    assert.ok(Array.isArray(site.featureIds));
    assert.ok(site.featureIds.length > 0);
    assert.equal('resourceOccurrenceIds' in site, false);
  }
});

test('every Feature belongs to exactly one Site and has at least one resource', () => {
  const world = buildWorld('feature-site-resource-ownership');
  const owners = new Map();
  for (const site of Object.values(world.sites)) {
    for (const featureId of site.featureIds) owners.set(featureId, (owners.get(featureId) ?? 0) + 1);
  }
  for (const [featureId, feature] of Object.entries(world.features)) {
    assert.equal(owners.get(featureId), 1);
    assert.ok(world.sites[feature.siteId]);
    assert.ok(Array.isArray(feature.resourceOccurrences));
    assert.ok(feature.resourceOccurrences.length > 0);
  }
});

test('every ResourceOccurrence is owned by exactly one Feature', () => {
  const world = buildWorld('occurrence-feature-ownership');
  const owners = new Map();
  for (const [featureId, feature] of Object.entries(world.features)) {
    for (const occurrenceId of feature.resourceOccurrences) {
      const occurrence = world.resourceOccurrences[occurrenceId];
      assert.ok(occurrence);
      assert.equal(occurrence.sourceType, 'feature');
      assert.equal(occurrence.sourceId, featureId);
      owners.set(occurrenceId, (owners.get(occurrenceId) ?? 0) + 1);
    }
  }
  for (const occurrenceId of Object.keys(world.resourceOccurrences)) assert.equal(owners.get(occurrenceId), 1);
});

test('every Site belongs to exactly one Region and every Region site resolves', () => {
  const world = buildWorld('site-region-ownership');
  const owners = new Map();
  for (const [regionId, region] of Object.entries(world.regions)) {
    for (const siteId of region.siteIds) {
      assert.ok(world.sites[siteId]);
      assert.equal(world.sites[siteId].regionId, regionId);
      owners.set(siteId, (owners.get(siteId) ?? 0) + 1);
    }
  }
  for (const siteId of Object.keys(world.sites)) assert.equal(owners.get(siteId), 1);
});

test('generated ResourceOccurrences resolve to registered definitions and use concrete composition when modeled', () => {
  const world = buildWorld('registered-occurrences');
  for (const occurrence of Object.values(world.resourceOccurrences)) {
    const resource = getResourceDefinition(occurrence.resourceId);
    assert.ok(resource);
    if (RESOURCE_COMPOSITION_TEMPLATES[resource.id]) {
      assert.ok(occurrence.composition && Object.keys(occurrence.composition).length > 0);
    }
    assert.equal('components' in occurrence, false);
  }
});

test('every localized generated Feature family is compatible with its resource occurrence family', () => {
  const world = buildWorld('feature-family-integrity');
  for (const feature of Object.values(world.features)) {
    // Regional-access Features are presentation wrappers around resources that
    // were already selected by regional generation. Their types (Forest,
    // Water Body, Atmospheric Zone, etc.) intentionally do not use the
    // localized Feature compatibility registry.
    if (feature.regionalAccess) continue;
    const allowed = FEATURE_ALLOWED_FAMILIES[feature.type];
    assert.ok(allowed instanceof Set);
    for (const occurrenceId of feature.resourceOccurrences) {
      const occurrence = world.resourceOccurrences[occurrenceId];
      const resource = getResourceDefinition(occurrence.resourceId);
      assert.ok(resource);
      assert.ok(
        allowed.has(resource.occurrenceFamily),
        `${feature.type} cannot host ${resource.occurrenceFamily}`,
      );
    }
  }
});

test('validateWorld accepts a generated canonical world', () => {
  assert.doesNotThrow(() => validateWorld(buildWorld('validate-generated-world')));
});
