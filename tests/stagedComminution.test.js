import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  addSolidFractionDirect,
  addSolidMaterialState,
  createSolidMaterialState,
  iterateSolidFractions,
  registerSolidTextureProfile,
  summarizeSolidMaterialByLiberationClass,
  summarizeSolidMaterialBySizeBin,
  summarizeSolidMaterialBySpecies,
  summarizeSolidMaterialByTextureProfile,
  totalSolidQuantity,
} from '../src/core/materials/solids/solidMaterialState.js';
import {
  particleSizeBinIdForMm,
} from '../src/core/materials/solids/particleSizeBins.js';
import {
  coneCrushSolidMaterialState,
  jawCrushSolidMaterialState,
  millSolidMaterialState,
  weightedComminutionProperties,
} from '../src/core/processes/physics/comminution.js';
import { splitScreenedSolidState } from '../src/core/processes/physics/screening.js';
import { applyContinuousMilling } from '../src/simulation/continuousComminution.js';
import { extractorOutputRates } from '../src/simulation/extractorNode.js';

const TOLERANCE = 1e-9;

function assertAlmostEqual(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) <= TOLERANCE, `${label}: expected ${expected}, got ${actual}`);
}

function textureProfile(id, d50Um, {
  speciesId = 'hematite',
  d10Um = d50Um * 0.4,
  d90Um = d50Um * 2.5,
  occurrenceModes = { free: 0.15, boundary: 0.35, intergrown: 0.35, included: 0.15 },
  cwi = 10,
  bwi = 15,
  ai = 0.3,
} = {}) {
  return {
    id,
    speciesTextures: {
      [speciesId]: {
        grainSizeUm: { d10: d10Um, d50: d50Um, d90: d90Um },
        occurrenceModes: { ...occurrenceModes },
      },
    },
    comminutionProperties: {
      bondCrushingWorkIndexKWhPerT: cwi,
      bondBallMillWorkIndexKWhPerT: bwi,
      bondAbrasionIndex: ai,
    },
  };
}

function multiSpeciesTexture(id, speciesD50, comminutionProperties = {
  bondCrushingWorkIndexKWhPerT: 11,
  bondBallMillWorkIndexKWhPerT: 16,
  bondAbrasionIndex: 0.35,
}) {
  return {
    id,
    speciesTextures: Object.fromEntries(Object.entries(speciesD50).map(([speciesId, d50]) => [
      speciesId,
      {
        grainSizeUm: { d10: d50 * 0.4, d50, d90: d50 * 2.5 },
        occurrenceModes: { free: 0.15, boundary: 0.35, intergrown: 0.35, included: 0.15 },
      },
    ])),
    comminutionProperties: { ...comminutionProperties },
  };
}

function singleFractionState({
  speciesId = 'hematite',
  sizeBinId,
  liberationClassId = 'locked',
  quantity = 100,
  texture = null,
}) {
  const state = createSolidMaterialState();
  if (texture) registerSolidTextureProfile(state, texture);
  addSolidFractionDirect(state, {
    speciesId,
    sizeBinId,
    liberationClassId,
    textureProfileId: texture?.id ?? null,
    quantity,
  });
  return state;
}

function liberationShare(state, classIds) {
  const summary = summarizeSolidMaterialByLiberationClass(state);
  const total = totalSolidQuantity(state);
  return classIds.reduce((sum, classId) => sum + (summary[classId] ?? 0), 0) / total;
}

function assertSpecies(state, expected) {
  const actual = summarizeSolidMaterialBySpecies(state);
  for (const [speciesId, expectedQuantity] of Object.entries(expected)) {
    assertAlmostEqual(actual[speciesId] ?? 0, expectedQuantity, `${speciesId} conserved mass`);
  }
}

