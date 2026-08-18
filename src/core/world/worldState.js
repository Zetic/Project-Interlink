/**
 * World State — the root serialisable simulation object.
 *
 * createWorld(seed) returns a plain JS object that owns all generated
 * simulation entities.  It is the single source of physical truth;
 * player knowledge and UI state are kept separately.
 *
 * Shape:
 * {
 *   schemaVersion,
 *   generatorVersion,
 *   seed,
 *   planetId,          // convenience reference to the single active planet
 *   planets: {},
 *   regions: {},       // keyed by regionId
 *   features: {},      // keyed by featureId
 *   resourceOccurrences: {},  // keyed by occurrenceId
 *   materialBatches: {},       // keyed by batchId
 *   processResults: {},        // keyed by processRunId
 * }
 */

import { SCHEMA_VERSION, GENERATOR_VERSION } from './versions.js';
import { generatePlanet } from '../../generator/generatePlanet.js';

/**
 * Generate and return a new world state from the given seed string.
 *
 * @param {string} seed
 * @returns {object} world
 */
export function createWorld(seed) {
  const seedStr = String(seed ?? 'default-seed');

  // generatePlanet returns a self-contained planet object; we then lift its
  // nested regions, features, and resource occurrences into flat maps.
  const planet = generatePlanet(seedStr);

  const world = {
    schemaVersion: SCHEMA_VERSION,
    generatorVersion: GENERATOR_VERSION,
    seed: seedStr,

    planetId: planet.id,
    planets: {},
    regions: {},
    features: {},
    resourceOccurrences: {},
    materialBatches: {},
    processResults: {},
    nextMaterialBatchOrdinal: 1,
    nextProcessRunOrdinal: 1,
  };

  // Lift regions out of the planet array into the flat map
  const regionIds = [];
  for (const region of planet.regions) {
    const featureIds = [];

    for (const feature of region.features) {
      // Lift resource occurrences from the feature into the flat map
      const occurrenceIds = [];
      for (const occ of feature.resourceOccurrences) {
        world.resourceOccurrences[occ.id] = occ;
        occurrenceIds.push(occ.id);
      }

      // Store a flat feature (without the nested occurrences array; reference by IDs)
      world.features[feature.id] = {
        ...feature,
        resourceOccurrences: occurrenceIds,
      };
      featureIds.push(feature.id);
    }

    // Lift background resource occurrences into the flat map
    const bgOccurrenceIds = [];
    for (const occ of region.backgroundResourceOccurrences) {
      world.resourceOccurrences[occ.id] = occ;
      bgOccurrenceIds.push(occ.id);
    }

    // Store a flat region (without nested features/occurrence arrays; reference by IDs)
    world.regions[region.id] = {
      ...region,
      features: featureIds,
      backgroundResourceOccurrences: bgOccurrenceIds,
    };
    regionIds.push(region.id);
  }

  // Store a flat planet (without nested regions array)
  world.planets[planet.id] = {
    ...planet,
    regions: regionIds,
  };

  validateWorld(world);
  return world;
}

/**
 * Validate cross-references and invariants within a world state.
 * Logs errors to the console during development.
 *
 * @param {object} world
 * @returns {string[]} list of error messages (empty if valid)
 */
