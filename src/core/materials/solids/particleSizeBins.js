export const PARTICLE_SIZE_BINS = Object.freeze([
  Object.freeze({ id: 'lt-1mm', name: '<1 mm', minMm: 0, maxMm: 1, representativeMm: 0.5 }),
  Object.freeze({ id: '1-5mm', name: '1–5 mm', minMm: 1, maxMm: 5, representativeMm: 3 }),
  Object.freeze({ id: '5-15mm', name: '5–15 mm', minMm: 5, maxMm: 15, representativeMm: 10 }),
  Object.freeze({ id: '15-25mm', name: '15–25 mm', minMm: 15, maxMm: 25, representativeMm: 20 }),
  Object.freeze({ id: '25-60mm', name: '25–60 mm', minMm: 25, maxMm: 60, representativeMm: 42.5 }),
  Object.freeze({ id: '60-120mm', name: '60–120 mm', minMm: 60, maxMm: 120, representativeMm: 90 }),
  Object.freeze({ id: '120mm-plus', name: '120+ mm', minMm: 120, maxMm: Infinity, representativeMm: 140 }),
]);

const PARTICLE_SIZE_BIN_BY_ID = Object.freeze(Object.fromEntries(PARTICLE_SIZE_BINS.map((bin, index) => [bin.id, Object.freeze({ ...bin, index })])));

export function listParticleSizeBins() {
  return PARTICLE_SIZE_BINS;
}

export function getParticleSizeBin(binId) {
  return PARTICLE_SIZE_BIN_BY_ID[binId] ?? null;
}

export function requireParticleSizeBin(binId) {
  const bin = getParticleSizeBin(binId);
  if (!bin) throw new Error(`Unknown particle-size bin '${binId}'`);
  return bin;
}

export function particleSizeBinIndex(binId) {
  return requireParticleSizeBin(binId).index;
}

export function particleSizeBinIdForMm(sizeMm) {
  if (typeof sizeMm !== 'number' || !Number.isFinite(sizeMm) || sizeMm <= 0) {
    throw new Error('particle size must be a finite positive number');
  }
  // Exact cut points map to the finer/lower bin so a target like 15 mm means
  // “no coarser than 15 mm”, not the next coarser 15–25 mm product class.
  return PARTICLE_SIZE_BINS.find(bin => sizeMm <= bin.maxMm)?.id ?? PARTICLE_SIZE_BINS[PARTICLE_SIZE_BINS.length - 1].id;
}

export function representativeParticleSizeMm(binId) {
  return requireParticleSizeBin(binId).representativeMm;
}
