import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractorOccurrenceEligibility,
  extractorOutputRates,
} from '../src/simulation/extractorNode.js';
import {
  compileExtractableWorldOccurrencesForRuntime,
  compileResourceOccurrenceForRuntime,
  populateWasmResourceOccurrence,
} from '../src/simulation/packedExtractionCompiler.js';
import { createPackedMaterialIdTables } from '../src/simulation/packedRuntimeCompiler.js';
import { iterateSolidFractions } from '../src/core/materials/solids/solidMaterialState.js';

function featureOccurrence({
  id,
  resourceId,
  featureId,
  composition,
  quantityClass = 'Massive',
  mineralTexture = null,
  comminutionProperties = null,
}) {
  return {
    id,
    resourceId,
    name: resourceId,
    sourceType: 'feature',
    sourceId: featureId,
    composition,
    quantityClass,
    ...(mineralTexture ? { mineralTexture } : {}),
    ...(comminutionProperties ? { comminutionProperties } : {}),
  };
}

function basaltOccurrence() {
  return featureOccurrence({
    id: 'occ-basalt',
    resourceId: 'basalt',
    featureId: 'feature-basalt',
    composition: { plagioclase: 55, augite: 30, olivine: 15 },
  });
}

function ironOccurrence() {
  return featureOccurrence({
    id: 'occ-iron',
    resourceId: 'iron-ore',
    featureId: 'feature-iron',
    composition: { hematite: 60, magnetite: 20, goethite: 10, quartz: 10 },
    mineralTexture: {
      id: 'texture-occ-iron',
      speciesTextures: {
        hematite: { grainSizeUm: { d10: 30, d50: 100, d90: 250 }, occurrenceModes: { free: 0.2, boundary: 0.3, intergrown: 0.4, included: 0.1 } },
        magnetite: { grainSizeUm: { d10: 35, d50: 110, d90: 260 }, occurrenceModes: { free: 0.2, boundary: 0.3, intergrown: 0.4, included: 0.1 } },
        goethite: { grainSizeUm: { d10: 40, d50: 120, d90: 280 }, occurrenceModes: { free: 0.2, boundary: 0.3, intergrown: 0.4, included: 0.1 } },
        quartz: { grainSizeUm: { d10: 25, d50: 90, d90: 220 }, occurrenceModes: { free: 0.2, boundary: 0.3, intergrown: 0.4, included: 0.1 } },
      },
    },
    comminutionProperties: {
      bondCrushingWorkIndexKWhPerT: 10,
      bondBallMillWorkIndexKWhPerT: 15,
      bondAbrasionIndex: 0.3,
    },
  });
}

