import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createWorld } from '../src/core/world/worldState.js';
import { acquireSampleFromOccurrence } from '../src/core/materials/sampleAcquisition.js';
import { CRUSHING_PROCESS_ID, MAGNETIC_SEPARATION_PROCESS_ID } from '../src/core/processes/processDefinitions.js';
import { runProcessAndCommit } from '../src/core/processes/processExecution.js';
import { createSolidMaterialBodyFromOccurrence } from '../src/core/materials/occurrenceMaterialization.js';
import {
  crushSolidMaterialState,
  hasCrushableSolidFractions,
  magneticRecoveryForFraction,
  splitMagneticSolidState,
} from '../src/core/processes/processPhysics.js';
import {
  addSolidMaterialState,
  createSolidMaterialState,
  solidMaterialStatesEqual,
  summarizeSolidMaterialByLiberationClass,
  summarizeSolidMaterialBySizeBin,
  summarizeSolidMaterialBySpecies,
  totalSolidQuantity,
  withdrawSolidMaterialState,
  SOLID_MATERIAL_TOLERANCE,
  validateSolidMaterialState,
} from '../src/core/materials/solidMaterialState.js';
import { getMaterialSpecies } from '../src/core/materials/materialSpecies.js';
import { particleSizeBinIdForMm } from '../src/core/materials/particleSizeBins.js';
import {
  createHopper,
  hopperReceiveInflow,
  hopperStoredMassKg,
  hopperWithdraw,
} from '../src/simulation/hopperNode.js';
import {
  createBlueprint,
  blueprintAddCrusher,
  blueprintAddHopper,
  blueprintAddMagSep,
  blueprintConnect,
  setNodeEnabled,
  simulationTick,
  _resetOrdinals,
} from '../src/simulation/simulationEngine.js';

const MASS_TOL = 1e-9;

function findOccurrence(resourceId) {
  for (let i = 0; i < 250; i += 1) {
    const world = createWorld(`solid-material-${resourceId}-${i}`);
    const occurrence = Object.values(world.resourceOccurrences).find(item =>
      item.resourceId === resourceId && item.composition && typeof item.composition === 'object'
    );
    if (occurrence) return { world, occurrence };
  }
  throw new Error(`Could not find occurrence for '${resourceId}' in test seed range`);
}

function assertAlmostEqual(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) <= MASS_TOL, `${label}: expected ${expected}, got ${actual}`);
}

test('solid material state merges identical fractions, preserves distinct size/liberation, and summarizes directly', () => {
  const state = createSolidMaterialState([
    { speciesId: 'hematite', sizeBinId: '5-15mm', liberationClassId: 'locked', quantity: 2 },
    { speciesId: 'hematite', sizeBinId: '5-15mm', liberationClassId: 'locked', quantity: 3 },
    { speciesId: 'hematite', sizeBinId: '15-25mm', liberationClassId: 'locked', quantity: 4 },
    { speciesId: 'hematite', sizeBinId: '5-15mm', liberationClassId: 'liberated', quantity: 5 },
    { speciesId: 'quartz', sizeBinId: '5-15mm', liberationClassId: 'liberated', quantity: SOLID_MATERIAL_TOLERANCE / 2 },
  ]);
  assert.deepEqual(state.fractions, {
    'hematite|5-15mm|locked': 5,
    'hematite|15-25mm|locked': 4,
    'hematite|5-15mm|liberated': 5,
  });
  assert.equal(totalSolidQuantity(state), 14);
  assert.deepEqual(summarizeSolidMaterialBySpecies(state), { hematite: 14 });
  assert.deepEqual(summarizeSolidMaterialBySizeBin(state), { '5-15mm': 10, '15-25mm': 4 });
  assert.deepEqual(summarizeSolidMaterialByLiberationClass(state), { locked: 9, liberated: 5 });
});

