from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    if old not in text:
        raise SystemExit(f"Expected text not found in {path}: {old[:160]!r}")
    target.write_text(text.replace(old, new))


path = "src/map/mapRenderer.ts"
replace(
    path,
    """export const RESOURCE_NODE_FADE_START_ZOOM = 2 ** 16;
export const RESOURCE_NODE_INTERACTIVE_ZOOM = 2 ** 17;
export const RESOURCE_NODE_FULL_OPACITY_ZOOM = 2 ** 18;
export const RESOURCE_NODE_PHYSICAL_WIDTH_METERS = 20;
""",
    """export const RESOURCE_NODE_FADE_START_ZOOM = 2 ** 16;
export const RESOURCE_NODE_INTERACTIVE_ZOOM = 2 ** 17;
export const RESOURCE_NODE_FULL_OPACITY_ZOOM = 2 ** 17;
export const RESOURCE_NODE_DETAIL_MIN_TEXT_PIXELS = 5.75;
export const WHEEL_GEOGRAPHIC_SENSITIVITY = 0.0015;
export const WHEEL_ENGINEERING_SENSITIVITY = 0.00035;
export const WHEEL_ENGINEERING_BLEND_START_ZOOM = 2 ** 14;
export const WHEEL_ENGINEERING_BLEND_END_ZOOM = 2 ** 18;
export const RESOURCE_NODE_PHYSICAL_WIDTH_METERS = 20;
""",
)

replace(
    path,
    """function smoothStep(value: number): number {
  const clamped = clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function camerasEqual""",
    """function smoothStep(value: number): number {
  const clamped = clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

export function wheelSensitivityForZoom(zoom: number): number {
  const logZoom = Math.log2(Math.max(MAP_MIN_ZOOM, zoom));
  const start = Math.log2(WHEEL_ENGINEERING_BLEND_START_ZOOM);
  const end = Math.log2(WHEEL_ENGINEERING_BLEND_END_ZOOM);
  const engineeringWeight = smoothStep((logZoom - start) / (end - start));
  return WHEEL_GEOGRAPHIC_SENSITIVITY
    + (WHEEL_ENGINEERING_SENSITIVITY - WHEEL_GEOGRAPHIC_SENSITIVITY) * engineeringWeight;
}

export function wheelZoomAfterDelta(zoom: number, deltaPixels: number): number {
  const sensitivity = wheelSensitivityForZoom(zoom);
  return clamp(zoom * Math.exp(-deltaPixels * sensitivity), MAP_MIN_ZOOM, MAP_MAX_ZOOM);
}

export function resourceDetailsVisibleAtPixelHeight(pixelHeight: number): boolean {
  return pixelHeight >= RESOURCE_NODE_DETAIL_MIN_TEXT_PIXELS;
}

function normalizeWheelDelta(event: WheelEvent, viewportHeight: number): number {
  let deltaPixels = event.deltaY;
  if (event.deltaMode === 1) deltaPixels *= 16;
  else if (event.deltaMode === 2) deltaPixels *= Math.max(1, viewportHeight);
  return clamp(deltaPixels, -240, 240);
}

function camerasEqual""",
)

replace(
    path,
    """  appendText(
    group,
    'ws-map-resource-category',
""",
    """  const details = createSvgElement('g');
  details.setAttribute('class', 'ws-map-resource-details');
  group.appendChild(details);

  appendText(
    details,
    'ws-map-resource-category',
""",
)

replace(
    path,
    """  appendText(group, 'ws-map-resource-name', 0, metersToWorldUnits(-0.8), resource.name, RESOURCE_NODE_BODY_FONT_SIZE);
  appendText(group, 'ws-map-resource-type', 0, metersToWorldUnits(1.45), 'Mineral Deposit', RESOURCE_NODE_BODY_FONT_SIZE);
  appendText(group, 'ws-map-resource-material', 0, metersToWorldUnits(3.7), definition?.name ?? resource.resourceId, RESOURCE_NODE_BODY_FONT_SIZE);
""",
    """  appendText(details, 'ws-map-resource-name', 0, metersToWorldUnits(-0.8), resource.name, RESOURCE_NODE_BODY_FONT_SIZE);
  appendText(details, 'ws-map-resource-type', 0, metersToWorldUnits(1.45), 'Mineral Deposit', RESOURCE_NODE_BODY_FONT_SIZE);
  appendText(details, 'ws-map-resource-material', 0, metersToWorldUnits(3.7), definition?.name ?? resource.resourceId, RESOURCE_NODE_BODY_FONT_SIZE);
""",
)

replace(
    path,
    """  port.appendChild(title);
  group.appendChild(port);
}
""",
    """  port.appendChild(title);
  details.appendChild(port);
}
""",
)

