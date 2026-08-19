import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, validateWorld } from '../src/core/world/worldState.js';
import { createKnowledge, analyzeMaterialBatch } from '../src/core/world/knowledgeState.js';
import {
  acquireSampleFromOccurrence,
  DEFAULT_INITIAL_PARTICLE_SIZE_MM,
  MIN_SAMPLE_MASS_KG,
} from '../src/core/materials/sampleAcquisition.js';
import { executeProcess, runProcessAndCommit } from '../src/core/processes/processExecution.js';
import {
  CRUSHING_PROCESS_ID,
  getProcessDefinition,
  MAGNETIC_SEPARATION_PROCESS_ID,
} from '../src/core/processes/processDefinitions.js';
import { createMaterialBatch, sumComponentMassKg } from '../src/core/materials/materialBatches.js';

const MASS_TOLERANCE_KG = 1e-6;

function createWorldWithMagneticCompatibleOccurrence() {
  for (let i = 0; i < 120; i++) {
    const world = createWorld(`material-processing-${i}`);
    const occurrence = Object.values(world.resourceOccurrences).find(occ =>
      occ.resourceId === 'iron-ore' && occ.composition && typeof occ.composition === 'object'
    );

    if (occurrence) {
      return { world, occurrence };
    }
  }

  throw new Error('Could not find iron-ore occurrence with structured composition in test seed range');
}

function assertFiniteNonNegativeComposition(componentsKg) {
  for (const [componentId, massKg] of Object.entries(componentsKg)) {
    assert.ok(typeof massKg === 'number' && Number.isFinite(massKg), `Component '${componentId}' mass must be finite`);
    assert.ok(massKg >= 0, `Component '${componentId}' mass must be non-negative`);
  }
}

function runTwoStageChain({ sampleMassKg = 10, targetParticleSizeMm = 12, fieldStrength = 0.6 } = {}) {
  const { world, occurrence } = createWorldWithMagneticCompatibleOccurrence();
  const sample = acquireSampleFromOccurrence(world, occurrence.id, sampleMassKg);
  const crushResult = runProcessAndCommit(
    world,
    CRUSHING_PROCESS_ID,
    { feed: sample.id },
    { targetParticleSizeMm }
  );
  const crushedBatchId = crushResult.outputBatches[0].batchId;
  const separationResult = runProcessAndCommit(
    world,
    MAGNETIC_SEPARATION_PROCESS_ID,
    { feed: crushedBatchId },
    { fieldStrength }
  );

  return { world, occurrence, sample, crushResult, crushedBatchId, separationResult };
}

test('sample acquisition from structured occurrence preserves composition and sets provenance/particle size', () => {
  const { world, occurrence } = createWorldWithMagneticCompatibleOccurrence();
  const sampleMassKg = 10;

  const batch = acquireSampleFromOccurrence(world, occurrence.id, sampleMassKg);

  assert.strictEqual(batch.sourceOccurrenceId, occurrence.id);
  assert.strictEqual(batch.resourceId, occurrence.resourceId);
  assert.strictEqual(batch.status, 'available');
  assert.strictEqual(batch.particleSizeMm, DEFAULT_INITIAL_PARTICLE_SIZE_MM);
  assert.deepStrictEqual(batch.provenance, {
    sourceOccurrenceIds: [occurrence.id],
    sourceBatchIds: [],
    createdByProcessRunId: null,
  });
  assert.ok(world.materialBatches[batch.id], 'Sample batch should be stored in world physical state');

  const componentSumKg = sumComponentMassKg(batch.componentsKg);
  assert.ok(
    Math.abs(componentSumKg - sampleMassKg) <= MASS_TOLERANCE_KG,
    `Component sum ${componentSumKg} should equal sample mass ${sampleMassKg}`
  );
  assert.ok(
    Math.abs(batch.totalMassKg - sampleMassKg) <= MASS_TOLERANCE_KG,
    `totalMassKg ${batch.totalMassKg} should equal sample mass ${sampleMassKg}`
  );

  const compositionTotal = Object.values(occurrence.composition).reduce((sum, value) => sum + value, 0);
  for (const [componentId, percent] of Object.entries(occurrence.composition)) {
    const expectedKg = sampleMassKg * (percent / compositionTotal);
    assert.ok(
      Math.abs(batch.componentsKg[componentId] - expectedKg) <= 1e-4,
      `Component '${componentId}' should match the generated occurrence composition`
    );
  }

  assertFiniteNonNegativeComposition(batch.componentsKg);
});

