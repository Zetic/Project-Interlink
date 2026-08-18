/**
 * World State — the root serialisable simulation object.
 *
 * createWorld(seed) returns a plain JS object that owns all generated
 * simulation entities. It is the single source of physical truth;
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
import { getProcessDefinition } from '../processes/processDefinitions.js';

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

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function validateReferenceIdArray(value, label, referenceMap, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`);
    return;
  }

  const seen = new Set();
  for (const id of value) {
    if (!isNonEmptyString(id)) {
      errors.push(`${label} contains an invalid id`);
      continue;
    }
    if (seen.has(id)) {
      errors.push(`${label} contains duplicate id '${id}'`);
      continue;
    }
    seen.add(id);

    if (!referenceMap[id]) {
      errors.push(`${label} references unknown id '${id}'`);
    }
  }
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

    if (!batch.provenance || typeof batch.provenance !== 'object' || Array.isArray(batch.provenance)) {
      errors.push(`Material batch '${bid}' is missing a valid provenance object`);
    } else {
      validateReferenceIdArray(
        batch.provenance.sourceOccurrenceIds,
        `Material batch '${bid}' provenance.sourceOccurrenceIds`,
        world.resourceOccurrences,
        errors
      );
      validateReferenceIdArray(
        batch.provenance.sourceBatchIds,
        `Material batch '${bid}' provenance.sourceBatchIds`,
        world.materialBatches,
        errors
      );

      const createdByProcessRunId = batch.provenance.createdByProcessRunId;
      if (createdByProcessRunId != null) {
        if (!isNonEmptyString(createdByProcessRunId)) {
          errors.push(`Material batch '${bid}' provenance.createdByProcessRunId must be a non-empty string or null`);
        } else if (!world.processResults?.[createdByProcessRunId]) {
          errors.push(
            `Material batch '${bid}' provenance references unknown process run '${createdByProcessRunId}'`
          );
        }
      }
    }

    if (
      typeof batch.particleSizeMm !== 'number' ||
      Number.isNaN(batch.particleSizeMm) ||
      !Number.isFinite(batch.particleSizeMm) ||
      batch.particleSizeMm <= 0
    ) {
      errors.push(`Material batch '${bid}' has invalid particleSizeMm '${batch.particleSizeMm}'`);
    }

    if (!batch.componentsKg || typeof batch.componentsKg !== 'object' || Array.isArray(batch.componentsKg)) {
      errors.push(`Material batch '${bid}' is missing componentsKg`);
      continue;
    }

    const componentEntries = Object.entries(batch.componentsKg);
    let massSum = 0;
    for (const [componentId, massKg] of componentEntries) {
      if (typeof massKg !== 'number' || Number.isNaN(massKg) || !Number.isFinite(massKg)) {
        errors.push(`Material batch '${bid}' component '${componentId}' has invalid mass '${massKg}'`);
        continue;
      }
      if (massKg < 0) {
        errors.push(`Material batch '${bid}' component '${componentId}' has negative mass '${massKg}'`);
      }
      massSum += massKg;
    }

    if (componentEntries.length === 0) {
      errors.push(`Material batch '${bid}' has no components`);
    }

    if (
      typeof batch.totalMassKg !== 'number' ||
      Number.isNaN(batch.totalMassKg) ||
      !Number.isFinite(batch.totalMassKg)
    ) {
      errors.push(`Material batch '${bid}' has invalid totalMassKg '${batch.totalMassKg}'`);
    } else if (Math.abs(batch.totalMassKg - massSum) > 1e-6) {
      errors.push(
        `Material batch '${bid}' totalMassKg '${batch.totalMassKg}' does not match component sum '${massSum}'`
      );
    }
  }

  // Process result references and port contracts
  for (const [runId, result] of Object.entries(world.processResults ?? {})) {
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      errors.push(`Process result '${runId}' must be an object`);
      continue;
    }

    const processDefinition = isNonEmptyString(result.processId)
      ? getProcessDefinition(result.processId)
      : null;
    if (!isNonEmptyString(result.processId)) {
      errors.push(`Process result '${runId}' has invalid processId`);
    } else if (!processDefinition) {
      errors.push(`Process result '${runId}' references unknown process '${result.processId}'`);
    }

    const expectedInputIds = new Set((processDefinition?.inputs ?? []).map(input => input.id));
    const seenInputIds = new Set();
    const seenInputBatchIds = new Set();

    if (!Array.isArray(result.inputBindings)) {
      errors.push(`Process result '${runId}' inputBindings must be an array`);
    } else {
      for (const inputBinding of result.inputBindings) {
        if (!inputBinding || typeof inputBinding !== 'object' || Array.isArray(inputBinding)) {
          errors.push(`Process result '${runId}' has invalid input binding`);
          continue;
        }

        const { inputId, batchId } = inputBinding;
        if (!isNonEmptyString(inputId)) {
          errors.push(`Process result '${runId}' has invalid input binding id`);
        } else {
          if (seenInputIds.has(inputId)) {
            errors.push(`Process result '${runId}' has duplicate input binding '${inputId}'`);
          }
          seenInputIds.add(inputId);
          if (processDefinition && !expectedInputIds.has(inputId)) {
            errors.push(`Process result '${runId}' has unexpected input binding '${inputId}'`);
          }
        }

        if (!isNonEmptyString(batchId)) {
          errors.push(`Process result '${runId}' has invalid input batch id`);
        } else {
          if (seenInputBatchIds.has(batchId)) {
            errors.push(`Process result '${runId}' binds input batch '${batchId}' more than once`);
          }
          seenInputBatchIds.add(batchId);
          if (!world.materialBatches[batchId]) {
            errors.push(`Process result '${runId}' references unknown input batch '${batchId}'`);
          }
        }
      }
    }

    if (processDefinition) {
      for (const expectedInputId of expectedInputIds) {
        if (!seenInputIds.has(expectedInputId)) {
          errors.push(`Process result '${runId}' is missing required input binding '${expectedInputId}'`);
        }
      }
    }

    const expectedOutputIds = new Set((processDefinition?.outputs ?? []).map(output => output.id));
    const seenOutputIds = new Set();
    const seenOutputBatchIds = new Set();

    if (!Array.isArray(result.outputBatches)) {
      errors.push(`Process result '${runId}' outputBatches must be an array`);
    } else {
      for (const output of result.outputBatches) {
        if (!output || typeof output !== 'object' || Array.isArray(output)) {
          errors.push(`Process result '${runId}' has invalid output binding`);
          continue;
        }

        const { outputId, batchId } = output;
        if (!isNonEmptyString(outputId)) {
          errors.push(`Process result '${runId}' has invalid output binding id`);
        } else {
          if (seenOutputIds.has(outputId)) {
            errors.push(`Process result '${runId}' has duplicate output binding '${outputId}'`);
          }
          seenOutputIds.add(outputId);
          if (processDefinition && !expectedOutputIds.has(outputId)) {
            errors.push(`Process result '${runId}' has unexpected output binding '${outputId}'`);
          }
        }

        if (!isNonEmptyString(batchId)) {
          errors.push(`Process result '${runId}' has invalid output batch id`);
        } else {
          if (seenOutputBatchIds.has(batchId)) {
            errors.push(`Process result '${runId}' references output batch '${batchId}' more than once`);
          }
          seenOutputBatchIds.add(batchId);
          if (!world.materialBatches[batchId]) {
            errors.push(`Process result '${runId}' references unknown output batch '${batchId}'`);
          }
        }
      }
    }

    if (processDefinition) {
      for (const expectedOutputId of expectedOutputIds) {
        if (!seenOutputIds.has(expectedOutputId)) {
          errors.push(`Process result '${runId}' is missing required output binding '${expectedOutputId}'`);
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error('[Interlink] World validation errors:', errors);
  }

  return errors;
}