test('particle-size vocabulary spans fine grinding through run-of-mine rock', () => {
  assert.equal(particleSizeBinIdForMm(0.032), 'lt-0.032mm');
  assert.equal(particleSizeBinIdForMm(0.063), '0.032-0.063mm');
  assert.equal(particleSizeBinIdForMm(0.125), '0.063-0.125mm');
  assert.equal(particleSizeBinIdForMm(0.25), '0.125-0.25mm');
  assert.equal(particleSizeBinIdForMm(0.5), '0.25-0.5mm');
  assert.equal(particleSizeBinIdForMm(1000), '500-1000mm');
});

test('ore-body extraction enters the plant as mostly locked run-of-mine rock and carries measured occurrence lineage', () => {
  const texture = multiSpeciesTexture('texture-iron-occurrence', { hematite: 220, quartz: 150 });
  const comminutionProperties = { ...texture.comminutionProperties };
  delete texture.comminutionProperties;
  const occurrence = {
    id: 'iron-occurrence',
    resourceId: 'iron-ore',
    composition: { hematite: 60, quartz: 40 },
    mineralTexture: texture,
    comminutionProperties,
  };
  const state = extractorOutputRates({ prototypeRateKgPerSecond: 10 }, occurrence, 1);
  const sizes = summarizeSolidMaterialBySizeBin(state);
  const liberation = summarizeSolidMaterialByLiberationClass(state);

  assert.deepEqual(Object.keys(sizes).sort(), ['120-250mm', '250-500mm', '500-1000mm']);
  assert.ok((liberation.locked ?? 0) / totalSolidQuantity(state) > 0.98);
  assertSpecies(state, { hematite: 6, quartz: 4 });
  assert.deepEqual(summarizeSolidMaterialByTextureProfile(state), { 'texture-iron-occurrence': 10 });
  assert.deepEqual(state.textureProfiles['texture-iron-occurrence'].speciesTextures, texture.speciesTextures);
  assert.deepEqual(state.textureProfiles['texture-iron-occurrence'].comminutionProperties, comminutionProperties);
});

test('Jaw Crusher performs primary size reduction with only minor liberation', () => {
  const feed = singleFractionState({ sizeBinId: '500-1000mm' });
  const product = jawCrushSolidMaterialState(feed, 120);
  const sizes = summarizeSolidMaterialBySizeBin(product);

  assertAlmostEqual(totalSolidQuantity(product), 100, 'jaw total');
  assertAlmostEqual(sizes['120-250mm'], 15, 'jaw oversize');
  assertAlmostEqual(sizes['60-120mm'], 55, 'jaw nominal');
  assertAlmostEqual(sizes['25-60mm'], 20, 'jaw finer');
  assertAlmostEqual(sizes['15-25mm'], 10, 'jaw finest');
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

  assertAlmostEqual(totalSolidQuantity(coneProduct), 100, 'cone total');
  assert.ok(summarizeSolidMaterialBySizeBin(coneProduct)['25-60mm'] > 0);
  assert.ok(liberationShare(coneProduct, ['locked']) > 0.85);
});

test('Cone Crusher produces the existing realistic nominal 25 mm PSD for coarse feed', () => {
  const feed = singleFractionState({ sizeBinId: '60-120mm' });
  const product = coneCrushSolidMaterialState(feed, 25);
  const sizes = summarizeSolidMaterialBySizeBin(product);

  assertAlmostEqual(sizes['25-60mm'], 10, 'cone oversize');
  assertAlmostEqual(sizes['15-25mm'], 55, 'cone nominal');
  assertAlmostEqual(sizes['5-15mm'], 25, 'cone finer');
  assertAlmostEqual(sizes['1-5mm'], 10, 'cone finest');
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

  assertAlmostEqual(totalSolidQuantity(undersize), 90, 'screen undersize');
  assertAlmostEqual(totalSolidQuantity(oversize), 10, 'screen oversize');
  assert.doesNotThrow(() => millSolidMaterialState(undersize, 0.25));
});