test('hopper mixing preserves size/liberation populations and proportional withdrawal remains well mixed', () => {
  const hopper = createHopper({ id: 'hopper-direct', capacityKg: 100 });
  hopperReceiveInflow(hopper, createSolidMaterialState([
    { speciesId: 'hematite', sizeBinId: '60-120mm', liberationClassId: 'locked', quantity: 4 },
  ]), 1);
  hopperReceiveInflow(hopper, createSolidMaterialState([
    { speciesId: 'hematite', sizeBinId: '5-15mm', liberationClassId: 'liberated', quantity: 6 },
  ]), 1);

  const withdrawal = hopperWithdraw(hopper, 5, 1);
  assert.deepEqual(withdrawal.actualSolidState.fractions, {
    'hematite|60-120mm|locked': 2,
    'hematite|5-15mm|liberated': 3,
  });
  assertAlmostEqual(hopperStoredMassKg(hopper), 5, 'remaining hopper mass');
});

test('direct solid-state receive and withdraw conserve mass across larger sparse states', () => {
  const sizeBins = ['lt-1mm', '1-5mm', '5-15mm', '15-25mm', '25-60mm', '60-120mm', '120mm-plus'];
  const liberationClasses = ['locked', 'partial', 'mostly-liberated', 'liberated'];
  const concreteSpecies = ['hematite', 'magnetite', 'goethite', 'quartz', 'chalcopyrite', 'gibbsite'];
  const fractions = [];
  for (let i = 0; i < 240; i += 1) {
    fractions.push({
      speciesId: concreteSpecies[i % concreteSpecies.length],
      sizeBinId: sizeBins[i % sizeBins.length],
      liberationClassId: liberationClasses[i % liberationClasses.length],
      quantity: (i + 1) / 10,
    });
  }
  const source = createSolidMaterialState(fractions);
  const scaled = createSolidMaterialState();
  addSolidMaterialState(scaled, source, 0.5);
  const initialTotal = totalSolidQuantity(source);
  assertAlmostEqual(totalSolidQuantity(scaled), initialTotal * 0.5, 'scaled sparse total');
  const withdrawn = withdrawSolidMaterialState(source, initialTotal * 0.37);
  assertAlmostEqual(totalSolidQuantity(withdrawn) + totalSolidQuantity(source), initialTotal, 'withdrawal conservation');
});

test('occurrence materialization preserves iron composition and deterministic coarse low-liberation distribution', () => {
  const { occurrence } = findOccurrence('iron-ore');
  const body = createSolidMaterialBodyFromOccurrence(occurrence, 10);
  const compositionTotal = Object.values(occurrence.composition).reduce((sum, value) => sum + value, 0);
  const speciesSummary = summarizeSolidMaterialBySpecies(body.solidState);
  const sizeSummary = summarizeSolidMaterialBySizeBin(body.solidState);
  const liberationSummary = summarizeSolidMaterialByLiberationClass(body.solidState);
  assertAlmostEqual(sizeSummary['60-120mm'], 6.5, '60-120mm mass');
  assertAlmostEqual(sizeSummary['120mm-plus'], 3.5, '120mm-plus mass');
  assertAlmostEqual(liberationSummary.locked, 8.025, 'locked mass');
  assertAlmostEqual(liberationSummary.partial, 1.975, 'partial mass');
  for (const [speciesId, amount] of Object.entries(occurrence.composition)) {
    assertAlmostEqual(speciesSummary[speciesId], 10 * (amount / compositionTotal), `${speciesId} extracted mass`);
  }
});

test('generated non-ore solid occurrences materialize as concrete registered species', () => {
  const { world, occurrence } = findOccurrence('basalt');
  const sample = acquireSampleFromOccurrence(world, occurrence.id, 7.5);
  const speciesSummary = summarizeSolidMaterialBySpecies(sample.materialBody.solidState);
  const compositionTotal = Object.values(occurrence.composition).reduce((sum, value) => sum + value, 0);
  assert.ok(Object.keys(speciesSummary).length >= 2);
  for (const [speciesId, amount] of Object.entries(occurrence.composition)) {
    assert.ok(getMaterialSpecies(speciesId), `Expected concrete species '${speciesId}'`);
    assertAlmostEqual(speciesSummary[speciesId], 7.5 * (amount / compositionTotal), `${speciesId} basalt mass`);
  }
});

test('solid occurrence materialization rejects missing composition instead of inventing a coarse pseudo constituent', () => {
  assert.throws(
    () => createSolidMaterialBodyFromOccurrence({ id: 'basalt-legacy', resourceId: 'basalt', composition: null }, 5),
    /requires a concrete species composition/
  );
});