test('sample acquisition rejects masses below the supported prototype minimum without mutating world', () => {
  const { world, occurrence } = createWorldWithMagneticCompatibleOccurrence();
  const worldSnapshot = JSON.parse(JSON.stringify(world));

  assert.throws(
    () => acquireSampleFromOccurrence(world, occurrence.id, MIN_SAMPLE_MASS_KG / 2),
    /must be at least/
  );

  assert.deepStrictEqual(world, worldSnapshot, 'Rejected acquisition must leave physical world state unchanged');
});

test('sample analysis updates knowledge state only and records composition', () => {
  const { world, occurrence } = createWorldWithMagneticCompatibleOccurrence();
  const knowledge = createKnowledge(world);
  const batch = acquireSampleFromOccurrence(world, occurrence.id, 10);
  const worldSnapshot = JSON.parse(JSON.stringify(world));

  const analysis = analyzeMaterialBatch(knowledge, world, batch.id);

  assert.strictEqual(analysis.analysisState, 'analyzed');
  assert.strictEqual(analysis.totalMassKg, batch.totalMassKg);
  assert.deepStrictEqual(analysis.componentMassesKg, batch.componentsKg);
  assert.deepStrictEqual(world, worldSnapshot, 'Knowledge analysis must not mutate any physical world state');
});

test('process execution is deterministic for same batch and parameters', () => {
  const { world, occurrence } = createWorldWithMagneticCompatibleOccurrence();
  const batch = acquireSampleFromOccurrence(world, occurrence.id, 10);
  const processDefinition = getProcessDefinition(CRUSHING_PROCESS_ID);
  const parameters = { targetParticleSizeMm: 15 };

  const a = executeProcess(processDefinition, { feed: batch }, parameters);
  const b = executeProcess(processDefinition, { feed: batch }, parameters);

  assert.deepStrictEqual(a, b, 'Process execution should be deterministic');
});

test('crushing conserves mass and constituents while reducing particle size', () => {
  const { world, occurrence } = createWorldWithMagneticCompatibleOccurrence();
  const batch = acquireSampleFromOccurrence(world, occurrence.id, 10);

  const result = runProcessAndCommit(
    world,
    CRUSHING_PROCESS_ID,
    { feed: batch.id },
    { targetParticleSizeMm: 15 }
  );

  assert.strictEqual(world.materialBatches[batch.id].status, 'consumed', 'Input batch should be consumed after committed run');
  assert.strictEqual(result.outputBatches.length, 1, 'Expected one crushed output batch');
  assert.deepStrictEqual(result.inputBindings, [{ inputId: 'feed', batchId: batch.id }]);

  const crushed = result.outputBatches[0].batch;
  assert.strictEqual(crushed.particleSizeMm, 15, 'Crushing should set particle size to target');

  for (const componentId of Object.keys(batch.componentsKg)) {
    assert.ok(
      Math.abs(batch.componentsKg[componentId] - crushed.componentsKg[componentId]) <= MASS_TOLERANCE_KG,
      `Component '${componentId}' mass must be conserved in crushing`
    );
  }

  assert.ok(
    Math.abs(batch.totalMassKg - crushed.totalMassKg) <= MASS_TOLERANCE_KG,
    'Total mass should be conserved in crushing'
  );
  assert.deepStrictEqual(crushed.provenance.sourceOccurrenceIds, [occurrence.id]);
  assert.deepStrictEqual(crushed.provenance.sourceBatchIds, [batch.id]);
  assert.strictEqual(crushed.provenance.createdByProcessRunId, result.id);
});

test('invalid crushing parameters fail clearly and committed state remains atomic', () => {
  const { world, occurrence } = createWorldWithMagneticCompatibleOccurrence();
  const batch = acquireSampleFromOccurrence(world, occurrence.id, 10);
  const worldSnapshot = JSON.parse(JSON.stringify(world));

  assert.throws(
    () => runProcessAndCommit(
      world,
      CRUSHING_PROCESS_ID,
      { feed: batch.id },
      { targetParticleSizeMm: 0 }
    ),
    /must be within \[1, 120\]/
  );

  assert.deepStrictEqual(world, worldSnapshot, 'Failed crushing commit must not consume input, create outputs, or advance counters');
});

test('generic process dispatch rejects missing/unknown input bindings, unexpected parameters, and unknown process', () => {
  const { world, occurrence } = createWorldWithMagneticCompatibleOccurrence();
  const batch = acquireSampleFromOccurrence(world, occurrence.id, 10);

  assert.throws(
    () => runProcessAndCommit(world, CRUSHING_PROCESS_ID, {}, { targetParticleSizeMm: 10 }),
    /Missing required input binding 'feed'/
  );

  assert.throws(
    () => runProcessAndCommit(
      world,
      CRUSHING_PROCESS_ID,
      { feed: batch.id, extra: batch.id },
      { targetParticleSizeMm: 10 }
    ),
    /Unknown input binding 'extra'/
  );

  assert.throws(
    () => runProcessAndCommit(
      world,
      CRUSHING_PROCESS_ID,
      { feed: batch.id },
      { targetParticleSizeMm: 10, typoParameter: 1 }
    ),
    /Unknown process parameter 'typoParameter'/
  );

  assert.throws(
    () => runProcessAndCommit(world, 'unknown-process', { feed: batch.id }, {}),
    /Unknown process/
  );
});

