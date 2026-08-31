/**
 * Tests: deterministic world generation.
 * Verifies that createWorld(seed) is deterministic across calls, that different
 * seeds produce different worlds, and that version metadata is present.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/generator/generateWorld.js';
import { SCHEMA_VERSION, GENERATOR_VERSION } from '../src/core/world/versions.js';

test('same seed produces identical worlds', () => {
  const a = createWorld('test-determinism-seed');
  const b = createWorld('test-determinism-seed');
  assert.deepStrictEqual(a, b, 'Worlds from same seed should be deeply equal');
});

test('different seeds produce different worlds', () => {
  const a = createWorld('seed-alpha');
  const b = createWorld('seed-beta');
  // planetId should differ (different numeric hash)
  assert.notStrictEqual(a.planetId, b.planetId, 'Different seeds should produce different planets');
});

test('generated world includes schemaVersion and generatorVersion', () => {
  const world = createWorld('version-test');
  assert.strictEqual(world.schemaVersion, SCHEMA_VERSION, 'schemaVersion should match constant');
  assert.strictEqual(world.generatorVersion, GENERATOR_VERSION, 'generatorVersion should match constant');
  assert.ok(typeof world.schemaVersion === 'number', 'schemaVersion should be a number');
  assert.ok(typeof world.generatorVersion === 'number', 'generatorVersion should be a number');
});

test('generation does not depend on DOM state', () => {
  // Verify no accidental global DOM references — global.document must not exist
  // in the Node test environment and generation should still work.
  assert.strictEqual(typeof globalThis.document, 'undefined', 'No DOM should be present in Node test environment');
  // If generation throws due to missing DOM, the test will fail
  const world = createWorld('no-dom-test');
  assert.ok(world.planetId, 'World should be generated without DOM');
});

test('world seed is stored on the world object', () => {
  const seed = 'stored-seed-test';
  const world = createWorld(seed);
  assert.strictEqual(world.seed, seed);
});
