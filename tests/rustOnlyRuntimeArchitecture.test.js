
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('production realtime runtime exposes only the Rust/WASM Worker backend', () => {
  const source = read('src/simulation/realtimeRuntime.js');
  assert.doesNotMatch(source, /main-thread-compiled/);
  assert.doesNotMatch(source, /worldSimulationTick/);
  assert.match(source, /requires a browser with Web Worker and WebAssembly support/);
});

test('browser authoring modules cannot advance physical simulation time', () => {
  const engine = read('src/simulation/simulationEngine.js');
  const world = read('src/simulation/worldSimulation.js');
  assert.doesNotMatch(engine, /export function simulationTick/);
  assert.doesNotMatch(engine, /export function simulationAdvance/);
  assert.doesNotMatch(world, /export function worldSimulationTick/);
  assert.doesNotMatch(world, /export function worldSimulationAdvance/);
});

test('debug tools cannot invoke the removed JavaScript physics engine', () => {
  const source = read('src/workspace/debug/debugDrawer.js');
  assert.doesNotMatch(source, /simulationTick|worldSimulationTick|performanceTelemetry/);
  assert.match(source, /advanceFixedSteps/);
});
