import test from 'node:test';
import assert from 'node:assert/strict';

import { createGasMaterialBody, createGasMaterialState } from '../src/core/materials/gas/gasMaterialState.js';
import {
  createSolidMaterialBody,
  createSolidMaterialState,
  iterateSolidFractions,
} from '../src/core/materials/solids/solidMaterialState.js';
import { setMaterialBodyTemperatureK } from '../src/core/materials/thermal/thermalMaterial.js';
import { applyGoethiteDehydroxylation } from '../src/core/processes/physics/thermochemicalReactions.js';
import { createRoastingFurnace } from '../src/simulation/apparatus/roastingFurnace.js';
import { createPackedMaterialIdTables } from '../src/simulation/packedRuntimeCompiler.js';
import {
  compileGoethiteReactionTablesForRuntime,
  compileRoastingFurnaceForRuntime,
  populateWasmGoethiteReactionTables,
  wasmGoethiteReactionConstructorArgs,
  wasmRoastingFurnaceConstructorArgs,
} from '../src/simulation/packedRoastingCompiler.js';

function textureProfile() {
  return {
    id: 'goethite-test-texture',
    speciesTextures: {
      goethite: {
        grainSizeUm: { d10: 20, d50: 60, d90: 160 },
        occurrenceModes: { free: 0.1, boundary: 0.2, intergrown: 0.5, included: 0.2 },
      },
    },
  };
}

function goethiteBody({ massKg = 1, temperatureK = 900, textured = false } = {}) {
  const texture = textured ? textureProfile() : null;
  const state = createSolidMaterialState([
    {
      speciesId: 'goethite',
      sizeBinId: '0.125-0.25mm',
      liberationClassId: 'locked',
      ...(texture ? { textureProfileId: texture.id } : {}),
      quantity: massKg,
    },
  ], texture ? { textureProfiles: { [texture.id]: texture } } : {});
  const body = createSolidMaterialBody(state);
  setMaterialBodyTemperatureK(body, temperatureK);
  return body;
}

test('goethite reaction compiler pins production stoichiometry and kinetics in runtime IDs', () => {
  const idTables = createPackedMaterialIdTables();
  const feed = goethiteBody();
  // Register the feed's existing descriptors before compiling reaction metadata,
  // matching the real canonical-state -> execution-state order.
  idTables.species.idFor('goethite');
  idTables.sizeBin.idFor('0.125-0.25mm');
  idTables.liberationClass.idFor('locked');
  const compiled = compileGoethiteReactionTablesForRuntime(feed.solidState, idTables);

  assert.equal(compiled.reactionId, 'goethite-dehydroxylation');
  assert.equal(compiled.sourceMassPerExtentKg, 0.177702);
  assert.equal(compiled.solidProductMassPerExtentKg, 0.159687);
  assert.equal(compiled.gasProductMassPerExtentKg, 0.018015);
  assert.equal(compiled.reactionEnthalpyJPerMolExtent, 90000);
  assert.equal(compiled.activationEnergyJPerMol, 90000);
  assert.equal(compiled.preExponentialFactorPerSecond, 60000);
  assert.equal(compiled.sourceSpeciesId, idTables.species.idFor('goethite'));
  assert.equal(compiled.solidProductSpeciesId, idTables.species.idFor('hematite'));
  assert.equal(compiled.gasProductSpeciesId, idTables.species.idFor('waterVapor'));

  const size = compiled.sizeFactors.find(row => row.canonicalId === '0.125-0.25mm');
  const expected = Math.min(5, Math.max(0.1, (1e-4 / 1.875e-4) ** 0.35));
  assert.ok(Math.abs(size.factor - expected) < 1e-15);
});

test('reaction compiler allocates derived product texture lineage in the shared runtime ID table', () => {
  const idTables = createPackedMaterialIdTables();
  const body = goethiteBody({ textured: true });
  const compiled = compileGoethiteReactionTablesForRuntime(body.solidState, idTables);
  assert.equal(compiled.textureMappings.length, 1);
  const mapping = compiled.textureMappings[0];
  assert.equal(mapping.sourceCanonicalId, 'goethite-test-texture');
  assert.equal(
    mapping.productCanonicalId,
    'goethite-test-texture--goethite-dehydroxylation--goethite-to-hematite',
  );
  assert.equal(mapping.sourceRuntimeId, idTables.textureProfile.idFor(mapping.sourceCanonicalId));
  assert.equal(mapping.productRuntimeId, idTables.textureProfile.idFor(mapping.productCanonicalId));
  const derived = compiled.derivedTextureProfiles[mapping.productCanonicalId];
  assert.deepEqual(derived.speciesTextures.hematite, derived.speciesTextures.goethite);
});