test('non-solid occurrences fail clearly instead of receiving fake particulate state', () => {
  assert.throws(
    () => createSolidMaterialBodyFromOccurrence({ id: 'fresh-water-occ', resourceId: 'fresh-water', composition: { H2O: 100 } }, 5),
    /unsupported physical form 'liquid'/
  );
});

test('generated copper species have property coverage and magnetic separation conserves them', () => {
  const { world, occurrence } = findOccurrence('copper-ore');
  const sample = acquireSampleFromOccurrence(world, occurrence.id, 10);
  for (const speciesId of Object.keys(occurrence.composition)) {
    const species = getMaterialSpecies(speciesId);
    assert.ok(species);
    assert.equal(typeof species.physicalProperties?.magneticResponse?.normalizedSeparationCoefficient, 'number');
  }

  const crushResult = runProcessAndCommit(world, CRUSHING_PROCESS_ID, { feed: sample.id }, { targetParticleSizeMm: 10 });
  const separation = runProcessAndCommit(
    world,
    MAGNETIC_SEPARATION_PROCESS_ID,
    { feed: crushResult.outputBatches[0].batchId },
    { fieldStrength: 0.6 }
  );
  const concentrate = separation.outputBatches.find(output => output.outputId === 'concentrate')?.batch;
  const tailings = separation.outputBatches.find(output => output.outputId === 'tailings')?.batch;
  assert.ok(concentrate && tailings);
  for (const [speciesId, inputMass] of Object.entries(sample.componentsKg)) {
    assertAlmostEqual(
      (concentrate.componentsKg[speciesId] ?? 0) + (tailings.componentsKg[speciesId] ?? 0),
      inputMass,
      `${speciesId} magnetic conservation`
    );
  }
});

test('crusher produces a smaller-size distribution, improves liberation deterministically, and conserves species mass', () => {
  const feed = createSolidMaterialState([
    { speciesId: 'hematite', sizeBinId: '120mm-plus', liberationClassId: 'locked', quantity: 10 },
  ]);
  const product = crushSolidMaterialState(feed, 12);
  const sizeSummary = summarizeSolidMaterialBySizeBin(product);
  const liberationSummary = summarizeSolidMaterialByLiberationClass(product);
  assertAlmostEqual(sizeSummary['5-15mm'], 6.5, '5-15mm crushed mass');
  assertAlmostEqual(sizeSummary['1-5mm'], 2.5, '1-5mm crushed mass');
  assertAlmostEqual(sizeSummary['lt-1mm'], 1, 'lt-1mm crushed mass');
  assertAlmostEqual(liberationSummary.locked, 2, 'locked crushed mass');
  assertAlmostEqual(liberationSummary.partial, 5.2, 'partial crushed mass');
  assertAlmostEqual(liberationSummary['mostly-liberated'], 2.8, 'mostly liberated crushed mass');
  assertAlmostEqual(summarizeSolidMaterialBySpecies(product).hematite, 10, 'hematite crushed mass');
});

test('particle-size bin boundary mapping treats exact cut points as belonging to the lower target class', () => {
  assert.equal(particleSizeBinIdForMm(1), 'lt-1mm');
  assert.equal(particleSizeBinIdForMm(5), '1-5mm');
  assert.equal(particleSizeBinIdForMm(15), '5-15mm');
  assert.equal(particleSizeBinIdForMm(25), '15-25mm');
  assert.equal(particleSizeBinIdForMm(60), '25-60mm');
  assert.equal(particleSizeBinIdForMm(120), '60-120mm');
});

