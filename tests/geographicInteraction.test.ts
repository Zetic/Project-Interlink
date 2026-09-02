import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { FEATURE_MARKER_SHOW_ZOOM, REGION_INTERACTION_MAX_ZOOM, REGION_LABEL_MAX_ZOOM, REGION_RENDER_MAX_ZOOM, featureMarkerWorldRadius, regionLabelBudgetForZoom, regionLabelFocusPoint, regionLabelOpacity, regionLabelOpacityAroundPointer, regionLabelPixelSizeForZoom, regionsInteractiveAtZoom } from '../dist/map/mapRenderer.js';
import { AppStore } from '../dist/state/appState.js';
import { generateWorld } from '../dist/world/generateWorld.js';
import { geographicLocationAt, geographicLocationKey } from '../dist/world/geographyQueries.js';
import { navigationContextKey } from '../dist/ui/navigationPanel.js';

const world = generateWorld('geographic-interaction');

test('Continent, Ocean, and Region focus use viewport-aware geographic framing', () => {
  const store = new AppStore(); store.setWorld(world);
  const continent = world.planet.continents[0]; const ocean = world.planet.oceans[0]; const region = world.planet.regions[0];
  store.focusSelection({ type: 'continent', continentId: continent.id }); assert.deepEqual(store.getState().selection, { type: 'continent', continentId: continent.id }); assert.ok(store.getState().camera.zoom >= 1);
  store.focusSelection({ type: 'ocean', oceanId: ocean.id }); assert.deepEqual(store.getState().selection, { type: 'ocean', oceanId: ocean.id }); assert.ok(store.getState().camera.zoom >= 1);
  store.focusSelection({ type: 'region', regionId: region.id }); assert.ok(store.getState().camera.zoom > 6); assert.equal(store.getState().camera.centerX, region.center.x);
});

test('Location context covers land and ocean while selection remains independent', () => {
  const land = world.planet.regions.find(region => region.surfaceType === 'land'); const ocean = world.planet.regions.find(region => region.surfaceType === 'ocean');
  const landContext = geographicLocationAt(world.planet, land.center); const oceanContext = geographicLocationAt(world.planet, ocean.center);
  assert.equal(landContext.parent.kind, 'continent'); assert.equal(landContext.region.id, land.id);
  assert.equal(oceanContext.parent.kind, 'ocean'); assert.equal(oceanContext.region.id, ocean.id);
  const store = new AppStore(); store.setWorld(world); store.setSelection({ type: 'resource', resourceNodeId: world.planet.resourceNodes[0].id }); store.setCamera({ centerX: ocean.center.x, centerY: ocean.center.y, zoom: 30 });
  assert.deepEqual(store.getState().selection, { type: 'resource', resourceNodeId: world.planet.resourceNodes[0].id });
  assert.equal(geographicLocationAt(world.planet, { x: store.getState().camera.centerX, y: store.getState().camera.centerY }).parent.kind, 'ocean');
});

test('camera context keys refresh after significant movement within one Region', () => {
  const region = world.planet.regions[0];
  const first = { centerX: region.bounds.x + 2, centerY: region.bounds.y + 2, zoom: 20 };
  const second = { centerX: region.bounds.x + region.bounds.width - 2, centerY: region.bounds.y + region.bounds.height - 2, zoom: 20 };
  assert.notEqual(geographicLocationKey(world.planet, { x: first.centerX, y: first.centerY }, 8), geographicLocationKey(world.planet, { x: second.centerX, y: second.centerY }, 8));
  assert.notEqual(navigationContextKey(world.planet, first), navigationContextKey(world.planet, second));
});

test('geographic labels grow in budget, shrink in pixels, and fade radially', () => {
  assert.ok(regionLabelBudgetForZoom(256) > regionLabelBudgetForZoom(4));
  assert.ok(regionLabelPixelSizeForZoom(256) < regionLabelPixelSizeForZoom(4));
  assert.ok(regionLabelPixelSizeForZoom(256) >= 9 && regionLabelPixelSizeForZoom(4) <= 16);
  assert.ok(regionLabelOpacity(0.5, 0.5) > regionLabelOpacity(0.85, 0.5));
  assert.equal(regionLabelOpacity(1, 1), 0);
});

test('pointer position controls label focus with a camera-center fallback', () => {
  assert.deepEqual(regionLabelFocusPoint(null), { x: 0.5, y: 0.5 });
  assert.deepEqual(regionLabelFocusPoint({ normalizedX: 0.8, normalizedY: 0.2, worldPoint: { x: 10, y: 20 } }), { x: 0.8, y: 0.2 });
  assert.ok(regionLabelOpacityAroundPointer(0.8, 0.2, 0.8, 0.2) > regionLabelOpacityAroundPointer(0.5, 0.5, 0.8, 0.2));
  assert.equal(regionLabelOpacityAroundPointer(0.1, 0.9, 0.8, 0.2), 0);
});

test('Feature markers retain a stable screen-space radius across zoom levels', () => {
  for (const unitsPerPixel of [16, 8, 2, 0.25, 0.01]) assert.ok(Math.abs(featureMarkerWorldRadius(unitsPerPixel) / unitsPerPixel - 3) < 1e-9);
});

test('semantic LOD has no gap and Region interaction yields at 512x', () => {
  assert.equal(REGION_INTERACTION_MAX_ZOOM, 512);
  assert.equal(regionsInteractiveAtZoom(511), true); assert.equal(regionsInteractiveAtZoom(512), false);
  assert.ok(REGION_RENDER_MAX_ZOOM >= FEATURE_MARKER_SHOW_ZOOM);
  assert.ok(REGION_LABEL_MAX_ZOOM <= REGION_RENDER_MAX_ZOOM);
});

test('coarse parents use multi-loop even-odd paths from canonical coastline truth', () => {
  const source = fs.readFileSync('src/map/mapRenderer.ts', 'utf8');
  assert.match(source, /path\.setAttribute\('fill-rule', 'evenodd'\)/);
  assert.match(source, /parent\.polygons\.map/);
});

test('pointer movement updates existing label emphasis without spatial requery', () => {
  const source = fs.readFileSync('src/map/mapRenderer.ts', 'utf8');
  const pointerHandler = source.slice(source.indexOf("svg.addEventListener('pointermove'"), source.indexOf('const finishPointer'));
  assert.match(pointerHandler, /scheduleRegionLabelFocus/);
  assert.doesNotMatch(pointerHandler, /regionsIntersecting|resourceNodesIntersecting|replaceChildren/);
});