test('generic process contracts reject duplicate physical input bindings and output-port mismatches', () => {
  const { world, occurrence } = createWorldWithMagneticCompatibleOccurrence();
  const batch = acquireSampleFromOccurrence(world, occurrence.id, 10);
  const crushingDefinition = getProcessDefinition(CRUSHING_PROCESS_ID);

  const originalInputs = crushingDefinition.inputs;
  crushingDefinition.inputs = [
    { id: 'feed', kind: 'material' },
    { id: 'secondFeed', kind: 'material' },
  ];
  try {
    assert.throws(
      () => runProcessAndCommit(
        world,
        CRUSHING_PROCESS_ID,
        { feed: batch.id, secondFeed: batch.id },
        { targetParticleSizeMm: 10 }
      ),
      /cannot bind the same physical batch to multiple input ports/
    );
  } finally {
    crushingDefinition.inputs = originalInputs;
  }

  const originalOutputs = crushingDefinition.outputs;
  crushingDefinition.outputs = [{ id: 'renamed-product', kind: 'material' }];
  try {
    assert.throws(
      () => executeProcess(crushingDefinition, { feed: batch }, { targetParticleSizeMm: 10 }),
      /unexpected output port 'product'/
    );
  } finally {
    crushingDefinition.outputs = originalOutputs;
  }
});

test('magnetic separation rejects coarse feed and accepts crushed feed', () => {
  const { world, occurrence } = createWorldWithMagneticCompatibleOccurrence();
  const batch = acquireSampleFromOccurrence(world, occurrence.id, 10);

  assert.throws(
    () => runProcessAndCommit(
      world,
      MAGNETIC_SEPARATION_PROCESS_ID,
      { feed: batch.id },
      { fieldStrength: 0.5 }
    ),
    /requires feed particle size <=/
  );

  const crushResult = runProcessAndCommit(
    world,
    CRUSHING_PROCESS_ID,
    { feed: batch.id },
    { targetParticleSizeMm: 15 }
  );
  const crushedBatchId = crushResult.outputBatches[0].batchId;

  const result = runProcessAndCommit(
    world,
    MAGNETIC_SEPARATION_PROCESS_ID,
    { feed: crushedBatchId },
    { fieldStrength: 0.5 }
  );

  const concentrate = result.outputBatches.find(output => output.outputId === 'concentrate')?.batch;
  const tailings = result.outputBatches.find(output => output.outputId === 'tailings')?.batch;
  assert.ok(concentrate && tailings, 'Both concentrate and tailings outputs should exist');
  assert.strictEqual(concentrate.particleSizeMm, 15);
  assert.strictEqual(tailings.particleSizeMm, 15);

  const crushedBatch = world.materialBatches[crushedBatchId];
  for (const componentId of Object.keys(crushedBatch.componentsKg)) {
    const outMass = (concentrate.componentsKg[componentId] ?? 0) + (tailings.componentsKg[componentId] ?? 0);
    assert.ok(
      Math.abs(crushedBatch.componentsKg[componentId] - outMass) <= MASS_TOLERANCE_KG,
      `Component '${componentId}' mass must be conserved through magnetic separation`
    );
  }

  assertFiniteNonNegativeComposition(concentrate.componentsKg);
  assertFiniteNonNegativeComposition(tailings.componentsKg);
});

test('full crushing -> magnetic chain conserves original sample matter and prevents consumed-batch reuse', () => {
  const { world, sample, crushedBatchId, separationResult } = runTwoStageChain();

  const concentrate = separationResult.outputBatches.find(output => output.outputId === 'concentrate')?.batch;
  const tailings = separationResult.outputBatches.find(output => output.outputId === 'tailings')?.batch;
  assert.ok(concentrate && tailings, 'Both final outputs should exist');

  for (const componentId of Object.keys(sample.componentsKg)) {
    const finalMass = (concentrate.componentsKg[componentId] ?? 0) + (tailings.componentsKg[componentId] ?? 0);
    assert.ok(
      Math.abs(sample.componentsKg[componentId] - finalMass) <= MASS_TOLERANCE_KG,
      `Component '${componentId}' mass must be conserved across complete chain`
    );
  }

  const finalTotalKg = concentrate.totalMassKg + tailings.totalMassKg;
  assert.ok(
    Math.abs(sample.totalMassKg - finalTotalKg) <= MASS_TOLERANCE_KG,
    'Total mass must be conserved across complete chain'
  );

  assert.throws(
    () => runProcessAndCommit(
      world,
      MAGNETIC_SEPARATION_PROCESS_ID,
      { feed: crushedBatchId },
      { fieldStrength: 0.7 }
    ),
    /not available for processing/
  );
});

