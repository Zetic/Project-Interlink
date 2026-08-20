import {
  CRUSHING_PROCESS_ID,
  FEEDING_PROCESS_ID,
  MAGNETIC_SEPARATION_PROCESS_ID,
  MERGING_PROCESS_ID,
  SCREENING_PROCESS_ID,
  SPLITTING_PROCESS_ID,
} from '../definitions/index.js';
import { runCrushing } from './crushing.js';
import { runFeeding } from './feeding.js';
import { runMagneticSeparation } from './magneticSeparation.js';
import { runMerging } from './merging.js';
import { runScreening } from './screening.js';
import { runSplitting } from './splitting.js';

export const PROCESS_EXECUTOR_REGISTRY = Object.freeze({
  [CRUSHING_PROCESS_ID]: runCrushing,
  [FEEDING_PROCESS_ID]: runFeeding,
  [MAGNETIC_SEPARATION_PROCESS_ID]: runMagneticSeparation,
  [MERGING_PROCESS_ID]: runMerging,
  [SCREENING_PROCESS_ID]: runScreening,
  [SPLITTING_PROCESS_ID]: runSplitting,
});

export function processExecutorFor(processId) {
  return PROCESS_EXECUTOR_REGISTRY[processId] ?? null;
}
