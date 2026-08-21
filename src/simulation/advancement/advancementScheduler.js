/**
 * Explicit simulation-time advancement scheduler.
 *
 * Player/UI wall time is not simulation time. Callers request a target world
 * time; the scheduler chooses the cheapest proven way to reach it while keeping
 * the canonical 0.1 s fixed-step path as the universal correctness fallback.
 */

import { SIMULATION_STEP_S } from '../simulationEngine.js';
import {
  createWorldSimulation,
  pauseWorldSimulation,
  worldSimulationTick,
} from '../worldSimulation.js';
import {
  applyQuiescentOperatingSegment,
  cacheOperatingSegment,
  cachedOperatingSegment,
  invalidateOperatingSegment,
  markOperatingSegmentReuse,
  observeWorldForQuiescentSegment,
  operatingSegmentTelemetry,
  worldIsQuiescent,
} from './operatingSegments.js';
import {
  applyLinearExtractorOperatingSegment,
  buildLinearExtractorOperatingSegment,
  linearExtractorBatchIntervalSeconds,
  validateLinearExtractorOperatingSegment,
} from './linearExtractorSegment.js';

const TIME_TOLERANCE_S = 1e-9;

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function defaultYieldControl() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function assertFiniteNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be finite and non-negative`);
}

function authoritativeStepCount(seconds) {
  assertFiniteNonNegative(seconds, 'Simulation advance seconds');
  const raw = seconds / SIMULATION_STEP_S;
  const rounded = Math.round(raw);
  if (Math.abs(raw - rounded) > TIME_TOLERANCE_S) {
    throw new Error(`Simulation advancement must be a multiple of the authoritative ${SIMULATION_STEP_S} s step`);
  }
  return rounded;
}

function exactWorldStep(world) {
  const simulation = createWorldSimulation(world);
  // worldSimulationTick retains its historical running gate for compatibility
  // with old callers. Explicit advancement temporarily opens that gate for one
  // exact step and immediately returns the world to paused engineering mode.
  simulation.running = true;
  try {
    return worldSimulationTick(world, SIMULATION_STEP_S);
  } finally {
    simulation.running = false;
  }
}

function progressSnapshot(result, targetSimulationSeconds) {
  return {
    ...result,
    targetSimulationSeconds,
    currentSimulationSeconds: result.endSimulationSeconds,
    completionFraction: result.requestedSeconds <= 0
      ? 1
      : Math.max(0, Math.min(1, result.advancedSeconds / result.requestedSeconds)),
  };
}

function createResult(world, requestedSeconds) {
  const startSimulationSeconds = createWorldSimulation(world).elapsedSeconds;
  return {
    requestedSeconds,
    advancedSeconds: 0,
    startSimulationSeconds,
    endSimulationSeconds: startSimulationSeconds,
    detailedFixedSteps: 0,
    linearBatchOperations: 0,
    linearEquivalentSteps: 0,
    quiescentFastForwardOperations: 0,
    quiescentEquivalentSteps: 0,
    schedulerOperations: 0,
    elapsedWallMs: 0,
    throughputRealtimeFactor: 0,
    fixedEquivalentSteps: authoritativeStepCount(requestedSeconds),
    scheduleCompressionRatio: 1,
    operatingSegment: null,
  };
}

function finalizeResult(world, result, wallStartMs) {
  result.endSimulationSeconds = world.simulation.elapsedSeconds;
  result.advancedSeconds = result.endSimulationSeconds - result.startSimulationSeconds;
  result.elapsedWallMs = Math.max(0, nowMs() - wallStartMs);
  result.throughputRealtimeFactor = result.elapsedWallMs > 0
    ? result.advancedSeconds / (result.elapsedWallMs / 1000)
    : Number.POSITIVE_INFINITY;
  result.scheduleCompressionRatio = result.schedulerOperations > 0
    ? result.fixedEquivalentSteps / result.schedulerOperations
    : (result.fixedEquivalentSteps > 0 ? Number.POSITIVE_INFINITY : 1);
  result.operatingSegment = operatingSegmentTelemetry(world);
  return result;
}

function tryCachedSegment(world, remainingSeconds, result) {
  const cached = cachedOperatingSegment(world);
  if (!cached) return false;

  if (cached.kind === 'quiescent') {
    if (!worldIsQuiescent(world)) {
      invalidateOperatingSegment(world, 'quiescent segment became active');
      return false;
    }
    applyQuiescentOperatingSegment(world, remainingSeconds);
    result.quiescentFastForwardOperations += 1;
    result.quiescentEquivalentSteps += authoritativeStepCount(remainingSeconds);
    result.schedulerOperations += 1;
    return true;
  }

  if (cached.kind === 'linear-extractor-storage') {
    const validated = validateLinearExtractorOperatingSegment(world, cached);
    if (!validated) {
      invalidateOperatingSegment(world, 'linear extractor segment dependencies changed');
      return false;
    }
    const interval = linearExtractorBatchIntervalSeconds(validated, remainingSeconds);
    if (!(interval > 0)) return false;
    const equivalentSteps = applyLinearExtractorOperatingSegment(world, interval);
    result.linearBatchOperations += 1;
    result.linearEquivalentSteps += equivalentSteps;
    result.schedulerOperations += 1;
    markOperatingSegmentReuse(world, interval);

    const next = buildLinearExtractorOperatingSegment(world);
    if (next) cacheOperatingSegment(world, next);
    else invalidateOperatingSegment(world, 'linear extractor segment reached an event boundary');
    return true;
  }

  invalidateOperatingSegment(world, `unknown operating segment '${cached.kind}'`);
  return false;
}

function observeAfterDetailedStep(world) {
  const quiescent = observeWorldForQuiescentSegment(world);
  if (quiescent) return quiescent;

  const linear = buildLinearExtractorOperatingSegment(world);
  if (linear) return cacheOperatingSegment(world, linear);
  return null;
}

/**
 * Synchronous explicit advancement. Useful for deterministic tests and callers
 * that already own a worker/background execution context.
 */
export function advanceWorldToSync(world, targetSimulationSeconds) {
  if (!world || typeof world !== 'object') throw new Error('World advancement requires a world object');
  assertFiniteNonNegative(targetSimulationSeconds, 'Target simulation time');
  const simulation = createWorldSimulation(world);
  const requestedSeconds = targetSimulationSeconds - simulation.elapsedSeconds;
  if (requestedSeconds < -TIME_TOLERANCE_S) throw new Error('Cannot advance world backwards in time');
  authoritativeStepCount(Math.max(0, requestedSeconds));

  pauseWorldSimulation(world);
  const result = createResult(world, Math.max(0, requestedSeconds));
  const wallStartMs = nowMs();

  while (world.simulation.elapsedSeconds + TIME_TOLERANCE_S < targetSimulationSeconds) {
    const remainingSeconds = targetSimulationSeconds - world.simulation.elapsedSeconds;
    if (tryCachedSegment(world, remainingSeconds, result)) continue;

    exactWorldStep(world);
    result.detailedFixedSteps += 1;
    result.schedulerOperations += 1;
    observeAfterDetailedStep(world);
  }

  pauseWorldSimulation(world);
  return finalizeResult(world, result, wallStartMs);
}

export function advanceWorldBySync(world, seconds) {
  assertFiniteNonNegative(seconds, 'Simulation advance seconds');
  authoritativeStepCount(seconds);
  const current = createWorldSimulation(world).elapsedSeconds;
  return advanceWorldToSync(world, current + seconds);
}

/**
 * Browser-friendly explicit advancement. Physics remains synchronous within an
 * operation, but the scheduler yields between bounded operations so long waits
 * can update progress and do not monopolize the event loop indefinitely.
 */
export async function advanceWorldTo(world, targetSimulationSeconds, {
  yieldEveryOperations = 25,
  yieldControl = defaultYieldControl,
  onProgress = null,
} = {}) {
  if (!world || typeof world !== 'object') throw new Error('World advancement requires a world object');
  assertFiniteNonNegative(targetSimulationSeconds, 'Target simulation time');
  if (!Number.isInteger(yieldEveryOperations) || yieldEveryOperations < 1) {
    throw new Error('yieldEveryOperations must be a positive integer');
  }

  const simulation = createWorldSimulation(world);
  const requestedSeconds = targetSimulationSeconds - simulation.elapsedSeconds;
  if (requestedSeconds < -TIME_TOLERANCE_S) throw new Error('Cannot advance world backwards in time');
  authoritativeStepCount(Math.max(0, requestedSeconds));

  pauseWorldSimulation(world);
  const result = createResult(world, Math.max(0, requestedSeconds));
  const wallStartMs = nowMs();
  let operationsSinceYield = 0;

  while (world.simulation.elapsedSeconds + TIME_TOLERANCE_S < targetSimulationSeconds) {
    const remainingSeconds = targetSimulationSeconds - world.simulation.elapsedSeconds;
    if (!tryCachedSegment(world, remainingSeconds, result)) {
      exactWorldStep(world);
      result.detailedFixedSteps += 1;
      result.schedulerOperations += 1;
      observeAfterDetailedStep(world);
    }

    result.endSimulationSeconds = world.simulation.elapsedSeconds;
    result.advancedSeconds = result.endSimulationSeconds - result.startSimulationSeconds;
    operationsSinceYield += 1;
    if (operationsSinceYield >= yieldEveryOperations && world.simulation.elapsedSeconds + TIME_TOLERANCE_S < targetSimulationSeconds) {
      onProgress?.(progressSnapshot(result, targetSimulationSeconds));
      operationsSinceYield = 0;
      await yieldControl();
    }
  }

  pauseWorldSimulation(world);
  finalizeResult(world, result, wallStartMs);
  onProgress?.(progressSnapshot(result, targetSimulationSeconds));
  return result;
}

export async function advanceWorldBy(world, seconds, options = {}) {
  assertFiniteNonNegative(seconds, 'Simulation advance seconds');
  authoritativeStepCount(seconds);
  const current = createWorldSimulation(world).elapsedSeconds;
  return advanceWorldTo(world, current + seconds, options);
}

export { SIMULATION_STEP_S };
