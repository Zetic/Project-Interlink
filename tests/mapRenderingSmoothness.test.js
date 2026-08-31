import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { approachCamera } from '../dist/map/camera/mapCamera.js';
import {
  ENGINEERING_NODE_FADE_START_ZOOM,
  ENGINEERING_NODE_FULL_OPACITY_ZOOM,
  ENGINEERING_NODE_INTERACTIVE_ZOOM,
  engineeringNodeOpacity,
} from '../dist/map/rendering/engineeringNodeVisibility.js';
import {
  MECHANICAL_NODE_FADE_START_ZOOM,
  MECHANICAL_NODE_FULL_OPACITY_ZOOM,
  MECHANICAL_NODE_INTERACTIVE_ZOOM,
} from '../dist/map/rendering/mechanicalRenderer.js';
import {
  RESOURCE_NODE_FADE_START_ZOOM,
  RESOURCE_NODE_FULL_OPACITY_ZOOM,
  RESOURCE_NODE_INTERACTIVE_ZOOM,
} from '../dist/map/rendering/resourceRenderer.js';

test('FEATURE and mechanical cards share one engineering visibility policy', () => {
  assert.equal(RESOURCE_NODE_FADE_START_ZOOM, ENGINEERING_NODE_FADE_START_ZOOM);
  assert.equal(MECHANICAL_NODE_FADE_START_ZOOM, ENGINEERING_NODE_FADE_START_ZOOM);
  assert.equal(RESOURCE_NODE_FULL_OPACITY_ZOOM, ENGINEERING_NODE_FULL_OPACITY_ZOOM);
  assert.equal(MECHANICAL_NODE_FULL_OPACITY_ZOOM, ENGINEERING_NODE_FULL_OPACITY_ZOOM);
  assert.equal(RESOURCE_NODE_INTERACTIVE_ZOOM, ENGINEERING_NODE_INTERACTIVE_ZOOM);
  assert.equal(MECHANICAL_NODE_INTERACTIVE_ZOOM, ENGINEERING_NODE_INTERACTIVE_ZOOM);
  assert.equal(engineeringNodeOpacity(ENGINEERING_NODE_FADE_START_ZOOM), 0);
  assert.equal(engineeringNodeOpacity(ENGINEERING_NODE_FULL_OPACITY_ZOOM), 1);
});

test('node text remains part of the card whenever the card is rendered', () => {
  const resourceRenderer = fs.readFileSync('src/map/rendering/resourceRenderer.ts', 'utf8');
  const mechanicalRenderer = fs.readFileSync('src/map/rendering/mechanicalRenderer.ts', 'utf8');
  assert.doesNotMatch(resourceRenderer, /DETAIL_MIN_TEXT_PIXELS|details\.style\.(?:visibility|opacity)/);
  assert.doesNotMatch(mechanicalRenderer, /DETAIL_MIN_TEXT_PIXELS|details\.style\.(?:visibility|opacity)/);
});

test('manual wheel camera movement approaches its target rather than jumping to it', () => {
  const current = { centerX: 100, centerY: 200, zoom: 288_000 };
  const target = { centerX: 101, centerY: 199, zoom: 250_000 };
  const next = approachCamera(current, target, 16.67);
  assert.ok(next.zoom < current.zoom && next.zoom > target.zoom);
  assert.ok(next.centerX > current.centerX && next.centerX < target.centerX);
  assert.ok(next.centerY < current.centerY && next.centerY > target.centerY);
});

test('camera updates no longer force unrelated panels to rebuild every frame', () => {
  const nav = fs.readFileSync('src/ui/navigationPanel.ts', 'utf8');
  const inspector = fs.readFileSync('src/ui/inspectorPanel.ts', 'utf8');
  const debug = fs.readFileSync('src/ui/debugPanel.ts', 'utf8');
  const renderer = fs.readFileSync('src/map/mapRenderer.ts', 'utf8');
  assert.match(nav, /state\.world === lastWorld/);
  assert.match(inspector, /state\.world === lastWorld && state\.graph === lastGraph/);
  assert.doesNotMatch(debug, /if \(!drawer\.hidden\) render\(\);/);
  assert.match(renderer, /wheelTargetCamera/);
  assert.match(renderer, /queueWheelCamera/);
});

test('camera-driven node opacity is not layered with CSS opacity transitions', () => {
  const css = fs.readFileSync('map.css', 'utf8');
  assert.doesNotMatch(css, /ws-map-resource-node-layer[^{]*\{[^}]*transition:\s*opacity/s);
  assert.doesNotMatch(css, /ws-map-mechanical-layer[^{]*\{[^}]*transition:\s*opacity/s);
});