replace(
    path,
    """  const worldUnitsPerPixel = rect.width > 0 && viewBox.width > 0 ? viewBox.width / rect.width : 1;
  for (const label of svg.querySelectorAll<SVGTextElement>('.ws-map-region-label')) {
""",
    """  const worldUnitsPerPixel = rect.width > 0 && viewBox.width > 0 ? viewBox.width / rect.width : 1;
  const resourceTextPixelHeight = worldUnitsPerPixel > 0 ? RESOURCE_NODE_BODY_FONT_SIZE / worldUnitsPerPixel : 0;
  const resourceDetailsVisible = resourceDetailsVisibleAtPixelHeight(resourceTextPixelHeight);
  for (const details of svg.querySelectorAll<SVGGElement>('.ws-map-resource-details')) {
    details.style.opacity = resourceDetailsVisible ? '1' : '0';
    details.style.visibility = resourceDetailsVisible ? 'visible' : 'hidden';
    details.style.pointerEvents = resourceDetailsVisible ? 'auto' : 'none';
  }

  for (const label of svg.querySelectorAll<SVGTextElement>('.ws-map-region-label')) {
""",
)

replace(
    path,
    """    const zoom = clamp(displayCamera.zoom * Math.exp(-event.deltaY * 0.0015), MAP_MIN_ZOOM, MAP_MAX_ZOOM);
    const nextVisible = visibleWorldSize(svg, planet, zoom);
""",
    """    const deltaPixels = normalizeWheelDelta(event, rect.height);
    const zoom = wheelZoomAfterDelta(displayCamera.zoom, deltaPixels);
    const nextVisible = visibleWorldSize(svg, planet, zoom);
""",
)

Path("tests/mapCameraState.test.js").write_text("""import assert from 'node:assert/strict';
import test from 'node:test';

import { RESOURCE_FOCUS_ZOOM, AppStore } from '../dist/state/appState.js';
import {
  MAP_MAX_ZOOM,
  RESOURCE_NODE_DETAIL_MIN_TEXT_PIXELS,
  RESOURCE_NODE_FADE_START_ZOOM,
  RESOURCE_NODE_FULL_OPACITY_ZOOM,
  RESOURCE_NODE_INTERACTIVE_ZOOM,
  RESOURCE_NODE_PHYSICAL_WIDTH_METERS,
  RESOURCE_NODE_WORLD_WIDTH,
  WHEEL_ENGINEERING_BLEND_END_ZOOM,
  WHEEL_ENGINEERING_BLEND_START_ZOOM,
  WHEEL_ENGINEERING_SENSITIVITY,
  WHEEL_GEOGRAPHIC_SENSITIVITY,
  resourceDetailsVisibleAtPixelHeight,
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
  assert.ok(RESOURCE_FOCUS_ZOOM > RESOURCE_NODE_FULL_OPACITY_ZOOM);
  assert.ok(MAP_MAX_ZOOM > RESOURCE_FOCUS_ZOOM);

  const nominalVisibleWidthMeters = world.planet.physicalWidthMeters / RESOURCE_FOCUS_ZOOM;
  assert.ok(nominalVisibleWidthMeters > 70 && nominalVisibleWidthMeters < 80);
});

test('resource FEATURE cards use a meter-scale footprint on the Earth-scale map', () => {
  const world = generateWorld('resource-scale');
  assert.equal(RESOURCE_NODE_PHYSICAL_WIDTH_METERS, 20);
  assert.ok(Math.abs(worldUnitsToMeters(RESOURCE_NODE_WORLD_WIDTH) - 20) < 1e-9);
  assert.ok(RESOURCE_NODE_WORLD_WIDTH / world.planet.width < 0.000001);
  assert.equal(RESOURCE_NODE_FADE_START_ZOOM, 2 ** 16);
  assert.equal(RESOURCE_NODE_INTERACTIVE_ZOOM, 2 ** 17);
  assert.equal(RESOURCE_NODE_FULL_OPACITY_ZOOM, 2 ** 17);
});

test('wheel zoom becomes fine-grained around resources and returns to geographic speed when backing out', () => {
  assert.equal(WHEEL_ENGINEERING_BLEND_START_ZOOM, 2 ** 14);
  assert.equal(WHEEL_ENGINEERING_BLEND_END_ZOOM, 2 ** 18);
  assert.ok(WHEEL_ENGINEERING_SENSITIVITY < WHEEL_GEOGRAPHIC_SENSITIVITY);
  assert.equal(wheelSensitivityForZoom(2 ** 13), WHEEL_GEOGRAPHIC_SENSITIVITY);
  assert.equal(wheelSensitivityForZoom(2 ** 19), WHEEL_ENGINEERING_SENSITIVITY);

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

test('resource text detail is hidden before it becomes large enough to render cleanly', () => {
  assert.equal(RESOURCE_NODE_DETAIL_MIN_TEXT_PIXELS, 5.75);
  assert.equal(resourceDetailsVisibleAtPixelHeight(5.2), false);
  assert.equal(resourceDetailsVisibleAtPixelHeight(5.74), false);
  assert.equal(resourceDetailsVisibleAtPixelHeight(5.75), true);
  assert.equal(resourceDetailsVisibleAtPixelHeight(7), true);
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
""")
