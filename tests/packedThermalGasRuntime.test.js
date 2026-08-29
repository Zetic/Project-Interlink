import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  addGasMaterialState,
  createGasMaterialBody,
  createGasMaterialState,
} from '../src/core/materials/gas/gasMaterialState.js';
import {
  materialBodyTemperatureK,
  setMaterialBodyTemperatureK,
} from '../src/core/materials/thermal/thermalMaterial.js';
import {
  compileGasBodiesAndThermalTableForRuntime,
  compileGasMaterialBodyForRuntime,
  populateWasmPackedGasBody,
  populateWasmThermalGasTable,
} from '../src/simulation/packedThermalGasCompiler.js';
import {
  PACKED_THERMAL_REFERENCE_TEMPERATURE_K,
  PackedGasRuntimeBody,
  PackedGasRuntimeState,
  PackedGasStreamRuntimeState,
  exchangePackedHeatBetweenSolidAndGas,
  mixPackedGasBodies,
  packedAmbientHeatTransferEnergyJ,
  packedBoundedConductiveHeatTransferEnergyJ,
  packedGasBodyTemperatureK,
  setPackedGasBodyTemperatureK,
  setPackedSolidBodyTemperatureK,
} from '../src/simulation/packedGasRuntime.js';
import {
  PackedSolidRuntimeBody,
} from '../src/simulation/packedStorageRuntime.js';
import { PackedSolidRuntimeState } from '../src/simulation/packedRuntimeState.js';
import {
  compileSpeciesThermalTableForRuntime,
  createPackedMaterialIdTables,
} from '../src/simulation/packedRuntimeCompiler.js';

function waterVaporBody(massKg, temperatureK) {
  const body = createGasMaterialBody(createGasMaterialState({ waterVapor: massKg }));
  setMaterialBodyTemperatureK(body, temperatureK);
  return body;
}

test('canonical gas bodies compile into packed state with exact sensible-energy temperature parity', () => {
  const canonical = waterVaporBody(2, 500);
  const { packedGasBody, idTables } = compileGasMaterialBodyForRuntime(canonical);
  const thermalTable = compileSpeciesThermalTableForRuntime(idTables);

  assert.equal(packedGasBody.totalMassKg(), 2);
  assert.equal(idTables.species.valueFor(packedGasBody.gasState.speciesIds[0]), 'waterVapor');
  assert.ok(Math.abs(packedGasBody.sensibleEnthalpyJ - canonical.thermalState.sensibleEnthalpyJ) < 1e-9);
  assert.ok(Math.abs(packedGasBodyTemperatureK(packedGasBody, thermalTable) - 500) < 1e-10);
  assert.ok(Math.abs(materialBodyTemperatureK(canonical) - 500) < 1e-10);
});

test('packed gas mixing matches canonical mass, enthalpy, and equilibrium temperature', () => {
  const canonicalA = waterVaporBody(1, 400);
  const canonicalB = waterVaporBody(3, 600);
  const canonicalMixed = createGasMaterialBody(createGasMaterialState());
  addGasMaterialState(canonicalMixed.gasState, canonicalA.gasState);
  addGasMaterialState(canonicalMixed.gasState, canonicalB.gasState);
  canonicalMixed.thermalState.sensibleEnthalpyJ = canonicalA.thermalState.sensibleEnthalpyJ
    + canonicalB.thermalState.sensibleEnthalpyJ;

  const { packedGasBodies, thermalTable } = compileGasBodiesAndThermalTableForRuntime([
    canonicalA,
    canonicalB,
  ]);
  const packedMixed = mixPackedGasBodies(packedGasBodies);

  assert.ok(Math.abs(packedMixed.totalMassKg() - 4) < 1e-12);
  assert.ok(Math.abs(packedMixed.sensibleEnthalpyJ - canonicalMixed.thermalState.sensibleEnthalpyJ) < 1e-8);
  assert.ok(Math.abs(packedGasBodyTemperatureK(packedMixed, thermalTable) - materialBodyTemperatureK(canonicalMixed)) < 1e-10);
  assert.ok(Math.abs(packedGasBodyTemperatureK(packedMixed, thermalTable) - 550) < 1e-10);
});

test('zero sensible enthalpy resolves to reference temperature without thermal property coverage', () => {
  const gasState = new PackedGasRuntimeState();
  gasState.pushSpecies(42, 1);
  const body = new PackedGasRuntimeBody(gasState, 0);
  const emptyTables = createPackedMaterialIdTables();
  const thermalTable = compileSpeciesThermalTableForRuntime(emptyTables);
  assert.equal(packedGasBodyTemperatureK(body, thermalTable), PACKED_THERMAL_REFERENCE_TEMPERATURE_K);
});

