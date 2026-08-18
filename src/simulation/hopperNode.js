/** Hopper — minimal finite-capacity solid-material storage node. */

const HOPPER_TOLERANCE_KG = 1e-9;

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
  if (total === 0) particleSizeMm = null;
  else if (typeof particleSizeMm !== 'number' || !Number.isFinite(particleSizeMm) || particleSizeMm <= 0) {
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
    systemType: 'hopper',
    kind: 'primitive',
    ports: [
      { id: 'input', direction: 'input', kind: 'material', label: 'in' },
      { id: 'output', direction: 'output', kind: 'material', label: 'out' },
    ],
  };
}

export function createBoundaryBuffer({
  id,
  capacityKg,
  role,
  initialComponentsKg = {},
  initialParticleSizeMm = null,
} = {}) {
  if (role !== 'import' && role !== 'export') {
    throw new Error('Boundary buffer role must be import or export');
  }
  const hopper = createHopper({
    id,
    capacityKg,
    initialComponentsKg,
    initialParticleSizeMm,
  });
  hopper.systemType = 'boundary-buffer';
  hopper.boundaryRole = role;
  hopper.displayName = role === 'import' ? 'Import Boundary' : 'Export Boundary';
  return hopper;
}

export function hopperStoredMassKg(hopper) {
  return Object.values(hopper.storedComponentsKg).reduce((sum, kg) => sum + kg, 0);
}

export function hopperFreeCapacityKg(hopper) {
  return Math.max(0, hopper.capacityKg - hopperStoredMassKg(hopper));
}

export function hopperReceiveInflow(hopper, componentInflowKgPerSecond, particleSizeMm, dt) {
  if (typeof particleSizeMm !== 'number' || !Number.isFinite(particleSizeMm) || particleSizeMm <= 0) {
    throw new Error('hopperReceiveInflow: particleSizeMm must be a finite positive number');
  }
  if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) {
    throw new Error('hopperReceiveInflow: dt must be a finite positive number');
  }
  const freeKg = hopperFreeCapacityKg(hopper);
  if (freeKg <= HOPPER_TOLERANCE_KG) return 0;
  const requestedKg = Object.values(componentInflowKgPerSecond).reduce((sum, r) => sum + r * dt, 0);
  if (requestedKg <= 0) return 0;
  const factor = Math.min(1, freeKg / requestedKg);

  let actualTotal = 0;
  for (const [cid, rateKgPerS] of Object.entries(componentInflowKgPerSecond)) {
    const delta = rateKgPerS * dt * factor;
    hopper.storedComponentsKg[cid] = (hopper.storedComponentsKg[cid] ?? 0) + delta;
    actualTotal += delta;
  }

  const prevMass = hopperStoredMassKg(hopper) - actualTotal;
  if (hopper.particleSizeMm === null || prevMass <= HOPPER_TOLERANCE_KG) hopper.particleSizeMm = particleSizeMm;
  else hopper.particleSizeMm = (hopper.particleSizeMm * prevMass + particleSizeMm * actualTotal) / (prevMass + actualTotal);
  return actualTotal;
}

export function hopperWithdraw(hopper, requestedRatesKgPerSecond, dt) {
  if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) {
    throw new Error('hopperWithdraw: dt must be a finite positive number');
  }
  const storedMassKg = hopperStoredMassKg(hopper);
  if (storedMassKg <= HOPPER_TOLERANCE_KG) {
    return { actualRates: Object.fromEntries(Object.keys(requestedRatesKgPerSecond).map(cid => [cid, 0])), actualTotalKg: 0 };
  }
  const requestedTotalKg = Object.values(requestedRatesKgPerSecond).reduce((sum, r) => sum + r * dt, 0);
  if (requestedTotalKg <= 0) {
    return { actualRates: Object.fromEntries(Object.keys(requestedRatesKgPerSecond).map(cid => [cid, 0])), actualTotalKg: 0 };
  }
  const factor = Math.min(1, storedMassKg / requestedTotalKg);
  const actualRates = {};
  let actualTotalKg = 0;
  for (const [cid, rateKgPerS] of Object.entries(requestedRatesKgPerSecond)) {
    const requestedCidKg = rateKgPerS * dt * factor;
    const actualCidKg = Math.min(requestedCidKg, hopper.storedComponentsKg[cid] ?? 0);
    actualRates[cid] = actualCidKg / dt;
    hopper.storedComponentsKg[cid] = Math.max(0, (hopper.storedComponentsKg[cid] ?? 0) - actualCidKg);
    actualTotalKg += actualCidKg;
  }
  if (hopperStoredMassKg(hopper) <= HOPPER_TOLERANCE_KG) hopper.particleSizeMm = null;
  return { actualRates, actualTotalKg };
}

export { HOPPER_TOLERANCE_KG };
