import assert from 'node:assert/strict';
import test from 'node:test';

import { RESOURCE_FOCUS_ZOOM, AppStore } from '../dist/state/appState.js';
import {
  MAP_MAX_ZOOM,
  RESOURCE_NODE_HIDE_ZOOM,
  RESOURCE_NODE_INTERACTIVE_ZOOM,
  RESOURCE_NODE_PHYSICAL_WIDTH_METERS,
  RESOURCE_NODE_SHOW_ZOOM,
  RESOURCE_NODE_WORLD_WIDTH,
  WHEEL_ENGINEERING_BLEND_END_ZOOM,
  WHEEL_ENGINEERING_BLEND_START_ZOOM,
  WHEEL_ENGINEERING_SENSITIVITY,
  WHEEL_GEOGRAPHIC_SENSITIVITY,
  wheelSensitivityForZoom,
  wheelZoomAfterDelta,
} from '../dist/map/mapRenderer.js';
import { generateWorld } from '../dist/world/generateWorld.js';
import { worldUnitsToMeters } from '../dist/world/scale.js';

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

test('NAV resource focus reaches Earth-scale engineering depth', () => {
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
  assert.equal(RESOURCE_FOCUS_ZOOM, 2 ** 19);
  assert.equal(MAP_MAX_ZOOM, 2 ** 24);
  assert.ok(RESOURCE_FOCUS_ZOOM > RESOURCE_NODE_SHOW_ZOOM);
  assert.ok(MAP_MAX_ZOOM > RESOURCE_FOCUS_ZOOM);

  const nominalVisibleWidthMeters = world.planet.physicalWidthMeters / RESOURCE_FOCUS_ZOOM;
  assert.ok(nominalVisibleWidthMeters > 70 && nominalVisibleWidthMeters < 80);
});

test('resource FEATURE cards use a meter-scale footprint and hysteretic visibility', () => {
  const world = generateWorld('resource-scale');
  assert.equal(RESOURCE_NODE_PHYSICAL_WIDTH_METERS, 20);
  assert.ok(Math.abs(worldUnitsToMeters(RESOURCE_NODE_WORLD_WIDTH) - 20) < 1e-9);
  assert.ok(RESOURCE_NODE_WORLD_WIDTH / world.planet.width < 0.000001);
  assert.equal(RESOURCE_NODE_SHOW_ZOOM, 2 ** 16);
  assert.equal(RESOURCE_NODE_HIDE_ZOOM, 55_000);
  assert.equal(RESOURCE_NODE_INTERACTIVE_ZOOM, 2 ** 17);
});

test('wheel zoom becomes fine-grained around resources and returns to geographic speed when backing out', () => {
  assert.equal(WHEEL_ENGINEERING_BLEND_START_ZOOM, 2 ** 14);
  assert.equal(WHEEL_ENGINEERING_BLEND_END_ZOOM, 2 ** 18);
  assert.ok(WHEEL_ENGINEERING_SENSITIVITY < WHEEL_GEOGRAPHIC_SENSITIVITY);
  assert.equal(wheelSensitivityForZoom(2 ** 13), WHEEL_GEOGRAPHIC_SENSITIVITY);
  assert.ok(Math.abs(wheelSensitivityForZoom(2 ** 19) - WHEEL_ENGINEERING_SENSITIVITY) < 1e-12);

  const engineeringStart = 288_000;
  const engineeringNext = wheelZoomAfterDelta(engineeringStart, 100);
  const engineeringRatio = engineeringNext / engineeringStart;
  assert.ok(engineeringRatio > 0.95 && engineeringRatio < 1, `engineering wheel ratio ${engineeringRatio}`);

  const geographicStart = 8_000;
  const geographicNext = wheelZoomAfterDelta(geographicStart, 100);
  const geographicRatio = geographicNext / geographicStart;
  assert.ok(geographicRatio < 0.9, `geographic wheel ratio ${geographicRatio}`);
  assert.ok(geographicRatio < engineeringRatio);

  const middleSensitivity = wheelSensitivityForZoom(2 ** 16);
  assert.ok(middleSensitivity < WHEEL_GEOGRAPHIC_SENSITIVITY);
  assert.ok(middleSensitivity > WHEEL_ENGINEERING_SENSITIVITY);
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
