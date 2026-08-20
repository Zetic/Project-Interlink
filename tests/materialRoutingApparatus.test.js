import { test } from 'node:test';
import assert from 'node:assert/strict';

import { APPARATUS_DEFINITIONS } from '../src/content/apparatus/definitions.js';
import {
  FEEDING_PROCESS_ID,
  MERGING_PROCESS_ID,
  SPLITTING_PROCESS_ID,
  getProcessDefinition,
} from '../src/core/processes/definitions/index.js';
import {
  mergeSolidMaterialStates,
  splitSolidMaterialState,
} from '../src/core/processes/physics/index.js';
import {
  createSolidMaterialState,
  solidMaterialStatesEqual,
  summarizeSolidMaterialBySpecies,
  totalSolidQuantity,
} from '../src/core/materials/solids/solidMaterialState.js';
import {
  hopperReceiveInflow,
  hopperStoredMassKg,
} from '../src/simulation/hopperNode.js';
import {
  applyContinuousFeeding,
  applyContinuousMerging,
  applyContinuousSplitting,
} from '../src/simulation/continuousProcessing.js';
import {
  _resetOrdinals,
  blueprintAddApparatus,
  blueprintAddHopper,
  blueprintConnect,
  createBlueprint,
  getNodePortDefinitions,
  setApparatusParameter,
  setNodeEnabled,
  simulationTick,
} from '../src/simulation/simulationEngine.js';

const TOL = 1e-8;

function assertAlmostEqual(actual, expected, label = 'value') {
  assert.ok(Math.abs(actual - expected) <= TOL, `${label}: expected ${expected}, got ${actual}`);
}

function simpleState(entries) {
  return createSolidMaterialState(entries);
}

test('routing apparatus are definition-driven with explicit physical ports and process contracts', () => {
  assert.equal(APPARATUS_DEFINITIONS.splitter.processId, SPLITTING_PROCESS_ID);
  assert.equal(APPARATUS_DEFINITIONS.merger.processId, MERGING_PROCESS_ID);
  assert.equal(APPARATUS_DEFINITIONS.feeder.processId, FEEDING_PROCESS_ID);
  assert.equal(getProcessDefinition(SPLITTING_PROCESS_ID).conservationPolicy, 'species');
  assert.equal(getProcessDefinition(MERGING_PROCESS_ID).conservationPolicy, 'species');
  assert.equal(getProcessDefinition(FEEDING_PROCESS_ID).conservationPolicy, 'species');

  const blueprint = createBlueprint();
  const splitter = blueprintAddApparatus(blueprint, 'splitter');
  const merger = blueprintAddApparatus(blueprint, 'merger');
  const feeder = blueprintAddApparatus(blueprint, 'feeder');
  assert.deepEqual(getNodePortDefinitions(splitter).map(port => port.id), ['feed', 'output-a', 'output-b']);
  assert.deepEqual(getNodePortDefinitions(merger).map(port => port.id), ['input-a', 'input-b', 'product']);
  assert.deepEqual(getNodePortDefinitions(feeder).map(port => port.id), ['feed', 'product']);
});

test('Splitter divides every existing fraction proportionally without changing material descriptors', () => {
  const feed = simpleState([
    { speciesId: 'hematite', sizeBinId: '15-25mm', liberationClassId: 'partial', quantity: 7 },
    { speciesId: 'quartz', sizeBinId: '5-15mm', liberationClassId: 'liberated', quantity: 3 },
  ]);
  const { outputA, outputB } = splitSolidMaterialState(feed, 0.7);
  assertAlmostEqual(outputA.fractions['hematite|15-25mm|partial'], 4.9, 'hematite A');
  assertAlmostEqual(outputB.fractions['hematite|15-25mm|partial'], 2.1, 'hematite B');
  assertAlmostEqual(outputA.fractions['quartz|5-15mm|liberated'], 2.1, 'quartz A');
  assertAlmostEqual(outputB.fractions['quartz|5-15mm|liberated'], 0.9, 'quartz B');
  assertAlmostEqual(totalSolidQuantity(outputA) + totalSolidQuantity(outputB), 10, 'split conservation');
  assertAlmostEqual(totalSolidQuantity(feed), 10, 'input not mutated');
});

