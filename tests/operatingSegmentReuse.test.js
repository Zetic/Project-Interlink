import test from 'node:test';
import assert from 'node:assert/strict';

import {
  blueprintAddApparatus,
  blueprintAddFeatureSource,
  blueprintConnect,
  createBlueprint,
} from '../src/simulation/simulationEngine.js';
import { createWorldSimulation, registerSimulationSession } from '../src/simulation/worldSimulation.js';
import { advanceWorldBySync } from '../src/simulation/advancement/advancementScheduler.js';
import { hopperStoredMassKg } from '../src/simulation/hopperNode.js';
import { CANONICAL_IRON_BENCHMARK_OCCURRENCE } from '../src/debug/fixtures/roastingBenchmark.js';

function createLinearFactory() {
  const blueprint = createBlueprint();
  const occurrence = {
    ...CANONICAL_IRON_BENCHMARK_OCCURRENCE,
    composition: { ...CANONICAL_IRON_BENCHMARK_OCCURRENCE.composition },
  };
  const world = { resourceOccurrences: { [occurrence.id]: occurrence } };
  const feature = blueprintAddFeatureSource(blueprint, {
    id: 'reuse-feature',
    featureId: occurrence.sourceId,
    resourceOccurrenceIds: [occurrence.id],
  });
  const extractor = blueprintAddApparatus(blueprint, 'extractor', {
    id: 'reuse-extractor',
    enabled: true,
    prototypeRateKgPerSecond: 5,
  });
  const hopper = blueprintAddApparatus(blueprint, 'hopper', {
    id: 'reuse-hopper',
    capacityKg: 1000,
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
  registerSimulationSession(world, 'reuse-site', blueprint);
  return { world, blueprint, extractor, hopper };
}

function assertClose(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(actual), Math.abs(expected)), `${actual} differs from ${expected}`);
}

test('a learned active operating segment is reused immediately on the next player wait until configuration changes', () => {
  const fixture = createLinearFactory();

  const first = advanceWorldBySync(fixture.world, 5);
  assert.equal(first.detailedFixedSteps, 1, 'first wait should establish the observed running regime with one exact step');
  assert.equal(first.linearBatchOperations, 1);
  assert.equal(first.operatingSegment.activeSegment?.kind, 'linear-extractor-storage');
  assertClose(hopperStoredMassKg(fixture.hopper), 25);

  const second = advanceWorldBySync(fixture.world, 5);
  assert.equal(second.detailedFixedSteps, 0, 'unchanged factory should reuse its cached active regime without a warm-up step');
  assert.equal(second.linearBatchOperations, 1);
  assert.equal(second.schedulerOperations, 1);
  assert.ok(second.scheduleCompressionRatio >= 50);
  assertClose(hopperStoredMassKg(fixture.hopper), 50);

  fixture.extractor.prototypeRateKgPerSecond = 2;
  const third = advanceWorldBySync(fixture.world, 5);
  assert.equal(third.detailedFixedSteps, 1, 'changed apparatus configuration must wake the exact reference path before recaching');
  assert.ok(third.operatingSegment.invalidations >= 1);
  assert.equal(third.linearBatchOperations, 1);
  assertClose(hopperStoredMassKg(fixture.hopper), 60);
});
