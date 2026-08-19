import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBlueprint,
  createBlueprintLayout,
} from '../src/simulation/simulationEngine.js';
import { NODE_DEFINITIONS } from '../src/workspace/nodeCatalog.js';
import {
  armPlacement,
  cancelPlacement,
  commitNodePlacement,
  createPlacementState,
  placementIsActive,
  updatePlacementPosition,
} from '../src/workspace/nodePlacement.js';

const crusher = NODE_DEFINITIONS.find(definition => definition.id === 'crusher');

test('placement preview coordinates use the existing pan and zoom transform', () => {
  const state = createPlacementState();
  armPlacement(state, crusher.id);
  assert.deepEqual(
    updatePlacementPosition(state, { x: 140, y: 90 }, { panX: 20, panY: 10, zoom: 2 }),
    { x: 60, y: 40 },
  );
  assert.deepEqual(state.graphPosition, { x: 60, y: 40 });
});

test('cancelling placement leaves the blueprint and layout unchanged', () => {
  const state = createPlacementState();
  const blueprint = createBlueprint();
  const layout = createBlueprintLayout();
  armPlacement(state, crusher.id);
  cancelPlacement(state);

  assert.equal(placementIsActive(state), false);
  assert.deepEqual(blueprint.nodes, {});
  assert.deepEqual(layout.nodePositions, {});
});

test('committing placement adds one real node at its logical graph position', () => {
  const state = createPlacementState();
  const blueprint = createBlueprint();
  const layout = createBlueprintLayout();
  armPlacement(state, crusher.id);

  const node = commitNodePlacement(blueprint, layout, crusher, {}, { x: -75, y: 130 });

  assert.equal(node.nodeType, 'crusher');
  assert.equal(Object.keys(blueprint.nodes).length, 1);
  assert.deepEqual(layout.nodePositions[node.id], { x: -75, y: 130 });
});
