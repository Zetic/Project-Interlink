/**
 * Hopper — minimal finite-capacity solid-material storage node.
 *
 * Physical state:
 * {
 *   id: string,
 *   capacityKg: number,
 *   storedComponentsKg: { [componentId]: number },  // source of truth
 *   particleSizeMm: number | null,  // null when empty
 *   // ports
 *   inputPortId: 'input',
 *   outputPortId: 'output',
 * }
 *
 * Rules:
 * - constituent quantities are the source of truth; total is derived
 * - no negative stored quantities
 * - cannot exceed capacity beyond numeric tolerance
 * - physically mixed matter is aggregated
 */

const HOPPER_TOLERANCE_KG = 1e-9;

/**
 * Create a new Hopper node.
 *
 * @param {object} params
 * @param {string} params.id
 * @param {number} params.capacityKg - finite positive capacity
 * @param {{ [componentId: string]: number }} [params.initialComponentsKg]
 * @param {number | null} [params.initialParticleSizeMm]
 * @returns {object} hopper
 */
export function createHopper({ id, capacityKg, initialComponentsKg = {}, initialParticleSizeMm = null }) {
  if (!id || typeof id !== 'string') throw new Error('Hopper id must be a non-empty string');
  if (typeof capacityKg !== 'number' || !Number.isFinite(capacityKg) || capacityKg <= 0) {
    throw new Error('Hopper capacityKg must be a finite positive number');
  }

  const storedComponentsKg = {};
  let total = 0;
  for (const [cid, kg] of Object.entries(initialComponentsKg)) {
    if (typeof kg !== 'number' || !Number.isFinite(kg) || kg < 0) {
      throw new Error(`Hopper initial component '${cid}' must be a finite non-negative number`);
    }
    storedComponentsKg[cid] = kg;
    total += kg;
  }
  if (total > capacityKg + HOPPER_TOLERANCE_KG) {
    throw new Error(`Hopper initial contents (${total} kg) exceed capacity (${capacityKg} kg)`);
  }

  let particleSizeMm = initialParticleSizeMm;
  if (total === 0) {
    particleSizeMm = null;
  } else if (typeof particleSizeMm !== 'number' || !Number.isFinite(particleSizeMm) || particleSizeMm <= 0) {
    throw new Error('Hopper initialParticleSizeMm must be a finite positive number when contents are non-empty');
  }

  return {
    id,
    capacityKg,
    storedComponentsKg,
    particleSizeMm,
    inputPortId: 'input',
    outputPortId: 'output',
    nodeType: 'hopper',
  };
}

/**
 * Derive total stored mass (kg) from constituents.
 *
 * @param {object} hopper
 * @returns {number}
 */
export function hopperStoredMassKg(hopper) {
  return Object.values(hopper.storedComponentsKg).reduce((sum, kg) => sum + kg, 0);
}

/**
 * Derive how much additional mass can be accepted (kg).
 *
 * @param {object} hopper
 * @returns {number}
 */
export function hopperFreeCapacityKg(hopper) {
  return Math.max(0, hopper.capacityKg - hopperStoredMassKg(hopper));
}

/**
 * Receive material inflow into the hopper for one simulation timestep.
 * Clamps to free capacity — caller must check/handle partial acceptance.
 *
 * @param {object} hopper - mutated in place
 * @param {{ [componentId: string]: number }} componentInflowKgPerSecond
 * @param {number} particleSizeMm - particle size of incoming material
 * @param {number} dt - timestep in seconds
 * @returns {number} actualTotalInflowKg - how much was actually accepted
 */
export function hopperReceiveInflow(hopper, componentInflowKgPerSecond, particleSizeMm, dt) {
  if (typeof particleSizeMm !== 'number' || !Number.isFinite(particleSizeMm) || particleSizeMm <= 0) {
    throw new Error('hopperReceiveInflow: particleSizeMm must be a finite positive number');
  }
  if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) {
    throw new Error('hopperReceiveInflow: dt must be a finite positive number');
  }

  const freeKg = hopperFreeCapacityKg(hopper);
  if (freeKg <= HOPPER_TOLERANCE_KG) return 0;

  // Compute requested total inflow
  const requestedKg = Object.values(componentInflowKgPerSecond).reduce((sum, r) => sum + r * dt, 0);
  if (requestedKg <= 0) return 0;

  // Throttle to free capacity
  const factor = Math.min(1, freeKg / requestedKg);

  let actualTotal = 0;
  for (const [cid, rateKgPerS] of Object.entries(componentInflowKgPerSecond)) {
    const delta = rateKgPerS * dt * factor;
    hopper.storedComponentsKg[cid] = (hopper.storedComponentsKg[cid] ?? 0) + delta;
    actualTotal += delta;
  }

  // Blend particle size (mass-weighted average)
  const prevMass = hopperStoredMassKg(hopper) - actualTotal;
  if (hopper.particleSizeMm === null || prevMass <= HOPPER_TOLERANCE_KG) {
    hopper.particleSizeMm = particleSizeMm;
  } else {
    hopper.particleSizeMm = (hopper.particleSizeMm * prevMass + particleSizeMm * actualTotal) / (prevMass + actualTotal);
  }

  return actualTotal;
}

/**
 * Withdraw material from the hopper for one simulation timestep.
 * Returns the actual component flow rates (kg/s) that could be served.
 *
 * @param {object} hopper - mutated in place
 * @param {{ [componentId: string]: number }} requestedRatesKgPerSecond
 * @param {number} dt
 * @returns {{ actualRates: { [componentId: string]: number }, actualTotalKg: number }}
 */
export function hopperWithdraw(hopper, requestedRatesKgPerSecond, dt) {
  if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) {
    throw new Error('hopperWithdraw: dt must be a finite positive number');
  }

  const storedMassKg = hopperStoredMassKg(hopper);
  if (storedMassKg <= HOPPER_TOLERANCE_KG) {
    const zeroRates = {};
    for (const cid of Object.keys(requestedRatesKgPerSecond)) zeroRates[cid] = 0;
    return { actualRates: zeroRates, actualTotalKg: 0 };
  }

  const requestedTotalKg = Object.values(requestedRatesKgPerSecond).reduce((sum, r) => sum + r * dt, 0);
  if (requestedTotalKg <= 0) {
    const zeroRates = {};
    for (const cid of Object.keys(requestedRatesKgPerSecond)) zeroRates[cid] = 0;
    return { actualRates: zeroRates, actualTotalKg: 0 };
  }

  // Throttle to available mass (proportionally across all constituents)
  const factor = Math.min(1, storedMassKg / requestedTotalKg);

  const actualRates = {};
  let actualTotalKg = 0;

  for (const [cid, rateKgPerS] of Object.entries(requestedRatesKgPerSecond)) {
    const requestedCidKg = rateKgPerS * dt * factor;
    // Cannot withdraw more than actually stored for this component
    const actualCidKg = Math.min(requestedCidKg, hopper.storedComponentsKg[cid] ?? 0);

    actualRates[cid] = actualCidKg / dt;
    hopper.storedComponentsKg[cid] = Math.max(0, (hopper.storedComponentsKg[cid] ?? 0) - actualCidKg);
    actualTotalKg += actualCidKg;
  }

  // Clear particle size when effectively empty
  if (hopperStoredMassKg(hopper) <= HOPPER_TOLERANCE_KG) {
    hopper.particleSizeMm = null;
  }

  return { actualRates, actualTotalKg };
}

export { HOPPER_TOLERANCE_KG };
