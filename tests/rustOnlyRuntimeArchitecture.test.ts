import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('production runtime is hosted only in the full Rust/WASM Worker', () => {
  const controller = read('src/runtime/runtimeController.ts');
  assert.match(controller, /new Worker\(new URL\('\.\/fullRuntimeWorker\.js'/);
  assert.match(controller, /Rust\/WASM Worker/);
  assert.doesNotMatch(controller, /main-thread-compiled|worldSimulationTick|simulationTick|simulationAdvance/);
});

test('browser runtime Worker delegates physical execution to WasmPackedWorldRuntime', () => {
  const worker = read('src/runtime/fullRuntimeWorker.ts');
  assert.match(worker, /WasmPackedWorldRuntime/);
  assert.match(worker, /runtime_protocol_version as runtimeProtocolVersion/);
  assert.doesNotMatch(worker, /worldSimulationTick|export function simulationTick|export function simulationAdvance/);
});

test('debug controls request Worker steps instead of invoking browser physics', () => {
  const source = read('src/ui/debugPanel.ts');
  assert.match(source, /runtime\.advanceFixedSteps/);
  assert.match(source, /Rust\/WASM Worker/);
  assert.doesNotMatch(source, /simulationTick|worldSimulationTick|performanceTelemetry/);
});
