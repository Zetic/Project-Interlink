import { validateWorld } from './worldValidation.js';

export function validateHierarchy(world) {
  return validateWorld(world).filter(error =>
    /Planet|Region|Site|Feature/.test(error)
  );
}
