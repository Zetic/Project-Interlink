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
  assert.equal(GENERATOR_VERSION, 5);
  assert.equal(world.schemaVersion, 8);
  assert.equal(world.generatorVersion, 5);
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

test('generated localized Features each have exactly one ResourceOccurrence', () => {
  const world = buildWorld('one-occ-per-feature');
  const localizedFeatures = Object.values(world.features).filter(feature => !feature.regionalAccess);
  assert.ok(localizedFeatures.length > 0, 'World must contain localized Features');
  for (const feature of localizedFeatures) {
    assert.equal(
      feature.resourceOccurrences.length,
      1,
      `Localized Feature '${feature.id}' must have exactly one ResourceOccurrence, got ${feature.resourceOccurrences.length}`,
    );
  }
});

test('a localized Site can contain multiple distinct Features', () => {
  // Run several seeds to find at least one Site with multiple Features.
  const seeds = ['multi-feature-a', 'multi-feature-b', 'multi-feature-c', 'multi-feature-d', 'multi-feature-e'];
  let foundMultiFeatureSite = false;
  for (const seed of seeds) {
    const world = buildWorld(seed);
    const localizedSites = Object.values(world.sites).filter(site => site.siteKind === 'localized');
    if (localizedSites.some(site => site.featureIds.length > 1)) {
      foundMultiFeatureSite = true;
      break;
    }
  }
  assert.ok(foundMultiFeatureSite, 'At least one localized Site should contain multiple Features across tested seeds');
});

test('deterministic generation: same seed produces identical worlds under generator v5', () => {
  const world1 = buildWorld('determinism-v5');
  const world2 = buildWorld('determinism-v5');
  assert.deepStrictEqual(
    Object.keys(world1.features).sort(),
    Object.keys(world2.features).sort(),
    'Same seed must produce identical Feature IDs',
  );
  assert.deepStrictEqual(
    Object.keys(world1.resourceOccurrences).sort(),
    Object.keys(world2.resourceOccurrences).sort(),
    'Same seed must produce identical ResourceOccurrence IDs',
  );
});

test('every occurrence occurrenceFamily is physically compatible with its owning Feature type', () => {
  // Validate the family-based hard gate across many seeds.
  const seeds = ['compat-a', 'compat-b', 'compat-c', 'compat-d', 'compat-e'];
  for (const seed of seeds) {
    const world = buildWorld(seed);
    for (const [featureId, feature] of Object.entries(world.features)) {
      const allowedFamilies = FEATURE_ALLOWED_FAMILIES[feature.type];
      if (!allowedFamilies) continue; // regional-access or unknown type — skip
      for (const occurrenceId of feature.resourceOccurrences) {
        const occ = world.resourceOccurrences[occurrenceId];
        const resourceDef = getResourceDefinition(occ.resourceId);
        assert.ok(
          resourceDef,
          `Occurrence '${occurrenceId}' references unknown resource '${occ.resourceId}'`,
        );
        assert.ok(
          allowedFamilies.has(resourceDef.occurrenceFamily),
          `Feature '${featureId}' (${feature.type}) has incompatible occurrence '${occ.resourceId}' ` +
          `(family '${resourceDef.occurrenceFamily}' not in allowed families: ${[...allowedFamilies].join(', ')})`,
        );
      }
    }
  }
});

test('Outcrop features never receive aqueous-fluid occurrences regardless of planet moisture', () => {
  // Specifically prove that a water-rich planet does not bleed groundwater into Outcrops.
  const AQUEOUS_FAMILIES = new Set(['aqueous-fluid', 'hydrothermal-fluid']);
  const seeds = ['outcrop-aqueous-a', 'outcrop-aqueous-b', 'outcrop-aqueous-c',
                 'outcrop-aqueous-d', 'outcrop-aqueous-e', 'outcrop-aqueous-f'];
  for (const seed of seeds) {
    const world = buildWorld(seed);
    for (const [featureId, feature] of Object.entries(world.features)) {
      if (feature.type !== 'Outcrop') continue;
      for (const occurrenceId of feature.resourceOccurrences) {
        const occ = world.resourceOccurrences[occurrenceId];
        const resourceDef = getResourceDefinition(occ.resourceId);
        assert.ok(
          resourceDef && !AQUEOUS_FAMILIES.has(resourceDef.occurrenceFamily),
          `Outcrop '${featureId}' received aqueous resource '${occ.resourceId}' ` +
          `(family '${resourceDef?.occurrenceFamily}') — water-rich planet must not override family compatibility`,
        );
      }
    }
  }
});

