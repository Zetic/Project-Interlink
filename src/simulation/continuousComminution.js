import {
  CONE_CRUSHING_PROCESS_ID,
  JAW_CRUSHING_PROCESS_ID,
  MILLING_PROCESS_ID,
  getProcessParameterDefinition,
  validateProcessParameter,
} from '../core/processes/definitions/index.js';
import {
  coneCrushSolidMaterialState,
  jawCrushSolidMaterialState,
  millSolidMaterialState,
} from '../core/processes/physics/comminution.js';
import {
  createSolidMaterialStateFromSpeciesQuantities,
  scaleSolidMaterialState,
  summarizeSolidMaterialBySpecies,
  totalSolidQuantity,
  validateSolidMaterialState,
} from '../core/materials/solids/solidMaterialState.js';

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

function validateThroughputCapacity(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive number`);
  }
}

function legacyFlowView(solidState, particleSizeMm) {
  const summary = summarizeSolidMaterialBySpecies(solidState);
  for (const key of Object.keys(summary)) summary[key] = Number(summary[key].toFixed(12));
  return { componentMassFlowKgPerSecond: summary, particleSizeMm };
}

const PROCESS_CONFIG = Object.freeze({
  [JAW_CRUSHING_PROCESS_ID]: Object.freeze({
    parameterId: 'jawProductSizeMm',
    label: 'Jaw Crusher',
    execute: jawCrushSolidMaterialState,
  }),
  [CONE_CRUSHING_PROCESS_ID]: Object.freeze({
    parameterId: 'coneProductSizeMm',
    label: 'Cone Crusher',
    execute: coneCrushSolidMaterialState,
  }),
  [MILLING_PROCESS_ID]: Object.freeze({
    parameterId: 'millProductSizeMm',
    label: 'Ball Mill',
    execute: millSolidMaterialState,
  }),
});

export function applyContinuousStagedComminution(
  feed,
  processId,
  targetParticleSizeMm,
  throughputCapacityKgPerSecond,
) {
  const config = PROCESS_CONFIG[processId];
  if (!config) throw new Error(`Unsupported staged comminution process '${processId}'`);
  const normalizedFeed = normalizeFeed(feed);
  validateSolidMaterialState(normalizedFeed.solidState);
  validateProcessParameter(
    getProcessParameterDefinition(processId, config.parameterId),
    targetParticleSizeMm,
  );
  validateThroughputCapacity(throughputCapacityKgPerSecond, `${config.label} throughputCapacityKgPerSecond`);

  const feedTotalRate = totalSolidQuantity(normalizedFeed.solidState);
  const factor = feedTotalRate > 0 ? Math.min(1, throughputCapacityKgPerSecond / feedTotalRate) : 1;
  const actualFeedSolidState = scaleSolidMaterialState(normalizedFeed.solidState, factor);
  const productSolidState = config.execute(actualFeedSolidState, targetParticleSizeMm);

  return {
    actualFeedSolidState,
    productSolidState,
    actualFeedRates: legacyFlowView(actualFeedSolidState, normalizedFeed.nominalParticleSizeMm),
    productRates: legacyFlowView(productSolidState, targetParticleSizeMm),
  };
}

export function applyContinuousJawCrushing(feed, targetParticleSizeMm, throughputCapacityKgPerSecond) {
  return applyContinuousStagedComminution(
    feed,
    JAW_CRUSHING_PROCESS_ID,
    targetParticleSizeMm,
    throughputCapacityKgPerSecond,
  );
}

export function applyContinuousConeCrushing(feed, targetParticleSizeMm, throughputCapacityKgPerSecond) {
  return applyContinuousStagedComminution(
    feed,
    CONE_CRUSHING_PROCESS_ID,
    targetParticleSizeMm,
    throughputCapacityKgPerSecond,
  );
}

export function applyContinuousMilling(feed, targetParticleSizeMm, throughputCapacityKgPerSecond) {
  return applyContinuousStagedComminution(
    feed,
    MILLING_PROCESS_ID,
    targetParticleSizeMm,
    throughputCapacityKgPerSecond,
  );
}
