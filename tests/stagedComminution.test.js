import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  addSolidFractionDirect,
  createSolidMaterialState,
  summarizeSolidMaterialByLiberationClass,
  summarizeSolidMaterialBySizeBin,
  summarizeSolidMaterialBySpecies,
  totalSolidQuantity,
} from '../src/core/materials/solids/solidMaterialState.js';
import {
  particleSizeBinIdForMm,
} from '../src/core/materials/solids/particleSizeBins.js';
import {
  coneCrushSolidMaterialState,
  jawCrushSolidMaterialState,
  millSolidMaterialState,
} from '../src/core/processes/physics/comminution.js';
import { splitScreenedSolidState } from '../src/core/processes/physics/screening.js';
import { extractorOutputRates } from '../src/simulation/extractorNode.js';

function singleFractionState({ speciesId = 'hematite', sizeBinId, liberationClassId = 'locked', quantity = 100 }) {
  const state = createSolidMaterialState();
  addSolidFractionDirect(state, { speciesId, sizeBinId, liberationClassId, quantity });
  return state;
}

function liberationShare(state, classIds) {
  const summary = summarizeSolidMaterialByLiberationClass(state);
  const total = totalSolidQuantity(state);
  return classIds.reduce((sum, classId) => sum + (summary[classId] ?? 0), 0) / total;
}

test('particle-size vocabulary spans fine grinding through run-of-mine rock', () => {
  assert.equal(particleSizeBinIdForMm(0.032), 'lt-0.032mm');
  assert.equal(particleSizeBinIdForMm(0.063), '0.032-0.063mm');
  assert.equal(particleSizeBinIdForMm(0.125), '0.063-0.125mm');
  assert.equal(particleSizeBinIdForMm(0.25), '0.125-0.25mm');
  assert.equal(particleSizeBinIdForMm(0.5), '0.25-0.5mm');
  assert.equal(particleSizeBinIdForMm(1000), '500-1000mm');
});

test('ore-body extraction enters the plant as mostly locked run-of-mine rock', () => {
  const occurrence = {
    id: 'iron-occurrence',
    resourceId: 'iron-ore',
    composition: { hematite: 60, quartz: 40 },
  };
  const state = extractorOutputRates({ prototypeRateKgPerSecond: 10 }, occurrence, 1);
  const sizes = summarizeSolidMaterialBySizeBin(state);
  const liberation = summarizeSolidMaterialByLiberationClass(state);

  assert.deepEqual(Object.keys(sizes).sort(), ['120-250mm', '250-500mm', '500-1000mm']);
  assert.ok((liberation.locked ?? 0) / totalSolidQuantity(state) > 0.98);
  assert.deepEqual(summarizeSolidMaterialBySpecies(state), { hematite: 6, quartz: 4 });
});

test('Jaw Crusher performs primary size reduction with only minor liberation', () => {
  const feed = singleFractionState({ sizeBinId: '500-1000mm' });
  const product = jawCrushSolidMaterialState(feed, 120);
  const sizes = summarizeSolidMaterialBySizeBin(product);

  assert.equal(totalSolidQuantity(product), 100);
  assert.equal(sizes['120-250mm'], 15);
  assert.equal(sizes['60-120mm'], 55);
  assert.equal(sizes['25-60mm'], 20);
  assert.equal(sizes['15-25mm'], 10);
  assert.ok(liberationShare(product, ['locked']) > 0.95);
});

test('Cone Crusher rejects feed outside its secondary-crushing envelope', () => {
  const feed = singleFractionState({ sizeBinId: '500-1000mm' });
  assert.throws(
    () => coneCrushSolidMaterialState(feed, 25),
    /Cone Crusher requires feed particle size <= 250 mm/,
  );
});

