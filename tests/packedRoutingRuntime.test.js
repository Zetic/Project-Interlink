import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addSolidFractionDirect,
  createSolidMaterialBody,
  createSolidMaterialState,
  summarizeSolidMaterialBySpecies,
} from '../src/core/materials/solids/solidMaterialState.js';
import {
  blueprintAddApparatus,
  blueprintAddHopper,
  blueprintConnect,
  createBlueprint,
  getStreamForConnection,
  simulationTick,
} from '../src/simulation/simulationEngine.js';
import {
  hopperReceiveMaterialBody,
  hopperStoredMassKg,
} from '../src/simulation/hopperNode.js';
import { totalMaterialStreamMassFlowKgPerSecond } from '../src/simulation/materialStream.js';
import {
  compileHopperForRuntime,
  compileSpeciesThermalTableForRuntime,
  createPackedMaterialIdTables,
} from '../src/simulation/packedRuntimeCompiler.js';
import {
  PackedMergerRuntime,
  PackedSplitterRuntime,
} from '../src/simulation/packedRoutingRuntime.js';

function makeBody(fractions, sensibleEnthalpyJ = 0) {
  const solidState = createSolidMaterialState();
  for (const { speciesId, quantity } of fractions) {
    addSolidFractionDirect(solidState, {
      speciesId,
      sizeBinId: '1-5mm',
      liberationClassId: 'partial',
      quantity,
    });
  }
  return createSolidMaterialBody(solidState, { sensibleEnthalpyJ });
}

function packedSpeciesQuantities(packedState, idTables) {
  const result = {};
  for (let index = 0; index < packedState.length; index++) {
    const speciesId = idTables.species.valueFor(packedState.speciesIds[index]);
    result[speciesId] = (result[speciesId] ?? 0) + packedState.quantities[index];
  }
  return result;
}

function assertRecordClose(actual, expected, tolerance = 1e-9) {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
  for (const key of Object.keys(expected)) {
    assert.ok(Math.abs(actual[key] - expected[key]) <= tolerance, `${key}: ${actual[key]} != ${expected[key]}`);
  }
}

function createCanonicalSplitterGraph({ outputACapacityKg = 100, outputBCapacityKg = 100 } = {}) {
  const blueprint = createBlueprint();
  const source = blueprintAddHopper(blueprint, 200);
  const splitter = blueprintAddApparatus(blueprint, 'splitter', {
    splitFractionToA: 0.25,
    throughputKgPerSecond: 8,
    enabled: true,
  });
  const outputA = blueprintAddHopper(blueprint, outputACapacityKg);
  const outputB = blueprintAddHopper(blueprint, outputBCapacityKg);
  hopperReceiveMaterialBody(source, makeBody([
    { speciesId: 'hematite', quantity: 60 },
    { speciesId: 'quartz', quantity: 40 },
  ], 10_000));

  const inputConnection = blueprintConnect(blueprint, source.id, source.outputPortId, splitter.id, splitter.inputPortId);
  const outputAConnection = blueprintConnect(blueprint, splitter.id, splitter.outputAPortId, outputA.id, outputA.inputPortId);
  const outputBConnection = blueprintConnect(blueprint, splitter.id, splitter.outputBPortId, outputB.id, outputB.inputPortId);
  assert.ok(inputConnection && outputAConnection && outputBConnection);
  return { blueprint, source, splitter, outputA, outputB, inputConnection, outputAConnection, outputBConnection };
}

function createCanonicalMergerGraph({ outputCapacityKg = 100 } = {}) {
  const blueprint = createBlueprint();
  const inputA = blueprintAddHopper(blueprint, 100);
  const inputB = blueprintAddHopper(blueprint, 100);
  const merger = blueprintAddApparatus(blueprint, 'merger', {
    throughputKgPerSecond: 10,
    enabled: true,
  });
  const output = blueprintAddHopper(blueprint, outputCapacityKg);

  // Deliberately different compositions and sensible-enthalpy states so the
  // packed runtime must reproduce production constant-Cp equilibrium behavior.
  hopperReceiveMaterialBody(inputA, makeBody([{ speciesId: 'hematite', quantity: 40 }], 5_200));
  hopperReceiveMaterialBody(inputB, makeBody([{ speciesId: 'quartz', quantity: 60 }], 22_200));

  const inputAConnection = blueprintConnect(blueprint, inputA.id, inputA.outputPortId, merger.id, merger.inputAPortId);
  const inputBConnection = blueprintConnect(blueprint, inputB.id, inputB.outputPortId, merger.id, merger.inputBPortId);
  const outputConnection = blueprintConnect(blueprint, merger.id, merger.outputPortId, output.id, output.inputPortId);
  assert.ok(inputAConnection && inputBConnection && outputConnection);
  return { blueprint, inputA, inputB, merger, output, inputAConnection, inputBConnection, outputConnection };
}

