import { validateWorld } from './worldValidation.js';

export function validateProcessHistory(world, validationErrors = validateWorld(world)) {
  return validationErrors.filter(error =>
    /Process result|process run|Material batch/.test(error)
  );
}
