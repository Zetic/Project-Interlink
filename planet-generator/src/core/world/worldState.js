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

    // Store a flat region (without nested features array)
    world.regions[region.id] = {
      ...region,
      features: featureIds,
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

  if (errors.length > 0) {
    console.error('[Interlink] World validation errors:', errors);
  }

  return errors;
}
