import test from 'node:test';
import assert from 'node:assert/strict';

import {
  _resetOrdinals,
  blueprintAddApparatus,
  blueprintAddFeatureSource,
  blueprintConnect,
  createBlueprint,
} from '../src/simulation/simulationEngine.js';
import {
  createWorldSimulation,
  pauseWorldSimulation,
  registerSimulationSession,
  resumeWorldSimulation,
  worldSimulationAdvance,
} from '../src/simulation/worldSimulation.js';
import {
  advanceWorldBy,
  advanceWorldBySync,
} from '../src/simulation/advancement/advancementScheduler.js';
import { hopperStoredMassKg } from '../src/simulation/hopperNode.js';
import { totalMaterialStreamMassFlowKgPerSecond } from '../src/simulation/materialStream.js';
import {
  CANONICAL_IRON_BENCHMARK_OCCURRENCE,
  createRoastingBenchmarkFixture,
} from '../src/debug/fixtures/roastingBenchmark.js';
import { workspaceShellMarkup } from '../src/workspace/shell/workspaceUI.js';

function assertClose(actual, expected, tolerance = 1e-9, message = '') {
  const allowed = tolerance * Math.max(1, Math.abs(actual), Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= allowed, message || `${actual} differs from ${expected}`);
}

function registeredRoastingFixture() {
  _resetOrdinals();
  const fixture = createRoastingBenchmarkFixture({ count: 1 });
  createWorldSimulation(fixture.world);
  registerSimulationSession(fixture.world, 'roasting-site', fixture.blueprint);
  return fixture;
}

function roastingSnapshot(fixture) {
  const manifest = fixture.manifests[0];
  return {
    worldElapsed: fixture.world.simulation.elapsedSeconds,
    stats: JSON.parse(JSON.stringify(fixture.blueprint.simulationStats)),
    feedHopper: JSON.parse(JSON.stringify(manifest.feedHopper)),
    furnace: JSON.parse(JSON.stringify(manifest.furnace)),
    productHopper: JSON.parse(JSON.stringify(manifest.productHopper)),
    vent: JSON.parse(JSON.stringify(manifest.vent)),
    streams: JSON.parse(JSON.stringify(fixture.blueprint.streams)),
  };
}

function createExtractorStorageFixture({ capacityKg = 100, rateKgPerSecond = 5 } = {}) {
  _resetOrdinals();
  const blueprint = createBlueprint();
  const occurrence = {
    ...CANONICAL_IRON_BENCHMARK_OCCURRENCE,
    composition: { ...CANONICAL_IRON_BENCHMARK_OCCURRENCE.composition },
  };
  const world = { resourceOccurrences: { [occurrence.id]: occurrence } };
  const feature = blueprintAddFeatureSource(blueprint, {
    id: 'linear-feature',
    featureId: occurrence.sourceId,
    displayName: occurrence.name,
    resourceOccurrenceIds: [occurrence.id],
  });
  const extractor = blueprintAddApparatus(blueprint, 'extractor', {
    id: 'linear-extractor',
    enabled: true,
    prototypeRateKgPerSecond: rateKgPerSecond,
  });
  const hopper = blueprintAddApparatus(blueprint, 'hopper', {
    id: 'linear-hopper',
    capacityKg,
  });
  assert.ok(blueprintConnect(
    blueprint,
    feature.id,
    feature.resourceAccessPortId,
    extractor.id,
    extractor.sourceInputPortId,
    { occurrenceId: occurrence.id },
  ));
  assert.ok(blueprintConnect(blueprint, extractor.id, extractor.outputPortId, hopper.id, hopper.inputPortId));
  createWorldSimulation(world);
  registerSimulationSession(world, 'linear-site', blueprint);
  return { world, blueprint, feature, extractor, hopper };
}

function solidFractions(hopper) {
  return { ...(hopper.materialBody?.solidState?.fractions ?? {}) };
}

function compareLinearPhysicalState(actual, expected) {
  assertClose(hopperStoredMassKg(actual.hopper), hopperStoredMassKg(expected.hopper), 1e-10);
  const actualFractions = solidFractions(actual.hopper);
  const expectedFractions = solidFractions(expected.hopper);
  assert.deepEqual(Object.keys(actualFractions).sort(), Object.keys(expectedFractions).sort());
  for (const key of Object.keys(expectedFractions)) {
    assertClose(actualFractions[key], expectedFractions[key], 1e-10, `fraction ${key}`);
  }
  assertClose(actual.blueprint.simulationStats.elapsedSeconds, expected.blueprint.simulationStats.elapsedSeconds, 1e-12);
  assertClose(actual.blueprint.simulationStats.extractedKg, expected.blueprint.simulationStats.extractedKg, 1e-10);
  assert.equal(actual.extractor.operatingState, expected.extractor.operatingState);
  const actualStream = Object.values(actual.blueprint.streams)[0];
  const expectedStream = Object.values(expected.blueprint.streams)[0];
  assertClose(
    totalMaterialStreamMassFlowKgPerSecond(actualStream),
    totalMaterialStreamMassFlowKgPerSecond(expectedStream),
    1e-10,
  );
}

