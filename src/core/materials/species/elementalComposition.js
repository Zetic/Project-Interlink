import { requireMaterialSpecies } from './materialSpecies.js';

export const ATOMIC_MASSES_KG_PER_MOL = Object.freeze({
  Fe: 0.055845,
  H: 0.001008,
  O: 0.015999,
  Si: 0.028085,
});

export function elementalMassesForSpeciesMass(speciesId, massKg) {
  if (!Number.isFinite(massKg) || massKg < 0) {
    throw new Error(`Species '${speciesId}' mass must be finite and non-negative`);
  }
  const species = requireMaterialSpecies(speciesId);
  const chemistry = species.chemistry;
  if (!chemistry) throw new Error(`Chemical composition missing for species '${speciesId}'`);
  const moles = massKg / chemistry.molarMassKgPerMol;
  const masses = {};
  for (const [element, atomCount] of Object.entries(chemistry.elementalComposition)) {
    const atomicMass = ATOMIC_MASSES_KG_PER_MOL[element];
    if (atomicMass == null) throw new Error(`Atomic mass missing for element '${element}'`);
    masses[element] = moles * atomCount * atomicMass;
  }
  return masses;
}
