import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  liberationClassDistributionAtParticleSize,
} from '../src/core/materials/solids/mineralTextures.js';
import {
  addSolidFractionDirect,
  createSolidMaterialState,
  registerSolidTextureProfile,
  summarizeSolidMaterialByLiberationClass,
  totalSolidQuantity,
} from '../src/core/materials/solids/solidMaterialState.js';
import { millSolidMaterialState } from '../src/core/processes/physics/comminution.js';

function ironTexture(id = 'iron-texture') {
  return {
    id,
    speciesTextures: {
      hematite: {
        grainSizeUm: { d10: 94, d50: 245.2, d90: 640.3 },
        occurrenceModes: { free: 0.39, boundary: 0.29, intergrown: 0.22, included: 0.10 },
      },
    },
    comminutionProperties: {
      bondCrushingWorkIndexKWhPerT: 12.05,
      bondBallMillWorkIndexKWhPerT: 15.98,
      bondAbrasionIndex: 0.377,
    },
  };
}

function texturedHematiteFeed({
  liberationClassId = 'locked',
  sizeBinId = '15-25mm',
  quantity = 100,
  texture = ironTexture(),
} = {}) {
  const state = createSolidMaterialState();
  registerSolidTextureProfile(state, texture);
  addSolidFractionDirect(state, {
    speciesId: 'hematite',
    sizeBinId,
    liberationClassId,
    textureProfileId: texture.id,
    quantity,
  });
  return state;
}

function share(summary, id, total) {
  return (summary[id] ?? 0) / total;
}

test('texture equilibrium moves strongly toward liberated material far below mineral D10', () => {
  const distribution = liberationClassDistributionAtParticleSize(
    ironTexture(),
    'hematite',
    0.016,
  );
  const total = Object.values(distribution).reduce((sum, value) => sum + value, 0);
  assert.ok(Math.abs(total - 1) < 1e-12);
  assert.ok(distribution.liberated > 0.80);
  assert.ok(distribution.locked < 0.05);
});

test('fine Ball Mill grinding approaches texture-defined states instead of a fixed class-step ceiling', () => {
  const feed = texturedHematiteFeed();
  const product = millSolidMaterialState(feed, 0.032);
  const liberation = summarizeSolidMaterialByLiberationClass(product);
  const total = totalSolidQuantity(product);

  assert.ok(share(liberation, 'liberated', total) > 0.50);
  assert.ok(share(liberation, 'partial', total) < 0.30);
  assert.ok(share(liberation, 'locked', total) < 0.10);
  assert.ok(Math.abs(total - 100) < 1e-9);
});

test('finer grinding produces materially higher full liberation for the same ore texture', () => {
  const feed = texturedHematiteFeed();
  const coarseProduct = millSolidMaterialState(feed, 0.25);
  const fineProduct = millSolidMaterialState(feed, 0.032);
  const coarseLiberation = summarizeSolidMaterialByLiberationClass(coarseProduct);
  const fineLiberation = summarizeSolidMaterialByLiberationClass(fineProduct);

  const coarseFullyLiberated = share(coarseLiberation, 'liberated', totalSolidQuantity(coarseProduct));
  const fineFullyLiberated = share(fineLiberation, 'liberated', totalSolidQuantity(fineProduct));
  assert.ok(fineFullyLiberated > coarseFullyLiberated + 0.25);
});

test('comminution never re-locks an already liberated population', () => {
  const feed = texturedHematiteFeed({ liberationClassId: 'liberated' });
  const product = millSolidMaterialState(feed, 0.25);
  const liberation = summarizeSolidMaterialByLiberationClass(product);

  assert.ok(Math.abs((liberation.liberated ?? 0) - 100) < 1e-9);
  assert.equal(liberation.locked ?? 0, 0);
  assert.equal(liberation.partial ?? 0, 0);
  assert.equal(liberation['mostly-liberated'] ?? 0, 0);
});
