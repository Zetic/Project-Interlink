import { allocateNextMaterialBatchId, createMaterialBatch } from './materialBatches.js';
import { createSolidMaterialBodyFromOccurrence } from './occurrenceMaterialization.js';

const DEFAULT_SAMPLE_MASS_KG = 10;
const MIN_SAMPLE_MASS_KG = 0.1;
const DEFAULT_INITIAL_PARTICLE_SIZE_MM = 120;

function assertSampleMassKg(sampleMassKg) {
  if (typeof sampleMassKg !== 'number' || Number.isNaN(sampleMassKg) || !Number.isFinite(sampleMassKg)) {
    throw new Error('sampleMassKg must be a finite number');
  }
  if (sampleMassKg < MIN_SAMPLE_MASS_KG) {
    throw new Error(`sampleMassKg must be at least ${MIN_SAMPLE_MASS_KG} kg`);
  }
}

export function acquireSampleFromOccurrence(world, occurrenceId, sampleMassKg = DEFAULT_SAMPLE_MASS_KG) {
  if (!world?.resourceOccurrences) throw new Error('World resource occurrences map is required');
  if (!world?.materialBatches) throw new Error('World materialBatches map is required');
  if (!occurrenceId || typeof occurrenceId !== 'string') throw new Error('occurrenceId must be a non-empty string');

  assertSampleMassKg(sampleMassKg);

  const occurrence = world.resourceOccurrences[occurrenceId];
  if (!occurrence) throw new Error(`Occurrence '${occurrenceId}' does not exist in world state`);

  const batch = createMaterialBatch({
    id: allocateNextMaterialBatchId(world),
    sourceOccurrenceId: occurrence.id,
    resourceId: occurrence.resourceId,
    materialBody: createSolidMaterialBodyFromOccurrence(occurrence, sampleMassKg),
    particleSizeMm: DEFAULT_INITIAL_PARTICLE_SIZE_MM,
    provenance: {
      sourceOccurrenceIds: [occurrence.id],
      sourceBatchIds: [],
      createdByProcessRunId: null,
    },
    status: 'available',
  });

  world.materialBatches[batch.id] = batch;
  return batch;
}

export { DEFAULT_SAMPLE_MASS_KG, MIN_SAMPLE_MASS_KG, DEFAULT_INITIAL_PARTICLE_SIZE_MM };
