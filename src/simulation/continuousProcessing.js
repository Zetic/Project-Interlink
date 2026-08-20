/** Continuous solid-material process physics for the Engineering workspace. */

import {
  MAGNETIC_SEPARATION_PROCESS_ID,
  CRUSHING_PROCESS_ID,
  SCREENING_PROCESS_ID,
  getProcessParameterDefinition,
  validateProcessParameter,
} from '../core/processes/processDefinitions.js';
import {
  crushSolidMaterialState,
  magneticRecoveryForFraction,
  splitMagneticSolidState,
  splitScreenedSolidState,
} from '../core/processes/physics/index.js';
import {
  createSolidMaterialStateFromSpeciesQuantities,
  scaleSolidMaterialState,
  summarizeSolidMaterialBySpecies,
  totalSolidQuantity,
  validateSolidMaterialState,
} from '../core/materials/solids/solidMaterialState.js';

const STREAM_FLOW_TOLERANCE = 1e-9;

function normalizeFeed(feed) {
  if (feed?.fractions) return { solidState: feed, nominalParticleSizeMm: null };
  if (feed?.solidState) return { solidState: feed.solidState, nominalParticleSizeMm: feed.nominalParticleSizeMm ?? null };
  if (feed?.componentMassFlowKgPerSecond) {
    return {
      solidState: createSolidMaterialStateFromSpeciesQuantities(
        feed.componentMassFlowKgPerSecond,
        feed.particleSizeMm,
      ),
      nominalParticleSizeMm: feed.particleSizeMm,
    };
  }
  throw new Error('Process feed must be a solid material state');
}

function validateFeed(feed) {
  validateSolidMaterialState(normalizeFeed(feed).solidState);
}

function validateThroughputCapacity(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive number`);
  }
}

function legacyFlowView(solidState, particleSizeMm) {
  const summary = summarizeSolidMaterialBySpecies(solidState);
  for (const key of Object.keys(summary)) summary[key] = Number(summary[key].toFixed(12));
  return {
    componentMassFlowKgPerSecond: summary,
    particleSizeMm,
  };
}

export function applyContinuousCrushing(feed, targetParticleSizeMm, throughputCapacityKgPerSecond) {
  validateFeed(feed);
  validateProcessParameter(
    getProcessParameterDefinition(CRUSHING_PROCESS_ID, 'targetParticleSizeMm'),
    targetParticleSizeMm,
  );
  const normalizedFeed = normalizeFeed(feed);
  const feedSolidState = normalizedFeed.solidState;
  validateThroughputCapacity(throughputCapacityKgPerSecond, 'Crusher throughputCapacityKgPerSecond');

  const feedTotalRate = totalSolidQuantity(feedSolidState);
  const factor = feedTotalRate > 0 ? Math.min(1, throughputCapacityKgPerSecond / feedTotalRate) : 1;
  const actualFeedSolidState = scaleSolidMaterialState(feedSolidState, factor);
  const productSolidState = crushSolidMaterialState(actualFeedSolidState, targetParticleSizeMm);

  return {
    actualFeedSolidState,
    productSolidState,
    actualFeedRates: legacyFlowView(actualFeedSolidState, normalizedFeed.nominalParticleSizeMm),
    productRates: legacyFlowView(productSolidState, targetParticleSizeMm),
  };
}

export function applyContinuousScreening(feed, apertureSizeMm, throughputCapacityKgPerSecond) {
  validateFeed(feed);
  validateProcessParameter(
    getProcessParameterDefinition(SCREENING_PROCESS_ID, 'apertureSizeMm'),
    apertureSizeMm,
  );
  validateThroughputCapacity(throughputCapacityKgPerSecond, 'Screen throughputCapacityKgPerSecond');

  const normalizedFeed = normalizeFeed(feed);
  const feedSolidState = normalizedFeed.solidState;
  const feedTotalRate = totalSolidQuantity(feedSolidState);
  const factor = feedTotalRate > 0 ? Math.min(1, throughputCapacityKgPerSecond / feedTotalRate) : 1;
  const actualFeedSolidState = scaleSolidMaterialState(feedSolidState, factor);
  const { undersize, oversize } = splitScreenedSolidState(actualFeedSolidState, apertureSizeMm);

  const outputRate = totalSolidQuantity(undersize) + totalSolidQuantity(oversize);
  const actualFeedRate = totalSolidQuantity(actualFeedSolidState);
  if (Math.abs(actualFeedRate - outputRate) > STREAM_FLOW_TOLERANCE * Math.max(1, actualFeedRate)) {
    throw new Error('Screen violated constituent conservation');
  }

  return {
    actualFeedSolidState,
    undersizeSolidState: undersize,
    oversizeSolidState: oversize,
    actualFeedRates: legacyFlowView(actualFeedSolidState, normalizedFeed.nominalParticleSizeMm),
    undersizeRates: legacyFlowView(undersize, apertureSizeMm),
    oversizeRates: legacyFlowView(oversize, null),
  };
}

export function applyContinuousMagneticSeparation(feed, fieldStrength, maxFeedParticleSizeMm = 25) {
  validateFeed(feed);
  validateProcessParameter(
    getProcessParameterDefinition(MAGNETIC_SEPARATION_PROCESS_ID, 'fieldStrength'),
    fieldStrength,
  );
  const normalizedFeed = normalizeFeed(feed);
  const feedSolidState = normalizedFeed.solidState;
  const { concentrate, tailings } = splitMagneticSolidState(feedSolidState, fieldStrength, maxFeedParticleSizeMm);

  const inputRate = totalSolidQuantity(feedSolidState);
  const outputRate = totalSolidQuantity(concentrate) + totalSolidQuantity(tailings);
  if (Math.abs(inputRate - outputRate) > STREAM_FLOW_TOLERANCE * Math.max(1, inputRate)) {
    throw new Error('Magnetic Separator violated constituent conservation');
  }

  return {
    actualFeedSolidState: scaleSolidMaterialState(feedSolidState, 1),
    concentrateSolidState: concentrate,
    tailingsSolidState: tailings,
    actualFeedRates: legacyFlowView(feedSolidState, normalizedFeed.nominalParticleSizeMm),
    concentrateRates: legacyFlowView(concentrate, normalizedFeed.nominalParticleSizeMm),
    tailingsRates: legacyFlowView(tailings, normalizedFeed.nominalParticleSizeMm),
  };
}

export { STREAM_FLOW_TOLERANCE, magneticRecoveryForFraction };
export const CONTINUOUS_PROCESS_IDS = {
  CRUSHER: CRUSHING_PROCESS_ID,
  SCREEN: SCREENING_PROCESS_ID,
  MAGNETIC_SEPARATOR: MAGNETIC_SEPARATION_PROCESS_ID,
};
