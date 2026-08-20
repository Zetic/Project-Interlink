/** Tests: canonical World State entity/reference and ownership integrity. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, validateWorld } from '../src/core/world/worldState.js';
import { SCHEMA_VERSION, GENERATOR_VERSION } from '../src/core/world/versions.js';
import { FEATURE_ALLOWED_FAMILIES } from '../src/generator/generateFeatures.js';
import { getResourceDefinition } from '../src/generator/generateResources.js';

function buildWorld(seed = 'integrity-test') {
  return createWorld(seed);
}

test('world uses the Site/Feature resource schema and generator versions', () => {
  const world = buildWorld();
  assert.equal(SCHEMA_VERSION, 8);
  assert.equal(GENERATOR_VERSION, 6);
  assert.equal(world.schemaVersion, 8);
  assert.equal(world.generatorVersion, 6);
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
  const world = buildWorld('site-feature-ownership');
  for (const [siteId, site] of Object.entries(world.sites)) {
    assert.ok(site.name);
    assert.ok(Array.isArray(site.featureIds));
    assert.ok(site.featureIds.length > 0);
    assert.equal('resourceOccurrenceIds' in site, false);
    for (const featureId of site.featureIds) {
      const feature = world.features[featureId];
      assert.ok(feature);
      assert.equal(feature.siteId, siteId);
      assert.equal(feature.regionId, site.regionId);
    }
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

test('regional resource potential materializes as access Sites and Feature-owned occurrences', () => {
  const world = buildWorld('regional-access-sites');
  const regionalSites = Object.values(world.sites).filter(site => site.siteKind === 'regional-access');
  assert.ok(regionalSites.length > 0);
  for (const site of regionalSites) {
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
  assert.equal(new Set(allIds).size, allIds.length);
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
  assert.deepStrictEqual(validateWorld(buildWorld('validate-world-test')), []);
});

test('validateWorld rejects stale schema and generator versions clearly before structural validation', () => {
  const staleSchema = buildWorld('stale-schema-version');
  staleSchema.schemaVersion = SCHEMA_VERSION - 1;
  assert.deepStrictEqual(validateWorld(staleSchema), [`Unsupported schemaVersion '${SCHEMA_VERSION - 1}'; expected ${SCHEMA_VERSION}`]);

  const staleGenerator = buildWorld('stale-generator-version');
  staleGenerator.generatorVersion = GENERATOR_VERSION - 1;
  assert.deepStrictEqual(validateWorld(staleGenerator), [`Unsupported generatorVersion '${GENERATOR_VERSION - 1}'; expected ${GENERATOR_VERSION}`]);
});

test('generated localized Features each have exactly one ResourceOccurrence', () => {
  const world = buildWorld('one-occ-per-feature');
  const localizedFeatures = Object.values(world.features).filter(feature => !feature.regionalAccess);
  assert.ok(localizedFeatures.length > 0);
  for (const feature of localizedFeatures) assert.equal(feature.resourceOccurrences.length, 1);
});

test('a localized Site can contain multiple distinct Features', () => {
  const seeds = ['multi-feature-a', 'multi-feature-b', 'multi-feature-c', 'multi-feature-d', 'multi-feature-e'];
  assert.ok(seeds.some(seed =>
    Object.values(buildWorld(seed).sites)
      .filter(site => site.siteKind === 'localized')
      .some(site => site.featureIds.length > 1)
  ));
});

test('deterministic generation: same seed produces identical worlds under generator v6', () => {
  const world1 = buildWorld('determinism-v6');
  const world2 = buildWorld('determinism-v6');
  assert.deepStrictEqual(world1, world2);
});

test('every occurrence occurrenceFamily is physically compatible with its owning Feature type', () => {
  for (const seed of ['compat-a', 'compat-b', 'compat-c', 'compat-d', 'compat-e']) {
    const world = buildWorld(seed);
    for (const [featureId, feature] of Object.entries(world.features)) {
      const allowedFamilies = FEATURE_ALLOWED_FAMILIES[feature.type];
      if (!allowedFamilies) continue;
      for (const occurrenceId of feature.resourceOccurrences) {
        const occurrence = world.resourceOccurrences[occurrenceId];
        const resource = getResourceDefinition(occurrence.resourceId);
        assert.ok(resource, `Occurrence '${occurrenceId}' references unknown resource '${occurrence.resourceId}'`);
        assert.ok(allowedFamilies.has(resource.occurrenceFamily),
          `Feature '${featureId}' (${feature.type}) has incompatible '${occurrence.resourceId}' (${resource.occurrenceFamily})`);
      }
    }
  }
});

test('Outcrop, Aquifer, and Gas Reservoir Features preserve occurrence-family physical compatibility', () => {
  const aqueousFamilies = new Set(['aqueous-fluid', 'hydrothermal-fluid']);
  const solidFamilies = new Set(['rock-mass', 'ore-body', 'mineral-body', 'sediment', 'evaporite', 'ice-body']);
  const nonGasFamilies = new Set([...solidFamilies, ...aqueousFamilies, 'magma', 'vegetation', 'organic-soil', 'atmosphere']);

  for (const seed of ['feature-family-a', 'feature-family-b', 'feature-family-c', 'feature-family-d']) {
    const world = buildWorld(seed);
    for (const feature of Object.values(world.features)) {
      for (const occurrenceId of feature.resourceOccurrences) {
        const occurrence = world.resourceOccurrences[occurrenceId];
        const family = getResourceDefinition(occurrence.resourceId)?.occurrenceFamily;
        if (feature.type === 'Outcrop') assert.equal(aqueousFamilies.has(family), false);
        if (feature.type === 'Aquifer') assert.equal(solidFamilies.has(family), false);
        if (feature.type === 'Gas Reservoir') assert.equal(nonGasFamilies.has(family), false);
      }
    }
  }
});

test('iron ore occurrence remains a single mixed-composition source body', () => {
  let foundIronOre = false;
  for (let i = 0; i < 20 && !foundIronOre; i++) {
    const world = buildWorld(`iron-composition-${i}`);
    for (const occurrence of Object.values(world.resourceOccurrences)) {
      if (occurrence.resourceId !== 'iron-ore') continue;
      foundIronOre = true;
      assert.ok(occurrence.composition && typeof occurrence.composition === 'object');
      const totalPercent = Object.values(occurrence.composition).reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(totalPercent - 100) < 2);
      assert.equal(world.features[occurrence.sourceId].resourceOccurrences.length, 1);
    }
  }
  assert.ok(foundIronOre);
});
