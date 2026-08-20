import { validateWorld } from './worldValidation.js';

export function validateProcessHistory(world) {
  return validateWorld(world).filter(error =>
    /Process result|process run|Material batch/.test(error)
  );
}
