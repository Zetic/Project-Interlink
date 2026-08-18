/** Continuous solid-material process physics for the Engineering workspace. */

import { MAGNETIC_SEPARATION_PROCESS_ID, CRUSHING_PROCESS_ID } from '../core/processes/processDefinitions.js';
import {
  MAGNETIC_RESPONSE_BY_COMPONENT,
  assertCrushingTarget,
  splitMagneticComponents,
} from '../core/processes/processPhysics.js';
import { validateComponentMassFlowRates, totalMassFlowKgPerSecond } from './materialStream.js';

const STREAM_FLOW_TOLERANCE = 1e-9;

function validateFeed(feedRates) {
  if (!feedRates || typeof feedRates !== 'object') throw new Error('Process feed must be an object');
  validateComponentMassFlowRates(feedRates.componentMassFlowKgPerSecond);
  if (typeof feedRates.particleSizeMm !== 'number' || !Number.isFinite(feedRates.particleSizeMm) || feedRates.particleSizeMm <= 0) {
    throw new Error('Process feed particleSizeMm must be a finite positive number');
  }
}

export function applyContinuousCrushing(feedRates, targetParticleSizeMm, throughputCapacityKgPerSecond) {
  validateFeed(feedRates);
  assertCrushingTarget(feedRates.particleSizeMm, targetParticleSizeMm);
  if (
    typeof throughputCapacityKgPerSecond !== 'number' ||
    !Number.isFinite(throughputCapacityKgPerSecond) ||
    throughputCapacityKgPerSecond <= 0
  ) {
    throw new Error('Crusher throughputCapacityKgPerSecond must be a finite positive number');
  }

  const feedTotalRate = totalMassFlowKgPerSecond(feedRates.componentMassFlowKgPerSecond);
  const factor = feedTotalRate > 0 ? Math.min(1, throughputCapacityKgPerSecond / feedTotalRate) : 1;
  const actualFeedComponents = Object.fromEntries(
    Object.entries(feedRates.componentMassFlowKgPerSecond).map(([cid, rate]) => [cid, rate * factor])
  );

  return {
    actualFeedRates: {
      componentMassFlowKgPerSecond: actualFeedComponents,
      particleSizeMm: feedRates.particleSizeMm,
    },
    productRates: {
      componentMassFlowKgPerSecond: { ...actualFeedComponents },
      particleSizeMm: targetParticleSizeMm,
    },
  };
}

export function applyContinuousMagneticSeparation(feedRates, fieldStrength, maxFeedParticleSizeMm = 25) {
  validateFeed(feedRates);
  if (feedRates.particleSizeMm > maxFeedParticleSizeMm) {
    throw new Error(
      `Magnetic Separator requires feed particle size <= ${maxFeedParticleSizeMm} mm (got ${feedRates.particleSizeMm} mm)`
    );
  }

  const { concentrate, tailings } = splitMagneticComponents(
    feedRates.componentMassFlowKgPerSecond,
    fieldStrength
  );

  for (const cid of Object.keys(feedRates.componentMassFlowKgPerSecond)) {
    const inputRate = feedRates.componentMassFlowKgPerSecond[cid] ?? 0;
    const outputRate = (concentrate[cid] ?? 0) + (tailings[cid] ?? 0);
    if (Math.abs(inputRate - outputRate) > STREAM_FLOW_TOLERANCE * Math.max(1, inputRate)) {
      throw new Error(`Magnetic Separator violated constituent conservation for '${cid}'`);
    }
  }

  return {
    actualFeedRates: {
      componentMassFlowKgPerSecond: { ...feedRates.componentMassFlowKgPerSecond },
      particleSizeMm: feedRates.particleSizeMm,
    },
    concentrateRates: {
      componentMassFlowKgPerSecond: concentrate,
      particleSizeMm: feedRates.particleSizeMm,
    },
    tailingsRates: {
      componentMassFlowKgPerSecond: tailings,
      particleSizeMm: feedRates.particleSizeMm,
    },
  };
}

export { STREAM_FLOW_TOLERANCE, MAGNETIC_RESPONSE_BY_COMPONENT };
export const CONTINUOUS_PROCESS_IDS = {
  CRUSHER: CRUSHING_PROCESS_ID,
  MAGNETIC_SEPARATOR: MAGNETIC_SEPARATION_PROCESS_ID,
};
