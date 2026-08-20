/** Continuous solid-material process physics for the Engineering workspace. */

import {
  MAGNETIC_SEPARATION_PROCESS_ID,
  CRUSHING_PROCESS_ID,
  FEEDING_PROCESS_ID,
  MERGING_PROCESS_ID,
  SCREENING_PROCESS_ID,
  SPLITTING_PROCESS_ID,
  getProcessParameterDefinition,
  validateProcessParameter,
} from '../core/processes/processDefinitions.js';
import {
  crushSolidMaterialState,
  feedSolidMaterialState,
  magneticRecoveryForFraction,
  mergeSolidMaterialStates,
  splitMagneticSolidState,
  splitScreenedSolidState,
  splitSolidMaterialState,
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

function assertRateConservation(inputRate, outputRate, label) {
  if (Math.abs(inputRate - outputRate) > STREAM_FLOW_TOLERANCE * Math.max(1, inputRate)) {
    throw new Error(`${label} violated constituent conservation`);
  }
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
  assertRateConservation(actualFeedRate, outputRate, 'Screen');

  return {
    actualFeedSolidState,
    undersizeSolidState: undersize,
    oversizeSolidState: oversize,
    actualFeedRates: legacyFlowView(actualFeedSolidState, normalizedFeed.nominalParticleSizeMm),
    undersizeRates: legacyFlowView(undersize, apertureSizeMm),
    oversizeRates: legacyFlowView(oversize, null),
  };
}

export function applyContinuousSplitting(feed, splitFractionToA, throughputCapacityKgPerSecond) {
  validateFeed(feed);
  validateProcessParameter(
    getProcessParameterDefinition(SPLITTING_PROCESS_ID, 'splitFractionToA'),
    splitFractionToA,
  );
  validateThroughputCapacity(throughputCapacityKgPerSecond, 'Splitter throughputCapacityKgPerSecond');

  const normalizedFeed = normalizeFeed(feed);
  const feedSolidState = normalizedFeed.solidState;
  const feedTotalRate = totalSolidQuantity(feedSolidState);
  const factor = feedTotalRate > 0 ? Math.min(1, throughputCapacityKgPerSecond / feedTotalRate) : 1;
  const actualFeedSolidState = scaleSolidMaterialState(feedSolidState, factor);
  const { outputA, outputB } = splitSolidMaterialState(actualFeedSolidState, splitFractionToA);
  assertRateConservation(
    totalSolidQuantity(actualFeedSolidState),
    totalSolidQuantity(outputA) + totalSolidQuantity(outputB),
    'Splitter',
  );

  return {
    actualFeedSolidState,
    outputASolidState: outputA,
    outputBSolidState: outputB,
    actualFeedRates: legacyFlowView(actualFeedSolidState, normalizedFeed.nominalParticleSizeMm),
    outputARates: legacyFlowView(outputA, normalizedFeed.nominalParticleSizeMm),
    outputBRates: legacyFlowView(outputB, normalizedFeed.nominalParticleSizeMm),
  };
}

export function applyContinuousMerging(feedA, feedB, throughputCapacityKgPerSecond) {
  validateFeed(feedA);
  validateFeed(feedB);
  validateThroughputCapacity(throughputCapacityKgPerSecond, 'Merger throughputCapacityKgPerSecond');

  const normalizedA = normalizeFeed(feedA);
  const normalizedB = normalizeFeed(feedB);
  const totalInputRate = totalSolidQuantity(normalizedA.solidState) + totalSolidQuantity(normalizedB.solidState);
  const factor = totalInputRate > 0 ? Math.min(1, throughputCapacityKgPerSecond / totalInputRate) : 1;
  const actualInputASolidState = scaleSolidMaterialState(normalizedA.solidState, factor);
  const actualInputBSolidState = scaleSolidMaterialState(normalizedB.solidState, factor);
  const productSolidState = mergeSolidMaterialStates(actualInputASolidState, actualInputBSolidState);
  assertRateConservation(
    totalSolidQuantity(actualInputASolidState) + totalSolidQuantity(actualInputBSolidState),
    totalSolidQuantity(productSolidState),
    'Merger',
  );

  return {
    actualInputASolidState,
    actualInputBSolidState,
    productSolidState,
    actualInputARates: legacyFlowView(actualInputASolidState, normalizedA.nominalParticleSizeMm),
    actualInputBRates: legacyFlowView(actualInputBSolidState, normalizedB.nominalParticleSizeMm),
    productRates: legacyFlowView(productSolidState, null),
  };
}

export function applyContinuousFeeding(feed, flowRateKgPerSecond, throughputCapacityKgPerSecond) {
  validateFeed(feed);
  validateProcessParameter(
    getProcessParameterDefinition(FEEDING_PROCESS_ID, 'flowRateKgPerSecond'),
    flowRateKgPerSecond,
  );
  validateThroughputCapacity(throughputCapacityKgPerSecond, 'Feeder throughputCapacityKgPerSecond');

  const normalizedFeed = normalizeFeed(feed);
  const feedSolidState = normalizedFeed.solidState;
  const feedTotalRate = totalSolidQuantity(feedSolidState);
  const requestedRate = Math.min(flowRateKgPerSecond, throughputCapacityKgPerSecond);
  const factor = feedTotalRate > 0 ? Math.min(1, requestedRate / feedTotalRate) : 1;
  const actualFeedSolidState = scaleSolidMaterialState(feedSolidState, factor);
  const productSolidState = feedSolidMaterialState(actualFeedSolidState);
  assertRateConservation(totalSolidQuantity(actualFeedSolidState), totalSolidQuantity(productSolidState), 'Feeder');

  return {
    actualFeedSolidState,
    productSolidState,
    actualFeedRates: legacyFlowView(actualFeedSolidState, normalizedFeed.nominalParticleSizeMm),
    productRates: legacyFlowView(productSolidState, normalizedFeed.nominalParticleSizeMm),
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
  assertRateConservation(inputRate, outputRate, 'Magnetic Separator');

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
  FEEDER: FEEDING_PROCESS_ID,
  MAGNETIC_SEPARATOR: MAGNETIC_SEPARATION_PROCESS_ID,
  MERGER: MERGING_PROCESS_ID,
  SCREEN: SCREENING_PROCESS_ID,
  SPLITTER: SPLITTING_PROCESS_ID,
};
