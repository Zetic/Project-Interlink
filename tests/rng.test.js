/**
 * Tests: namespaced RNG determinism and isolation.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rngFor, hashSeed } from '../src/generator/random.js';

test('same seed + same namespace produces identical sequences', () => {
  const a = rngFor('root-seed', 'planet:base');
  const b = rngFor('root-seed', 'planet:base');
  const samplesA = [a.random(), a.random(), a.random(), a.random(), a.random()];
  const samplesB = [b.random(), b.random(), b.random(), b.random(), b.random()];
  assert.deepStrictEqual(samplesA, samplesB);
});

test('different namespaces produce independent sequences', () => {
  const a = rngFor('root-seed', 'planet:base');
  const b = rngFor('root-seed', 'planet:bulk');
  const samplesA = [a.random(), a.random(), a.random()];
  const samplesB = [b.random(), b.random(), b.random()];
  // With overwhelming probability, distinct namespaces produce distinct values
  assert.notDeepStrictEqual(samplesA, samplesB, 'Different namespaces should produce different sequences');
});

test('consuming values from one namespace does not alter another', () => {
  // Baseline: get value from namespace B without touching A first
  const b1 = rngFor('isolation-seed', 'ns:B');
  const baseline = b1.random();

  // Now consume many values from namespace A, then read B again
  const a = rngFor('isolation-seed', 'ns:A');
  for (let i = 0; i < 100; i++) a.random();

  const b2 = rngFor('isolation-seed', 'ns:B');
  const isolated = b2.random();

  assert.strictEqual(isolated, baseline, 'Consuming ns:A should not affect ns:B output');
});

test('different root seeds produce different sequences for same namespace', () => {
  const a = rngFor('seed-one', 'planet:base');
  const b = rngFor('seed-two', 'planet:base');
  const va = a.random();
  const vb = b.random();
  assert.notStrictEqual(va, vb, 'Different root seeds should produce different values');
});

test('hashSeed is deterministic', () => {
  assert.strictEqual(hashSeed('hello'), hashSeed('hello'));
  assert.notStrictEqual(hashSeed('hello'), hashSeed('world'));
});

test('rngFor range and int are deterministic', () => {
  const a = rngFor('range-test', 'ns');
  const b = rngFor('range-test', 'ns');
  assert.strictEqual(a.range(0, 100), b.range(0, 100));
  assert.strictEqual(a.int(1, 10), b.int(1, 10));
});

test('simulation modules do not use Math.random directly', async () => {
  // Intercept Math.random calls during world generation.
  // Note: ES module cache means modules are already loaded; this test only catches
  // Math.random() calls made during createWorld() execution (inside functions),
  // not any hypothetical module-initialization-time calls.
  const original = Math.random;
  let callCount = 0;
  Math.random = () => { callCount++; return original(); };

  const { createWorld } = await import('../src/core/world/worldState.js');
  createWorld('math-random-check');

  Math.random = original;

  assert.strictEqual(callCount, 0,
    `Simulation modules called Math.random() ${callCount} times — should use rngFor() instead`);
});
