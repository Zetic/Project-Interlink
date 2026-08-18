/**
 * Player Knowledge State.
 *
 * Tracks what the player has discovered or measured about world entities.
 * Must never alter physical world state.
 *
 * createKnowledge(world)   — initialise from a world object.
 * discoverFeature(knowledge, featureId) — mark a feature as discovered.
 * isFeatureDiscovered(knowledge, featureId) — boolean check.
 */

import { componentsPercent } from '../materials/materialBatches.js';

/**
 * Possible discovery states for a feature (ordered by progression).
 * Only 'unknown' and 'discovered' are used by the current UI; the rest
 * are reserved for future surveying mechanics.
 */
export const DISCOVERY_STATES = /** @type {const} */ ({
  UNKNOWN: 'unknown',
  DISCOVERED: 'discovered',
  // Future states (not yet implemented):
  // ANOMALY_DETECTED: 'anomaly_detected',
  // IDENTIFIED: 'identified',
  // COMPOSITION_ESTIMATED: 'composition_estimated',
  // QUANTITY_ESTIMATED: 'quantity_estimated',
  // CHARACTERIZED: 'characterized',
});

/**
 * Build an initial knowledge state from a world object.
 * All features start as unknown.
 *
 * @param {object} world  - A world state created by createWorld().
 * @returns {object} knowledge
 */
export function createKnowledge(world) {
  const knowledge = {
    features: {},
    materialBatches: {},
    nextMaterialAnalysisOrdinal: 1,
  };

  for (const featureId of Object.keys(world.features)) {
    knowledge.features[featureId] = {
      discoveryState: DISCOVERY_STATES.UNKNOWN,
      surveyConfidence: 0,
      estimatedComposition: null,
      estimatedQuantity: null,
    };
  }

  return knowledge;
}

/**
 * Mark a feature as discovered.
 * Discovering a feature does not alter physical world state.
 *
 * @param {object} knowledge
 * @param {string} featureId
 */
export function discoverFeature(knowledge, featureId) {
  if (!knowledge.features[featureId]) {
    console.warn(`[Knowledge] Unknown featureId: ${featureId}`);
    return;
  }
  knowledge.features[featureId].discoveryState = DISCOVERY_STATES.DISCOVERED;
}

/**
 * Record explicit player analysis for a material batch.
 * Analysis updates knowledge state only; it does not modify world truth.
 *
 * @param {object} knowledge
 * @param {object} world
 * @param {string} batchId
 * @returns {object} analysis record
 */
export function analyzeMaterialBatch(knowledge, world, batchId) {
  const batch = world?.materialBatches?.[batchId];
  if (!batch) throw new Error(`Cannot analyze unknown material batch '${batchId}'`);

  if (!knowledge.materialBatches[batchId]) {
    knowledge.materialBatches[batchId] = {
      analysisState: 'analyzed',
      analysisOrdinal: knowledge.nextMaterialAnalysisOrdinal,
      sourceOccurrenceId: batch.sourceOccurrenceId,
      resourceId: batch.resourceId,
      totalMassKg: batch.totalMassKg,
      componentMassesKg: { ...batch.componentsKg },
      componentPercents: componentsPercent(batch.componentsKg),
    };
    knowledge.nextMaterialAnalysisOrdinal += 1;
  }

  return knowledge.materialBatches[batchId];
}

/**
 * @param {object} knowledge
 * @param {string} featureId
 * @returns {boolean}
 */
export function isFeatureDiscovered(knowledge, featureId) {
  return knowledge.features[featureId]?.discoveryState === DISCOVERY_STATES.DISCOVERED;
}

/**
 * @param {object} knowledge
 * @param {string} batchId
 * @returns {boolean}
 */
export function isBatchAnalyzed(knowledge, batchId) {
  return knowledge.materialBatches[batchId]?.analysisState === 'analyzed';
}

/**
 * Validate that all knowledge records reference valid world entities.
 *
 * @param {object} knowledge
 * @param {object} world
 * @returns {string[]} errors
 */
export function validateKnowledge(knowledge, world) {
  const errors = [];

  for (const featureId of Object.keys(knowledge.features)) {
    if (!world.features[featureId]) {
      errors.push(`Knowledge references unknown featureId '${featureId}'`);
    }
  }

  for (const batchId of Object.keys(knowledge.materialBatches ?? {})) {
    if (!world.materialBatches?.[batchId]) {
      errors.push(`Knowledge references unknown material batch '${batchId}'`);
    }
  }

  if (errors.length > 0) {
    console.error('[Interlink] Knowledge validation errors:', errors);
  }

  return errors;
}
