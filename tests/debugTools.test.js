import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createRoastingBenchmarkFixture,
  TEST_FACTORY_FEEDER_RATE_KG_PER_SECOND,
} from '../src/debug/fixtures/roastingBenchmark.js';
import { workspaceShellMarkup } from '../src/workspace/shell/workspaceUI.js';

test('test factory builds the requested full processing topology with default settings', () => {
  const fixture = createRoastingBenchmarkFixture({ count: 1 });
  const line = fixture.manifests[0];
  assert.equal(line.nodeIds.length, 18);
  assert.equal(line.connectionIds.length, 18);
  assert.equal(line.feeder.flowRateKgPerSecond, TEST_FACTORY_FEEDER_RATE_KG_PER_SECOND);
  assert.equal(TEST_FACTORY_FEEDER_RATE_KG_PER_SECOND, 0.2);

  const expectedTypes = [
    'extractor', 'hopper', 'jawCrusher', 'hopper', 'coneCrusher', 'hopper',
    'screen', 'hopper', 'hopper', 'ballMill', 'hopper', 'splitter', 'hopper',
    'hopper', 'feeder', 'roastingFurnace', 'hopper', 'exhaustVent',
  ];
  assert.deepEqual(line.nodeIds.map(id => fixture.blueprint.nodes[id].nodeType), expectedTypes);

  for (const nodeId of line.nodeIds) {
    const node = fixture.blueprint.nodes[nodeId];
    if ('enabled' in node) assert.equal(node.enabled, true, `${node.nodeType} should start enabled`);
    if (node.nodeType === 'hopper') assert.equal(node.capacityKg, 1000);
  }

  assert.equal(line.extractor.prototypeRateKgPerSecond, 5);
  assert.equal(line.jawCrusher.throughputKgPerSecond, 8);
  assert.equal(line.coneCrusher.throughputKgPerSecond, 5);
  assert.equal(line.ballMill.throughputKgPerSecond, 2);
});

test('debug shell exposes Worker-owned deep profiling and fixed-step budget telemetry', () => {
  const markup = workspaceShellMarkup({ canvasId: 'c', svgId: 's', inspectorBodyId: 'i' });
  assert.match(markup, /Rust\/WASM Worker/);
  assert.match(markup, /Deep Rust apparatus profiling/);
  assert.match(markup, /100 ms fixed-step realtime budget/);
  assert.match(markup, /Iron Processing Line v2/);
  assert.match(markup, /\+0\.1 s/);
  assert.doesNotMatch(markup, /Run Headless Benchmark|Compiled JS/);
  const source = readFileSync(new URL('../src/workspace/debug/debugDrawer.js', import.meta.url), 'utf8');
  assert.match(source, /queryProfile/);
  assert.match(source, /setDeepProfiling/);
  assert.doesNotMatch(source, /simulationTick|worldSimulationTick|performanceTelemetry/);
});