test('Jaw product fits the Cone Crusher feed envelope', () => {
  const feed = singleFractionState({ sizeBinId: '500-1000mm' });
  const jawProduct = jawCrushSolidMaterialState(feed, 120);
  const coneProduct = coneCrushSolidMaterialState(jawProduct, 25);

  assert.equal(totalSolidQuantity(coneProduct), 100);
  assert.ok(summarizeSolidMaterialBySizeBin(coneProduct)['25-60mm'] > 0);
  assert.ok(liberationShare(coneProduct, ['locked']) > 0.85);
});

test('Cone Crusher produces the existing realistic nominal 25 mm PSD for coarse feed', () => {
  const feed = singleFractionState({ sizeBinId: '60-120mm' });
  const product = coneCrushSolidMaterialState(feed, 25);
  const sizes = summarizeSolidMaterialBySizeBin(product);

  assert.equal(sizes['25-60mm'], 10);
  assert.equal(sizes['15-25mm'], 55);
  assert.equal(sizes['5-15mm'], 25);
  assert.equal(sizes['1-5mm'], 10);
});

test('Ball Mill requires mill-ready feed rather than silently accepting crusher oversize', () => {
  const coneFeed = singleFractionState({ sizeBinId: '60-120mm' });
  const coneProduct = coneCrushSolidMaterialState(coneFeed, 25);
  assert.throws(
    () => millSolidMaterialState(coneProduct, 0.25),
    /Ball Mill requires feed particle size <= 25 mm/,
  );
});

test('Screening a 25 mm Cone product creates Ball-Mill-eligible undersize', () => {
  const coneFeed = singleFractionState({ sizeBinId: '60-120mm' });
  const coneProduct = coneCrushSolidMaterialState(coneFeed, 25);
  const { undersize, oversize } = splitScreenedSolidState(coneProduct, 25);

  assert.equal(totalSolidQuantity(undersize), 90);
  assert.equal(totalSolidQuantity(oversize), 10);
  assert.doesNotThrow(() => millSolidMaterialState(undersize, 0.25));
});

test('Ball Mill reaches the sub-millimetre regime and drives substantially more liberation than crushing', () => {
  const feed = singleFractionState({ sizeBinId: '15-25mm' });
  const crushed = coneCrushSolidMaterialState(singleFractionState({ sizeBinId: '60-120mm' }), 25);
  const milled = millSolidMaterialState(feed, 0.25);
  const sizes = summarizeSolidMaterialBySizeBin(milled);

  assert.equal(totalSolidQuantity(milled), 100);
  assert.equal(sizes['0.25-0.5mm'], 5);
  assert.equal(sizes['0.125-0.25mm'], 45);
  assert.equal(sizes['0.063-0.125mm'], 30);
  assert.equal(sizes['0.032-0.063mm'], 15);
  assert.equal(sizes['lt-0.032mm'], 5);
  assert.ok(liberationShare(milled, ['mostly-liberated', 'liberated']) > 0.15);
  assert.ok(liberationShare(milled, ['locked']) < liberationShare(crushed, ['locked']));
});

test('all staged comminution operations conserve each species exactly', () => {
  const feed = createSolidMaterialState();
  addSolidFractionDirect(feed, { speciesId: 'hematite', sizeBinId: '500-1000mm', liberationClassId: 'locked', quantity: 60 });
  addSolidFractionDirect(feed, { speciesId: 'quartz', sizeBinId: '500-1000mm', liberationClassId: 'locked', quantity: 40 });

  const jaw = jawCrushSolidMaterialState(feed, 120);
  const cone = coneCrushSolidMaterialState(jaw, 25);
  const { undersize } = splitScreenedSolidState(cone, 25);
  const mill = millSolidMaterialState(undersize, 0.25);

  assert.deepEqual(summarizeSolidMaterialBySpecies(jaw), { hematite: 60, quartz: 40 });
  assert.deepEqual(summarizeSolidMaterialBySpecies(cone), { hematite: 60, quartz: 40 });
  assert.deepEqual(summarizeSolidMaterialBySpecies(mill), { hematite: 54, quartz: 36 });
});