test('crusher preserves already-fine fractions and crushes only coarser fractions', () => {
  const mixedFeed = createSolidMaterialState([
    { speciesId: 'hematite', sizeBinId: '60-120mm', liberationClassId: 'locked', quantity: 6 },
    { speciesId: 'quartz', sizeBinId: '5-15mm', liberationClassId: 'liberated', quantity: 2 },
  ]);
  const product = crushSolidMaterialState(mixedFeed, 15);
  assert.equal(hasCrushableSolidFractions(mixedFeed, 15), true);
  assertAlmostEqual(product.fractions['quartz|5-15mm|liberated'], 2, 'already-fine fraction preserved');
  assertAlmostEqual(summarizeSolidMaterialBySpecies(product).hematite, 6, 'coarse species conserved');

  const alreadyFineFeed = createSolidMaterialState([
    { speciesId: 'hematite', sizeBinId: '5-15mm', liberationClassId: 'partial', quantity: 3 },
    { speciesId: 'quartz', sizeBinId: '1-5mm', liberationClassId: 'liberated', quantity: 1 },
  ]);
  assert.equal(hasCrushableSolidFractions(alreadyFineFeed, 15), false);
  assert.ok(solidMaterialStatesEqual(crushSolidMaterialState(alreadyFineFeed, 15), alreadyFineFeed));
});

test('magnetic recovery varies by species, liberation, particle size, and field strength while conserving every fraction', () => {
  assert.ok(magneticRecoveryForFraction('magnetite', '15-25mm', 'liberated', 0.8) > magneticRecoveryForFraction('hematite', '15-25mm', 'liberated', 0.8));
  assert.ok(magneticRecoveryForFraction('hematite', '15-25mm', 'liberated', 0.8) > magneticRecoveryForFraction('hematite', '15-25mm', 'locked', 0.8));
  assert.ok(magneticRecoveryForFraction('hematite', '15-25mm', 'liberated', 0.8) > magneticRecoveryForFraction('hematite', '60-120mm', 'liberated', 0.8));
  assert.ok(magneticRecoveryForFraction('hematite', '15-25mm', 'liberated', 0.8) > magneticRecoveryForFraction('hematite', '15-25mm', 'liberated', 0.2));

  const feed = createSolidMaterialState([
    { speciesId: 'magnetite', sizeBinId: '15-25mm', liberationClassId: 'liberated', quantity: 3 },
    { speciesId: 'hematite', sizeBinId: '5-15mm', liberationClassId: 'partial', quantity: 2 },
    { speciesId: 'quartz', sizeBinId: '5-15mm', liberationClassId: 'locked', quantity: 1 },
  ]);
  const { concentrate, tailings } = splitMagneticSolidState(feed, 0.6);
  for (const [key, quantity] of Object.entries(feed.fractions)) {
    assertAlmostEqual((concentrate.fractions[key] ?? 0) + (tailings.fractions[key] ?? 0), quantity, `${key} conserved`);
  }
});

test('serialized solid fraction keys reject malformed persisted state', () => {
  assert.throws(() => validateSolidMaterialState({ fractions: { 'hematite|5-15mm': 1 } }), /must have exactly 3 segments/);
  assert.throws(() => validateSolidMaterialState({ fractions: { 'hematite||locked': 1 } }), /must not contain empty segments/);
  assert.throws(() => validateSolidMaterialState({ fractions: { 'hematite|5-15mm|locked|garbage': 1 } }), /must have exactly 3 segments/);
});

test('continuous fraction-aware crusher backpressure preserves mass and stores transformed fractions', () => {
  _resetOrdinals();
  const blueprint = createBlueprint();
  const world = { resourceOccurrences: {} };
  const feed = blueprintAddHopper(blueprint, 100);
  const crusher = blueprintAddCrusher(blueprint, { throughputKgPerSecond: 4, targetParticleSizeMm: 15 });
  const output = blueprintAddHopper(blueprint, 10);
  hopperReceiveInflow(feed, createSolidMaterialState([
    { speciesId: 'hematite', sizeBinId: '120mm-plus', liberationClassId: 'locked', quantity: 6 },
    { speciesId: 'quartz', sizeBinId: '60-120mm', liberationClassId: 'locked', quantity: 4 },
  ]), 1);
  hopperReceiveInflow(output, createSolidMaterialState([
    { speciesId: 'quartz', sizeBinId: '5-15mm', liberationClassId: 'partial', quantity: 9.95 },
  ]), 1);
  blueprintConnect(blueprint, feed.id, feed.outputPortId, crusher.id, crusher.inputPortId);
  blueprintConnect(blueprint, crusher.id, crusher.outputPortId, output.id, output.inputPortId);
  setNodeEnabled(blueprint, crusher.id, true);

  const beforeFeed = hopperStoredMassKg(feed);
  const beforeOutput = hopperStoredMassKg(output);
  simulationTick(blueprint, world, 0.1);
  assertAlmostEqual(beforeFeed - hopperStoredMassKg(feed), hopperStoredMassKg(output) - beforeOutput, 'crusher backpressure conservation');
  assert.ok(Object.keys(output.materialBody.solidState.fractions).some(key => key.startsWith('hematite|5-15mm|')));
});

