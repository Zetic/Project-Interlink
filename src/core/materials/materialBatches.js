const MASS_TOLERANCE_KG = 1e-9;

function assertFiniteNonNegativeNumber(value, label) {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  if (value < 0) {
    throw new Error(`${label} must be non-negative`);
  }
}

export function roundKg(value) {
  return parseFloat(value.toFixed(6));
}

export function sumComponentMassKg(componentsKg) {
  return Object.values(componentsKg).reduce((sum, value) => sum + value, 0);
}

export function validateComponentsKg(componentsKg) {
  if (!componentsKg || typeof componentsKg !== 'object' || Array.isArray(componentsKg)) {
    throw new Error('componentsKg must be an object');
  }

  const entries = Object.entries(componentsKg);
  if (entries.length === 0) {
    throw new Error('componentsKg must contain at least one component');
  }

  for (const [componentId, massKg] of entries) {
    assertFiniteNonNegativeNumber(massKg, `Component '${componentId}' mass`);
  }
}

export function createMaterialBatch({
  id,
  sourceOccurrenceId,
  resourceId,
  status = 'available',
  componentsKg,
}) {
  if (!id || typeof id !== 'string') throw new Error('Material batch id must be a non-empty string');
  if (!sourceOccurrenceId || typeof sourceOccurrenceId !== 'string') {
    throw new Error('sourceOccurrenceId must be a non-empty string');
  }
  if (!resourceId || typeof resourceId !== 'string') throw new Error('resourceId must be a non-empty string');
  if (!['available', 'consumed'].includes(status)) throw new Error(`Unsupported batch status '${status}'`);

  validateComponentsKg(componentsKg);

  const normalizedComponentsKg = {};
  for (const [componentId, massKg] of Object.entries(componentsKg)) {
    normalizedComponentsKg[componentId] = roundKg(massKg);
  }

  const totalMassKg = roundKg(sumComponentMassKg(normalizedComponentsKg));
  if (totalMassKg <= MASS_TOLERANCE_KG) throw new Error('Material batch total mass must be greater than zero');

  return {
    id,
    sourceOccurrenceId,
    resourceId,
    status,
    totalMassKg,
    componentsKg: normalizedComponentsKg,
  };
}

export function componentsPercent(componentsKg) {
  validateComponentsKg(componentsKg);
  const totalMassKg = sumComponentMassKg(componentsKg);
  if (totalMassKg <= MASS_TOLERANCE_KG) {
    throw new Error('Cannot derive component percentages from zero total mass');
  }

  const percent = {};
  for (const [componentId, massKg] of Object.entries(componentsKg)) {
    percent[componentId] = parseFloat(((massKg / totalMassKg) * 100).toFixed(2));
  }
  return percent;
}

export function isMaterialBatchAvailable(batch) {
  return batch?.status === 'available';
}

export function allocateNextMaterialBatchId(world) {
  if (!world || typeof world.nextMaterialBatchOrdinal !== 'number') {
    throw new Error('World nextMaterialBatchOrdinal counter is required');
  }
  const ordinal = world.nextMaterialBatchOrdinal;
  world.nextMaterialBatchOrdinal += 1;
  return `batch-${ordinal}`;
}

export { MASS_TOLERANCE_KG };