function compileHoppers(canonicalHoppers) {
  const idTables = createPackedMaterialIdTables();
  const packed = canonicalHoppers.map(hopper => compileHopperForRuntime(hopper, idTables).packedHopper);
  const thermal = compileSpeciesThermalTableForRuntime(idTables);
  return { idTables, packed, thermal };
}

test('packed Splitter matches production 1-to-2 routing, energy, and streams', () => {
  const canonical = createCanonicalSplitterGraph();
  const { idTables, packed: [source, outputA, outputB], thermal } = compileHoppers([
    canonical.source,
    canonical.outputA,
    canonical.outputB,
  ]);
  const packedSplitter = new PackedSplitterRuntime({
    splitFractionToA: 0.25,
    throughputKgPerSecond: 8,
    enabled: true,
  });

  simulationTick(canonical.blueprint, {}, 0.1);
  const result = packedSplitter.tickHopperToHoppers(source, outputA, outputB, thermal, 0.1);

  assert.equal(result.operatingState, canonical.splitter.operatingState);
  assert.equal(result.operatingState, 'running');
  assert.ok(Math.abs(result.transferredMassKg - 0.8) < 1e-12);
  assert.ok(Math.abs(source.storedMassKg() - hopperStoredMassKg(canonical.source)) < 1e-9);
  assert.ok(Math.abs(outputA.storedMassKg() - hopperStoredMassKg(canonical.outputA)) < 1e-9);
  assert.ok(Math.abs(outputB.storedMassKg() - hopperStoredMassKg(canonical.outputB)) < 1e-9);
  assert.ok(Math.abs(source.body.sensibleEnthalpyJ - canonical.source.materialBody.thermalState.sensibleEnthalpyJ) < 1e-8);
  assert.ok(Math.abs(outputA.body.sensibleEnthalpyJ - canonical.outputA.materialBody.thermalState.sensibleEnthalpyJ) < 1e-8);
  assert.ok(Math.abs(outputB.body.sensibleEnthalpyJ - canonical.outputB.materialBody.thermalState.sensibleEnthalpyJ) < 1e-8);
  assertRecordClose(packedSpeciesQuantities(outputA.body.solidState, idTables), summarizeSolidMaterialBySpecies(canonical.outputA.materialBody.solidState));
  assertRecordClose(packedSpeciesQuantities(outputB.body.solidState, idTables), summarizeSolidMaterialBySpecies(canonical.outputB.materialBody.solidState));

  const canonicalInput = getStreamForConnection(canonical.blueprint, canonical.inputConnection.id);
  const canonicalA = getStreamForConnection(canonical.blueprint, canonical.outputAConnection.id);
  const canonicalB = getStreamForConnection(canonical.blueprint, canonical.outputBConnection.id);
  assert.ok(Math.abs(packedSplitter.inputStream.totalMassFlowKgPerSecond() - totalMaterialStreamMassFlowKgPerSecond(canonicalInput)) < 1e-9);
  assert.ok(Math.abs(packedSplitter.outputAStream.totalMassFlowKgPerSecond() - totalMaterialStreamMassFlowKgPerSecond(canonicalA)) < 1e-9);
  assert.ok(Math.abs(packedSplitter.outputBStream.totalMassFlowKgPerSecond() - totalMaterialStreamMassFlowKgPerSecond(canonicalB)) < 1e-9);
  assert.ok(Math.abs(packedSplitter.outputAStream.specificSensibleEnthalpyJPerKg - canonicalA.specificSensibleEnthalpyJPerKg) < 1e-8);
  assert.ok(Math.abs(packedSplitter.outputBStream.specificSensibleEnthalpyJPerKg - canonicalB.specificSensibleEnthalpyJPerKg) < 1e-8);
});

test('packed Splitter matches production throttling by the tightest output and blocked state', () => {
  const canonical = createCanonicalSplitterGraph({ outputACapacityKg: 0.05, outputBCapacityKg: 100 });
  const { packed: [source, outputA, outputB], thermal } = compileHoppers([canonical.source, canonical.outputA, canonical.outputB]);
  const packedSplitter = new PackedSplitterRuntime({ splitFractionToA: 0.25, throughputKgPerSecond: 8, enabled: true });

  simulationTick(canonical.blueprint, {}, 0.1);
  const first = packedSplitter.tickHopperToHoppers(source, outputA, outputB, thermal, 0.1);
  assert.equal(first.operatingState, canonical.splitter.operatingState);
  assert.equal(first.operatingState, 'running');
  assert.ok(Math.abs(first.transferredMassKg - 0.2) < 1e-12);

  simulationTick(canonical.blueprint, {}, 0.1);
  const second = packedSplitter.tickHopperToHoppers(source, outputA, outputB, thermal, 0.1);
  assert.equal(second.operatingState, canonical.splitter.operatingState);
  assert.equal(second.operatingState, 'blocked');
  assert.equal(packedSplitter.lastError, canonical.splitter.lastError);
  assert.equal(packedSplitter.outputAStream.totalMassFlowKgPerSecond(), 0);
  assert.equal(packedSplitter.outputBStream.totalMassFlowKgPerSecond(), 0);
});