function canonicalRows(state) {
  return [...iterateSolidFractions(state)]
    .map(fraction => ({
      speciesId: fraction.speciesId,
      sizeBinId: fraction.sizeBinId,
      liberationClassId: fraction.liberationClassId,
      textureProfileId: fraction.textureProfileId,
      quantity: fraction.quantity,
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function decodedPackedRows(packed, idTables) {
  const columns = packed.toColumns();
  const rows = [];
  for (let index = 0; index < columns.quantities.length; index += 1) {
    rows.push({
      speciesId: idTables.species.valueFor(columns.speciesIds[index]),
      sizeBinId: idTables.sizeBin.valueFor(columns.sizeBinIds[index]),
      liberationClassId: idTables.liberationClass.valueFor(columns.liberationClassIds[index]),
      textureProfileId: columns.textureProfileIds[index] === 0
        ? null
        : idTables.textureProfile.valueFor(columns.textureProfileIds[index]),
      quantity: columns.quantities[index],
    });
  }
  return rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

test('packed occurrence compiler exactly matches production non-ore extraction materialization', () => {
  const occurrence = basaltOccurrence();
  const canonical = extractorOutputRates({ prototypeRateKgPerSecond: 1 }, occurrence, 1);
  const { occurrence: packed, idTables } = compileResourceOccurrenceForRuntime(occurrence);

  assert.equal(packed.materialPerKg.totalQuantity(), 1);
  assert.deepEqual(decodedPackedRows(packed.materialPerKg, idTables), canonicalRows(canonical));
  assert.equal(packed.reserveMassKg, null);
  assert.equal(packed.canonicalOccurrenceId, occurrence.id);
  assert.equal(packed.canonicalFeatureId, occurrence.sourceId);
});

test('ore occurrence compiler preserves run-of-mine fragmentation and texture lineage', () => {
  const occurrence = ironOccurrence();
  const canonical = extractorOutputRates({ prototypeRateKgPerSecond: 1 }, occurrence, 1);
  const { occurrence: packed, idTables } = compileResourceOccurrenceForRuntime(occurrence);

  assert.deepEqual(decodedPackedRows(packed.materialPerKg, idTables), canonicalRows(canonical));
  const decoded = decodedPackedRows(packed.materialPerKg, idTables);
  assert.ok(decoded.every(row => ['120-250mm', '250-500mm', '500-1000mm'].includes(row.sizeBinId)));
  assert.ok(decoded.every(row => row.textureProfileId === 'texture-occ-iron'));
  assert.ok(decoded.some(row => row.liberationClassId === 'locked'));
  assert.ok(decoded.some(row => row.liberationClassId === 'partial'));
});

test('qualitative quantityClass is not fabricated into a physical reserve', () => {
  for (const quantityClass of ['Tiny', 'Small', 'Moderate', 'Large', 'Massive']) {
    const occurrence = { ...basaltOccurrence(), id: `occ-${quantityClass}`, quantityClass };
    const { occurrence: packed } = compileResourceOccurrenceForRuntime(occurrence);
    assert.equal(packed.reserveMassKg, null, `${quantityClass} should remain unbounded until world data supplies a measured reserve`);
  }
});

test('an explicit future reserve can be compiled without changing canonical world schema', () => {
  const { occurrence: packed } = compileResourceOccurrenceForRuntime(
    basaltOccurrence(),
    createPackedMaterialIdTables(),
    { reserveMassKg: 1250 },
  );
  assert.equal(packed.reserveMassKg, 1250);
  assert.throws(
    () => compileResourceOccurrenceForRuntime(basaltOccurrence(), createPackedMaterialIdTables(), { reserveMassKg: 0 }),
    /finite positive number/,
  );
});

test('world extraction compiler shares one numeric ID space and leaves unsupported forms canonical', () => {
  const basalt = basaltOccurrence();
  const iron = ironOccurrence();
  const water = featureOccurrence({
    id: 'occ-water',
    resourceId: 'saline-water',
    featureId: 'feature-water',
    composition: null,
  });
  assert.equal(extractorOccurrenceEligibility(water).ok, false);

  const compiled = compileExtractableWorldOccurrencesForRuntime({
    resourceOccurrences: {
      [basalt.id]: basalt,
      [iron.id]: iron,
      [water.id]: water,
    },
  });

  assert.deepEqual(Object.keys(compiled.occurrences).sort(), ['occ-basalt', 'occ-iron']);
  assert.match(compiled.unsupported['occ-water'], /does not support resource physical form 'liquid'/);
  assert.equal(
    compiled.occurrences['occ-basalt'].materialPerKg.toColumns().speciesIds.some(id => id === compiled.idTables.species.idFor('plagioclase')),
    true,
  );
  assert.equal(
    compiled.occurrences['occ-iron'].materialPerKg.toColumns().speciesIds.some(id => id === compiled.idTables.species.idFor('hematite')),
    true,
  );
});

test('WASM occurrence setup crosses the bridge only during compilation/setup', () => {
  const { occurrence: packed } = compileResourceOccurrenceForRuntime(
    basaltOccurrence(),
    createPackedMaterialIdTables(),
    { reserveMassKg: 50 },
  );
  const calls = { fractions: [], reserve: [] };
  const fakeWasmOccurrence = {
    push_material_fraction(...args) { calls.fractions.push(args); },
    set_finite_reserve_mass_kg(value) { calls.reserve.push(value); },
  };

  assert.equal(populateWasmResourceOccurrence(fakeWasmOccurrence, packed), fakeWasmOccurrence);
  assert.equal(calls.fractions.length, packed.materialPerKg.toColumns().quantities.length);
  assert.deepEqual(calls.reserve, [50]);
  const total = calls.fractions.reduce((sum, args) => sum + args[4], 0);
  assert.ok(Math.abs(total - 1) < 1e-12);
});

test('unsupported liquid occurrence fails compilation with the same production eligibility reason', () => {
  const water = featureOccurrence({
    id: 'occ-water',
    resourceId: 'saline-water',
    featureId: 'feature-water',
    composition: null,
  });
  assert.throws(
    () => compileResourceOccurrenceForRuntime(water),
    /does not support resource physical form 'liquid'/,
  );
});
