export const PARTICLE_SIZE_BINS = Object.freeze([
  Object.freeze({ id: 'lt-0.032mm', name: '<32 µm', minMm: 0, maxMm: 0.032, representativeMm: 0.016 }),
  Object.freeze({ id: '0.032-0.063mm', name: '32–63 µm', minMm: 0.032, maxMm: 0.063, representativeMm: 0.0475 }),
  Object.freeze({ id: '0.063-0.125mm', name: '63–125 µm', minMm: 0.063, maxMm: 0.125, representativeMm: 0.094 }),
  Object.freeze({ id: '0.125-0.25mm', name: '125–250 µm', minMm: 0.125, maxMm: 0.25, representativeMm: 0.1875 }),
  Object.freeze({ id: '0.25-0.5mm', name: '250–500 µm', minMm: 0.25, maxMm: 0.5, representativeMm: 0.375 }),
  Object.freeze({ id: '0.5-1mm', name: '0.5–1 mm', minMm: 0.5, maxMm: 1, representativeMm: 0.75 }),
  Object.freeze({ id: '1-5mm', name: '1–5 mm', minMm: 1, maxMm: 5, representativeMm: 3 }),
  Object.freeze({ id: '5-15mm', name: '5–15 mm', minMm: 5, maxMm: 15, representativeMm: 10 }),
  Object.freeze({ id: '15-25mm', name: '15–25 mm', minMm: 15, maxMm: 25, representativeMm: 20 }),
  Object.freeze({ id: '25-60mm', name: '25–60 mm', minMm: 25, maxMm: 60, representativeMm: 42.5 }),
  Object.freeze({ id: '60-120mm', name: '60–120 mm', minMm: 60, maxMm: 120, representativeMm: 90 }),
  Object.freeze({ id: '120-250mm', name: '120–250 mm', minMm: 120, maxMm: 250, representativeMm: 185 }),
  Object.freeze({ id: '250-500mm', name: '250–500 mm', minMm: 250, maxMm: 500, representativeMm: 375 }),
  Object.freeze({ id: '500-1000mm', name: '500–1000 mm', minMm: 500, maxMm: 1000, representativeMm: 750 }),
  Object.freeze({ id: '1000mm-plus', name: '1000+ mm', minMm: 1000, maxMm: Infinity, representativeMm: 1200 }),
]);

const PARTICLE_SIZE_BIN_BY_ID = Object.freeze(Object.fromEntries(
  PARTICLE_SIZE_BINS.map((bin, index) => [bin.id, Object.freeze({ ...bin, index })])
));

// Compatibility-only aliases for fraction keys produced before the staged
// comminution model. New staged comminution emits the expanded canonical bins.
const LEGACY_PARTICLE_SIZE_BINS = Object.freeze({
  'lt-1mm': Object.freeze({
    id: 'lt-1mm',
    name: '<1 mm (legacy)',
    minMm: 0,
    maxMm: 1,
    representativeMm: 0.5,
    index: PARTICLE_SIZE_BINS.findIndex(bin => bin.id === '0.5-1mm'),
  }),
  '120mm-plus': Object.freeze({
    id: '120mm-plus',
    name: '120+ mm (legacy)',
    minMm: 120,
    maxMm: Infinity,
    representativeMm: 140,
    index: PARTICLE_SIZE_BINS.findIndex(bin => bin.id === '120-250mm'),
  }),
});

export function listParticleSizeBins() {
  return PARTICLE_SIZE_BINS;
}

export function getParticleSizeBin(binId) {
  return PARTICLE_SIZE_BIN_BY_ID[binId] ?? LEGACY_PARTICLE_SIZE_BINS[binId] ?? null;
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
  // The old generic Crusher and historical process fixtures used an explicit
  // broad <1 mm class. Keep the exact 1 mm lookup stable for that compatibility
  // path; new Ball Mill settings are below 1 mm and resolve to canonical fine bins.
  if (sizeMm === 1) return 'lt-1mm';
  // Exact cut points map to the finer/lower bin so a target like 15 mm means
  // “no coarser than 15 mm”, not the next coarser 15–25 mm product class.
  return PARTICLE_SIZE_BINS.find(bin => sizeMm <= bin.maxMm)?.id
    ?? PARTICLE_SIZE_BINS[PARTICLE_SIZE_BINS.length - 1].id;
}

export function representativeParticleSizeMm(binId) {
  return requireParticleSizeBin(binId).representativeMm;
}