export function validateWorld(world) {
  const errors = [];

  // planetId must exist
  if (!world.planets[world.planetId]) {
    errors.push(`planetId '${world.planetId}' not in planets map`);
  }

  // Region references from planet
  const planet = world.planets[world.planetId];
  if (planet) {
    for (const rid of planet.regions) {
      if (!world.regions[rid]) {
        errors.push(`Planet references unknown region '${rid}'`);
      }
    }
  }

  // Feature references from regions + back-reference regionId
  for (const [rid, region] of Object.entries(world.regions)) {
    for (const fid of region.features) {
      if (!world.features[fid]) {
        errors.push(`Region '${rid}' references unknown feature '${fid}'`);
      } else {
        const f = world.features[fid];
        if (f.regionId !== rid) {
          errors.push(`Feature '${fid}' regionId '${f.regionId}' does not match parent region '${rid}'`);
        }
        // Physical features must not carry player-discovery state
        if ('discovered' in f) {
          errors.push(`Feature '${fid}' contains 'discovered' — move to knowledgeState`);
        }
      }
    }
  }

  // Occurrence references from features
  for (const [fid, feature] of Object.entries(world.features)) {
    for (const oid of feature.resourceOccurrences) {
      if (!world.resourceOccurrences[oid]) {
        errors.push(`Feature '${fid}' references unknown occurrence '${oid}'`);
      }
    }
  }

  // Background occurrence references from regions
  for (const [rid, region] of Object.entries(world.regions)) {
    for (const oid of (region.backgroundResourceOccurrences ?? [])) {
      if (!world.resourceOccurrences[oid]) {
        errors.push(`Region '${rid}' references unknown background occurrence '${oid}'`);
      }
    }
  }

  // Material batch references and physical invariants
  for (const [bid, batch] of Object.entries(world.materialBatches ?? {})) {
    if (batch.sourceOccurrenceId && !world.resourceOccurrences[batch.sourceOccurrenceId]) {
      errors.push(`Material batch '${bid}' references unknown source occurrence '${batch.sourceOccurrenceId}'`);
    }

    if (!batch.provenance || typeof batch.provenance !== 'object') {
      errors.push(`Material batch '${bid}' is missing provenance object`);
    } else {
      for (const occurrenceId of (batch.provenance.sourceOccurrenceIds ?? [])) {
        if (!world.resourceOccurrences[occurrenceId]) {
          errors.push(`Material batch '${bid}' provenance references unknown source occurrence '${occurrenceId}'`);
        }
      }
      for (const sourceBatchId of (batch.provenance.sourceBatchIds ?? [])) {
        if (!world.materialBatches[sourceBatchId]) {
          errors.push(`Material batch '${bid}' provenance references unknown source batch '${sourceBatchId}'`);
        }
      }
      if (batch.provenance.createdByProcessRunId && !world.processResults?.[batch.provenance.createdByProcessRunId]) {
        errors.push(
          `Material batch '${bid}' provenance references unknown process run '${batch.provenance.createdByProcessRunId}'`
        );
      }
    }

    if (typeof batch.particleSizeMm !== 'number' || Number.isNaN(batch.particleSizeMm) || !Number.isFinite(batch.particleSizeMm) || batch.particleSizeMm <= 0) {
      errors.push(`Material batch '${bid}' has invalid particleSizeMm '${batch.particleSizeMm}'`);
    }

    if (!batch.componentsKg || typeof batch.componentsKg !== 'object') {
      errors.push(`Material batch '${bid}' is missing componentsKg`);
      continue;
    }

    const componentEntries = Object.entries(batch.componentsKg);
    let massSum = 0;
    for (const [componentId, massKg] of componentEntries) {
      if (typeof massKg !== 'number' || Number.isNaN(massKg) || !Number.isFinite(massKg)) {
        errors.push(`Material batch '${bid}' component '${componentId}' has invalid mass '${massKg}'`);
      }
      if (massKg < 0) {
        errors.push(`Material batch '${bid}' component '${componentId}' has negative mass '${massKg}'`);
      }
      massSum += massKg;
    }

    if (componentEntries.length === 0) {
      errors.push(`Material batch '${bid}' has no components`);
    }

    if (typeof batch.totalMassKg !== 'number' || Number.isNaN(batch.totalMassKg) || !Number.isFinite(batch.totalMassKg)) {
      errors.push(`Material batch '${bid}' has invalid totalMassKg '${batch.totalMassKg}'`);
    } else if (Math.abs(batch.totalMassKg - massSum) > 1e-6) {
      errors.push(`Material batch '${bid}' totalMassKg '${batch.totalMassKg}' does not match component sum '${massSum}'`);
    }
  }

  // Process result references
  for (const [runId, result] of Object.entries(world.processResults ?? {})) {
    for (const inputBinding of (result.inputBindings ?? [])) {
      const inputBatchId = inputBinding?.batchId;
      if (!inputBinding?.inputId || typeof inputBinding.inputId !== 'string') {
        errors.push(`Process result '${runId}' has invalid input binding id`);
      }
      if (!world.materialBatches[inputBatchId]) {
        errors.push(`Process result '${runId}' references unknown input batch '${inputBatchId}'`);
      }
    }
    for (const output of (result.outputBatches ?? [])) {
      if (!world.materialBatches[output.batchId]) {
        errors.push(`Process result '${runId}' references unknown output batch '${output.batchId}'`);
      }
    }
  }

  if (errors.length > 0) {
    console.error('[Interlink] World validation errors:', errors);
  }

  return errors;
}
