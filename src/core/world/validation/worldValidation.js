import { SCHEMA_VERSION, GENERATOR_VERSION } from '../versions.js';
import { validateHierarchy } from './hierarchyValidation.js';
import { validateOccurrences } from './occurrenceValidation.js';
import { validateProcessHistory } from './processHistoryValidation.js';

function validateExactVersion(actual, expected, label, errors) {
  if (!Number.isInteger(actual)) {
    errors.push(`${label} must be an integer`);
    return;
  }
  if (actual !== expected) {
    errors.push(`Unsupported ${label} '${actual}'; expected ${expected}`);
  }
}

/** Compose independent world-state validation domains. */
export function validateWorld(world) {
  if (!world || typeof world !== 'object' || Array.isArray(world)) {
    return ['world must be an object'];
  }

  const errors = [];
  validateExactVersion(world.schemaVersion, SCHEMA_VERSION, 'schemaVersion', errors);
  validateExactVersion(world.generatorVersion, GENERATOR_VERSION, 'generatorVersion', errors);
  if (errors.length > 0) return errors;

  errors.push(
    ...validateHierarchy(world),
    ...validateOccurrences(world),
    ...validateProcessHistory(world),
  );

  if (errors.length > 0) console.error('[Interlink] World validation errors:', errors);
  return errors;
}
