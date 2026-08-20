import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createWorld } from '../src/core/world/worldState.js';
import { MATERIAL_FORMS, physicalFormForOccurrence } from '../src/core/materials/materialForms.js';
import { getMaterialSpecies, listMaterialSpecies } from '../src/core/materials/materialSpecies.js';
import { acquireSampleFromOccurrence } from '../src/core/materials/sampleAcquisition.js';
import { runProcessAndCommit } from '../src/core/processes/processExecution.js';
import { CRUSHING_PROCESS_ID, MAGNETIC_SEPARATION_PROCESS_ID } from '../src/core/processes/processDefinitions.js';

const PLACEHOLDER_IDS = new Set([
  'quartzAndGangue',
  'gangue-mixture',
  'gangue',
  'ironOxides',
  'other',
]);

function findOccurrence(resourceId) {
  for (let i = 0; i < 300; i++) {
    const world = createWorld(`species-coverage-${resourceId}-${i}`);
    const occurrence = Object.values(world.resourceOccurrences).find(item => item.resourceId === resourceId);
    if (occurrence) return { world, occurrence };
  }
  throw new Error(`Could not find generated '${resourceId}' occurrence`);
}

test('material species registry contains concrete species only with explicit magnetic-response data', () => {
  const species = listMaterialSpecies();
  assert.ok(species.length > 0);
  for (const item of species) {
    assert.notEqual(item.kind, 'pseudo-species', `Registry must not contain pseudo species '${item.id}'`);
    assert.equal(PLACEHOLDER_IDS.has(item.id), false, `Registry must not contain placeholder constituent '${item.id}'`);
    const coefficient = item.physicalProperties?.magneticResponse?.normalizedSeparationCoefficient;
    assert.equal(typeof coefficient, 'number', `Species '${item.id}' needs magnetic-response data`);
    assert.ok(Number.isFinite(coefficient), `Species '${item.id}' magnetic response must be finite`);
    assert.ok(coefficient >= 0 && coefficient <= 1, `Species '${item.id}' magnetic response must be normalized`);
  }
});

test('generated solid ResourceOccurrences always use registered concrete constituents', () => {
  let solidOccurrenceCount = 0;
  for (let i = 0; i < 60; i++) {
    const world = createWorld(`solid-species-world-${i}`);
    for (const occurrence of Object.values(world.resourceOccurrences)) {
      if (physicalFormForOccurrence(occurrence) !== MATERIAL_FORMS.SOLID_PARTICULATE) continue;
      solidOccurrenceCount++;
      assert.ok(occurrence.composition && typeof occurrence.composition === 'object',
        `Solid occurrence '${occurrence.resourceId}' must have a concrete composition`);
      assert.ok(Object.keys(occurrence.composition).length > 0,
        `Solid occurrence '${occurrence.resourceId}' composition must not be empty`);

      for (const constituentId of Object.keys(occurrence.composition)) {
        assert.equal(PLACEHOLDER_IDS.has(constituentId), false,
          `Generated occurrence '${occurrence.resourceId}' contains placeholder '${constituentId}'`);
        const species = getMaterialSpecies(constituentId);
        assert.ok(species, `Generated constituent '${constituentId}' must exist in MaterialSpecies registry`);
        assert.notEqual(species.kind, 'pseudo-species');
        assert.equal(typeof species.physicalProperties?.magneticResponse?.normalizedSeparationCoefficient, 'number',
          `Generated species '${constituentId}' must expose magnetic-response data`);
      }
    }
  }
  assert.ok(solidOccurrenceCount > 0, 'Expected generated solid ResourceOccurrences');
});

test('aluminum ore can be crushed and magnetically separated without unsupported-species failure', () => {
  const { world, occurrence } = findOccurrence('aluminum-ore');
  const sample = acquireSampleFromOccurrence(world, occurrence.id, 20);
  const crush = runProcessAndCommit(
    world,
    CRUSHING_PROCESS_ID,
    { feed: sample.id },
    { targetParticleSizeMm: 15 },
  );
  const crushedBatch = crush.outputBatches[0].batch;

  const separation = runProcessAndCommit(
    world,
    MAGNETIC_SEPARATION_PROCESS_ID,
    { feed: crushedBatch.id },
    { fieldStrength: 0.6 },
  );

  const concentrate = separation.outputBatches.find(output => output.outputId === 'concentrate')?.batch;
  const tailings = separation.outputBatches.find(output => output.outputId === 'tailings')?.batch;
  assert.ok(concentrate);
  assert.ok(tailings);
  assert.ok(Math.abs((concentrate.totalMassKg + tailings.totalMassKg) - sample.totalMassKg) < 1e-6);

  for (const constituentId of Object.keys(occurrence.composition)) {
    const recovered = (concentrate.componentsKg[constituentId] ?? 0) + (tailings.componentsKg[constituentId] ?? 0);
    assert.ok(Math.abs(recovered - sample.componentsKg[constituentId]) < 1e-6,
      `Magnetic separation must conserve '${constituentId}'`);
  }
});