test('Aquifer features never receive solid rock or ore occurrences', () => {
  const SOLID_FAMILIES = new Set(['rock-mass', 'ore-body', 'mineral-body', 'sediment', 'evaporite', 'ice-body']);
  const seeds = ['aquifer-solid-a', 'aquifer-solid-b', 'aquifer-solid-c'];
  for (const seed of seeds) {
    const world = buildWorld(seed);
    for (const [featureId, feature] of Object.entries(world.features)) {
      if (feature.type !== 'Aquifer') continue;
      for (const occurrenceId of feature.resourceOccurrences) {
        const occ = world.resourceOccurrences[occurrenceId];
        const resourceDef = getResourceDefinition(occ.resourceId);
        assert.ok(
          resourceDef && !SOLID_FAMILIES.has(resourceDef.occurrenceFamily),
          `Aquifer '${featureId}' received solid/non-fluid resource '${occ.resourceId}' ` +
          `(family '${resourceDef?.occurrenceFamily}')`,
        );
      }
    }
  }
});

test('Gas Reservoir features never receive solid or aqueous-fluid occurrences', () => {
  const NON_GAS_FAMILIES = new Set(['rock-mass', 'ore-body', 'mineral-body', 'sediment', 'evaporite',
                                    'ice-body', 'aqueous-fluid', 'hydrothermal-fluid', 'magma',
                                    'vegetation', 'organic-soil', 'atmosphere']);
  const seeds = ['gasreservoir-solid-a', 'gasreservoir-solid-b', 'gasreservoir-solid-c'];
  for (const seed of seeds) {
    const world = buildWorld(seed);
    for (const [featureId, feature] of Object.entries(world.features)) {
      if (feature.type !== 'Gas Reservoir') continue;
      for (const occurrenceId of feature.resourceOccurrences) {
        const occ = world.resourceOccurrences[occurrenceId];
        const resourceDef = getResourceDefinition(occ.resourceId);
        assert.ok(
          resourceDef && !NON_GAS_FAMILIES.has(resourceDef.occurrenceFamily),
          `Gas Reservoir '${featureId}' received non-gas resource '${occ.resourceId}' ` +
          `(family '${resourceDef?.occurrenceFamily}')`,
        );
      }
    }
  }
});

test('iron ore occurrence remains a single mixed-composition source body', () => {
  // Find an iron ore occurrence and verify it has mineral-mixture composition.
  let foundIronOre = false;
  for (let i = 0; i < 20 && !foundIronOre; i++) {
    const world = buildWorld(`iron-composition-${i}`);
    for (const occ of Object.values(world.resourceOccurrences)) {
      if (occ.resourceId !== 'iron-ore') continue;
      foundIronOre = true;
      // Must be exactly one occurrence per Feature (checked elsewhere); verify composition.
      assert.ok(
        occ.composition && typeof occ.composition === 'object',
        `iron-ore occurrence '${occ.id}' missing composition (should have mineral mixture)`,
      );
      const totalPercent = Object.values(occ.composition).reduce((a, b) => a + b, 0);
      assert.ok(
        Math.abs(totalPercent - 100) < 2,
        `iron-ore occurrence '${occ.id}' composition sums to ${totalPercent}% (expected ~100%)`,
      );
      // The source Feature should own exactly this one occurrence.
      const feature = world.features[occ.sourceId];
      assert.equal(
        feature.resourceOccurrences.length,
        1,
        `Iron ore Feature '${occ.sourceId}' must have exactly one occurrence`,
      );
    }
  }
  assert.ok(foundIronOre, 'No iron-ore occurrence found across 20 seeds — cannot verify composition invariant');
});