test('continuous Splitter respects rated throughput while preserving the configured ratio', () => {
  const feed = simpleState([
    { speciesId: 'hematite', sizeBinId: '15-25mm', liberationClassId: 'partial', quantity: 8 },
    { speciesId: 'quartz', sizeBinId: '15-25mm', liberationClassId: 'partial', quantity: 2 },
  ]);
  const result = applyContinuousSplitting(feed, 0.25, 4);
  assertAlmostEqual(totalSolidQuantity(result.actualFeedSolidState), 4, 'actual split feed');
  assertAlmostEqual(totalSolidQuantity(result.outputASolidState), 1, 'output A');
  assertAlmostEqual(totalSolidQuantity(result.outputBSolidState), 3, 'output B');
});

test('Splitter applies required-output backpressure atomically', () => {
  _resetOrdinals();
  const blueprint = createBlueprint();
  const feed = blueprintAddHopper(blueprint, 100);
  const splitter = blueprintAddApparatus(blueprint, 'splitter', { splitFractionToA: 0.5, throughputKgPerSecond: 10 });
  const outputA = blueprintAddHopper(blueprint, 1);
  const outputB = blueprintAddHopper(blueprint, 100);
  hopperReceiveInflow(feed, { hematite: 10 }, 15, 1);
  hopperReceiveInflow(outputA, { quartz: 1 }, 15, 1);
  blueprintConnect(blueprint, feed.id, feed.outputPortId, splitter.id, splitter.inputPortId);
  blueprintConnect(blueprint, splitter.id, splitter.outputAPortId, outputA.id, outputA.inputPortId);
  blueprintConnect(blueprint, splitter.id, splitter.outputBPortId, outputB.id, outputB.inputPortId);
  setNodeEnabled(blueprint, splitter.id, true);

  const beforeFeed = hopperStoredMassKg(feed);
  const beforeA = hopperStoredMassKg(outputA);
  const beforeB = hopperStoredMassKg(outputB);
  simulationTick(blueprint, {}, 1);
  assertAlmostEqual(hopperStoredMassKg(feed), beforeFeed, 'feed unchanged');
  assertAlmostEqual(hopperStoredMassKg(outputA), beforeA, 'A unchanged');
  assertAlmostEqual(hopperStoredMassKg(outputB), beforeB, 'B unchanged');
  assert.equal(splitter.operatingState, 'blocked');
});

test('Material Merger combines sparse populations without changing fraction identity', () => {
  const inputA = simpleState([
    { speciesId: 'hematite', sizeBinId: '15-25mm', liberationClassId: 'partial', quantity: 6 },
  ]);
  const inputB = simpleState([
    { speciesId: 'quartz', sizeBinId: '5-15mm', liberationClassId: 'liberated', quantity: 4 },
  ]);
  const product = mergeSolidMaterialStates(inputA, inputB);
  assert.deepEqual(summarizeSolidMaterialBySpecies(product), { hematite: 6, quartz: 4 });
  assertAlmostEqual(totalSolidQuantity(product), 10, 'merged mass');
  assertAlmostEqual(totalSolidQuantity(inputA), 6, 'input A unchanged');
  assertAlmostEqual(totalSolidQuantity(inputB), 4, 'input B unchanged');
});

test('continuous Material Merger scales both inputs together against rated throughput', () => {
  const inputA = simpleState([
    { speciesId: 'hematite', sizeBinId: '15-25mm', liberationClassId: 'partial', quantity: 8 },
  ]);
  const inputB = simpleState([
    { speciesId: 'quartz', sizeBinId: '5-15mm', liberationClassId: 'liberated', quantity: 2 },
  ]);
  const result = applyContinuousMerging(inputA, inputB, 5);
  assertAlmostEqual(totalSolidQuantity(result.actualInputASolidState), 4, 'scaled A');
  assertAlmostEqual(totalSolidQuantity(result.actualInputBSolidState), 1, 'scaled B');
  assertAlmostEqual(totalSolidQuantity(result.productSolidState), 5, 'product');
});

