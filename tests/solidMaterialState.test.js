
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld as createWorld } from '../src/generator/generateWorld.js';
import { createSolidMaterialBodyFromOccurrence } from '../src/core/materials/occurrenceMaterialization.js';
import {
  addSolidMaterialState, createSolidMaterialState, summarizeSolidMaterialByLiberationClass,
  summarizeSolidMaterialBySizeBin, summarizeSolidMaterialBySpecies, totalSolidQuantity,
  withdrawSolidMaterialState, SOLID_MATERIAL_TOLERANCE, validateSolidMaterialState,
} from '../src/core/materials/solids/solidMaterialState.js';
import { particleSizeBinIdForMm } from '../src/core/materials/solids/particleSizeBins.js';

const TOL = 1e-9;
const close = (a, b) => assert.ok(Math.abs(a - b) <= TOL, `${a} != ${b}`);
function findOccurrence(resourceId) {
  for (let i = 0; i < 250; i++) {
    const world = createWorld(`solid-material-${resourceId}-${i}`);
    const occurrence = Object.values(world.resourceOccurrences).find(item => item.resourceId === resourceId && item.composition);
    if (occurrence) return occurrence;
  }
  throw new Error(`Could not find ${resourceId}`);
}

test('solid material state merges identical descriptors and summarizes sparse populations', () => {
  const state = createSolidMaterialState([
    { speciesId: 'hematite', sizeBinId: '5-15mm', liberationClassId: 'locked', quantity: 2 },
    { speciesId: 'hematite', sizeBinId: '5-15mm', liberationClassId: 'locked', quantity: 3 },
    { speciesId: 'hematite', sizeBinId: '15-25mm', liberationClassId: 'locked', quantity: 4 },
    { speciesId: 'hematite', sizeBinId: '5-15mm', liberationClassId: 'liberated', quantity: 5 },
    { speciesId: 'quartz', sizeBinId: '5-15mm', liberationClassId: 'liberated', quantity: SOLID_MATERIAL_TOLERANCE / 2 },
  ]);
  assert.equal(totalSolidQuantity(state), 14);
  assert.deepEqual(summarizeSolidMaterialBySpecies(state), { hematite: 14 });
  assert.deepEqual(summarizeSolidMaterialBySizeBin(state), { '5-15mm': 10, '15-25mm': 4 });
  assert.deepEqual(summarizeSolidMaterialByLiberationClass(state), { locked: 9, liberated: 5 });
});

test('canonical sparse add/withdraw utilities conserve mass for authoring and serialization', () => {
  const source = createSolidMaterialState([
    { speciesId: 'hematite', sizeBinId: '5-15mm', liberationClassId: 'partial', quantity: 20 },
    { speciesId: 'quartz', sizeBinId: '1-5mm', liberationClassId: 'liberated', quantity: 10 },
  ]);
  const initial = totalSolidQuantity(source);
  const copy = createSolidMaterialState();
  addSolidMaterialState(copy, source, 0.5);
  close(totalSolidQuantity(copy), 15);
  const withdrawn = withdrawSolidMaterialState(source, 9);
  close(totalSolidQuantity(source) + totalSolidQuantity(withdrawn), initial);
});

test('occurrence materialization preserves concrete composition in canonical packed-ready state', () => {
  const occurrence = findOccurrence('iron-ore');
  const body = createSolidMaterialBodyFromOccurrence(occurrence, 10);
  close(totalSolidQuantity(body.solidState), 10);
  assert.ok(Object.keys(summarizeSolidMaterialBySpecies(body.solidState)).length > 1);
});

test('particle-size boundary lookup keeps canonical cut semantics', () => {
  assert.equal(particleSizeBinIdForMm(1), 'lt-1mm');
  assert.equal(particleSizeBinIdForMm(5), '1-5mm');
  assert.equal(particleSizeBinIdForMm(25), '15-25mm');
  assert.equal(particleSizeBinIdForMm(120), '60-120mm');
});

test('serialized solid fraction keys reject malformed descriptors', () => {
  assert.throws(() => validateSolidMaterialState({ fractions: { 'hematite|5-15mm': 1 } }), /exactly 3 segments/);
  assert.throws(() => validateSolidMaterialState({ fractions: { 'hematite||locked': 1 } }), /empty segments/);
});
