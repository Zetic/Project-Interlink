import { CRUSHING_PROCESS_ID, MAGNETIC_SEPARATION_PROCESS_ID } from '../definitions/index.js';
import { runCrushing } from './crushing.js';
import { runMagneticSeparation } from './magneticSeparation.js';

export const PROCESS_EXECUTOR_REGISTRY = Object.freeze({
  [CRUSHING_PROCESS_ID]: runCrushing,
  [MAGNETIC_SEPARATION_PROCESS_ID]: runMagneticSeparation,
});

export function processExecutorFor(processId) {
  return PROCESS_EXECUTOR_REGISTRY[processId] ?? null;
}
