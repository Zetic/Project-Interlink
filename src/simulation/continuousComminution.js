import {
  CONE_CRUSHING_PROCESS_ID,
  JAW_CRUSHING_PROCESS_ID,
  MILLING_PROCESS_ID,
  getProcessParameterDefinition,
  validateProcessParameter,
} from '../core/processes/definitions/index.js';
import {
  COMMINUTION_EQUIPMENT,
  comminutionSpecificEnergyKWhPerT,
  coneCrushSolidMaterialState,
  jawCrushSolidMaterialState,
  millSolidMaterialState,
  weightedComminutionProperties,
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

function validatePositive(value, label) {
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
    equipmentId: COMMINUTION_EQUIPMENT.JAW_CRUSHER,
  }),
  [CONE_CRUSHING_PROCESS_ID]: Object.freeze({
    parameterId: 'coneProductSizeMm',
    label: 'Cone Crusher',
    execute: coneCrushSolidMaterialState,
    equipmentId: COMMINUTION_EQUIPMENT.CONE_CRUSHER,
  }),
  [MILLING_PROCESS_ID]: Object.freeze({
    parameterId: 'millProductSizeMm',
    label: 'Ball Mill',
    execute: millSolidMaterialState,
    equipmentId: COMMINUTION_EQUIPMENT.BALL_MILL,
  }),
});

export function applyContinuousStagedComminution(
  feed,
  processId,
  targetParticleSizeMm,
  throughputCapacityKgPerSecond,
  ratedPowerKw = null,
) {
  const config = PROCESS_CONFIG[processId];
  if (!config) throw new Error(`Unsupported staged comminution process '${processId}'`);
  const normalizedFeed = normalizeFeed(feed);
  validateSolidMaterialState(normalizedFeed.solidState);
  validateProcessParameter(
    getProcessParameterDefinition(processId, config.parameterId),
    targetParticleSizeMm,
  );
  validatePositive(throughputCapacityKgPerSecond, `${config.label} throughputCapacityKgPerSecond`);
  if (ratedPowerKw != null) validatePositive(ratedPowerKw, `${config.label} ratedPowerKw`);

  const feedTotalRate = totalSolidQuantity(normalizedFeed.solidState);
  const specificEnergyKWhPerT = feedTotalRate > 0
    ? comminutionSpecificEnergyKWhPerT(
      normalizedFeed.solidState,
      targetParticleSizeMm,
      config.equipmentId,
    )
    : 0;
  const powerLimitedThroughputKgPerSecond = ratedPowerKw != null && specificEnergyKWhPerT > 0
    ? ratedPowerKw / (specificEnergyKWhPerT * 3.6)
    : Infinity;
  const allowedRate = Math.min(throughputCapacityKgPerSecond, powerLimitedThroughputKgPerSecond);
  const factor = feedTotalRate > 0 ? Math.min(1, allowedRate / feedTotalRate) : 1;
  const actualFeedSolidState = scaleSolidMaterialState(normalizedFeed.solidState, factor);
  const productSolidState = config.execute(actualFeedSolidState, targetParticleSizeMm);
  const comminutionProperties = weightedComminutionProperties(normalizedFeed.solidState);

  return {
    actualFeedSolidState,
    productSolidState,
    specificEnergyKWhPerT,
    powerLimitedThroughputKgPerSecond,
    comminutionProperties,
    actualPowerKw: specificEnergyKWhPerT * totalSolidQuantity(actualFeedSolidState) * 3.6,
    actualFeedRates: legacyFlowView(actualFeedSolidState, normalizedFeed.nominalParticleSizeMm),
    productRates: legacyFlowView(productSolidState, targetParticleSizeMm),
  };
}

export function applyContinuousJawCrushing(feed, targetParticleSizeMm, throughputCapacityKgPerSecond, ratedPowerKw = null) {
  return applyContinuousStagedComminution(
    feed,
    JAW_CRUSHING_PROCESS_ID,
    targetParticleSizeMm,
    throughputCapacityKgPerSecond,
    ratedPowerKw,
  );
}

export function applyContinuousConeCrushing(feed, targetParticleSizeMm, throughputCapacityKgPerSecond, ratedPowerKw = null) {
  return applyContinuousStagedComminution(
    feed,
    CONE_CRUSHING_PROCESS_ID,
    targetParticleSizeMm,
    throughputCapacityKgPerSecond,
    ratedPowerKw,
  );
}

export function applyContinuousMilling(feed, targetParticleSizeMm, throughputCapacityKgPerSecond, ratedPowerKw = null) {
  return applyContinuousStagedComminution(
    feed,
    MILLING_PROCESS_ID,
    targetParticleSizeMm,
    throughputCapacityKgPerSecond,
    ratedPowerKw,
  );
}
