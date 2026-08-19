import { particleSizeBinIdForMm } from './particleSizeBins.js';
import {
  SOLID_MATERIAL_TOLERANCE as MASS_TOLERANCE_KG,
  addSolidFractionUnchecked,
  cloneSolidMaterialBody,
  createSolidMaterialBody,
  createSolidMaterialState,
  roundSolidQuantity,
  summarizeSolidMaterialByLiberationClass,
  summarizeSolidMaterialBySizeBin,
  summarizeSolidMaterialBySpecies,
  totalSolidQuantity,
  validateSolidMaterialBody,
} from './solidMaterialState.js';

function assertFiniteNonNegativeNumber(value, label) {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  if (value < 0) {
    throw new Error(`${label} must be non-negative`);
  }
}

function assertLegacyParticleSizeMm(value) {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new Error('particleSizeMm must be a finite number');
  }
  if (value <= 0) {
    throw new Error('particleSizeMm must be greater than zero');
  }
}

function normalizeStringIdArray(value, label) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);

  const seen = new Set();
  const normalized = [];
  for (const item of value) {
    if (!item || typeof item !== 'string') {
      throw new Error(`${label} entries must be non-empty strings`);
    }
    if (seen.has(item)) continue;
    seen.add(item);
    normalized.push(item);
  }
  return normalized;
}

export function normalizeMaterialProvenance(provenance = {}) {
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) {
    throw new Error('provenance must be an object');
  }

  const createdByProcessRunId = provenance.createdByProcessRunId ?? null;
  if (createdByProcessRunId != null && (typeof createdByProcessRunId !== 'string' || !createdByProcessRunId)) {
    throw new Error('provenance.createdByProcessRunId must be a non-empty string when provided');
  }

  return {
    sourceOccurrenceIds: normalizeStringIdArray(provenance.sourceOccurrenceIds, 'provenance.sourceOccurrenceIds'),
    sourceBatchIds: normalizeStringIdArray(provenance.sourceBatchIds, 'provenance.sourceBatchIds'),
    createdByProcessRunId,
  };
}

export function roundKg(value) {
  return roundSolidQuantity(value);
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

function legacyMaterialBodyFromComponents(componentsKg, particleSizeMm, liberationClassId = 'partial') {
  validateComponentsKg(componentsKg);
  assertLegacyParticleSizeMm(particleSizeMm);
  const solidState = createSolidMaterialState();
  const sizeBinId = particleSizeBinIdForMm(particleSizeMm);
  for (const [speciesId, massKg] of Object.entries(componentsKg)) {
    addSolidFractionUnchecked(solidState, { speciesId, sizeBinId, liberationClassId, quantity: roundKg(massKg) });
  }
  return createSolidMaterialBody(solidState);
}

function summarizeMaterialBody(materialBody) {
  validateSolidMaterialBody(materialBody);
  const componentsKg = summarizeSolidMaterialBySpecies(materialBody.solidState);
  const totalMassKg = roundKg(totalSolidQuantity(materialBody.solidState));
  return {
    componentsKg,
    totalMassKg,
    sizeDistributionKg: summarizeSolidMaterialBySizeBin(materialBody.solidState),
    liberationDistributionKg: summarizeSolidMaterialByLiberationClass(materialBody.solidState),
  };
}

export function createMaterialBatch({
  id,
  sourceOccurrenceId = null,
  resourceId = null,
  materialBody = null,
  particleSizeMm = null,
  provenance = {},
  status = 'available',
  componentsKg = null,
}) {
  if (!id || typeof id !== 'string') throw new Error('Material batch id must be a non-empty string');
  if (sourceOccurrenceId != null && (typeof sourceOccurrenceId !== 'string' || !sourceOccurrenceId)) {
    throw new Error('sourceOccurrenceId must be a non-empty string when provided');
  }
  if (resourceId != null && (typeof resourceId !== 'string' || !resourceId)) {
    throw new Error('resourceId must be a non-empty string when provided');
  }
  if (!['available', 'consumed'].includes(status)) throw new Error(`Unsupported batch status '${status}'`);

  const normalizedMaterialBody = materialBody
    ? cloneSolidMaterialBody(materialBody)
    : legacyMaterialBodyFromComponents(componentsKg, particleSizeMm);
  const normalizedProvenance = normalizeMaterialProvenance(provenance);
  const summary = summarizeMaterialBody(normalizedMaterialBody);
  if (summary.totalMassKg <= MASS_TOLERANCE_KG) throw new Error('Material batch total mass must be greater than zero');

  return {
    id,
    sourceOccurrenceId,
    resourceId,
    physicalForm: normalizedMaterialBody.physicalForm,
    particleSizeMm,
    materialBody: normalizedMaterialBody,
    provenance: normalizedProvenance,
    status,
    totalMassKg: summary.totalMassKg,
    componentsKg: summary.componentsKg,
    sizeDistributionKg: summary.sizeDistributionKg,
    liberationDistributionKg: summary.liberationDistributionKg,
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
