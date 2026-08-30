
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/core/world/worldState.js';
import { MATERIAL_FORMS, physicalFormForOccurrence } from '../src/core/materials/materialForms.js';
import { getMaterialSpecies, listMaterialSpecies } from '../src/core/materials/materialSpecies.js';

const PLACEHOLDER_IDS = new Set(['quartzAndGangue', 'gangue-mixture', 'gangue', 'ironOxides', 'other']);

test('material species registry contains concrete species only with explicit magnetic-response data', () => {
  for (const item of listMaterialSpecies()) {
    assert.notEqual(item.kind, 'pseudo-species');
    assert.equal(PLACEHOLDER_IDS.has(item.id), false);
    const coefficient = item.physicalProperties?.magneticResponse?.normalizedSeparationCoefficient;
    assert.equal(typeof coefficient, 'number');
    assert.ok(Number.isFinite(coefficient) && coefficient >= 0 && coefficient <= 1);
  }
});

test('generated solid ResourceOccurrences always use registered concrete constituents', () => {
  let count = 0;
  for (let i = 0; i < 60; i++) {
    const world = createWorld(`solid-species-world-${i}`);
    for (const occurrence of Object.values(world.resourceOccurrences)) {
      if (physicalFormForOccurrence(occurrence) !== MATERIAL_FORMS.SOLID_PARTICULATE) continue;
      count++;
      for (const constituentId of Object.keys(occurrence.composition ?? {})) {
        assert.equal(PLACEHOLDER_IDS.has(constituentId), false);
        assert.ok(getMaterialSpecies(constituentId));
      }
    }
  }
  assert.ok(count > 0);
});
