import test from 'node:test';
import assert from 'node:assert/strict';

import { reconfigureWasmPackedWorldRuntime } from '../src/simulation/liveWorldReconfigure.js';

function setup({ hoppers = [], nodeIds = [] } = {}) {
  return {
    sites: [],
    hoppers,
    exhaustVents: [],
    machines: [],
    passiveLinks: [],
    boundaryTransfers: [],
    runtimeIds: { nodes: nodeIds },
  };
}

function fakeWorld() {
  const calls = [];
  const world = new Proxy({ calls }, {
    get(target, property, receiver) {
      if (property in target) return Reflect.get(target, property, receiver);
      return (...args) => calls.push([property, ...args]);
    },
  });
  return world;
}

test('ordinary live reconfiguration retains the empty-only Hopper removal guard', () => {
  const world = fakeWorld();
  const previous = setup({
    hoppers: [{ nodeId: 0, capacityKg: 100 }],
    nodeIds: ['discarded-hopper'],
  });
  const next = setup({ nodeIds: ['discarded-hopper'] });

  reconfigureWasmPackedWorldRuntime(world, previous, next);

  assert.deepEqual(
    world.calls.filter(call => call[0] === 'remove_hopper_if_empty_live'),
    [['remove_hopper_if_empty_live', 0]],
  );
  assert.equal(world.calls.some(call => call[0] === 'replace_hopper_state_live'), false);
});

test('explicit Reset Site clears a removed Hopper only on the transactional candidate before removal', () => {
  const world = fakeWorld();
  const previous = setup({
    hoppers: [{ nodeId: 0, capacityKg: 100 }],
    nodeIds: ['discarded-hopper'],
  });
  const next = setup({ nodeIds: ['discarded-hopper'] });

  reconfigureWasmPackedWorldRuntime(world, previous, next, {
    resetNodeIds: ['discarded-hopper'],
  });

  const replacement = world.calls.find(call => call[0] === 'replace_hopper_state_live');
  assert.deepEqual(replacement, [
    'replace_hopper_state_live',
    0,
    100,
    [], [], [], [], [], 0,
  ]);
  const replaceIndex = world.calls.indexOf(replacement);
  const removeIndex = world.calls.findIndex(call => call[0] === 'remove_hopper_if_empty_live');
  assert.ok(replaceIndex >= 0 && removeIndex > replaceIndex, 'candidate Hopper must be emptied before guarded removal');
});

test('Reset Site also replaces retained state for Hopper IDs that remain in the rebuilt Site', () => {
  const world = fakeWorld();
  const previous = setup({
    hoppers: [{ nodeId: 0, capacityKg: 100 }],
    nodeIds: ['site-buffer'],
  });
  const nextBody = {
    speciesIds: [4],
    sizeBinIds: [2],
    liberationClassIds: [1],
    textureProfileIds: [0],
    quantities: [3.5],
    sensibleEnthalpyJ: 250,
  };
  const next = setup({
    hoppers: [{ nodeId: 0, capacityKg: 100, body: nextBody }],
    nodeIds: ['site-buffer'],
  });

  reconfigureWasmPackedWorldRuntime(world, previous, next, {
    resetNodeIds: ['site-buffer'],
  });

  assert.deepEqual(
    world.calls.find(call => call[0] === 'replace_hopper_state_live'),
    ['replace_hopper_state_live', 0, 100, [4], [2], [1], [0], [3.5], 250],
  );
});
