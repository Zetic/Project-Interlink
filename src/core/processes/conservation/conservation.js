import { validateSpeciesConservation } from './speciesConservation.js';
import { validateElementalConservation } from './elementalConservation.js';

export const CONSERVATION_POLICIES = Object.freeze({
  species: validateSpeciesConservation,
  elemental: validateElementalConservation,
});

export function conservationPolicyFor(processDefinition) {
  const policy = processDefinition?.conservationPolicy ?? 'species';
  const validator = CONSERVATION_POLICIES[policy];
  if (!validator) throw new Error(`Unknown conservation policy '${policy}'`);
  return validator;
}

export function validateProcessConservation(
  processDefinition,
  inputBodies,
  outputBodies,
) {
  return conservationPolicyFor(processDefinition)(
    inputBodies,
    outputBodies,
    processDefinition.id,
  );
}
