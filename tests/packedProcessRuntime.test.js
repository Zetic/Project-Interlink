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
  createPackedMaterialIdTables,
} from '../src/simulation/packedRuntimeCompiler.js';
import { compileMaterialStreamForRuntime } from '../src/simulation/packedProcessCompiler.js';
import { PackedFeederRuntime } from '../src/simulation/packedProcessRuntime.js';

function makeFeedBody() {
  const solidState = createSolidMaterialState();
  addSolidFractionDirect(solidState, {
    speciesId: 'hematite',
    sizeBinId: '1-5mm',
    liberationClassId: 'partial',
    quantity: 60,
  });
  addSolidFractionDirect(solidState, {
    speciesId: 'quartz',
    sizeBinId: '1-5mm',
    liberationClassId: 'partial',
    quantity: 40,
  });
  return createSolidMaterialBody(solidState, { sensibleEnthalpyJ: 10_000 });
}

function createCanonicalFeederGraph({ targetCapacityKg = 100, enabled = true } = {}) {
  const blueprint = createBlueprint();
  const source = blueprintAddHopper(blueprint, 200);
  const feeder = blueprintAddApparatus(blueprint, 'feeder', {
    flowRateKgPerSecond: 5,
    throughputKgPerSecond: 8,
    enabled,
  });
  const target = blueprintAddHopper(blueprint, targetCapacityKg);
  hopperReceiveMaterialBody(source, makeFeedBody());

  const inputConnection = blueprintConnect(
    blueprint,
    source.id,
    source.outputPortId,
    feeder.id,
    feeder.inputPortId,
  );
  const outputConnection = blueprintConnect(
    blueprint,
    feeder.id,
    feeder.outputPortId,
    target.id,
    target.inputPortId,
  );
  assert.ok(inputConnection);
  assert.ok(outputConnection);
  return { blueprint, source, feeder, target, inputConnection, outputConnection };
}

function packedSpeciesQuantities(packedState, idTables) {
  const result = {};
  const columns = packedState.toColumns();
  for (let index = 0; index < columns.quantities.length; index++) {
    const speciesId = idTables.species.valueFor(columns.speciesIds[index]);
    result[speciesId] = (result[speciesId] ?? 0) + columns.quantities[index];
  }
  return result;
}

function assertRecordClose(actual, expected, tolerance = 1e-10) {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
  for (const key of Object.keys(expected)) {
    assert.ok(Math.abs(actual[key] - expected[key]) <= tolerance, `${key}: ${actual[key]} != ${expected[key]}`);
  }
}

test('packed Feeder matches production Hopper -> Feeder -> Hopper execution and stream state', () => {
  const canonical = createCanonicalFeederGraph();
  const idTables = createPackedMaterialIdTables();
  const { packedHopper: packedSource } = compileHopperForRuntime(canonical.source, idTables);
  const { packedHopper: packedTarget } = compileHopperForRuntime(canonical.target, idTables);
  const packedFeeder = new PackedFeederRuntime({
    flowRateKgPerSecond: 5,
    throughputKgPerSecond: 8,
    enabled: true,
  });

  simulationTick(canonical.blueprint, {}, 0.1);
  const packedResult = packedFeeder.tickHopperToHopper(packedSource, packedTarget, 0.1);

  assert.equal(canonical.feeder.operatingState, 'running');
  assert.equal(packedResult.operatingState, canonical.feeder.operatingState);
  assert.ok(Math.abs(packedResult.transferredMassKg - 0.5) < 1e-12);
  assert.ok(Math.abs(packedSource.storedMassKg() - hopperStoredMassKg(canonical.source)) < 1e-10);
  assert.ok(Math.abs(packedTarget.storedMassKg() - hopperStoredMassKg(canonical.target)) < 1e-10);
  assert.ok(Math.abs(packedSource.body.sensibleEnthalpyJ - canonical.source.materialBody.thermalState.sensibleEnthalpyJ) < 1e-9);
  assert.ok(Math.abs(packedTarget.body.sensibleEnthalpyJ - canonical.target.materialBody.thermalState.sensibleEnthalpyJ) < 1e-9);

  assertRecordClose(
    packedSpeciesQuantities(packedSource.body.solidState, idTables),
    summarizeSolidMaterialBySpecies(canonical.source.materialBody.solidState),
  );
  assertRecordClose(
    packedSpeciesQuantities(packedTarget.body.solidState, idTables),
    summarizeSolidMaterialBySpecies(canonical.target.materialBody.solidState),
  );

  const canonicalInputStream = getStreamForConnection(canonical.blueprint, canonical.inputConnection.id);
  const canonicalOutputStream = getStreamForConnection(canonical.blueprint, canonical.outputConnection.id);
  assert.ok(canonicalInputStream);
  assert.ok(canonicalOutputStream);
  assert.ok(Math.abs(packedFeeder.inputStream.totalMassFlowKgPerSecond() - totalMaterialStreamMassFlowKgPerSecond(canonicalInputStream)) < 1e-10);
  assert.ok(Math.abs(packedFeeder.outputStream.totalMassFlowKgPerSecond() - totalMaterialStreamMassFlowKgPerSecond(canonicalOutputStream)) < 1e-10);
  assert.ok(Math.abs(packedFeeder.inputStream.specificSensibleEnthalpyJPerKg - canonicalInputStream.specificSensibleEnthalpyJPerKg) < 1e-10);
  assert.ok(Math.abs(packedFeeder.outputStream.specificSensibleEnthalpyJPerKg - canonicalOutputStream.specificSensibleEnthalpyJPerKg) < 1e-10);
  assertRecordClose(
    packedSpeciesQuantities(packedFeeder.outputStream.solidState, idTables),
    canonicalOutputStream.componentMassFlowKgPerSecond,
  );

  const { packed: compiledCanonicalStream } = compileMaterialStreamForRuntime(canonicalOutputStream, idTables);
  assert.ok(Math.abs(compiledCanonicalStream.totalMassFlowKgPerSecond() - packedFeeder.outputStream.totalMassFlowKgPerSecond()) < 1e-10);
  assert.ok(Math.abs(compiledCanonicalStream.specificSensibleEnthalpyJPerKg - packedFeeder.outputStream.specificSensibleEnthalpyJPerKg) < 1e-10);
});

