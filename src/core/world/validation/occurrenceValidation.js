import { validateWorld } from './worldValidation.js';

export function validateOccurrences(world) {
  return validateWorld(world).filter(error =>
    /ResourceOccurrence|resourceOccurrences/.test(error)
  );
}
