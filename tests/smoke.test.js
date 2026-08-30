/**
 * Tests: Multi-seed smoke test.
 * Generates 250 deterministic worlds and verifies all major validators pass.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/generator/generateWorld.js';
import { validateWorld } from '../src/core/world/validation/worldValidation.js';
import { createKnowledge, validateKnowledge } from '../src/core/world/knowledgeState.js';

const SEED_COUNT = 250;
const TOLERANCE = 1.5;

const AQUIFER_STATES = new Set(['Liquid', 'Mixed']);
const GAS_RESERVOIR_STATES = new Set(['Gaseous', 'Mixed']);
const MAGMA_CHAMBER_STATES = new Set(['Liquid']);
const ICE_BODY_STATES = new Set(['Solid']);

const AQUIFER_RESOURCES = new Set(['groundwater', 'brine', 'fresh-water', 'saline-water', 'lithium-brine', 'ammonia-water-solution']);
const GAS_RESERVOIR_RESOURCES = new Set(['natural-gas']);
const MAGMA_CHAMBER_RESOURCES = new Set(['magma']);
const ICE_BODY_RESOURCES = new Set(['water-ice', 'gas-clathrate', 'permafrost']);
const BIO_IDS = new Set(['wood', 'plant-biomass', 'peat', 'organic-soil', 'coal', 'guano', 'latex', 'reef-material']);

function validateWorldInvariants(world, seed) {
  const errs = [];

  const planet = world.planets[world.planetId];

  // Bulk composition ~100
  const bulkSum = Object.values(planet.bulkComposition).reduce((a, b) => a + b, 0);
  if (Math.abs(bulkSum - 100) > TOLERANCE) {
    errs.push(`[${seed}] Bulk composition sums to ${bulkSum}`);
  }

  // Atmosphere composition ~100 when present
  if ((planet.atmosphere?.pressureBar ?? 0) > 0) {
    const atmoSum = Object.values(planet.atmosphere.composition).reduce((a, b) => a + b, 0);
    if (Math.abs(atmoSum - 100) > TOLERANCE) {
      errs.push(`[${seed}] Atmosphere composition sums to ${atmoSum}`);
    }
  }

  // Mass fractions ~1
  const fracSum = planet.coreMassFraction + planet.deepInteriorMassFraction + planet.envelopeMassFraction;
  if (Math.abs(fracSum - 1) > 0.01) {
    errs.push(`[${seed}] Mass fractions sum to ${fracSum}`);
  }

  // Region areas ~100
  const areaSum = planet.regions.map(rid => world.regions[rid].areaPercent).reduce((a, b) => a + b, 0);
  if (Math.abs(areaSum - 100) > TOLERANCE) {
    errs.push(`[${seed}] Region areas sum to ${areaSum}`);
  }

  // No NaN or Infinity in numeric planet fields
  function scanNaN(obj, path) {
    for (const [k, v] of Object.entries(obj ?? {})) {
      const p = `${path}.${k}`;
      if (typeof v === 'number') {
        if (isNaN(v)) errs.push(`[${seed}] NaN at ${p}`);
        if (!isFinite(v)) errs.push(`[${seed}] Infinity at ${p}`);
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        scanNaN(v, p);
      }
    }
  }
  scanNaN(planet, 'planet');

  // Non-negative physical quantities
  for (const f of ['massEarth', 'radiusEarth', 'gravityG', 'escapeVelocityKmS', 'meanDensity',
    'equilibriumTemperatureK', 'meanTemperatureK']) {
    if (planet[f] < 0) errs.push(`[${seed}] Negative ${f}: ${planet[f]}`);
  }

  // Feature composition sums
  for (const occ of Object.values(world.resourceOccurrences)) {
    if (!occ.composition || typeof occ.composition !== 'object') continue;
    const s = Object.values(occ.composition).reduce((a, b) => a + b, 0);
    if (Math.abs(s - 100) > TOLERANCE) {
      errs.push(`[${seed}] Occurrence '${occ.id}' composition sums to ${s}`);
    }
  }

  // Feature compatibility
  for (const feature of Object.values(world.features)) {
    const checkState = (allowed) => {
      if (!allowed.has(feature.physicalState)) {
        errs.push(`[${seed}] ${feature.type} '${feature.id}' has invalid physicalState '${feature.physicalState}'`);
      }
    };
    const checkResource = (allowed) => {
      for (const oid of feature.resourceOccurrences) {
        const occ = world.resourceOccurrences[oid];
        if (occ && !allowed.has(occ.resourceId)) {
          errs.push(`[${seed}] ${feature.type} '${feature.id}' has incompatible resource '${occ.resourceId}'`);
        }
      }
    };

    switch (feature.type) {
      case 'Aquifer':       checkState(AQUIFER_STATES);       checkResource(AQUIFER_RESOURCES); break;
      case 'Gas Reservoir': checkState(GAS_RESERVOIR_STATES); checkResource(GAS_RESERVOIR_RESOURCES); break;
      case 'Magma Chamber': checkState(MAGMA_CHAMBER_STATES); checkResource(MAGMA_CHAMBER_RESOURCES); break;
      case 'Ice Body':      checkState(ICE_BODY_STATES);      checkResource(ICE_BODY_RESOURCES); break;
    }
  }

  // Biological resources only when biosphere present
  if (!planet.biospherePresent) {
    for (const occ of Object.values(world.resourceOccurrences)) {
      if (BIO_IDS.has(occ.resourceId)) {
        errs.push(`[${seed}] Biological resource '${occ.resourceId}' without biosphere`);
      }
    }
  }

  return errs;
}

test(`smoke test: ${SEED_COUNT} seeds pass all validators and invariants`, () => {
  const allErrors = [];

  for (let i = 0; i < SEED_COUNT; i++) {
    const seed = `test-world-${i}`;
    const world = createWorld(seed);

    // validateWorld cross-references
    const worldErrors = validateWorld(world);
    for (const e of worldErrors) allErrors.push(`[${seed}] ${e}`);

    // validateKnowledge
    const knowledge = createKnowledge(world);
    const knowledgeErrors = validateKnowledge(knowledge, world);
    for (const e of knowledgeErrors) allErrors.push(`[${seed}] ${e}`);

    // Numeric invariants + feature compatibility
    const invariantErrors = validateWorldInvariants(world, seed);
    allErrors.push(...invariantErrors);
  }

  assert.deepStrictEqual(
    allErrors,
    [],
    `${allErrors.length} error(s) across ${SEED_COUNT} seeds:\n${allErrors.slice(0, 20).join('\n')}`
  );
});

test(`smoke test: first 10 seeds are deterministic`, () => {
  // Verify a sample from the seed set re-generates identically
  for (let i = 0; i < 10; i++) {
    const seed = `test-world-${i}`;
    const a = createWorld(seed);
    const b = createWorld(seed);
    assert.deepStrictEqual(a, b, `Seed '${seed}' produced non-deterministic results`);
  }
});
