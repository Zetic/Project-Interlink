import { validateWorld } from './worldValidation.js';

export function validateHierarchy(world) {
  return validateWorld(world).filter(error =>
    /^(?:planetId\b|Planet\b|Region\b|Site\b|Feature\b)/.test(error)
  );
}
