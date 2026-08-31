import assert from 'node:assert/strict';
import test from 'node:test';

import { RESOURCE_FOCUS_ZOOM, AppStore } from '../dist/state/appState.js';
import {
  MAP_MAX_ZOOM,
  RESOURCE_NODE_FADE_START_ZOOM,
  RESOURCE_NODE_FULL_OPACITY_ZOOM,
  RESOURCE_NODE_INTERACTIVE_ZOOM,
  RESOURCE_NODE_WORLD_WIDTH,
} from '../dist/map/mapRenderer.js';
import { generateWorld } from '../dist/world/generateWorld.js';

test('NAV-style region focus selects and moves the camera toward the region', () => {
  const world = generateWorld('region-focus');
  const store = new AppStore();
  store.setWorld(world);
  const region = world.planet.regions[2];

  store.focusSelection({ type: 'region', regionId: region.id });
  const state = store.getState();

  assert.deepEqual(state.selection, { type: 'region', regionId: region.id });
  assert.equal(state.camera.centerX, region.bounds.x + region.bounds.width / 2);
  assert.equal(state.camera.centerY, region.bounds.y + region.bounds.height / 2);
  assert.ok(state.camera.zoom >= 2);
});

test('NAV-style resource focus targets the resource at engineering-scale zoom', () => {
  const world = generateWorld('resource-focus');
  const store = new AppStore();
  store.setWorld(world);
  const resource = world.planet.resourceNodes[0];

  store.focusSelection({ type: 'resource', resourceNodeId: resource.id });
  const state = store.getState();

  assert.deepEqual(state.selection, { type: 'resource', resourceNodeId: resource.id });
  assert.equal(state.camera.centerX, resource.position.x);
  assert.equal(state.camera.centerY, resource.position.y);
  assert.equal(state.camera.zoom, RESOURCE_FOCUS_ZOOM);
  assert.ok(RESOURCE_FOCUS_ZOOM > RESOURCE_NODE_FULL_OPACITY_ZOOM);
  assert.ok(MAP_MAX_ZOOM > RESOURCE_FOCUS_ZOOM);
});

test('resource nodes occupy a deliberately tiny fraction of planet width', () => {
  const world = generateWorld('resource-scale');
  assert.ok(RESOURCE_NODE_WORLD_WIDTH / world.planet.width < 0.01);
  assert.ok(RESOURCE_NODE_FADE_START_ZOOM >= 6);
  assert.ok(RESOURCE_NODE_INTERACTIVE_ZOOM > RESOURCE_NODE_FADE_START_ZOOM);
  assert.ok(RESOURCE_NODE_FULL_OPACITY_ZOOM >= RESOURCE_NODE_INTERACTIVE_ZOOM);
});

test('planet focus restores the full-map camera', () => {
  const world = generateWorld('planet-focus');
  const store = new AppStore();
  store.setWorld(world);
  store.setCamera({ centerX: 100, centerY: 100, zoom: 9 });

  store.focusSelection({ type: 'planet' });
  const state = store.getState();

  assert.deepEqual(state.selection, { type: 'planet' });
  assert.deepEqual(state.camera, {
    centerX: world.planet.width / 2,
    centerY: world.planet.height / 2,
    zoom: 1,
  });
});
