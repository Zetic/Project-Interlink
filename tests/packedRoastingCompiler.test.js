import test from 'node:test';
import assert from 'node:assert/strict';

import { createGasMaterialBody, createGasMaterialState } from '../src/core/materials/gas/gasMaterialState.js';
import {
  createSolidMaterialBody,
  createSolidMaterialState,
} from '../src/core/materials/solids/solidMaterialState.js';
import { setMaterialBodyTemperatureK } from '../src/core/materials/thermal/thermalMaterial.js';
import { createRoastingFurnace } from '../src/simulation/apparatus/roastingFurnace.js';
import { createPackedMaterialIdTables } from '../src/simulation/packedRuntimeCompiler.js';
import {
  compileGoethiteReactionTablesForRuntime,
  compileRoastingFurnaceForRuntime,
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
  assert.ok(Math.abs(Array.from(compiled.packedGasInventory.gasState.toColumns().quantities).reduce((sum, value) => sum + value, 0) - 0.05) < 1e-12);
  assert.equal(compiled.packedGasInventory.sensibleEnthalpyJ, 1234);
  assert.equal(compiled.config.internalZoneCount, 4);
  assert.equal(compiled.config.enabled, true);
  assert.equal(compiled.idTables.species.valueFor(compiled.reaction.gasProductSpeciesId), 'waterVapor');
});
