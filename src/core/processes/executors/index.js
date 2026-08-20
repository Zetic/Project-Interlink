import {
  CRUSHING_PROCESS_ID,
  MAGNETIC_SEPARATION_PROCESS_ID,
  SCREENING_PROCESS_ID,
} from '../definitions/index.js';
import { runCrushing } from './crushing.js';
import { runMagneticSeparation } from './magneticSeparation.js';
import { runScreening } from './screening.js';

export const PROCESS_EXECUTOR_REGISTRY = Object.freeze({
  [CRUSHING_PROCESS_ID]: runCrushing,
  [MAGNETIC_SEPARATION_PROCESS_ID]: runMagneticSeparation,
  [SCREENING_PROCESS_ID]: runScreening,
});

export function processExecutorFor(processId) {
  return PROCESS_EXECUTOR_REGISTRY[processId] ?? null;
}