test('continuous chained crushers with progressively finer targets run sequentially and conserve mass', () => {
  _resetOrdinals();
  const blueprint = createBlueprint();
  const world = { resourceOccurrences: {} };
  const feed = blueprintAddHopper(blueprint, 100);
  const crusherA = blueprintAddCrusher(blueprint, { throughputKgPerSecond: 4, targetParticleSizeMm: 25 });
  const middle = blueprintAddHopper(blueprint, 100);
  const crusherB = blueprintAddCrusher(blueprint, { throughputKgPerSecond: 2, targetParticleSizeMm: 5 });
  const output = blueprintAddHopper(blueprint, 100);
  const initialTotal = 12;
  hopperReceiveInflow(feed, createSolidMaterialState([
    { speciesId: 'hematite', sizeBinId: '120mm-plus', liberationClassId: 'locked', quantity: initialTotal },
  ]), 1);
  blueprintConnect(blueprint, feed.id, feed.outputPortId, crusherA.id, crusherA.inputPortId);
  blueprintConnect(blueprint, crusherA.id, crusherA.outputPortId, middle.id, middle.inputPortId);
  blueprintConnect(blueprint, middle.id, middle.outputPortId, crusherB.id, crusherB.inputPortId);
  blueprintConnect(blueprint, crusherB.id, crusherB.outputPortId, output.id, output.inputPortId);
  setNodeEnabled(blueprint, crusherA.id, true);
  setNodeEnabled(blueprint, crusherB.id, true);
  for (let i = 0; i < 5; i += 1) simulationTick(blueprint, world, 0.1);
  assert.equal(crusherB.operatingState, 'running');
  assert.ok(hopperStoredMassKg(output) > 0);
  assertAlmostEqual(hopperStoredMassKg(feed) + hopperStoredMassKg(middle) + hopperStoredMassKg(output), initialTotal, 'two-stage crusher chain conservation');
});

test('continuous crusher passes feed already at the configured target instead of acting as an implicit size sensor', () => {
  _resetOrdinals();
  const blueprint = createBlueprint();
  const world = { resourceOccurrences: {} };
  const feed = blueprintAddHopper(blueprint, 100);
  const crusher = blueprintAddCrusher(blueprint, { throughputKgPerSecond: 4, targetParticleSizeMm: 15 });
  const output = blueprintAddHopper(blueprint, 100);
  hopperReceiveInflow(feed, createSolidMaterialState([
    { speciesId: 'hematite', sizeBinId: '5-15mm', liberationClassId: 'partial', quantity: 3 },
    { speciesId: 'quartz', sizeBinId: '1-5mm', liberationClassId: 'liberated', quantity: 1 },
  ]), 1);
  blueprintConnect(blueprint, feed.id, feed.outputPortId, crusher.id, crusher.inputPortId);
  blueprintConnect(blueprint, crusher.id, crusher.outputPortId, output.id, output.inputPortId);
  setNodeEnabled(blueprint, crusher.id, true);
  const feedBefore = hopperStoredMassKg(feed);
  simulationTick(blueprint, world, 0.1);
  const feedDecrease = feedBefore - hopperStoredMassKg(feed);
  assert.equal(crusher.operatingState, 'running');
  assertAlmostEqual(feedDecrease, 0.4, 'already-sized feed moves at configured throughput');
  assertAlmostEqual(hopperStoredMassKg(output), feedDecrease, 'pass-through feed conservation');
});

