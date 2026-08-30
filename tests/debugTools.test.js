
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRoastingBenchmarkFixture } from '../src/debug/fixtures/roastingBenchmark.js';
import { workspaceShellMarkup } from '../src/workspace/shell/workspaceUI.js';

test('test factory fixture still builds canonical graph topology for live Rust/WASM testing', () => {
  const fixture = createRoastingBenchmarkFixture({ count: 1 });
  assert.ok(Object.keys(fixture.blueprint.nodes).length > 0);
  assert.ok(Object.keys(fixture.blueprint.connections).length > 0);
});

test('debug shell exposes Rust Worker stepping and no legacy JS profiler or headless benchmark', () => {
  const markup = workspaceShellMarkup({ canvasId: 'c', svgId: 's', inspectorBodyId: 'i' });
  assert.match(markup, /Rust\/WASM Worker/);
  assert.match(markup, /\+0\.1 s/);
  assert.doesNotMatch(markup, /Deep apparatus profiling|Run Headless Benchmark|Compiled JS/);
  const source = readFileSync(new URL('../src/workspace/debug/debugDrawer.js', import.meta.url), 'utf8');
  assert.match(source, /advanceFixedSteps/);
  assert.doesNotMatch(source, /simulationTick|worldSimulationTick|performanceTelemetry/);
});
