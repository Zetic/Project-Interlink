import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSolidMaterialState,
  summarizeSolidMaterialBySizeBin,
  totalSolidQuantity,
} from '../src/core/materials/solids/solidMaterialState.js';
import { magneticRecoveryForFraction } from '../src/core/processes/physics/magneticSeparation.js';
import { splitScreenedSolidState } from '../src/core/processes/physics/screening.js';
import {
  compileSolidMaterialStateForRuntime,
  createPackedMaterialIdTables,
} from '../src/simulation/packedRuntimeCompiler.js';
import {
  compileSeparationTablesForRuntime,
  populateWasmSeparationTables,
} from '../src/simulation/packedSeparationCompiler.js';

function representativeFeed() {
  return createSolidMaterialState([
    { speciesId: 'magnetite', sizeBinId: '15-25mm', liberationClassId: 'liberated', quantity: 10 },
    { speciesId: 'hematite', sizeBinId: '5-15mm', liberationClassId: 'partial', quantity: 5 },
    { speciesId: 'quartz', sizeBinId: '25-60mm', liberationClassId: 'locked', quantity: 5 },
  ]);
}

test('separation compiler resolves particle bins, liberation factors, magnetic response, and Cp into runtime IDs', () => {
  const idTables = createPackedMaterialIdTables();
  compileSolidMaterialStateForRuntime(representativeFeed(), idTables);
  const compiled = compileSeparationTablesForRuntime(idTables);

  const bySize = Object.fromEntries(compiled.sizeBins.map(row => [row.canonicalId, row]));
  assert.equal(bySize['15-25mm'].maxMm, 25);
  assert.equal(bySize['15-25mm'].magneticSuitability, 1);
  assert.equal(bySize['5-15mm'].magneticSuitability, 0.9);
  assert.equal(bySize['0.5-1mm'].magneticSuitability, 0.4);
  assert.equal(bySize['0.016-0.032mm'].magneticSuitability, 0);
  assert.equal(bySize['lt-0.032mm'].magneticSuitability, 0.05);
  assert.equal(bySize['lt-1mm'].magneticSuitability, 0.4);
  assert.equal(bySize['120mm-plus'].magneticSuitability, 0);

  const liberation = Object.fromEntries(compiled.liberationClasses.map(row => [row.canonicalId, row.recoveryFactor]));
  assert.deepEqual(liberation, {
    locked: 0.25,
    partial: 0.55,
    'mostly-liberated': 0.8,
    liberated: 1,
  });

  const magnetic = Object.fromEntries(compiled.magneticResponses.map(row => [row.canonicalId, row.normalizedSeparationCoefficient]));
  assert.equal(magnetic.magnetite, 1);
  assert.equal(magnetic.hematite, 0.55);
  assert.equal(magnetic.quartz, 0);

  const thermal = Object.fromEntries(compiled.thermalProperties.map(row => [row.canonicalId, row.specificHeatCapacityJPerKgK]));
  assert.equal(thermal.magnetite, 670);
  assert.equal(thermal.hematite, 650);
  assert.equal(thermal.quartz, 740);

  assert.equal(bySize['15-25mm'].runtimeId, idTables.sizeBin.idFor('15-25mm'));
  assert.equal(
    compiled.magneticResponses.find(row => row.canonicalId === 'magnetite').runtimeId,
    idTables.species.idFor('magnetite'),
  );
});

test('unregistered runtime species remain absent so Rust reports missing magnetic-property coverage', () => {
  const idTables = createPackedMaterialIdTables();
  idTables.species.idFor('unregistered-test-species');
  const compiled = compileSeparationTablesForRuntime(idTables);
  assert.equal(compiled.magneticResponses.some(row => row.canonicalId === 'unregistered-test-species'), false);
  assert.equal(compiled.thermalProperties.some(row => row.canonicalId === 'unregistered-test-species'), false);
});

test('WASM separation table population uses one setup pass over compiled metadata', () => {
  const idTables = createPackedMaterialIdTables();
  compileSolidMaterialStateForRuntime(representativeFeed(), idTables);
  const compiled = compileSeparationTablesForRuntime(idTables);
  const calls = {
    sizes: [],
    liberation: [],
    magnetic: [],
    thermal: [],
  };
  const fakeWasmTable = {
    add_size_bin(...args) { calls.sizes.push(args); },
    add_liberation_class(...args) { calls.liberation.push(args); },
    set_species_magnetic_response(...args) { calls.magnetic.push(args); },
    set_specific_heat_capacity_j_per_kg_k(...args) { calls.thermal.push(args); },
  };

  assert.equal(populateWasmSeparationTables(fakeWasmTable, compiled), fakeWasmTable);
  assert.equal(calls.sizes.length, compiled.sizeBins.length);
  assert.equal(calls.liberation.length, 4);
  assert.equal(calls.magnetic.length, 3);
  assert.equal(calls.thermal.length, 3);
  const magnetiteId = idTables.species.idFor('magnetite');
  assert.ok(calls.magnetic.some(([id, response]) => id === magnetiteId && response === 1));
  assert.ok(calls.thermal.some(([id, cp]) => id === magnetiteId && cp === 670));
});

test('compiler metadata pins the production magnetic recovery curve used by Rust parity tests', () => {
  assert.ok(Math.abs(
    magneticRecoveryForFraction('magnetite', '15-25mm', 'liberated', 0.5) - 0.5875,
  ) < 1e-12);
  assert.ok(Math.abs(
    magneticRecoveryForFraction('quartz', '15-25mm', 'liberated', 0.5) - 0.0125,
  ) < 1e-12);
  assert.equal(
    magneticRecoveryForFraction('magnetite', '0.016-0.032mm', 'liberated', 1),
    0,
  );
  assert.ok(Math.abs(
    magneticRecoveryForFraction('magnetite', 'lt-0.032mm', 'liberated', 1) - 0.051,
  ) < 1e-12);
});

test('production sharp-cut Screen fixture remains the parity oracle for packed Rust classification', () => {
  const feed = createSolidMaterialState([
    { speciesId: 'quartz', sizeBinId: '5-15mm', liberationClassId: 'locked', quantity: 30 },
    { speciesId: 'hematite', sizeBinId: '15-25mm', liberationClassId: 'partial', quantity: 20 },
    { speciesId: 'magnetite', sizeBinId: '25-60mm', liberationClassId: 'mostly-liberated', quantity: 40 },
    { speciesId: 'quartz', sizeBinId: '60-120mm', liberationClassId: 'liberated', quantity: 10 },
  ]);
  const { undersize, oversize } = splitScreenedSolidState(feed, 25);
  assert.equal(totalSolidQuantity(undersize), 50);
  assert.equal(totalSolidQuantity(oversize), 50);
  assert.deepEqual(summarizeSolidMaterialBySizeBin(undersize), {
    '5-15mm': 30,
    '15-25mm': 20,
  });
  assert.deepEqual(summarizeSolidMaterialBySizeBin(oversize), {
    '25-60mm': 40,
    '60-120mm': 10,
  });
});