test('Ball Mill reaches the sub-millimetre regime and drives more liberation than crushing', () => {
  const feed = singleFractionState({ sizeBinId: '15-25mm' });
  const crushed = coneCrushSolidMaterialState(singleFractionState({ sizeBinId: '60-120mm' }), 25);
  const milled = millSolidMaterialState(feed, 0.25);
  const sizes = summarizeSolidMaterialBySizeBin(milled);

  assertAlmostEqual(totalSolidQuantity(milled), 100, 'mill total');
  assertAlmostEqual(sizes['0.25-0.5mm'], 5, 'mill oversize');
  assertAlmostEqual(sizes['0.125-0.25mm'], 45, 'mill nominal');
  assertAlmostEqual(sizes['0.063-0.125mm'], 30, 'mill finer');
  assertAlmostEqual(sizes['0.032-0.063mm'], 15, 'mill very fine');
  assertAlmostEqual(sizes['lt-0.032mm'], 5, 'mill finest');
  assert.ok(liberationShare(milled, ['locked']) < liberationShare(crushed, ['locked']));
});

test('identical Ball Mill settings produce different liberation from measured mineral grain distributions', () => {
  const coarseTexture = textureProfile('coarse-texture', 350);
  const fineTexture = textureProfile('fine-texture', 55);
  const coarseFeed = singleFractionState({ sizeBinId: '15-25mm', texture: coarseTexture });
  const fineFeed = singleFractionState({ sizeBinId: '15-25mm', texture: fineTexture });

  const coarseProduct = millSolidMaterialState(coarseFeed, 0.25);
  const fineProduct = millSolidMaterialState(fineFeed, 0.25);
  const coarseUsefulLiberation = liberationShare(coarseProduct, ['mostly-liberated', 'liberated']);
  const fineUsefulLiberation = liberationShare(fineProduct, ['mostly-liberated', 'liberated']);

  assert.ok(coarseUsefulLiberation > fineUsefulLiberation + 0.05);
  for (const [binId, quantity] of Object.entries(summarizeSolidMaterialBySizeBin(coarseProduct))) {
    assertAlmostEqual(summarizeSolidMaterialBySizeBin(fineProduct)[binId], quantity, `${binId} same PSD`);
  }
  assert.deepEqual(summarizeSolidMaterialByTextureProfile(coarseProduct), { 'coarse-texture': 100 });
  assert.deepEqual(summarizeSolidMaterialByTextureProfile(fineProduct), { 'fine-texture': 100 });
});

test('mineral association mode changes liberation at the same grain sizes', () => {
  const easyTexture = textureProfile('boundary-rich', 180, {
    occurrenceModes: { free: 0.35, boundary: 0.50, intergrown: 0.10, included: 0.05 },
  });
  const includedTexture = textureProfile('included-rich', 180, {
    occurrenceModes: { free: 0.05, boundary: 0.10, intergrown: 0.35, included: 0.50 },
  });
  const easy = millSolidMaterialState(singleFractionState({ sizeBinId: '15-25mm', texture: easyTexture }), 0.25);
  const difficult = millSolidMaterialState(singleFractionState({ sizeBinId: '15-25mm', texture: includedTexture }), 0.25);
  assert.ok(
    liberationShare(easy, ['mostly-liberated', 'liberated'])
      > liberationShare(difficult, ['mostly-liberated', 'liberated']),
  );
});

test('Bond Ball Mill Work Index power-limits harder ore at the same mill setting and drive power', () => {
  const easyFeed = singleFractionState({
    sizeBinId: '15-25mm',
    quantity: 10,
    texture: textureProfile('low-bwi', 180, { bwi: 9, ai: 0.2 }),
  });
  const hardFeed = singleFractionState({
    sizeBinId: '15-25mm',
    quantity: 10,
    texture: textureProfile('high-bwi', 180, { bwi: 22, ai: 0.6 }),
  });

  const easy = applyContinuousMilling(easyFeed, 0.25, 10, 25);
  const hard = applyContinuousMilling(hardFeed, 0.25, 10, 25);
  assert.ok(easy.specificEnergyKWhPerT < hard.specificEnergyKWhPerT);
  assert.ok(totalSolidQuantity(easy.actualFeedSolidState) > totalSolidQuantity(hard.actualFeedSolidState));
  assert.ok(easy.actualPowerKw <= 25 + TOLERANCE);
  assert.ok(hard.actualPowerKw <= 25 + TOLERANCE);
});

