/** Continuous solid-material process physics for the Engineering workspace. */

import {
  MAGNETIC_SEPARATION_PROCESS_ID,
  CRUSHING_PROCESS_ID,
  getProcessDefinition,
  validateProcessParameters,
} from '../core/processes/processDefinitions.js';
import {
  crushSolidMaterialState,
  magneticRecoveryForFraction,
  splitMagneticSolidState,
} from '../core/processes/processPhysics.js';
import {
  createSolidMaterialStateFromSpeciesQuantities,
  scaleSolidMaterialState,
  summarizeSolidMaterialBySpecies,
  totalSolidQuantity,
  validateSolidMaterialState,
} from '../core/materials/solidMaterialState.js';

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
  validateProcessParameters(getProcessDefinition(CRUSHING_PROCESS_ID), { targetParticleSizeMm });
  const normalizedFeed = normalizeFeed(feed);
  const feedSolidState = normalizedFeed.solidState;
  if (
    typeof throughputCapacityKgPerSecond !== 'number' ||
    !Number.isFinite(throughputCapacityKgPerSecond) ||
    throughputCapacityKgPerSecond <= 0
  ) {
    throw new Error('Crusher throughputCapacityKgPerSecond must be a finite positive number');
  }

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

export function applyContinuousMagneticSeparation(feed, fieldStrength, maxFeedParticleSizeMm = 25) {
  validateFeed(feed);
  validateProcessParameters(getProcessDefinition(MAGNETIC_SEPARATION_PROCESS_ID), { fieldStrength });
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
  MAGNETIC_SEPARATOR: MAGNETIC_SEPARATION_PROCESS_ID,
};