test('full crushing -> magnetic chain is deterministic for identical world/input/parameters', () => {
  const a = runTwoStageChain({ sampleMassKg: 10, targetParticleSizeMm: 12, fieldStrength: 0.6 });
  const b = runTwoStageChain({ sampleMassKg: 10, targetParticleSizeMm: 12, fieldStrength: 0.6 });

  assert.deepStrictEqual(a.world.materialBatches, b.world.materialBatches, 'Chained material state should be deterministic');
  assert.deepStrictEqual(a.world.processResults, b.world.processResults, 'Chained process results should be deterministic');
});

test('provenance references resolve via validateWorld after chained processing', () => {
  const { world } = runTwoStageChain({ targetParticleSizeMm: 10, fieldStrength: 0.55 });

  const errors = validateWorld(world);
  assert.deepStrictEqual(errors, [], `validateWorld returned errors: ${JSON.stringify(errors)}`);
});

test('validateWorld reports malformed schema-v4 provenance/bindings without throwing', () => {
  const { world, occurrence } = createWorldWithMagneticCompatibleOccurrence();
  const sample = acquireSampleFromOccurrence(world, occurrence.id, 10);

  sample.provenance.sourceOccurrenceIds = 'not-an-array';
  world.processResults['process-run-malformed'] = {
    id: 'process-run-malformed',
    processId: CRUSHING_PROCESS_ID,
    inputBindings: { feed: sample.id },
    outputBatches: null,
    parameters: { targetParticleSizeMm: 10 },
    metrics: { massInKg: 10, massOutKg: 10, balanceErrorKg: 0 },
  };

  let errors;
  assert.doesNotThrow(() => {
    errors = validateWorld(world);
  }, 'validateWorld should report malformed serialized structures rather than throwing');

  assert.ok(
    errors.some(error => error.includes('provenance.sourceOccurrenceIds') && error.includes('must be an array')),
    'Malformed provenance array should be reported'
  );
  assert.ok(
    errors.some(error => error.includes("process-run-malformed") && error.includes('inputBindings must be an array')),
    'Malformed inputBindings should be reported'
  );
  assert.ok(
    errors.some(error => error.includes("process-run-malformed") && error.includes('outputBatches must be an array')),
    'Malformed outputBatches should be reported'
  );
});

test('invalid process parameters and unsupported components are rejected clearly', () => {
  const { world, occurrence } = createWorldWithMagneticCompatibleOccurrence();
  const batch = acquireSampleFromOccurrence(world, occurrence.id, 10);

  assert.throws(
    () => runProcessAndCommit(
      world,
      MAGNETIC_SEPARATION_PROCESS_ID,
      { feed: batch.id },
      { fieldStrength: 1.5 }
    ),
    /must be within \[0, 1\]/
  );

  const processDefinition = getProcessDefinition(MAGNETIC_SEPARATION_PROCESS_ID);
  const fakeBatch = {
    id: 'batch-fake',
    resourceId: 'copper-ore',
    particleSizeMm: 5,
    status: 'available',
    componentsKg: {
      chalcopyrite: 6,
      pyrite: 4,
    },
  };

  assert.throws(
    () => executeProcess(processDefinition, { feed: fakeBatch }, { fieldStrength: 0.5 }),
    /does not support species 'chalcopyrite' without magnetic response data/
  );
});

test('failed committed process with invalid output batch remains atomic', () => {
  const { world, occurrence } = createWorldWithMagneticCompatibleOccurrence();
  const tinyBatch = createMaterialBatch({
    id: 'batch-tiny',
    sourceOccurrenceId: occurrence.id,
    resourceId: 'iron-ore',
    particleSizeMm: 5,
    provenance: {
      sourceOccurrenceIds: [occurrence.id],
      sourceBatchIds: [],
      createdByProcessRunId: null,
    },
    status: 'available',
    componentsKg: {
      quartzAndGangue: 0.000001,
    },
  });
  world.materialBatches[tinyBatch.id] = tinyBatch;
  const worldSnapshot = JSON.parse(JSON.stringify(world));

  assert.throws(
    () => runProcessAndCommit(
      world,
      MAGNETIC_SEPARATION_PROCESS_ID,
      { feed: tinyBatch.id },
      { fieldStrength: 0 }
    ),
    /total mass must be greater than zero/
  );

  assert.deepStrictEqual(world, worldSnapshot, 'Failed process commit must not consume input, create outputs, or advance counters');
});
