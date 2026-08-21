/**
 * Thermal-property domain access. Prototype heat capacities are intentionally
 * present only for species consumed by the initial roasting vertical slice.
 */
export function specificHeatCapacityJPerKgKForSpecies(species) {
  return species?.physicalProperties?.thermal?.specificHeatCapacityJPerKgK ?? null;
}
