import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  boundsForNodePositions,
  centerViewport,
  fitViewport,
  screenToGraph,
  translateGraphPosition,
  zoomAroundPoint,
} from '../src/workspace/graph/viewport.js';

test('screenToGraph applies pan and zoom', () => {
  assert.deepEqual(screenToGraph({ x: 140, y: 90 }, { panX: 20, panY: 10, zoom: 2 }), { x: 60, y: 40 });
});

test('translateGraphPosition preserves signed graph coordinates', () => {
  assert.deepEqual(
    translateGraphPosition({ x: 25, y: 10 }, { x: 40, y: 50 }, { x: -60, y: -30 }),
    { x: -75, y: -70 },
  );
});

test('boundsForNodePositions uses actual signed node bounds instead of forcing the origin into view', () => {
  assert.deepEqual(
    boundsForNodePositions({
      a: { x: -400, y: -250 },
      b: { x: -100, y: 50 },
    }, 160, 100),
    { minX: -400, minY: -250, maxX: 60, maxY: 150 },
  );
});

test('zoomAroundPoint preserves the graph point under the cursor', () => {
  const before = { panX: 30, panY: 20, zoom: 1 };
  const after = zoomAroundPoint(before, 2, { x: 130, y: 80 });
  assert.deepEqual(screenToGraph({ x: 130, y: 80 }, after), screenToGraph({ x: 130, y: 80 }, before));
});

test('fit and center change only viewport state', () => {
  const initial = { panX: 0, panY: 0, zoom: 1 };
  const bounds = { minX: 0, minY: 0, maxX: 400, maxY: 200 };
  const fitted = fitViewport(initial, bounds, { width: 800, height: 600 });
  const centered = centerViewport(initial, bounds, { width: 800, height: 600 });
  assert.equal(fitted.zoom, 1.8);
  assert.deepEqual(centered, { panX: 200, panY: 200, zoom: 1 });
  assert.deepEqual(initial, { panX: 0, panY: 0, zoom: 1 });
});

test('fit and center correctly frame nodes in negative graph space', () => {
  const initial = { panX: 0, panY: 0, zoom: 1 };
  const bounds = { minX: -600, minY: -300, maxX: -200, maxY: -100 };
  const fitted = fitViewport(initial, bounds, { width: 800, height: 600 });
  const centered = centerViewport(initial, bounds, { width: 800, height: 600 });

  assert.equal(fitted.zoom, 1.8);
  assert.deepEqual(fitted, { panX: 1120, panY: 660, zoom: 1.8 });
  assert.deepEqual(centered, { panX: 800, panY: 500, zoom: 1 });
});