test('two same-target crushers continue material flow without built-in size-control logic', () => {
  _resetOrdinals();
  const blueprint = createBlueprint();
  const world = { resourceOccurrences: {} };
  const feed = blueprintAddHopper(blueprint, 100);
  const crusherA = blueprintAddCrusher(blueprint, { throughputKgPerSecond: 4, targetParticleSizeMm: 15 });
  const middle = blueprintAddHopper(blueprint, 100);
  const crusherB = blueprintAddCrusher(blueprint, { throughputKgPerSecond: 2, targetParticleSizeMm: 15 });
  const output = blueprintAddHopper(blueprint, 100);
  const initialTotal = 12;
  hopperReceiveInflow(feed, createSolidMaterialState([
    { speciesId: 'hematite', sizeBinId: '120mm-plus', liberationClassId: 'locked', quantity: initialTotal },
  ]), 1);
  blueprintConnect(blueprint, feed.id, feed.outputPortId, crusherA.id, crusherA.inputPortId);
  blueprintConnect(blueprint, crusherA.id, crusherA.outputPortId, middle.id, middle.inputPortId);
  blueprintConnect(blueprint, middle.id, middle.outputPortId, crusherB.id, crusherB.inputPortId);
  blueprintConnect(blueprint, crusherB.id, crusherB.outputPortId, output.id, output.inputPortId);
  setNodeEnabled(blueprint, crusherA.id, true);
  setNodeEnabled(blueprint, crusherB.id, true);
  for (let i = 0; i < 5; i += 1) simulationTick(blueprint, world, 0.1);
  assert.equal(crusherB.operatingState, 'running');
  assert.equal(crusherB.lastError, null);
  assert.ok(hopperStoredMassKg(output) > 0);
  assertAlmostEqual(hopperStoredMassKg(feed) + hopperStoredMassKg(middle) + hopperStoredMassKg(output), initialTotal, 'same-target crusher chain conservation');
});

test('continuous fraction-aware magnetic separator backpressure remains atomic', () => {
  _resetOrdinals();
  const blueprint = createBlueprint();
  const world = { resourceOccurrences: {} };
  const feed = blueprintAddHopper(blueprint, 100);
  const separator = blueprintAddMagSep(blueprint, { fieldStrength: 0.6, throughputKgPerSecond: 4 });
  const concentrate = blueprintAddHopper(blueprint, 1);
  const tailings = blueprintAddHopper(blueprint, 100);
  hopperReceiveInflow(feed, createSolidMaterialState([
    { speciesId: 'hematite', sizeBinId: '15-25mm', liberationClassId: 'partial', quantity: 2 },
    { speciesId: 'magnetite', sizeBinId: '5-15mm', liberationClassId: 'liberated', quantity: 2 },
  ]), 1);
  hopperReceiveInflow(concentrate, createSolidMaterialState([
    { speciesId: 'hematite', sizeBinId: '5-15mm', liberationClassId: 'liberated', quantity: 1 },
  ]), 1);
  blueprintConnect(blueprint, feed.id, feed.outputPortId, separator.id, separator.inputPortId);
  blueprintConnect(blueprint, separator.id, separator.concentratePortId, concentrate.id, concentrate.inputPortId);
  blueprintConnect(blueprint, separator.id, separator.tailingsPortId, tailings.id, tailings.inputPortId);
  setNodeEnabled(blueprint, separator.id, true);

  const feedBefore = createSolidMaterialState(Object.entries(feed.materialBody.solidState.fractions).map(([key, quantity]) => {
    const [speciesId, sizeBinId, liberationClassId] = key.split('|');
    return { speciesId, sizeBinId, liberationClassId, quantity };
  }));
  const concentrateBefore = createSolidMaterialState(Object.entries(concentrate.materialBody.solidState.fractions).map(([key, quantity]) => {
    const [speciesId, sizeBinId, liberationClassId] = key.split('|');
    return { speciesId, sizeBinId, liberationClassId, quantity };
  }));
  simulationTick(blueprint, world, 0.1);
  assert.ok(solidMaterialStatesEqual(feed.materialBody.solidState, feedBefore));
  assert.ok(solidMaterialStatesEqual(concentrate.materialBody.solidState, concentrateBefore));
  assert.ok(solidMaterialStatesEqual(tailings.materialBody.solidState, createSolidMaterialState()));
});
