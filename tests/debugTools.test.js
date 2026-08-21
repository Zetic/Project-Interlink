import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  blueprintAddFeatureSource,
  createBlueprint,
  createBlueprintLayout,
  simulationTick,
} from '../src/simulation/simulationEngine.js';
import { hopperStoredMassKg } from '../src/simulation/hopperNode.js';
import {
  CANONICAL_IRON_BENCHMARK_OCCURRENCE,
  createRoastingBenchmarkFixture,
  placeRoastingTestFactories,
  removeRoastingTestFixture,
} from '../src/debug/fixtures/roastingBenchmark.js';
import {
  performanceTelemetrySnapshot,
  profileApparatusCall,
  resetPerformanceTelemetry,
  setDeepProfilingEnabled,
} from '../src/debug/performanceTelemetry.js';
import { workspaceShellMarkup } from '../src/workspace/shell/workspaceUI.js';

test('canonical roasting benchmark builds full Extractor → Furnace lines with explicit gas exhaust', () => {
  const fixture = createRoastingBenchmarkFixture({ count: 3 });
  const nodes = Object.values(fixture.blueprint.nodes);

  assert.equal(nodes.filter(node => node.nodeType === 'feature').length, 1);
  assert.equal(nodes.filter(node => node.nodeType === 'extractor').length, 3);
  assert.equal(nodes.filter(node => node.nodeType === 'hopper').length, 6);
  assert.equal(nodes.filter(node => node.nodeType === 'feeder').length, 3);
  assert.equal(nodes.filter(node => node.nodeType === 'roastingFurnace').length, 3);
  assert.equal(nodes.filter(node => node.nodeType === 'exhaustVent').length, 3);
  assert.equal(Object.keys(fixture.blueprint.connections).length, 18);

  for (const manifest of fixture.manifests) {
    assert.equal(manifest.extractor.enabled, true);
    assert.equal(manifest.feeder.enabled, true);
    assert.equal(manifest.furnace.enabled, true);
    assert.equal(manifest.feeder.flowRateKgPerSecond, 4);
  }
});

test('canonical benchmark uses ordinary simulation machinery and begins accumulating/feed processing', () => {
  const fixture = createRoastingBenchmarkFixture({ count: 1 });
  for (let index = 0; index < 10; index += 1) {
    simulationTick(fixture.blueprint, fixture.world, 0.1);
  }
  const line = fixture.manifests[0];
  assert.ok(fixture.blueprint.simulationStats.extractedKg > 0);
  assert.ok(hopperStoredMassKg(line.feedHopper) > 0);
  assert.notEqual(line.extractor.operatingState, 'blocked');
  assert.notEqual(line.furnace.operatingState, 'blocked');
});

test('visible roasting fixtures use a real Site Feature and can be removed as one debug fixture', () => {
  const blueprint = createBlueprint();
  const blueprintLayout = createBlueprintLayout();
  const occurrence = {
    ...CANONICAL_IRON_BENCHMARK_OCCURRENCE,
    id: 'world-iron-occurrence',
    sourceId: 'world-iron-feature',
    composition: { ...CANONICAL_IRON_BENCHMARK_OCCURRENCE.composition },
  };
  const world = { resourceOccurrences: { [occurrence.id]: occurrence } };
  const source = blueprintAddFeatureSource(blueprint, {
    id: 'world-iron-feature-node',
    featureId: occurrence.sourceId,
    resourceOccurrenceIds: [occurrence.id],
  });

  const fixture = placeRoastingTestFactories({
    blueprint,
    blueprintLayout,
    world,
    count: 2,
    preferredFeatureNodeId: source.id,
  });

  assert.equal(fixture.manifests.length, 2);
  assert.equal(Object.keys(blueprint.nodes).length, 13);
  assert.equal(Object.keys(blueprint.connections).length, 12);
  assert.equal(Object.keys(blueprintLayout.nodePositions).length, 12);

  removeRoastingTestFixture(blueprint, blueprintLayout, fixture);
  assert.deepEqual(Object.keys(blueprint.nodes), [source.id]);
  assert.equal(Object.keys(blueprint.connections).length, 0);
  assert.equal(Object.keys(blueprint.streams).length, 0);
  assert.equal(Object.keys(blueprintLayout.nodePositions).length, 0);
});

test('deep apparatus profiling is opt-in and exposes per-type timing without changing return values', () => {
  resetPerformanceTelemetry();
  setDeepProfilingEnabled(false);
  assert.equal(profileApparatusCall('testMachine', 'machine-1', value => value * 2, [3]), 6);
  assert.equal(performanceTelemetrySnapshot().totalProfileCalls, 0);

  setDeepProfilingEnabled(true);
  assert.equal(profileApparatusCall('testMachine', 'machine-1', value => value * 2, [4]), 8);
  const snapshot = performanceTelemetrySnapshot();
  assert.equal(snapshot.totalProfileCalls, 1);
  assert.equal(snapshot.byType[0].nodeType, 'testMachine');
  assert.equal(snapshot.byType[0].calls, 1);
  assert.ok(snapshot.byType[0].totalDurationMs >= 0);

  setDeepProfilingEnabled(false);
  resetPerformanceTelemetry();
});

test('workspace shell includes a third mutually-addressable DEBUG rail panel', () => {
  const markup = workspaceShellMarkup({
    title: 'Test',
    canvasId: 'canvas',
    svgId: 'svg',
    inspectorBodyId: 'inspector',
  });
  assert.match(markup, /id="ws-navigation-toggle"/);
  assert.match(markup, /id="ws-node-catalog-toggle"/);
  assert.match(markup, /id="ws-debug-toggle"/);
  assert.match(markup, /id="ws-debug-drawer"/);
  assert.match(markup, /Run Headless Benchmark/);
  assert.match(markup, /Place Factory/);
});
