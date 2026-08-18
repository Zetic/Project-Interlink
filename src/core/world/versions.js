/**
 * Schema and generator version constants.
 *
 * SCHEMA_VERSION   - describes the shape of serialised world-state data.
 * GENERATOR_VERSION - describes the procedural rules producing deterministic
 *                     world content. Bump when generation logic changes in a
 *                     way that intentionally alters outputs for the same seed.
 */

// Schema v4: adds material provenance/particle size and explicit process input bindings
// Generator v2: feature physical states and resources are constrained by feature type
export const SCHEMA_VERSION = 4;
export const GENERATOR_VERSION = 2;
