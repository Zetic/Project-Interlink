/**
 * Tests: Numeric simulation invariants and feature compatibility constraints.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld as createWorld } from '../src/generator/generateWorld.js';
import { resources } from '../src/generator/generateResources.js';
import { FEATURE_ALLOWED_FAMILIES, OCCURRENCE_FAMILY_VALUES } from '../src/generator/generateFeatures.js';

const TOLERANCE = 1.5; // percentage points for composition sums

function buildWorld(seed = 'invariants-test') {
  return createWorld(seed);
}

function checkNoNaNOrInfinity(obj, path = '') {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const p = path ? `${path}.${k}` : k;
    if (typeof v === 'number') {
      assert.ok(!isNaN(v), `NaN at ${p}`);
      assert.ok(isFinite(v), `Infinity at ${p}`);
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      checkNoNaNOrInfinity(v, p);
    }
  }
}

test('bulk composition sums to ~100%', () => {
  const world = buildWorld();
  const planet = world.planets[world.planetId];
  const sum = Object.values(planet.bulkComposition).reduce((a, b) => a + b, 0);
  assert.ok(
    Math.abs(sum - 100) <= TOLERANCE,
    `Bulk composition sums to ${sum}, expected ~100`
  );
});

test('atmospheric composition sums to ~100% when atmosphere exists', () => {
  // Try a few seeds to find one with atmosphere
  let found = false;
  for (let i = 0; i < 20; i++) {
    const world = createWorld(`atmo-comp-test-${i}`);
    const planet = world.planets[world.planetId];
    if (planet.atmosphere?.pressureBar > 0) {
      const sum = Object.values(planet.atmosphere.composition).reduce((a, b) => a + b, 0);
      assert.ok(
        Math.abs(sum - 100) <= TOLERANCE,
        `Atmospheric composition sums to ${sum}, expected ~100 (seed atmo-comp-test-${i})`
      );
      found = true;
      break;
    }
  }
  // If no atmosphere found (unlikely), just pass
  if (!found) {
    // noop — extremely rare, all tested planets were airless
  }
});

test('core + deep interior + envelope mass fractions sum to ~1', () => {
  const world = buildWorld();
  const planet = world.planets[world.planetId];
  const sum = planet.coreMassFraction + planet.deepInteriorMassFraction + planet.envelopeMassFraction;
  assert.ok(
    Math.abs(sum - 1) <= 0.01,
    `Mass fractions sum to ${sum}, expected ~1`
  );
});

test('region area percentages sum to ~100%', () => {
  const world = buildWorld();
  const planet = world.planets[world.planetId];
  const sum = planet.regions.map(rid => world.regions[rid].areaPercent).reduce((a, b) => a + b, 0);
  assert.ok(
    Math.abs(sum - 100) <= TOLERANCE,
    `Region areas sum to ${sum}, expected ~100`
  );
});

test('no NaN or Infinity in planet physical fields', () => {
  const world = buildWorld('nan-check');
  const planet = world.planets[world.planetId];
  checkNoNaNOrInfinity(planet);
});

test('physical quantities that cannot be negative are not negative', () => {
  const world = buildWorld('non-negative-test');
  const planet = world.planets[world.planetId];
  const nonNeg = ['massEarth', 'radiusEarth', 'gravityG', 'escapeVelocityKmS', 'meanDensity',
    'equilibriumTemperatureK', 'meanTemperatureK'];
  for (const field of nonNeg) {
    assert.ok(planet[field] >= 0, `${field} should be non-negative, got ${planet[field]}`);
  }
});

test('feature resource occurrence compositions that are complete mixtures sum to ~100%', () => {
  const world = buildWorld('composition-sum');
  for (const occ of Object.values(world.resourceOccurrences)) {
    if (!occ.composition || typeof occ.composition !== 'object') continue;
    const sum = Object.values(occ.composition).reduce((a, b) => a + b, 0);
    assert.ok(
      Math.abs(sum - 100) <= TOLERANCE,
      `Occurrence '${occ.id}' composition sums to ${sum}, expected ~100`
    );
  }
});

// --- Feature compatibility invariants ---

const AQUIFER_ALLOWED_STATES = new Set(['Liquid', 'Mixed']);
const GAS_RESERVOIR_ALLOWED_STATES = new Set(['Gaseous', 'Mixed']);
const MAGMA_CHAMBER_ALLOWED_STATES = new Set(['Liquid']);
const ICE_BODY_ALLOWED_STATES = new Set(['Solid']);

const AQUIFER_ALLOWED_RESOURCES = new Set(['groundwater', 'brine', 'fresh-water', 'saline-water', 'lithium-brine', 'ammonia-water-solution']);
const GAS_RESERVOIR_ALLOWED_RESOURCES = new Set(['natural-gas']);
const MAGMA_CHAMBER_ALLOWED_RESOURCES = new Set(['magma']);
const ICE_BODY_ALLOWED_RESOURCES = new Set(['water-ice', 'gas-clathrate', 'permafrost']);

const BIO_RESOURCE_IDS = new Set(['wood', 'plant-biomass', 'peat', 'organic-soil', 'coal', 'guano', 'latex', 'reef-material']);

test('Aquifer features have fluid-compatible physical state', () => {
  const world = buildWorld('aquifer-state');
  for (const feature of Object.values(world.features)) {
    if (feature.type !== 'Aquifer') continue;
    assert.ok(
      AQUIFER_ALLOWED_STATES.has(feature.physicalState),
      `Aquifer '${feature.id}' has invalid physicalState '${feature.physicalState}'`
    );
  }
});

test('Aquifer features do not contain incompatible resources (e.g. magma)', () => {
  const world = buildWorld('aquifer-resources');
  for (const feature of Object.values(world.features)) {
    if (feature.type !== 'Aquifer') continue;
    for (const oid of feature.resourceOccurrences) {
      const occ = world.resourceOccurrences[oid];
      assert.ok(
        AQUIFER_ALLOWED_RESOURCES.has(occ.resourceId),
        `Aquifer '${feature.id}' has incompatible resource '${occ.resourceId}'`
      );
    }
  }
});

test('Gas Reservoir features have gaseous-compatible physical state', () => {
  const world = buildWorld('gasreservoir-state');
  for (const feature of Object.values(world.features)) {
    if (feature.type !== 'Gas Reservoir') continue;
    assert.ok(
      GAS_RESERVOIR_ALLOWED_STATES.has(feature.physicalState),
      `Gas Reservoir '${feature.id}' has invalid physicalState '${feature.physicalState}'`
    );
  }
});

test('Gas Reservoir features contain gas-compatible resources', () => {
  const world = buildWorld('gasreservoir-resources');
  for (const feature of Object.values(world.features)) {
    if (feature.type !== 'Gas Reservoir') continue;
    for (const oid of feature.resourceOccurrences) {
      const occ = world.resourceOccurrences[oid];
      assert.ok(
        GAS_RESERVOIR_ALLOWED_RESOURCES.has(occ.resourceId),
        `Gas Reservoir '${feature.id}' has incompatible resource '${occ.resourceId}'`
      );
    }
  }
});

test('Magma Chamber features have liquid physical state', () => {
  const world = buildWorld('magma-state');
  for (const feature of Object.values(world.features)) {
    if (feature.type !== 'Magma Chamber') continue;
    assert.ok(
      MAGMA_CHAMBER_ALLOWED_STATES.has(feature.physicalState),
      `Magma Chamber '${feature.id}' has invalid physicalState '${feature.physicalState}'`
    );
  }
});

test('Magma Chamber features contain magma-compatible resources', () => {
  const world = buildWorld('magma-resources');
  for (const feature of Object.values(world.features)) {
    if (feature.type !== 'Magma Chamber') continue;
    for (const oid of feature.resourceOccurrences) {
      const occ = world.resourceOccurrences[oid];
      assert.ok(
        MAGMA_CHAMBER_ALLOWED_RESOURCES.has(occ.resourceId),
        `Magma Chamber '${feature.id}' has incompatible resource '${occ.resourceId}'`
      );
    }
  }
});

test('Ice Body features have solid physical state', () => {
  const world = buildWorld('icebody-state');
  for (const feature of Object.values(world.features)) {
    if (feature.type !== 'Ice Body') continue;
    assert.ok(
      ICE_BODY_ALLOWED_STATES.has(feature.physicalState),
      `Ice Body '${feature.id}' has invalid physicalState '${feature.physicalState}'`
    );
  }
});

test('Ice Body features contain frozen-volatile-compatible resources', () => {
  const world = buildWorld('icebody-resources');
  for (const feature of Object.values(world.features)) {
    if (feature.type !== 'Ice Body') continue;
    for (const oid of feature.resourceOccurrences) {
      const occ = world.resourceOccurrences[oid];
      assert.ok(
        ICE_BODY_ALLOWED_RESOURCES.has(occ.resourceId),
        `Ice Body '${feature.id}' has incompatible resource '${occ.resourceId}'`
      );
    }
  }
});

test('biological resources do not appear without biosphere', () => {
  // Try several seeds to find a planet without biosphere
  for (let i = 0; i < 20; i++) {
    const world = createWorld(`bio-gate-${i}`);
    const planet = world.planets[world.planetId];
    if (planet.biospherePresent) continue;

    for (const occ of Object.values(world.resourceOccurrences)) {
      assert.ok(
        !BIO_RESOURCE_IDS.has(occ.resourceId),
        `Biological resource '${occ.resourceId}' found on planet without biosphere (seed bio-gate-${i})`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Catalog-integrity tests — static checks on the resource/feature definitions
// ---------------------------------------------------------------------------

test('every ResourceDefinition has an occurrenceFamily field', () => {
  for (const resource of resources) {
    assert.ok(
      typeof resource.occurrenceFamily === 'string' && resource.occurrenceFamily.length > 0,
      `Resource '${resource.id}' is missing occurrenceFamily`
    );
  }
});

test('every ResourceDefinition occurrenceFamily is in the canonical registry', () => {
  for (const resource of resources) {
    assert.ok(
      OCCURRENCE_FAMILY_VALUES.has(resource.occurrenceFamily),
      `Resource '${resource.id}' has unregistered occurrenceFamily '${resource.occurrenceFamily}'`
    );
  }
});

test('every family referenced by FEATURE_ALLOWED_FAMILIES is in the canonical registry', () => {
  for (const [featureType, familySet] of Object.entries(FEATURE_ALLOWED_FAMILIES)) {
    for (const family of familySet) {
      assert.ok(
        OCCURRENCE_FAMILY_VALUES.has(family),
        `FEATURE_ALLOWED_FAMILIES['${featureType}'] references unregistered family '${family}'`
      );
    }
  }
});

test('every localized/both ResourceDefinition is reachable by at least one localized Feature type', () => {
  // Build a map from family → set of Feature types that accept it.
  const familyToFeatures = new Map();
  for (const [featureType, familySet] of Object.entries(FEATURE_ALLOWED_FAMILIES)) {
    for (const family of familySet) {
      if (!familyToFeatures.has(family)) familyToFeatures.set(family, new Set());
      familyToFeatures.get(family).add(featureType);
    }
  }

  const LOCALIZED_DISTRIBUTIONS = new Set(['localized', 'both']);
  const unreachable = [];
  for (const resource of resources) {
    if (!LOCALIZED_DISTRIBUTIONS.has(resource.distribution)) continue;
    if (!familyToFeatures.has(resource.occurrenceFamily)) {
      unreachable.push(`${resource.id} (family: ${resource.occurrenceFamily})`);
    }
  }
  assert.deepEqual(
    unreachable,
    [],
    `Localized resources with no compatible Feature type (silent orphans): ${unreachable.join(', ')}`
  );
});
