/** Schema and generator version constants. */

// Schema v7: Regions own Sites, Sites own Features, and all ResourceOccurrences are Feature-owned.
// Schema v8: MaterialBatch serialization requires canonical fraction-aware materialBody state.
// Schema v9: ore-body ResourceOccurrences carry mineralTexture and textured solid fractions preserve that geological lineage.
// Generator v5: deterministic iron-ore compositions use explicit quartz species in canonical occurrence composition.
// Generator v6: all generated solid resources use concrete species compositions with property coverage; placeholder gangue/oxide constituents are no longer emitted.
// Generator v7: ore-body occurrences generate deterministic mineral texture / characteristic liberation-size profiles.
export const SCHEMA_VERSION = 9;
export const GENERATOR_VERSION = 7;