test('packed Merger matches production 2-to-1 composition, equilibrium energy, and streams', () => {
  const canonical = createCanonicalMergerGraph();
  const { idTables, packed: [inputA, inputB, output], thermal } = compileHoppers([
    canonical.inputA,
    canonical.inputB,
    canonical.output,
  ]);
  const packedMerger = new PackedMergerRuntime({ throughputKgPerSecond: 10, enabled: true });

  simulationTick(canonical.blueprint, {}, 0.1);
  const result = packedMerger.tickHoppersToHopper(inputA, inputB, output, thermal, 0.1);

  assert.equal(result.operatingState, canonical.merger.operatingState);
  assert.equal(result.operatingState, 'running');
  assert.ok(Math.abs(result.outputMassKg - 1.0) < 1e-12);
  assert.ok(Math.abs(inputA.storedMassKg() - hopperStoredMassKg(canonical.inputA)) < 1e-9);
  assert.ok(Math.abs(inputB.storedMassKg() - hopperStoredMassKg(canonical.inputB)) < 1e-9);
  assert.ok(Math.abs(output.storedMassKg() - hopperStoredMassKg(canonical.output)) < 1e-9);
  assert.ok(Math.abs(inputA.body.sensibleEnthalpyJ - canonical.inputA.materialBody.thermalState.sensibleEnthalpyJ) < 1e-8);
  assert.ok(Math.abs(inputB.body.sensibleEnthalpyJ - canonical.inputB.materialBody.thermalState.sensibleEnthalpyJ) < 1e-8);
  assert.ok(Math.abs(output.body.sensibleEnthalpyJ - canonical.output.materialBody.thermalState.sensibleEnthalpyJ) < 1e-8);
  assertRecordClose(packedSpeciesQuantities(output.body.solidState, idTables), summarizeSolidMaterialBySpecies(canonical.output.materialBody.solidState));

  const canonicalA = getStreamForConnection(canonical.blueprint, canonical.inputAConnection.id);
  const canonicalB = getStreamForConnection(canonical.blueprint, canonical.inputBConnection.id);
  const canonicalOutput = getStreamForConnection(canonical.blueprint, canonical.outputConnection.id);
  assert.ok(Math.abs(packedMerger.inputAStream.totalMassFlowKgPerSecond() - totalMaterialStreamMassFlowKgPerSecond(canonicalA)) < 1e-9);
  assert.ok(Math.abs(packedMerger.inputBStream.totalMassFlowKgPerSecond() - totalMaterialStreamMassFlowKgPerSecond(canonicalB)) < 1e-9);
  assert.ok(Math.abs(packedMerger.outputStream.totalMassFlowKgPerSecond() - totalMaterialStreamMassFlowKgPerSecond(canonicalOutput)) < 1e-9);
  assert.ok(Math.abs(packedMerger.outputStream.specificSensibleEnthalpyJPerKg - canonicalOutput.specificSensibleEnthalpyJPerKg) < 1e-8);
  assertRecordClose(packedSpeciesQuantities(packedMerger.outputStream.solidState, idTables), canonicalOutput.componentMassFlowKgPerSecond);
});

test('packed Merger matches production output-capacity blocking', () => {
  const canonical = createCanonicalMergerGraph({ outputCapacityKg: 0.1 });
  const { packed: [inputA, inputB, output], thermal } = compileHoppers([canonical.inputA, canonical.inputB, canonical.output]);
  const packedMerger = new PackedMergerRuntime({ throughputKgPerSecond: 10, enabled: true });

  simulationTick(canonical.blueprint, {}, 0.1);
  const first = packedMerger.tickHoppersToHopper(inputA, inputB, output, thermal, 0.1);
  assert.equal(first.operatingState, canonical.merger.operatingState);
  assert.equal(first.operatingState, 'running');
  assert.ok(Math.abs(first.outputMassKg - 0.1) < 1e-12);

  simulationTick(canonical.blueprint, {}, 0.1);
  const second = packedMerger.tickHoppersToHopper(inputA, inputB, output, thermal, 0.1);
  assert.equal(second.operatingState, canonical.merger.operatingState);
  assert.equal(second.operatingState, 'blocked');
  assert.equal(packedMerger.lastError, canonical.merger.lastError);
  assert.equal(packedMerger.outputStream.totalMassFlowKgPerSecond(), 0);
});
