import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { cameraForAnchor, worldPointAtNormalizedScreen } from '../dist/map/camera/cameraAnchor.js';
import { approachZoom } from '../dist/map/camera/mapCamera.js';
import {
  ENGINEERING_NODE_HIDE_ZOOM,
  ENGINEERING_NODE_INTERACTIVE_ZOOM,
  ENGINEERING_NODE_SHOW_ZOOM,
  engineeringNodesVisibleAtZoom,
} from '../dist/map/rendering/engineeringNodeVisibility.js';
import {
  FLOATING_ORIGIN_ENTER_ZOOM,
  FLOATING_ORIGIN_EXIT_ZOOM,
  initialRenderOrigin,
  renderOriginForCamera,
  worldToRenderPoint,
} from '../dist/map/rendering/renderOrigin.js';
import {
  MECHANICAL_NODE_HIDE_ZOOM,
  MECHANICAL_NODE_INTERACTIVE_ZOOM,
  MECHANICAL_NODE_SHOW_ZOOM,
} from '../dist/map/rendering/mechanicalRenderer.js';
import {
  RESOURCE_NODE_HIDE_ZOOM,
  RESOURCE_NODE_INTERACTIVE_ZOOM,
  RESOURCE_NODE_SHOW_ZOOM,
} from '../dist/map/rendering/resourceRenderer.js';

test('FEATURE and mechanical cards share one hysteretic engineering visibility policy', () => {
  assert.equal(RESOURCE_NODE_HIDE_ZOOM, ENGINEERING_NODE_HIDE_ZOOM);
  assert.equal(MECHANICAL_NODE_HIDE_ZOOM, ENGINEERING_NODE_HIDE_ZOOM);
  assert.equal(RESOURCE_NODE_SHOW_ZOOM, ENGINEERING_NODE_SHOW_ZOOM);
  assert.equal(MECHANICAL_NODE_SHOW_ZOOM, ENGINEERING_NODE_SHOW_ZOOM);
  assert.equal(RESOURCE_NODE_INTERACTIVE_ZOOM, ENGINEERING_NODE_INTERACTIVE_ZOOM);
  assert.equal(MECHANICAL_NODE_INTERACTIVE_ZOOM, ENGINEERING_NODE_INTERACTIVE_ZOOM);

  assert.equal(engineeringNodesVisibleAtZoom(ENGINEERING_NODE_SHOW_ZOOM - 1, false), false);
  assert.equal(engineeringNodesVisibleAtZoom(ENGINEERING_NODE_SHOW_ZOOM, false), true);
  assert.equal(engineeringNodesVisibleAtZoom(60_000, true), true);
  assert.equal(engineeringNodesVisibleAtZoom(60_000, false), false);
  assert.equal(engineeringNodesVisibleAtZoom(ENGINEERING_NODE_HIDE_ZOOM, true), false);
});

test('node text remains part of the card and engineering nodes never alpha-fade', () => {
  const resourceRenderer = fs.readFileSync('src/map/rendering/resourceRenderer.ts', 'utf8');
  const mechanicalRenderer = fs.readFileSync('src/map/rendering/mechanicalRenderer.ts', 'utf8');
  const visibility = fs.readFileSync('src/map/rendering/engineeringNodeVisibility.ts', 'utf8');
  assert.doesNotMatch(resourceRenderer, /DETAIL_MIN_TEXT_PIXELS|details\.style\.(?:visibility|opacity)/);
  assert.doesNotMatch(mechanicalRenderer, /DETAIL_MIN_TEXT_PIXELS|details\.style\.(?:visibility|opacity)/);
  assert.doesNotMatch(visibility, /smoothStep|toFixed\(3\)/);
  assert.match(visibility, /layer\.style\.opacity = '1'/);
});

test('every intermediate wheel frame preserves the exact cursor/world anchor', () => {
  const screen = { x: 0.31, y: 0.68 };
  const initialZoom = 288_000;
  const targetZoom = 180_000;
  const fitWidth = 4096;
  const fitHeight = 2048;
  let camera = { centerX: 2187.428194, centerY: 916.582013, zoom: initialZoom };
  let visible = { width: fitWidth / camera.zoom, height: fitHeight / camera.zoom };
  const anchor = { screen, world: worldPointAtNormalizedScreen(camera, visible, screen) };

  for (let frame = 0; frame < 20; frame += 1) {
    const zoom = approachZoom(camera.zoom, targetZoom, 16.67);
    visible = { width: fitWidth / zoom, height: fitHeight / zoom };
    camera = cameraForAnchor(anchor, visible, zoom);
    const resolved = worldPointAtNormalizedScreen(camera, visible, screen);
    assert.ok(Math.abs(resolved.x - anchor.world.x) < 1e-12, `frame ${frame} x drift`);
    assert.ok(Math.abs(resolved.y - anchor.world.y) < 1e-12, `frame ${frame} y drift`);
  }
});

test('floating origin keeps engineering geometry close to zero and has its own hysteresis', () => {
  const worldCamera = { centerX: 2187.428194, centerY: 916.582013, zoom: 2 ** 19 };
  let state = initialRenderOrigin();
  state = renderOriginForCamera(state, worldCamera);
  assert.equal(state.active, true);
  assert.equal(FLOATING_ORIGIN_ENTER_ZOOM, 2 ** 15);
  assert.equal(FLOATING_ORIGIN_EXIT_ZOOM, 2 ** 14);

  const local = worldToRenderPoint({ x: worldCamera.centerX + 0.002, y: worldCamera.centerY - 0.001 }, state);
  assert.ok(Math.abs(local.x - 0.002) < 1e-12);
  assert.ok(Math.abs(local.y + 0.001) < 1e-12);

  state = renderOriginForCamera(state, { ...worldCamera, zoom: FLOATING_ORIGIN_EXIT_ZOOM - 1 }, { allowDeactivate: true });
  assert.deepEqual(state, initialRenderOrigin());
});

test('camera updates no longer force unrelated panels to rebuild every frame', () => {
  const nav = fs.readFileSync('src/ui/navigationPanel.ts', 'utf8');
  const inspector = fs.readFileSync('src/ui/inspectorPanel.ts', 'utf8');
  const debug = fs.readFileSync('src/ui/debugPanel.ts', 'utf8');
  const renderer = fs.readFileSync('src/map/mapRenderer.ts', 'utf8');
  assert.match(nav, /state\.world === lastWorld/);
  assert.match(inspector, /state\.world === lastWorld && state\.graph === lastGraph/);
  assert.doesNotMatch(debug, /if \(!drawer\.hidden\) render\(\);/);
  assert.match(renderer, /wheelAnchor/);
  assert.match(renderer, /cameraForAnchor/);
});

test('engineering renderer uses camera-relative coordinates at deep zoom', () => {
  const renderer = fs.readFileSync('src/map/mapRenderer.ts', 'utf8');
  const resource = fs.readFileSync('src/map/rendering/resourceRenderer.ts', 'utf8');
  const mechanical = fs.readFileSync('src/map/rendering/mechanicalRenderer.ts', 'utf8');
  assert.match(renderer, /localCenterX = displayCamera\.centerX - renderOrigin\.origin\.x/);
  assert.match(resource, /worldToRenderPoint\(resource\.position, renderOrigin\)/);
  assert.match(mechanical, /worldToRenderPoint\(node\.position, renderOrigin\)/);
  assert.match(mechanical, /worldToRenderPoint\(startWorld, renderOrigin\)/);
});
