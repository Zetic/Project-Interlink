import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBlueprint,
  createBlueprintLayout,
} from '../src/simulation/simulationEngine.js';
import { NODE_DEFINITIONS } from '../src/workspace/catalog/nodeCatalog.js';
import {
  armPlacement,
  cancelPlacement,
  commitNodePlacement,
  createPlacementState,
  graphPositionForCenteredPoint,
  graphPositionForViewportCenter,
  pointerMovementExceedsThreshold,
  placementIsActive,
  updatePlacementPosition,
} from '../src/workspace/graph/nodePlacement.js';

const coneCrusher = NODE_DEFINITIONS.find(definition => definition.id === 'cone-crusher');

test('placement preview coordinates use the existing pan and zoom transform', () => {
  const state = createPlacementState();
  armPlacement(state, coneCrusher.id);
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
  armPlacement(state, coneCrusher.id);
  cancelPlacement(state);

  assert.equal(placementIsActive(state), false);
  assert.deepEqual(blueprint.nodes, {});
  assert.deepEqual(layout.nodePositions, {});
});

test('committing placement adds one real node at its logical graph position', () => {
  const state = createPlacementState();
  const blueprint = createBlueprint();
  const layout = createBlueprintLayout();
  armPlacement(state, coneCrusher.id);

  const node = commitNodePlacement(blueprint, layout, coneCrusher, {}, { x: -75, y: 130 });

  assert.equal(node.nodeType, 'coneCrusher');
  assert.equal(Object.keys(blueprint.nodes).length, 1);
  assert.deepEqual(layout.nodePositions[node.id], { x: -75, y: 130 });
});

test('quick placement centers the node in logical graph coordinates without changing the viewport', () => {
  const viewport = { panX: -40, panY: 25, zoom: 2 };
  const before = { ...viewport };
  assert.deepEqual(
    graphPositionForViewportCenter(viewport, { width: 800, height: 600 }, 160, 100),
    { x: 140, y: 87.5 },
  );
  assert.deepEqual(viewport, before);
});

test('drag placement centers the ghost under the pointer after pan and zoom', () => {
  assert.deepEqual(
    graphPositionForCenteredPoint(
      { x: 300, y: 220 },
      { panX: 20, panY: -10, zoom: 0.5 },
      160,
      100,
    ),
    { x: 480, y: 410 },
  );
});

test('catalog pointer jitter stays a click until the movement threshold is crossed', () => {
  assert.equal(pointerMovementExceedsThreshold({ x: 10, y: 10 }, { x: 13, y: 13 }), false);
  assert.equal(pointerMovementExceedsThreshold({ x: 10, y: 10 }, { x: 14, y: 13 }), true);
});
