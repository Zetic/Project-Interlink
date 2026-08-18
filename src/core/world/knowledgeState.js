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
 * @param {object} knowledge
 * @param {string} featureId
 * @returns {boolean}
 */
export function isFeatureDiscovered(knowledge, featureId) {
  return knowledge.features[featureId]?.discoveryState === DISCOVERY_STATES.DISCOVERED;
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

  if (errors.length > 0) {
    console.error('[Interlink] Knowledge validation errors:', errors);
  }

  return errors;
}
