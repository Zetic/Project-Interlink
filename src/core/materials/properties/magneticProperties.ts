/**
 * Access to the magnetic property domain. Properties remain owned by species;
 * this module provides a stable domain boundary for future property resolvers.
 */
export function magneticResponseForSpecies(species) {
  return species?.physicalProperties?.magneticResponse ?? null;
}