test('packed Feeder matches production downstream capacity throttling and blocked state', () => {
  const canonical = createCanonicalFeederGraph({ targetCapacityKg: 0.2 });
  const idTables = createPackedMaterialIdTables();
  const { packedHopper: packedSource } = compileHopperForRuntime(canonical.source, idTables);
  const { packedHopper: packedTarget } = compileHopperForRuntime(canonical.target, idTables);
  const packedFeeder = new PackedFeederRuntime({
    flowRateKgPerSecond: 5,
    throughputKgPerSecond: 8,
    enabled: true,
  });

  simulationTick(canonical.blueprint, {}, 0.1);
  const first = packedFeeder.tickHopperToHopper(packedSource, packedTarget, 0.1);
  assert.equal(first.operatingState, canonical.feeder.operatingState);
  assert.equal(first.operatingState, 'running');
  assert.ok(Math.abs(first.transferredMassKg - 0.2) < 1e-12);
  const canonicalFirstOutput = getStreamForConnection(canonical.blueprint, canonical.outputConnection.id);
  assert.ok(Math.abs(packedFeeder.outputStream.totalMassFlowKgPerSecond() - totalMaterialStreamMassFlowKgPerSecond(canonicalFirstOutput)) < 1e-10);

  simulationTick(canonical.blueprint, {}, 0.1);
  const second = packedFeeder.tickHopperToHopper(packedSource, packedTarget, 0.1);
  assert.equal(second.operatingState, canonical.feeder.operatingState);
  assert.equal(second.operatingState, 'blocked');
  assert.equal(packedFeeder.lastError, canonical.feeder.lastError);
  assert.equal(packedFeeder.outputStream.totalMassFlowKgPerSecond(), 0);
  const canonicalSecondOutput = getStreamForConnection(canonical.blueprint, canonical.outputConnection.id);
  assert.equal(totalMaterialStreamMassFlowKgPerSecond(canonicalSecondOutput), 0);
});

test('packed Feeder preserves production disabled semantics and zero streams', () => {
  const canonical = createCanonicalFeederGraph({ enabled: false });
  const idTables = createPackedMaterialIdTables();
  const { packedHopper: packedSource } = compileHopperForRuntime(canonical.source, idTables);
  const { packedHopper: packedTarget } = compileHopperForRuntime(canonical.target, idTables);
  const packedFeeder = new PackedFeederRuntime({
    flowRateKgPerSecond: 5,
    throughputKgPerSecond: 8,
    enabled: false,
  });

  simulationTick(canonical.blueprint, {}, 0.1);
  const result = packedFeeder.tickHopperToHopper(packedSource, packedTarget, 0.1);
  assert.equal(result.operatingState, canonical.feeder.operatingState);
  assert.equal(result.operatingState, 'off');
  assert.equal(packedFeeder.inputStream.totalMassFlowKgPerSecond(), 0);
  assert.equal(packedFeeder.outputStream.totalMassFlowKgPerSecond(), 0);
  assert.equal(packedSource.storedMassKg(), 100);
  assert.equal(packedTarget.storedMassKg(), 0);
});
