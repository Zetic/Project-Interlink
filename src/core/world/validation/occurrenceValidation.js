import { validateWorld } from './worldValidation.js';

export function validateOccurrences(world, validationErrors = validateWorld(world)) {
  return validationErrors.filter(error =>
    /ResourceOccurrence|resourceOccurrences/.test(error)
  );
}
