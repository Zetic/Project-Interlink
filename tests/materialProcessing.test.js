import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/core/world/worldState.js';
import { createKnowledge, analyzeMaterialBatch } from '../src/core/world/knowledgeState.js';
import { acquireSampleFromOccurrence } from '../src/core/materials/sampleAcquisition.js';
import { executeProcess, runProcessAndCommit } from '../src/core/processes/processExecution.js';
import { getProcessDefinition, MAGNETIC_SEPARATION_PROCESS_ID } from '../src/core/processes/processDefinitions.js';
import { sumComponentMassKg } from '../src/core/materials/materialBatches.js';

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

test('sample acquisition from structured occurrence preserves requested mass and composition', () => {
  const { world, occurrence } = createWorldWithMagneticCompatibleOccurrence();
  const sampleMassKg = 10;

  const batch = acquireSampleFromOccurrence(world, occurrence.id, sampleMassKg);

  assert.strictEqual(batch.sourceOccurrenceId, occurrence.id);
  assert.strictEqual(batch.status, 'available');
  assert.ok(world.materialBatches[batch.id], 'Sample batch should be stored in world physical state');

  const componentSumKg = sumComponentMassKg(batch.componentsKg);
  assert.ok(Math.abs(componentSumKg - sampleMassKg) <= MASS_TOLERANCE_KG, `Component sum ${componentSumKg} should equal sample mass ${sampleMassKg}`);
  assert.ok(Math.abs(batch.totalMassKg - sampleMassKg) <= MASS_TOLERANCE_KG, `totalMassKg ${batch.totalMassKg} should equal sample mass ${sampleMassKg}`);

  const compositionTotal = Object.values(occurrence.composition).reduce((sum, value) => sum + value, 0);
  for (const [componentId, percent] of Object.entries(occurrence.composition)) {
    const expectedKg = sampleMassKg * (percent / compositionTotal);
    assert.ok(
      Math.abs(batch.componentsKg[componentId] - expectedKg) <= 1e-4,
      `Component '${componentId}' should match derived composition`
    );
  }

  assertFiniteNonNegativeComposition(batch.componentsKg);
});

test('sample analysis updates knowledge state only and records composition', () => {
  const { world, occurrence } = createWorldWithMagneticCompatibleOccurrence();
  const worldSnapshot = JSON.parse(JSON.stringify(world));
  const knowledge = createKnowledge(world);

  const batch = acquireSampleFromOccurrence(world, occurrence.id, 10);
  const analysis = analyzeMaterialBatch(knowledge, world, batch.id);

  assert.strictEqual(analysis.analysisState, 'analyzed');
  assert.strictEqual(analysis.totalMassKg, batch.totalMassKg);
  assert.deepStrictEqual(analysis.componentMassesKg, batch.componentsKg);

  // Only expected world mutation is sample creation (knowledge analysis must not change world truth)
  assert.deepStrictEqual(world.resourceOccurrences, worldSnapshot.resourceOccurrences);
});

test('process execution is deterministic for same batch and parameters', () => {
  const { world, occurrence } = createWorldWithMagneticCompatibleOccurrence();
  const batch = acquireSampleFromOccurrence(world, occurrence.id, 10);
  const processDefinition = getProcessDefinition(MAGNETIC_SEPARATION_PROCESS_ID);
  const parameters = { fieldStrength: 0.65 };

  const a = executeProcess(processDefinition, batch, parameters);
  const b = executeProcess(processDefinition, batch, parameters);

  assert.deepStrictEqual(a, b, 'Process execution should be deterministic');
});

test('magnetic separation conserves total mass and each constituent mass', () => {
  const { world, occurrence } = createWorldWithMagneticCompatibleOccurrence();
  const batch = acquireSampleFromOccurrence(world, occurrence.id, 10);

  const result = runProcessAndCommit(world, MAGNETIC_SEPARATION_PROCESS_ID, batch.id, { fieldStrength: 0.5 });

  assert.strictEqual(world.materialBatches[batch.id].status, 'consumed', 'Input batch should be consumed after committed run');
  assert.strictEqual(result.outputBatches.length, 2, 'Expected concentrate + tailings output batches');

  const concentrate = result.outputBatches.find(output => output.outputId === 'concentrate')?.batch;
  const tailings = result.outputBatches.find(output => output.outputId === 'tailings')?.batch;
  assert.ok(concentrate && tailings, 'Both concentrate and tailings outputs should exist');

  const inputComponents = batch.componentsKg;
  for (const componentId of Object.keys(inputComponents)) {
    const outMass = (concentrate.componentsKg[componentId] ?? 0) + (tailings.componentsKg[componentId] ?? 0);
    assert.ok(
      Math.abs(inputComponents[componentId] - outMass) <= MASS_TOLERANCE_KG,
      `Component '${componentId}' mass must be conserved`
    );
  }

  const totalOutKg = concentrate.totalMassKg + tailings.totalMassKg;
  assert.ok(Math.abs(batch.totalMassKg - totalOutKg) <= MASS_TOLERANCE_KG, 'Total mass should be conserved');
  assert.ok(Math.abs(result.metrics.balanceErrorKg) <= MASS_TOLERANCE_KG, 'Reported balance error should be within tolerance');

  assertFiniteNonNegativeComposition(concentrate.componentsKg);
  assertFiniteNonNegativeComposition(tailings.componentsKg);
});

test('unsupported input material is rejected clearly', () => {
  const world = createWorld('unsupported-material-seed');
  const processDefinition = getProcessDefinition(MAGNETIC_SEPARATION_PROCESS_ID);

  const fakeBatch = {
    id: 'batch-fake',
    sourceOccurrenceId: 'fake-occurrence',
    resourceId: 'copper-ore',
    status: 'available',
    totalMassKg: 10,
    componentsKg: {
      chalcopyrite: 6,
      pyrite: 4,
    },
  };

  assert.throws(
    () => executeProcess(processDefinition, fakeBatch, { fieldStrength: 0.5 }),
    /does not support resource|does not support component/
  );

  assert.deepStrictEqual(world.processResults, {}, 'Unsupported execution should not commit process results');
});

test('invalid process parameters are rejected clearly', () => {
  const { world, occurrence } = createWorldWithMagneticCompatibleOccurrence();
  const batch = acquireSampleFromOccurrence(world, occurrence.id, 10);

  assert.throws(
    () => runProcessAndCommit(world, MAGNETIC_SEPARATION_PROCESS_ID, batch.id, { fieldStrength: 1.5 }),
    /must be within \[0, 1\]/
  );
});

test('consumed input batch cannot be reused in committed state path', () => {
  const { world, occurrence } = createWorldWithMagneticCompatibleOccurrence();
  const batch = acquireSampleFromOccurrence(world, occurrence.id, 10);

  runProcessAndCommit(world, MAGNETIC_SEPARATION_PROCESS_ID, batch.id, { fieldStrength: 0.4 });

  assert.throws(
    () => runProcessAndCommit(world, MAGNETIC_SEPARATION_PROCESS_ID, batch.id, { fieldStrength: 0.7 }),
    /not available for processing/
  );
});
