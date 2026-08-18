/**
 * Continuous process execution for Crusher and Magnetic Separator.
 *
 * Reuses the physical transformation rules from the discrete batch system
 * (processDefinitions.js / processExecution.js) applied to flow rates.
 *
 * Conservation is checked at the rate level:
 *   sum(inputRates) == sum(outputRates) within STREAM_FLOW_TOLERANCE
 *
 * CRUSHER
 * -------
 * - Accepts a feed stream up to `throughputCapacityKgPerSecond`
 * - Changes particleSizeMm to `targetParticleSizeMm`
 * - Preserves each constituent mass-flow rate
 * - Requires targetParticleSizeMm < feed.particleSizeMm
 *
 * MAGNETIC SEPARATOR
 * ------------------
 * - Requires feed.particleSizeMm <= maxFeedParticleSizeMm (25 mm default)
 * - Splits each constituent flow between concentrate and tailings
 *   using the same MAGNETIC_RESPONSE_BY_COMPONENT table
 * - Conserves each constituent flow across both outputs
 */

import { MAGNETIC_SEPARATION_PROCESS_ID, CRUSHING_PROCESS_ID } from '../core/processes/processDefinitions.js';

const STREAM_FLOW_TOLERANCE = 1e-9;

/** Shared magnetic response table (mirrors processExecution.js) */
const MAGNETIC_RESPONSE_BY_COMPONENT = {
  magnetite:      { baseRecovery: 0.20, variableRecovery: 0.75 },
  hematite:       { baseRecovery: 0.08, variableRecovery: 0.32 },
  goethite:       { baseRecovery: 0.05, variableRecovery: 0.18 },
  quartzAndGangue:{ baseRecovery: 0.01, variableRecovery: 0.04 },
};

function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

/**
 * Apply continuous crusher transformation to a feed stream.
 *
 * @param {{
 *   componentMassFlowKgPerSecond: { [cid: string]: number },
 *   particleSizeMm: number
 * }} feedRates
 * @param {number} targetParticleSizeMm
 * @param {number} throughputCapacityKgPerSecond
 * @returns {{
 *   productRates: { componentMassFlowKgPerSecond: { [cid: string]: number }, particleSizeMm: number },
 *   actualFeedRates: { componentMassFlowKgPerSecond: { [cid: string]: number }, particleSizeMm: number }
 * }}
 */
export function applyContinuousCrushing(feedRates, targetParticleSizeMm, throughputCapacityKgPerSecond) {
  if (typeof targetParticleSizeMm !== 'number' || !Number.isFinite(targetParticleSizeMm) || targetParticleSizeMm <= 0) {
    throw new Error('Crusher targetParticleSizeMm must be a finite positive number');
  }
  if (targetParticleSizeMm >= feedRates.particleSizeMm) {
    throw new Error(
      `Crusher requires targetParticleSizeMm (${targetParticleSizeMm}) < feed size (${feedRates.particleSizeMm} mm)`
    );
  }
  if (typeof throughputCapacityKgPerSecond !== 'number' || !Number.isFinite(throughputCapacityKgPerSecond) || throughputCapacityKgPerSecond <= 0) {
    throw new Error('Crusher throughputCapacityKgPerSecond must be a finite positive number');
  }

  const feedTotalRate = Object.values(feedRates.componentMassFlowKgPerSecond).reduce((s, r) => s + r, 0);

  // Throttle to throughput capacity
  const factor = feedTotalRate > 0 ? Math.min(1, throughputCapacityKgPerSecond / feedTotalRate) : 1;

  const actualFeedComponents = {};
  const productComponents = {};

  for (const [cid, rate] of Object.entries(feedRates.componentMassFlowKgPerSecond)) {
    const actual = rate * factor;
    actualFeedComponents[cid] = actual;
    productComponents[cid] = actual; // constituent flow preserved
  }

  return {
    actualFeedRates: { componentMassFlowKgPerSecond: actualFeedComponents, particleSizeMm: feedRates.particleSizeMm },
    productRates: { componentMassFlowKgPerSecond: productComponents, particleSizeMm: targetParticleSizeMm },
  };
}

/**
 * Apply continuous magnetic separation transformation to a feed stream.
 *
 * @param {{
 *   componentMassFlowKgPerSecond: { [cid: string]: number },
 *   particleSizeMm: number
 * }} feedRates
 * @param {number} fieldStrength  0..1
 * @param {number} maxFeedParticleSizeMm  default 25 mm
 * @returns {{
 *   concentrateRates: { componentMassFlowKgPerSecond: { [cid: string]: number }, particleSizeMm: number },
 *   tailingsRates:    { componentMassFlowKgPerSecond: { [cid: string]: number }, particleSizeMm: number },
 *   actualFeedRates:  { componentMassFlowKgPerSecond: { [cid: string]: number }, particleSizeMm: number }
 * }}
 */
export function applyContinuousMagneticSeparation(feedRates, fieldStrength, maxFeedParticleSizeMm = 25) {
  if (feedRates.particleSizeMm > maxFeedParticleSizeMm) {
    throw new Error(
      `Magnetic Separator requires feed particle size <= ${maxFeedParticleSizeMm} mm (got ${feedRates.particleSizeMm} mm)`
    );
  }
  if (typeof fieldStrength !== 'number' || !Number.isFinite(fieldStrength) || fieldStrength < 0 || fieldStrength > 1) {
    throw new Error('Magnetic Separator fieldStrength must be a number in [0, 1]');
  }

  const concentrateComponents = {};
  const tailingsComponents = {};

  for (const [cid, feedRate] of Object.entries(feedRates.componentMassFlowKgPerSecond)) {
    const response = MAGNETIC_RESPONSE_BY_COMPONENT[cid];
    if (!response) {
      throw new Error(`Magnetic Separator does not support component '${cid}'`);
    }
    const recovery = clamp(response.baseRecovery + response.variableRecovery * fieldStrength, 0, 1);
    concentrateComponents[cid] = feedRate * recovery;
    tailingsComponents[cid]    = feedRate * (1 - recovery);
  }

  // Verify conservation
  const feedTotal = Object.values(feedRates.componentMassFlowKgPerSecond).reduce((s, r) => s + r, 0);
  const outTotal  = Object.values(concentrateComponents).reduce((s, r) => s + r, 0)
                  + Object.values(tailingsComponents).reduce((s, r) => s + r, 0);
  if (Math.abs(feedTotal - outTotal) > STREAM_FLOW_TOLERANCE * Math.max(1, feedTotal)) {
    throw new Error('Magnetic Separator violated constituent conservation');
  }

  return {
    actualFeedRates:   { componentMassFlowKgPerSecond: { ...feedRates.componentMassFlowKgPerSecond }, particleSizeMm: feedRates.particleSizeMm },
    concentrateRates:  { componentMassFlowKgPerSecond: concentrateComponents, particleSizeMm: feedRates.particleSizeMm },
    tailingsRates:     { componentMassFlowKgPerSecond: tailingsComponents,    particleSizeMm: feedRates.particleSizeMm },
  };
}

export { STREAM_FLOW_TOLERANCE, MAGNETIC_RESPONSE_BY_COMPONENT };
export const CONTINUOUS_PROCESS_IDS = {
  CRUSHER: CRUSHING_PROCESS_ID,
  MAGNETIC_SEPARATOR: MAGNETIC_SEPARATION_PROCESS_ID,
};