test('packed gas streams keep kg/s composition and specific sensible enthalpy separate', () => {
  const gasFlow = new PackedGasRuntimeState();
  gasFlow.pushSpecies(1, 2);
  const stream = new PackedGasStreamRuntimeState(gasFlow, 1000);
  const inventory = new PackedGasRuntimeBody();

  const accepted = inventory.receiveFlow(stream.gasState, 0.25, stream.specificSensibleEnthalpyJPerKg);
  assert.ok(Math.abs(accepted - 0.5) < 1e-12);
  assert.ok(Math.abs(inventory.totalMassKg() - 0.5) < 1e-12);
  assert.ok(Math.abs(inventory.sensibleEnthalpyJ - 500) < 1e-12);
  assert.equal(stream.totalMassFlowKgPerSecond, 2);
});

test('solid-gas heat exchange conserves energy and cannot overshoot equilibrium in one fixed step', () => {
  const idTables = createPackedMaterialIdTables();
  const hematiteId = idTables.species.idFor('hematite');
  const waterVaporId = idTables.species.idFor('waterVapor');
  const thermalTable = compileSpeciesThermalTableForRuntime(idTables);

  const solidState = new PackedSolidRuntimeState();
  solidState.pushFraction({
    speciesId: hematiteId,
    sizeBinId: 1,
    liberationClassId: 1,
    textureProfileId: 0,
    quantity: 1,
  });
  const solidBody = new PackedSolidRuntimeBody(solidState, 0);
  setPackedSolidBodyTemperatureK(solidBody, thermalTable, 900);

  const gasState = new PackedGasRuntimeState();
  gasState.pushSpecies(waterVaporId, 1);
  const gasBody = new PackedGasRuntimeBody(gasState, 0);
  setPackedGasBodyTemperatureK(gasBody, thermalTable, 300);

  const energyBefore = solidBody.sensibleEnthalpyJ + gasBody.sensibleEnthalpyJ;
  const transfer = exchangePackedHeatBetweenSolidAndGas(
    solidBody,
    gasBody,
    thermalTable,
    1e9,
    0.1,
  );

  assert.ok(transfer > 0);
  assert.ok(Math.abs(solidBody.sensibleEnthalpyJ + gasBody.sensibleEnthalpyJ - energyBefore) < 1e-8);
  const solidCapacity = thermalTable.heatCapacityJPerK(solidBody.solidState);
  const gasCapacity = 1900;
  const solidTemperature = PACKED_THERMAL_REFERENCE_TEMPERATURE_K + solidBody.sensibleEnthalpyJ / solidCapacity;
  const gasTemperature = PACKED_THERMAL_REFERENCE_TEMPERATURE_K + gasBody.sensibleEnthalpyJ / gasCapacity;
  assert.ok(Math.abs(solidTemperature - gasTemperature) < 1e-9);
});

test('bounded conductive exchange clips an aggressive transfer at exact equilibrium', () => {
  const transfer = packedBoundedConductiveHeatTransferEnergyJ(
    500,
    100,
    300,
    300,
    1e9,
    0.1,
  );
  const expected = (500 - 300) / (1 / 100 + 1 / 300);
  assert.ok(Math.abs(transfer - expected) < 1e-9);
});

test('ambient transfer preserves the production furnace heat-loss equation', () => {
  assert.ok(Math.abs(packedAmbientHeatTransferEnergyJ(500, 10, 0.1) - 201.85) < 1e-10);
});

test('WASM setup helpers populate gas material and thermal data only at initialization', () => {
  const canonical = waterVaporBody(2, 500);
  const { packedGasBody, idTables } = compileGasMaterialBodyForRuntime(canonical);
  const calls = [];
  const wasmGasBody = {
    push_species(speciesId, quantity) { calls.push(['species', speciesId, quantity]); },
    set_sensible_enthalpy_j(value) { calls.push(['enthalpy', value]); },
  };
  const thermalCalls = [];
  const wasmThermalTable = {
    set_specific_heat_capacity_j_per_kg_k(speciesId, cp) {
      thermalCalls.push([speciesId, cp]);
    },
  };

  populateWasmPackedGasBody(wasmGasBody, packedGasBody);
  populateWasmThermalGasTable(wasmThermalTable, idTables);

  assert.equal(calls.filter(([kind]) => kind === 'species').length, 1);
  assert.equal(calls.filter(([kind]) => kind === 'enthalpy').length, 1);
  assert.deepEqual(thermalCalls, [[idTables.species.idFor('waterVapor'), 1900]]);
});
