/**
 * Tests: Knowledge State isolation from World State.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/core/world/worldState.js';
import {
  createKnowledge,
  discoverFeature,
  isFeatureDiscovered,
  validateKnowledge,
  DISCOVERY_STATES,
} from '../src/core/world/knowledgeState.js';

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

test('createKnowledge references only valid world features', () => {
  const world = createWorld('knowledge-valid-refs');
  const knowledge = createKnowledge(world);
  for (const featureId of Object.keys(knowledge.features)) {
    assert.ok(world.features[featureId], `Knowledge references unknown feature '${featureId}'`);
  }
});

test('createKnowledge covers every world feature', () => {
  const world = createWorld('knowledge-coverage');
  const knowledge = createKnowledge(world);
  for (const featureId of Object.keys(world.features)) {
    assert.ok(featureId in knowledge.features, `Feature '${featureId}' has no knowledge entry`);
  }
});

test('all features begin as unknown', () => {
  const world = createWorld('knowledge-unknown');
  const knowledge = createKnowledge(world);
  for (const [fid, entry] of Object.entries(knowledge.features)) {
    assert.strictEqual(
      entry.discoveryState, DISCOVERY_STATES.UNKNOWN,
      `Feature '${fid}' should start as UNKNOWN`
    );
  }
});

test('discovering one feature changes only the knowledge structure', () => {
  const world = createWorld('knowledge-isolation-1');
  const knowledge = createKnowledge(world);
  const featureIds = Object.keys(world.features);
  assert.ok(featureIds.length > 0, 'World must have at least one feature');

  const target = featureIds[0];
  const othersBefore = featureIds.slice(1).map(id => knowledge.features[id].discoveryState);

  discoverFeature(knowledge, target);

  assert.strictEqual(knowledge.features[target].discoveryState, DISCOVERY_STATES.DISCOVERED);
  const othersAfter = featureIds.slice(1).map(id => knowledge.features[id].discoveryState);
  assert.deepStrictEqual(othersBefore, othersAfter, 'Other features should be unaffected');
});

test('discovering a feature does not mutate the physical world', () => {
  const world = createWorld('knowledge-no-mutation');
  const worldSnapshot = deepClone(world);
  const knowledge = createKnowledge(world);

  const featureId = Object.keys(world.features)[0];
  discoverFeature(knowledge, featureId);

  assert.deepStrictEqual(world, worldSnapshot, 'Physical world must be unchanged after discovery');
});

test('isFeatureDiscovered returns correct boolean', () => {
  const world = createWorld('knowledge-bool-check');
  const knowledge = createKnowledge(world);
  const featureId = Object.keys(world.features)[0];

  assert.strictEqual(isFeatureDiscovered(knowledge, featureId), false);
  discoverFeature(knowledge, featureId);
  assert.strictEqual(isFeatureDiscovered(knowledge, featureId), true);
});

test('validateKnowledge returns no errors for fresh knowledge', () => {
  const world = createWorld('knowledge-validate');
  const knowledge = createKnowledge(world);
  const errors = validateKnowledge(knowledge, world);
  assert.deepStrictEqual(errors, [], `validateKnowledge returned errors: ${JSON.stringify(errors)}`);
});

test('validateKnowledge flags stale reference not in world', () => {
  const world = createWorld('knowledge-stale-ref');
  const knowledge = createKnowledge(world);
  knowledge.features['nonexistent-feature-xyz'] = { discoveryState: DISCOVERY_STATES.UNKNOWN };
  const errors = validateKnowledge(knowledge, world);
  assert.ok(errors.length > 0, 'Should report error for stale reference');
});
