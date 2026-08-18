import { allocateNextMaterialBatchId, createMaterialBatch } from './materialBatches.js';

const DEFAULT_SAMPLE_MASS_KG = 10;
const MIN_SAMPLE_MASS_KG = 0.1;
// Prototype approximation for freshly acquired run-of-occurrence material.
const DEFAULT_INITIAL_PARTICLE_SIZE_MM = 80;

function assertSampleMassKg(sampleMassKg) {
  if (typeof sampleMassKg !== 'number' || Number.isNaN(sampleMassKg) || !Number.isFinite(sampleMassKg)) {
    throw new Error('sampleMassKg must be a finite number');
  }
  if (sampleMassKg < MIN_SAMPLE_MASS_KG) {
    throw new Error(`sampleMassKg must be at least ${MIN_SAMPLE_MASS_KG} kg`);
  }
}

function compositionToComponentsKg(compositionPercent, sampleMassKg) {
  const entries = Object.entries(compositionPercent);
  if (entries.length === 0) throw new Error('Occurrence composition is empty');

  const totalPercent = entries.reduce((sum, [, value]) => sum + value, 0);
  if (totalPercent <= 0) throw new Error('Occurrence composition must sum to a positive value');

  const componentsKg = {};
  let runningMassKg = 0;

  for (let i = 0; i < entries.length; i++) {
    const [componentId, percent] = entries[i];
    if (typeof percent !== 'number' || Number.isNaN(percent) || !Number.isFinite(percent) || percent < 0) {
      throw new Error(`Invalid composition percentage for component '${componentId}'`);
    }

    if (i === entries.length - 1) {
      componentsKg[componentId] = parseFloat((sampleMassKg - runningMassKg).toFixed(6));
    } else {
      const normalizedPercent = percent / totalPercent;
      const componentMassKg = parseFloat((sampleMassKg * normalizedPercent).toFixed(6));
      componentsKg[componentId] = componentMassKg;
      runningMassKg += componentMassKg;
    }
  }

  return componentsKg;
}


export function acquireSampleFromOccurrence(world, occurrenceId, sampleMassKg = DEFAULT_SAMPLE_MASS_KG) {
  if (!world?.resourceOccurrences) throw new Error('World resource occurrences map is required');
  if (!world?.materialBatches) throw new Error('World materialBatches map is required');
  if (!occurrenceId || typeof occurrenceId !== 'string') throw new Error('occurrenceId must be a non-empty string');

  assertSampleMassKg(sampleMassKg);

  const occurrence = world.resourceOccurrences[occurrenceId];
  if (!occurrence) throw new Error(`Occurrence '${occurrenceId}' does not exist in world state`);
  if (!occurrence.composition || typeof occurrence.composition !== 'object') {
    throw new Error(`Occurrence '${occurrenceId}' does not provide structured composition`);
  }

  const batch = createMaterialBatch({
    id: allocateNextMaterialBatchId(world),
    sourceOccurrenceId: occurrence.id,
    resourceId: occurrence.resourceId,
    particleSizeMm: DEFAULT_INITIAL_PARTICLE_SIZE_MM,
    provenance: {
      sourceOccurrenceIds: [occurrence.id],
      sourceBatchIds: [],
      createdByProcessRunId: null,
    },
    status: 'available',
    componentsKg: compositionToComponentsKg(occurrence.composition, sampleMassKg),
  });

  world.materialBatches[batch.id] = batch;
  return batch;
}

export { DEFAULT_SAMPLE_MASS_KG, MIN_SAMPLE_MASS_KG, DEFAULT_INITIAL_PARTICLE_SIZE_MM };
