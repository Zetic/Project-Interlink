import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const rustSrcUrl = new URL('../rust/interlink-wasm/src/', import.meta.url);
const wasmDtsUrl = new URL('../src/wasm/interlink_wasm.d.ts', import.meta.url);
const workerUrl = new URL('../src/runtime/fullRuntimeWorker.ts', import.meta.url);

const removedStandaloneClasses = [
  'WasmPackedSolidState',
  'WasmPackedHopper',
  'WasmPackedComminutionMachine',
  'WasmPackedComminutionTables',
  'WasmPackedExtractor',
  'WasmPackedResourceOccurrence',
  'WasmPackedFeeder',
  'WasmPackedMerger',
  'WasmPackedSplitter',
  'WasmPackedThermalTable',
  'WasmPackedGoethiteReaction',
  'WasmPackedRoastingFurnace',
  'WasmPackedMagneticSeparator',
  'WasmPackedScreen',
  'WasmPackedSeparationTables',
  'WasmPackedGasBody',
  'WasmPackedGasStream',
  'WasmPackedThermalModel',
];

test('interlink-wasm source exposes only the world runtime bridge', () => {
  const files = readdirSync(rustSrcUrl).sort();
  assert.deepEqual(files, ['lib.rs', 'runtime_bridge.rs']);

  const lib = readFileSync(new URL('../rust/interlink-wasm/src/lib.rs', import.meta.url), 'utf8');
  assert.match(lib, /pub use runtime_bridge::WasmPackedWorldRuntime/);
  for (const stale of removedStandaloneClasses) assert.doesNotMatch(lib, new RegExp(stale));
});

test('generated browser API does not expose standalone apparatus/material WASM objects', () => {
  const declarations = readFileSync(wasmDtsUrl, 'utf8');
  assert.match(declarations, /export class WasmPackedWorldRuntime/);
  for (const stale of removedStandaloneClasses) assert.doesNotMatch(declarations, new RegExp(`export class ${stale}\\b`));
});

test('production TypeScript Worker imports only the world runtime bridge', () => {
  const worker = readFileSync(workerUrl, 'utf8');
  assert.match(worker, /WasmPackedWorldRuntime/);
  assert.match(worker, /runtime_protocol_version as runtimeProtocolVersion/);
  for (const stale of removedStandaloneClasses) assert.doesNotMatch(worker, new RegExp(stale));
});