test('explicit advancement preserves exact 0.1 s furnace results through fallback', async () => {
  const baseline = registeredRoastingFixture();
  resumeWorldSimulation(baseline.world);
  assert.equal(worldSimulationAdvance(baseline.world, 3), 30);
  pauseWorldSimulation(baseline.world);

  const advanced = registeredRoastingFixture();
  const result = await advanceWorldBy(advanced.world, 3, { yieldEveryOperations: 1000 });

  assert.equal(result.detailedFixedSteps, 30);
  assert.equal(result.linearEquivalentSteps, 0);
  assert.equal(result.quiescentEquivalentSteps, 0);
  assert.equal(advanced.world.simulation.running, false);
  assert.deepEqual(roastingSnapshot(advanced), roastingSnapshot(baseline));
});

test('linear extractor operating segment compresses repeated fixed steps without changing material result', async () => {
  const baseline = createExtractorStorageFixture();
  resumeWorldSimulation(baseline.world);
  worldSimulationAdvance(baseline.world, 10);
  pauseWorldSimulation(baseline.world);

  const advanced = createExtractorStorageFixture();
  const result = await advanceWorldBy(advanced.world, 10, { yieldEveryOperations: 1000 });

  compareLinearPhysicalState(advanced, baseline);
  assert.equal(result.fixedEquivalentSteps, 100);
  assert.ok(result.detailedFixedSteps <= 2);
  assert.ok(result.linearEquivalentSteps >= 98);
  assert.ok(result.schedulerOperations < 10);
  assert.ok(result.scheduleCompressionRatio > 10);
  assert.equal(advanced.world.simulation.running, false);
});

test('Hopper-full event resolves in detail then quiescent segment fast-forwards remaining time', () => {
  const fixture = createExtractorStorageFixture({ capacityKg: 100, rateKgPerSecond: 5 });
  const result = advanceWorldBySync(fixture.world, 30);

  assertClose(hopperStoredMassKg(fixture.hopper), 100, 1e-10);
  assert.equal(fixture.extractor.operatingState, 'blocked');
  assertClose(totalMaterialStreamMassFlowKgPerSecond(Object.values(fixture.blueprint.streams)[0]), 0, 1e-12);
  assert.equal(result.fixedEquivalentSteps, 300);
  assert.ok(result.linearEquivalentSteps > 100);
  assert.ok(result.quiescentEquivalentSteps > 0);
  assert.ok(result.schedulerOperations < 10);
  assert.equal(result.operatingSegment.activeSegment?.kind, 'quiescent');
});

test('cached quiescent segment invalidates when factory capacity changes and simulation resumes', () => {
  const fixture = createExtractorStorageFixture({ capacityKg: 100, rateKgPerSecond: 5 });
  const first = advanceWorldBySync(fixture.world, 30);
  assert.equal(first.operatingSegment.activeSegment?.kind, 'quiescent');
  assertClose(hopperStoredMassKg(fixture.hopper), 100, 1e-10);

  fixture.hopper.capacityKg = 200;
  const second = advanceWorldBySync(fixture.world, 10);

  assertClose(hopperStoredMassKg(fixture.hopper), 150, 1e-10);
  assert.equal(fixture.extractor.operatingState, 'running');
  assert.ok(second.operatingSegment.invalidations >= 1);
  assert.ok(second.linearEquivalentSteps > 0);
});

test('explicit advancement rejects hidden fractional physics steps', () => {
  const fixture = createExtractorStorageFixture();
  assert.throws(
    () => advanceWorldBySync(fixture.world, 1.05),
    /multiple of the authoritative 0\.1 s step/,
  );
});

test('workspace shell exposes paused engineering advancement and batch telemetry', () => {
  const html = workspaceShellMarkup({
    title: 'Test',
    canvasId: 'canvas',
    svgId: 'svg',
    inspectorBodyId: 'inspector',
  });
  assert.match(html, /PAUSED ENGINEERING/);
  assert.match(html, /data-world-advance-seconds="60"/);
  assert.match(html, /data-world-advance-custom/);
  assert.match(html, /Simulation throughput/);
  assert.match(html, /Cached operating segment/);
});
