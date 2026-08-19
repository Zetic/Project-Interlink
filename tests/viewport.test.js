import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centerViewport, fitViewport, screenToGraph, zoomAroundPoint } from '../src/workspace/viewport.js';

test('screenToGraph applies pan and zoom', () => {
  assert.deepEqual(screenToGraph({ x: 140, y: 90 }, { panX: 20, panY: 10, zoom: 2 }), { x: 60, y: 40 });
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