test('production thermochemical kernel remains the numerical and energy-balance oracle', () => {
  const feed = goethiteBody({ textured: true });
  const inputEnergy = feed.thermalState.sensibleEnthalpyJ;
  const result = applyGoethiteDehydroxylation(feed, 1);
  const outputEnergy = result.solidProductBody.thermalState.sensibleEnthalpyJ
    + result.gasProductBody.thermalState.sensibleEnthalpyJ
    + result.reactionEnergyDemandJ;
  assert.ok(result.reactionExtentMol > 0);
  assert.ok(result.temperatureK > 0 && result.temperatureK < 900);
  assert.ok(result.solverEvaluationCount > 0);
  assert.ok(Math.abs(outputEnergy - inputEnergy) <= 1e-4 * Math.max(1, Math.abs(inputEnergy)));
  assert.ok(result.gasProductBody.gasState.speciesMassKg.waterVapor > 0);
  const hematite = iterateSolidFractions(result.solidProductBody.solidState)
    .find(fraction => fraction.speciesId === 'hematite');
  assert.ok(hematite);
  assert.equal(hematite.sizeBinId, '0.125-0.25mm');
  assert.equal(hematite.liberationClassId, 'locked');
  assert.equal(
    hematite.textureProfileId,
    'goethite-test-texture--goethite-dehydroxylation--goethite-to-hematite',
  );
});

test('WASM reaction setup is one coarse metadata population pass', () => {
  const compiled = compileGoethiteReactionTablesForRuntime(goethiteBody().solidState);
  const sizeFactors = [];
  const textures = [];
  const fake = {
    set_size_factor(...args) { sizeFactors.push(args); },
    set_product_texture_mapping(...args) { textures.push(args); },
  };
  assert.equal(populateWasmGoethiteReactionTables(fake, compiled), fake);
  assert.equal(sizeFactors.length, compiled.sizeFactors.length);
  assert.equal(textures.length, 0);
  assert.deepEqual(wasmGoethiteReactionConstructorArgs(compiled), [
    compiled.sourceSpeciesId,
    compiled.solidProductSpeciesId,
    compiled.gasProductSpeciesId,
    0.177702,
    0.159687,
    0.018015,
    90000,
    90000,
    60000,
  ]);
});

test('live Roasting Furnace state compiles without changing canonical IDs or thermal ledgers', () => {
  const furnace = createRoastingFurnace({
    id: 'furnace-test',
    temperatureSetpointK: 900,
    ratedHeaterPowerKw: 120,
    maximumOperatingTemperatureK: 1200,
    maximumSolidThroughputKgPerSecond: 5,
    effectiveChamberHoldUpKg: 20,
    heatLossCoefficientWPerK: 25,
    internalZoneCount: 4,
    enabled: true,
  });
  furnace.zones[0] = goethiteBody({ massKg: 0.75, temperatureK: 700 });
  furnace.pendingFeed = goethiteBody({ massKg: 0.25, temperatureK: 400 });
  furnace.gasInventory = createGasMaterialBody(
    createGasMaterialState({ waterVapor: 0.05 }),
    { sensibleEnthalpyJ: 1234 },
  );

  const compiled = compileRoastingFurnaceForRuntime(furnace);
  assert.equal(compiled.packedZones.length, 4);
  assert.ok(Math.abs(compiled.packedZones[0].totalMassKg() - 0.75) < 1e-12);
  assert.ok(Math.abs(compiled.packedPendingFeed.totalMassKg() - 0.25) < 1e-12);
  assert.ok(Math.abs(compiled.packedGasInventory.totalMassKg() - 0.05) < 1e-12);
  assert.equal(compiled.packedGasInventory.sensibleEnthalpyJ, 1234);
  assert.equal(compiled.config.internalZoneCount, 4);
  assert.equal(compiled.config.enabled, true);
  assert.equal(compiled.idTables.species.valueFor(compiled.reaction.gasProductSpeciesId), 'waterVapor');
  assert.deepEqual(wasmRoastingFurnaceConstructorArgs(compiled), [
    900, 120, 1200, 5, 20, 25, 4, true,
  ]);
});
