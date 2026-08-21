import {
  CONE_CRUSHING_PROCESS_ID,
  CRUSHING_PROCESS_ID,
  FEEDING_PROCESS_ID,
  JAW_CRUSHING_PROCESS_ID,
  MAGNETIC_SEPARATION_PROCESS_ID,
  MERGING_PROCESS_ID,
  MILLING_PROCESS_ID,
  SCREENING_PROCESS_ID,
  SPLITTING_PROCESS_ID,
} from '../definitions/index.js';
import { runStagedComminution } from './comminution.js';
import { runCrushing } from './crushing.js';
import { runFeeding } from './feeding.js';
import { runMagneticSeparation } from './magneticSeparation.js';
import { runMerging } from './merging.js';
import { runScreening } from './screening.js';
import { runSplitting } from './splitting.js';

export const PROCESS_EXECUTOR_REGISTRY = Object.freeze({
  [CONE_CRUSHING_PROCESS_ID]: runStagedComminution,
  [CRUSHING_PROCESS_ID]: runCrushing,
  [FEEDING_PROCESS_ID]: runFeeding,
  [JAW_CRUSHING_PROCESS_ID]: runStagedComminution,
  [MAGNETIC_SEPARATION_PROCESS_ID]: runMagneticSeparation,
  [MERGING_PROCESS_ID]: runMerging,
  [MILLING_PROCESS_ID]: runStagedComminution,
  [SCREENING_PROCESS_ID]: runScreening,
  [SPLITTING_PROCESS_ID]: runSplitting,
});

export function processExecutorFor(processId) {
  return PROCESS_EXECUTOR_REGISTRY[processId] ?? null;
}
