import { validateWorld } from './worldValidation.js';

export function validateHierarchy(world, validationErrors = validateWorld(world)) {
  return validationErrors.filter(error =>
    /^(?:planetId\b|Planet\b|Region\b|Site\b|Feature\b)/.test(error)
  );
}