test('Material Merger consumes two connected inventories transactionally and can continue when one is empty', () => {
  _resetOrdinals();
  const blueprint = createBlueprint();
  const inputA = blueprintAddHopper(blueprint, 100);
  const inputB = blueprintAddHopper(blueprint, 100);
  const merger = blueprintAddApparatus(blueprint, 'merger', { throughputKgPerSecond: 10 });
  const output = blueprintAddHopper(blueprint, 100);
  hopperReceiveInflow(inputA, { hematite: 6 }, 15, 1);
  hopperReceiveInflow(inputB, { quartz: 4 }, 5, 1);
  blueprintConnect(blueprint, inputA.id, inputA.outputPortId, merger.id, merger.inputAPortId);
  blueprintConnect(blueprint, inputB.id, inputB.outputPortId, merger.id, merger.inputBPortId);
  blueprintConnect(blueprint, merger.id, merger.outputPortId, output.id, output.inputPortId);
  setNodeEnabled(blueprint, merger.id, true);

  simulationTick(blueprint, {}, 1);
  assertAlmostEqual(hopperStoredMassKg(inputA), 0, 'input A drained');
  assertAlmostEqual(hopperStoredMassKg(inputB), 0, 'input B drained');
  assertAlmostEqual(hopperStoredMassKg(output), 10, 'merged output');
  assert.deepEqual(output.storedComponentsKg, { hematite: 6, quartz: 4 });

  hopperReceiveInflow(inputA, { hematite: 3 }, 15, 1);
  simulationTick(blueprint, {}, 1);
  assertAlmostEqual(hopperStoredMassKg(inputA), 0, 'single available input drained');
  assertAlmostEqual(hopperStoredMassKg(output), 13, 'single-input continuation');
});

test('Feeder setpoint limits flow without modifying composition, size, or liberation', () => {
  const feed = simpleState([
    { speciesId: 'hematite', sizeBinId: '15-25mm', liberationClassId: 'partial', quantity: 8 },
    { speciesId: 'quartz', sizeBinId: '5-15mm', liberationClassId: 'liberated', quantity: 2 },
  ]);
  const result = applyContinuousFeeding(feed, 2.5, 10);
  assertAlmostEqual(totalSolidQuantity(result.actualFeedSolidState), 2.5, 'metered feed');
  assert.ok(solidMaterialStatesEqual(result.actualFeedSolidState, result.productSolidState));
});

test('placed Feeder honors player flow-rate changes and zero setpoint idles without consuming material', () => {
  _resetOrdinals();
  const blueprint = createBlueprint();
  const feed = blueprintAddHopper(blueprint, 100);
  const feeder = blueprintAddApparatus(blueprint, 'feeder');
  const output = blueprintAddHopper(blueprint, 100);
  hopperReceiveInflow(feed, { hematite: 10 }, 15, 1);
  blueprintConnect(blueprint, feed.id, feed.outputPortId, feeder.id, feeder.inputPortId);
  blueprintConnect(blueprint, feeder.id, feeder.outputPortId, output.id, output.inputPortId);
  setApparatusParameter(blueprint, feeder.id, 'flowRateKgPerSecond', 2.5);
  setNodeEnabled(blueprint, feeder.id, true);

  simulationTick(blueprint, {}, 1);
  assertAlmostEqual(hopperStoredMassKg(feed), 7.5, 'remaining feed');
  assertAlmostEqual(hopperStoredMassKg(output), 2.5, 'metered output');

  setApparatusParameter(blueprint, feeder.id, 'flowRateKgPerSecond', 0);
  const before = hopperStoredMassKg(feed);
  simulationTick(blueprint, {}, 1);
  assertAlmostEqual(hopperStoredMassKg(feed), before, 'zero-setpoint feed unchanged');
  assert.equal(feeder.operatingState, 'idle');
});

test('explicit Splitter and Merger ports provide branching/fan-in without weakening graph conservation rules', () => {
  _resetOrdinals();
  const blueprint = createBlueprint();
  const source = blueprintAddHopper(blueprint, 100);
  const splitter = blueprintAddApparatus(blueprint, 'splitter');
  const branchA = blueprintAddHopper(blueprint, 100);
  const branchB = blueprintAddHopper(blueprint, 100);
  const merger = blueprintAddApparatus(blueprint, 'merger');
  const product = blueprintAddHopper(blueprint, 100);

  assert.ok(blueprintConnect(blueprint, source.id, source.outputPortId, splitter.id, splitter.inputPortId));
  assert.ok(blueprintConnect(blueprint, splitter.id, splitter.outputAPortId, branchA.id, branchA.inputPortId));
  assert.ok(blueprintConnect(blueprint, splitter.id, splitter.outputBPortId, branchB.id, branchB.inputPortId));
  assert.ok(blueprintConnect(blueprint, branchA.id, branchA.outputPortId, merger.id, merger.inputAPortId));
  assert.ok(blueprintConnect(blueprint, branchB.id, branchB.outputPortId, merger.id, merger.inputBPortId));
  assert.ok(blueprintConnect(blueprint, merger.id, merger.outputPortId, product.id, product.inputPortId));

  const extra = blueprintAddHopper(blueprint, 100);
  assert.equal(blueprintConnect(blueprint, branchA.id, branchA.outputPortId, extra.id, extra.inputPortId), null);
});
