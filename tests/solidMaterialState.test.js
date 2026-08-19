import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createWorld } from '../src/core/world/worldState.js';
import { acquireSampleFromOccurrence } from '../src/core/materials/sampleAcquisition.js';
import { CRUSHING_PROCESS_ID, MAGNETIC_SEPARATION_PROCESS_ID } from '../src/core/processes/processDefinitions.js';
import { runProcessAndCommit } from '../src/core/processes/processExecution.js';
import {
  createSolidMaterialBodyFromOccurrence,
} from '../src/core/materials/occurrenceMaterialization.js';
import {
  crushSolidMaterialState,
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
} from '../src/core/materials/solidMaterialState.js';
import { getMaterialSpecies } from '../src/core/materials/materialSpecies.js';
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
  for (let i = 0; i < 200; i += 1) {
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

test('hopper mixing preserves direct size/liberation populations and proportional withdrawal remains well mixed', () => {
  const hopper = createHopper({ id: 'hopper-direct', capacityKg: 100 });
  const coarseLocked = createSolidMaterialState([
    { speciesId: 'hematite', sizeBinId: '60-120mm', liberationClassId: 'locked', quantity: 4 },
  ]);
  const fineLiberated = createSolidMaterialState([
    { speciesId: 'hematite', sizeBinId: '5-15mm', liberationClassId: 'liberated', quantity: 6 },
  ]);

  hopperReceiveInflow(hopper, coarseLocked, 1);
  hopperReceiveInflow(hopper, fineLiberated, 1);
  assert.deepEqual(hopper.materialBody.solidState.fractions, {
    'hematite|60-120mm|locked': 4,
    'hematite|5-15mm|liberated': 6,
  });

  const withdrawal = hopperWithdraw(hopper, 5, 1);
  assert.deepEqual(withdrawal.actualSolidState.fractions, {
    'hematite|60-120mm|locked': 2,
    'hematite|5-15mm|liberated': 3,
  });
  assertAlmostEqual(hopperStoredMassKg(hopper), 5, 'remaining hopper mass');
  assert.deepEqual(hopper.materialBody.solidState.fractions, {
    'hematite|60-120mm|locked': 2,
    'hematite|5-15mm|liberated': 3,
  });
});

test('direct solid-state receive and withdraw conserve mass across larger sparse states', () => {
  const sizeBins = ['lt-1mm', '1-5mm', '5-15mm', '15-25mm', '25-60mm', '60-120mm', '120mm-plus'];
  const liberationClasses = ['locked', 'partial', 'mostly-liberated', 'liberated'];
  const fractions = [];

  for (let i = 0; i < 240; i += 1) {
    fractions.push({
      speciesId: `species-${i}`,
      sizeBinId: sizeBins[i % sizeBins.length],
      liberationClassId: liberationClasses[i % liberationClasses.length],
      quantity: (i + 1) / 10,
    });
  }

  const source = createSolidMaterialState(fractions);
  const scaled = createSolidMaterialState();
  addSolidMaterialState(scaled, source, 0.5);
  const initialTotal = totalSolidQuantity(source);
  assert.equal(Object.keys(source.fractions).length, 240);
  assertAlmostEqual(totalSolidQuantity(scaled), initialTotal * 0.5, 'scaled sparse total');

  const withdrawn = withdrawSolidMaterialState(source, initialTotal * 0.37);
  const remainingTotal = totalSolidQuantity(source);
  assertAlmostEqual(totalSolidQuantity(withdrawn) + remainingTotal, initialTotal, 'withdrawal conservation');
  assert.equal(Object.keys(withdrawn.fractions).length, 240);
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
  assert.equal(body.physicalForm, 'solid-particulate');

  for (const [speciesId, amount] of Object.entries(occurrence.composition)) {
    assertAlmostEqual(speciesSummary[speciesId], 10 * (amount / compositionTotal), `${speciesId} extracted mass`);
  }
});

test('non-solid occurrences fail clearly instead of receiving fake particulate state', () => {
  assert.throws(
    () => createSolidMaterialBodyFromOccurrence({ id: 'fresh-water-occ', resourceId: 'fresh-water', composition: { H2O: 100 } }, 5),
    /unsupported physical form 'liquid'/
  );
});

test('unresolved solid species can be extracted and stored, but magnetic separation rejects missing magnetic data clearly', () => {
  const { world, occurrence } = findOccurrence('copper-ore');
  const sample = acquireSampleFromOccurrence(world, occurrence.id, 10);

  assert.equal(getMaterialSpecies('chalcopyrite'), null);
  assert.ok(sample.materialBody.solidState.fractions['chalcopyrite|60-120mm|locked'] > 0);
  assert.doesNotThrow(() => createHopper({ id: 'copper-storage', capacityKg: 20, initialMaterialBody: sample.materialBody }));

  const crushResult = runProcessAndCommit(
    world,
    CRUSHING_PROCESS_ID,
    { feed: sample.id },
    { targetParticleSizeMm: 10 }
  );
  const crushedBatchId = crushResult.outputBatches[0].batchId;
  assert.throws(
    () => runProcessAndCommit(
      world,
      MAGNETIC_SEPARATION_PROCESS_ID,
      { feed: crushedBatchId },
      { fieldStrength: 0.6 }
    ),
    /Magnetic Separator does not support species 'chalcopyrite' without magnetic response data/
  );
});

test('crusher produces a real smaller-size distribution, improves liberation deterministically, and conserves species mass', () => {
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

test('magnetic recovery varies by species, liberation, particle size, and field strength while conserving every fraction', () => {
  assert.ok(
    magneticRecoveryForFraction('magnetite', '15-25mm', 'liberated', 0.8)
    > magneticRecoveryForFraction('hematite', '15-25mm', 'liberated', 0.8)
  );
  assert.ok(
    magneticRecoveryForFraction('hematite', '15-25mm', 'liberated', 0.8)
    > magneticRecoveryForFraction('hematite', '15-25mm', 'locked', 0.8)
  );
  assert.ok(
    magneticRecoveryForFraction('hematite', '15-25mm', 'liberated', 0.8)
    > magneticRecoveryForFraction('hematite', '60-120mm', 'liberated', 0.8)
  );
  assert.ok(
    magneticRecoveryForFraction('hematite', '15-25mm', 'liberated', 0.8)
    > magneticRecoveryForFraction('hematite', '15-25mm', 'liberated', 0.2)
  );

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
    { speciesId: 'gangue-mixture', sizeBinId: '5-15mm', liberationClassId: 'partial', quantity: 9.95 },
  ]), 1);
  blueprintConnect(blueprint, feed.id, feed.outputPortId, crusher.id, crusher.inputPortId);
  blueprintConnect(blueprint, crusher.id, crusher.outputPortId, output.id, output.inputPortId);
  setNodeEnabled(blueprint, crusher.id, true);

  const beforeFeed = hopperStoredMassKg(feed);
  const beforeOutput = hopperStoredMassKg(output);
  simulationTick(blueprint, world, 0.1);
  const feedDecrease = beforeFeed - hopperStoredMassKg(feed);
  const outputIncrease = hopperStoredMassKg(output) - beforeOutput;

  assertAlmostEqual(feedDecrease, outputIncrease, 'crusher backpressure conservation');
  assert.ok(Object.keys(output.materialBody.solidState.fractions).some(key => key.startsWith('hematite|5-15mm|')));
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
  const tailingsBefore = createSolidMaterialState();
  simulationTick(blueprint, world, 0.1);

  assert.ok(solidMaterialStatesEqual(feed.materialBody.solidState, feedBefore));
  assert.ok(solidMaterialStatesEqual(tailings.materialBody.solidState, tailingsBefore));
});
