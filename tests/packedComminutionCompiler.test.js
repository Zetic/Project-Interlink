import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addSolidFractionDirect,
  createSolidMaterialState,
  registerSolidTextureProfile,
  summarizeSolidMaterialBySizeBin,
} from '../src/core/materials/solids/solidMaterialState.js';
import { millSolidMaterialState } from '../src/core/processes/physics/comminution.js';
import {
  compileComminutionTablesForRuntime,
  populateWasmComminutionTables,
} from '../src/simulation/packedComminutionCompiler.js';
import { createPackedMaterialIdTables } from '../src/simulation/packedRuntimeCompiler.js';

function textureProfile() {
  return {
    id: 'packed-comminution-texture',
    speciesTextures: {
      hematite: {
        grainSizeUm: { d10: 72, d50: 180, d90: 450 },
        occurrenceModes: { free: 0.15, boundary: 0.35, intergrown: 0.35, included: 0.15 },
      },
    },
    comminutionProperties: {
      bondCrushingWorkIndexKWhPerT: 11,
      bondBallMillWorkIndexKWhPerT: 19,
      bondAbrasionIndex: 0.42,
    },
  };
}

function texturedFeed() {
  const state = createSolidMaterialState();
  const texture = textureProfile();
  registerSolidTextureProfile(state, texture);
  addSolidFractionDirect(state, {
    speciesId: 'hematite',
    sizeBinId: '15-25mm',
    liberationClassId: 'locked',
    textureProfileId: texture.id,
    quantity: 100,
  });
  return state;
}

test('packed comminution compiler maps the complete particle and liberation vocabulary into runtime IDs', () => {
  const state = texturedFeed();
  const idTables = createPackedMaterialIdTables();
  const compiled = compileComminutionTablesForRuntime(state, idTables);

  assert.equal(compiled.sizeBins.filter(row => row.canonical).length, 18);
  assert.equal(compiled.sizeBins.length, 21);
  assert.deepEqual(
    compiled.liberationClasses.map(row => row.canonicalId),
    ['locked', 'partial', 'mostly-liberated', 'liberated'],
  );
  assert.equal(idTables.sizeBin.valueFor(compiled.runtimeSizeBinIdForMm(120)), '60-120mm');
  assert.equal(idTables.sizeBin.valueFor(compiled.runtimeSizeBinIdForMm(25)), '15-25mm');
  assert.equal(idTables.sizeBin.valueFor(compiled.runtimeSizeBinIdForMm(0.25)), '0.125-0.25mm');
  assert.equal(idTables.sizeBin.valueFor(compiled.runtimeSizeBinIdForMm(1)), 'lt-1mm');
  assert.equal(idTables.sizeBin.valueFor(compiled.legacyLtOneMmId), 'lt-1mm');
});

test('packed comminution compiler preserves texture grain data and measured engineering properties', () => {
  const state = texturedFeed();
  const idTables = createPackedMaterialIdTables();
  const compiled = compileComminutionTablesForRuntime(state, idTables);

  assert.equal(compiled.textures.length, 1);
  const texture = compiled.textures[0];
  assert.equal(idTables.species.valueFor(texture.speciesId), 'hematite');
  assert.equal(idTables.textureProfile.valueFor(texture.textureProfileId), 'packed-comminution-texture');
  assert.deepEqual(
    [texture.d10Um, texture.d50Um, texture.d90Um],
    [72, 180, 450],
  );
  assert.deepEqual(
    [texture.free, texture.boundary, texture.intergrown, texture.included],
    [0.15, 0.35, 0.35, 0.15],
  );

  assert.equal(compiled.properties.length, 1);
  assert.deepEqual(
    {
      cwi: compiled.properties[0].bondCrushingWorkIndexKWhPerT,
      bwi: compiled.properties[0].bondBallMillWorkIndexKWhPerT,
      ai: compiled.properties[0].bondAbrasionIndex,
    },
    { cwi: 11, bwi: 19, ai: 0.42 },
  );
});

test('WASM comminution table population is one setup pass rather than per-fraction bridge traffic', () => {
  const state = texturedFeed();
  const idTables = createPackedMaterialIdTables();
  const compiled = compileComminutionTablesForRuntime(state, idTables);
  const calls = [];
  const mockWasmTable = {
    add_size_bin: (...args) => calls.push(['size', ...args]),
    set_legacy_lt_one_mm_id: (...args) => calls.push(['legacy', ...args]),
    add_liberation_class: (...args) => calls.push(['lib', ...args]),
    set_species_texture: (...args) => calls.push(['texture', ...args]),
    set_texture_properties: (...args) => calls.push(['properties', ...args]),
  };

  assert.equal(populateWasmComminutionTables(mockWasmTable, compiled), mockWasmTable);
  assert.equal(calls.filter(call => call[0] === 'size').length, 21);
  assert.equal(calls.filter(call => call[0] === 'lib').length, 4);
  assert.equal(calls.filter(call => call[0] === 'texture').length, 1);
  assert.equal(calls.filter(call => call[0] === 'properties').length, 1);
  assert.equal(calls.filter(call => call[0] === 'legacy').length, 1);
});

test('production Ball Mill reference PSD used by Rust parity remains unchanged', () => {
  const product = millSolidMaterialState(texturedFeed(), 0.25);
  const sizes = summarizeSolidMaterialBySizeBin(product);
  assert.ok(Math.abs(sizes['0.25-0.5mm'] - 5) < 1e-9);
  assert.ok(Math.abs(sizes['0.125-0.25mm'] - 45) < 1e-9);
  assert.ok(Math.abs(sizes['0.063-0.125mm'] - 30) < 1e-9);
  assert.ok(Math.abs(sizes['0.032-0.063mm'] - 15) < 1e-9);
  assert.ok(Math.abs(sizes['0.016-0.032mm'] - 5) < 1e-9);
});