test('mixed ore preserves mass-weighted CWi BWi and abrasion index through lineage', () => {
  const easy = singleFractionState({
    sizeBinId: '15-25mm',
    quantity: 40,
    texture: textureProfile('easy-engineering', 220, { cwi: 7, bwi: 10, ai: 0.2 }),
  });
  const hard = singleFractionState({
    sizeBinId: '15-25mm',
    quantity: 60,
    texture: textureProfile('hard-engineering', 80, { cwi: 17, bwi: 20, ai: 0.6 }),
  });
  const blended = createSolidMaterialState();
  addSolidMaterialState(blended, easy);
  addSolidMaterialState(blended, hard);
  const properties = weightedComminutionProperties(blended);
  assertAlmostEqual(properties.bondCrushingWorkIndexKWhPerT, 13, 'mass weighted CWi');
  assertAlmostEqual(properties.bondBallMillWorkIndexKWhPerT, 16, 'mass weighted BWi');
  assertAlmostEqual(properties.bondAbrasionIndex, 0.44, 'mass weighted Ai');
});

test('Ball Mill consolidates sub-tolerance child allocations instead of losing conserved matter', () => {
  const quantity = 2e-9;
  const feed = singleFractionState({
    sizeBinId: '15-25mm',
    quantity,
    texture: textureProfile('tiny-textured-population', 180),
  });

  const milled = millSolidMaterialState(feed, 0.25);
  assert.ok(Math.abs(totalSolidQuantity(milled) - quantity) <= 1e-15);
  assert.ok(iterateSolidFractions(milled).length > 0);
  assert.ok(iterateSolidFractions(milled).every(
    fraction => fraction.textureProfileId === 'tiny-textured-population',
  ));
});

test('mixed ores retain separate texture populations instead of collapsing identical fractions', () => {
  const easy = singleFractionState({
    sizeBinId: '15-25mm',
    quantity: 40,
    texture: textureProfile('easy-texture', 300),
  });
  const difficult = singleFractionState({
    sizeBinId: '15-25mm',
    quantity: 60,
    texture: textureProfile('difficult-texture', 50),
  });
  const blended = createSolidMaterialState();
  addSolidMaterialState(blended, easy);
  addSolidMaterialState(blended, difficult);

  assert.equal(Object.keys(blended.fractions).length, 2);
  assert.deepEqual(summarizeSolidMaterialByTextureProfile(blended), {
    'easy-texture': 40,
    'difficult-texture': 60,
  });

  const milled = millSolidMaterialState(blended, 0.25);
  assert.deepEqual(summarizeSolidMaterialByTextureProfile(milled), {
    'easy-texture': 40,
    'difficult-texture': 60,
  });
  assertAlmostEqual(totalSolidQuantity(milled), 100, 'mixed mill total');
});

test('all staged comminution operations conserve each species exactly within floating-point tolerance', () => {
  const feed = createSolidMaterialState();
  addSolidFractionDirect(feed, { speciesId: 'hematite', sizeBinId: '500-1000mm', liberationClassId: 'locked', quantity: 60 });
  addSolidFractionDirect(feed, { speciesId: 'quartz', sizeBinId: '500-1000mm', liberationClassId: 'locked', quantity: 40 });

  const jaw = jawCrushSolidMaterialState(feed, 120);
  const cone = coneCrushSolidMaterialState(jaw, 25);
  const { undersize } = splitScreenedSolidState(cone, 25);
  const undersizeTotal = totalSolidQuantity(undersize);
  const mill = millSolidMaterialState(undersize, 0.25);

  assertSpecies(jaw, { hematite: 60, quartz: 40 });
  assertSpecies(cone, { hematite: 60, quartz: 40 });
  assertSpecies(mill, { hematite: undersizeTotal * 0.6, quartz: undersizeTotal * 0.4 });
});
