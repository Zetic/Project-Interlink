from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, text: str) -> None:
    Path(path).write_text(text)


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    if old not in text:
        raise SystemExit(f"expected text not found in {path}: {old[:120]!r}")
    write(path, text.replace(old, new, 1))


write('src/map/rendering/engineeringNodeVisibility.ts', """import { MECHANICAL_PLACEMENT_MIN_ZOOM, smoothStep } from '../camera/mapCamera.js';

/** Shared visibility contract for FEATURE, APPARATUS, and CONTAINER cards. */
export const ENGINEERING_NODE_FADE_START_ZOOM = 2 ** 16;
export const ENGINEERING_NODE_FULL_OPACITY_ZOOM = 2 ** 17;
export const ENGINEERING_NODE_INTERACTIVE_ZOOM = MECHANICAL_PLACEMENT_MIN_ZOOM;

export function engineeringNodeOpacity(zoom: number): number {
  const progress = (zoom - ENGINEERING_NODE_FADE_START_ZOOM)
    / (ENGINEERING_NODE_FULL_OPACITY_ZOOM - ENGINEERING_NODE_FADE_START_ZOOM);
  return smoothStep(progress);
}

export function applyEngineeringNodeVisibility(layer: SVGGElement | null, zoom: number): void {
  if (!layer) return;
  layer.style.opacity = engineeringNodeOpacity(zoom).toFixed(3);
  layer.style.visibility = zoom <= ENGINEERING_NODE_FADE_START_ZOOM ? 'hidden' : 'visible';
  layer.style.pointerEvents = zoom >= ENGINEERING_NODE_INTERACTIVE_ZOOM ? 'auto' : 'none';
}
""")

# Resource renderer: one shared node visibility policy and no text-only LOD cutoff.
path = 'src/map/rendering/resourceRenderer.ts'
text = read(path)
text = text.replace("import { smoothStep } from '../camera/mapCamera.js';\n", "import {\n  applyEngineeringNodeVisibility,\n  ENGINEERING_NODE_FADE_START_ZOOM,\n  ENGINEERING_NODE_FULL_OPACITY_ZOOM,\n  ENGINEERING_NODE_INTERACTIVE_ZOOM,\n} from './engineeringNodeVisibility.js';\n")
text = text.replace("export const RESOURCE_NODE_FADE_START_ZOOM = 2 ** 16;\nexport const RESOURCE_NODE_INTERACTIVE_ZOOM = 2 ** 17;\nexport const RESOURCE_NODE_FULL_OPACITY_ZOOM = 2 ** 17;\nexport const RESOURCE_NODE_DETAIL_MIN_TEXT_PIXELS = 5.75;\n", "export const RESOURCE_NODE_FADE_START_ZOOM = ENGINEERING_NODE_FADE_START_ZOOM;\nexport const RESOURCE_NODE_INTERACTIVE_ZOOM = ENGINEERING_NODE_INTERACTIVE_ZOOM;\nexport const RESOURCE_NODE_FULL_OPACITY_ZOOM = ENGINEERING_NODE_FULL_OPACITY_ZOOM;\n")
text = re.sub(r"\nexport function resourceDetailsVisibleAtPixelHeight\(pixelHeight: number\): boolean \{\n  return pixelHeight >= RESOURCE_NODE_DETAIL_MIN_TEXT_PIXELS;\n\}\n", "\n", text)
start = text.index('export function updateResourceVisibility')
text = text[:start] + """export function updateResourceVisibility(svg: SVGSVGElement, zoom: number): void {
  applyEngineeringNodeVisibility(svg.querySelector<SVGGElement>('.ws-map-resource-node-layer'), zoom);
}
"""
write(path, text)

# Mechanical renderer: identical fade/interaction policy and details remain with the card.
path = 'src/map/rendering/mechanicalRenderer.ts'
text = read(path)
text = text.replace("import { MECHANICAL_PLACEMENT_MIN_ZOOM, smoothStep } from '../camera/mapCamera.js';\n", "")
text = text.replace("import {\n  RESOURCE_NODE_PHYSICAL_HEIGHT_METERS,", "import {\n  applyEngineeringNodeVisibility,\n  ENGINEERING_NODE_FADE_START_ZOOM,\n  ENGINEERING_NODE_FULL_OPACITY_ZOOM,\n  ENGINEERING_NODE_INTERACTIVE_ZOOM,\n} from './engineeringNodeVisibility.js';\nimport {\n  RESOURCE_NODE_PHYSICAL_HEIGHT_METERS,")
text = text.replace("export const MECHANICAL_NODE_FADE_START_ZOOM = MECHANICAL_PLACEMENT_MIN_ZOOM;\nexport const MECHANICAL_NODE_FULL_OPACITY_ZOOM = 2 ** 18;\nexport const MECHANICAL_NODE_DETAIL_MIN_TEXT_PIXELS = 5.75;\n", "export const MECHANICAL_NODE_FADE_START_ZOOM = ENGINEERING_NODE_FADE_START_ZOOM;\nexport const MECHANICAL_NODE_FULL_OPACITY_ZOOM = ENGINEERING_NODE_FULL_OPACITY_ZOOM;\nexport const MECHANICAL_NODE_INTERACTIVE_ZOOM = ENGINEERING_NODE_INTERACTIVE_ZOOM;\n")
text = re.sub(
    r"export function updateMechanicalVisibility\(svg: SVGSVGElement, zoom: number\): void \{.*?\n\}\n\nexport function updatePlacementPreview",
    "export function updateMechanicalVisibility(svg: SVGSVGElement, zoom: number): void {\n  applyEngineeringNodeVisibility(svg.querySelector<SVGGElement>('.ws-map-mechanical-layer'), zoom);\n}\n\nexport function updatePlacementPreview",
    text,
    flags=re.S,
)
write(path, text)

# Camera easing helper used by manual wheel zoom.
path = 'src/map/camera/mapCamera.ts'
text = read(path)
needle = "export function wheelZoomAfterDelta(zoom: number, deltaPixels: number): number {\n  return clamp(zoom * Math.exp(-deltaPixels * wheelSensitivityForZoom(zoom)), MAP_MIN_ZOOM, MAP_MAX_ZOOM);\n}\n"
replacement = needle + """

export const WHEEL_CAMERA_RESPONSE_PER_SECOND = 20;

/** Frame-rate-independent camera easing; zoom interpolates logarithmically. */
export function approachCamera(
  current: MapCameraState,
  target: MapCameraState,
  elapsedMs: number,
  responsePerSecond = WHEEL_CAMERA_RESPONSE_PER_SECOND,
): MapCameraState {
  const seconds = clamp(elapsedMs, 0, 100) / 1000;
  const alpha = 1 - Math.exp(-Math.max(0, responsePerSecond) * seconds);
  if (alpha <= 0) return { ...current };
  if (alpha >= 0.999999) return { ...target };
  return {
    centerX: current.centerX + (target.centerX - current.centerX) * alpha,
    centerY: current.centerY + (target.centerY - current.centerY) * alpha,
    zoom: Math.exp(Math.log(current.zoom) + (Math.log(target.zoom) - Math.log(current.zoom)) * alpha),
  };
}
"""
if needle not in text:
    raise SystemExit('mapCamera wheelZoomAfterDelta block not found')
write(path, text.replace(needle, replacement, 1))

# Map renderer: remove text LOD public API, smooth wheel movement internally, publish only settled camera state.
path = 'src/map/mapRenderer.ts'
text = read(path)
text = text.replace(
    "  MAP_MAX_ZOOM, MAP_MIN_ZOOM, MECHANICAL_PLACEMENT_MIN_ZOOM, camerasEqual, clamp, clampCamera, formatZoomFactor,\n  normalizeWheelDelta, smoothStep, visibleWorldSize, wheelSensitivityForZoom, wheelZoomAfterDelta,\n",
    "  MAP_MAX_ZOOM, MAP_MIN_ZOOM, MECHANICAL_PLACEMENT_MIN_ZOOM, approachCamera, camerasEqual, clamp, clampCamera, formatZoomFactor,\n  normalizeWheelDelta, smoothStep, visibleWorldSize, wheelSensitivityForZoom, wheelZoomAfterDelta,\n",
)
text = text.replace(
    "  renderResourceLayer, resourceDetailsVisibleAtPixelHeight, updateResourceVisibility,\n  RESOURCE_NODE_DETAIL_MIN_TEXT_PIXELS, RESOURCE_NODE_FADE_START_ZOOM, RESOURCE_NODE_FULL_OPACITY_ZOOM, RESOURCE_NODE_INTERACTIVE_ZOOM,\n",
    "  renderResourceLayer, updateResourceVisibility,\n  RESOURCE_NODE_FADE_START_ZOOM, RESOURCE_NODE_FULL_OPACITY_ZOOM, RESOURCE_NODE_INTERACTIVE_ZOOM,\n",
)
text = text.replace(
    "  MAP_MAX_ZOOM, MAP_MIN_ZOOM, RESOURCE_NODE_DETAIL_MIN_TEXT_PIXELS, RESOURCE_NODE_FADE_START_ZOOM, RESOURCE_NODE_FULL_OPACITY_ZOOM,\n",
    "  MAP_MAX_ZOOM, MAP_MIN_ZOOM, RESOURCE_NODE_FADE_START_ZOOM, RESOURCE_NODE_FULL_OPACITY_ZOOM,\n",
)
text = text.replace(
    "  WHEEL_GEOGRAPHIC_SENSITIVITY, resourceDetailsVisibleAtPixelHeight, wheelSensitivityForZoom, wheelZoomAfterDelta,\n",
    "  WHEEL_GEOGRAPHIC_SENSITIVITY, wheelSensitivityForZoom, wheelZoomAfterDelta,\n",
)
old_block = re.search(
    r"  let renderedPlanet: Planet \| null = null;.*?  const refreshPreview = \(state: Readonly<AppState>\): void => \{.*?\};\n",
    text,
    flags=re.S,
)
if not old_block:
    raise SystemExit('mapRenderer camera state block not found')
new_block = """  let renderedPlanet: Planet | null = null;
  let renderedGraph: GraphState | null = null;
  let displayCamera: MapCameraState = { centerX: 0, centerY: 0, zoom: 1 };
  let navigationAnimationFrame: number | null = null;
  let wheelAnimationFrame: number | null = null;
  let wheelTargetCamera: MapCameraState | null = null;
  let wheelLastFrameAt: number | null = null;
  let internalCameraUpdate = false;
  let pointerId: number | null = null; let panStartClient = { x: 0, y: 0 }; let panStartCamera = displayCamera; let draggedNodeId: string | null = null; let dragStartNode: Point | null = null; let hoverWorld: Point | null = null; let suppressClick = false;

  const applyCamera = (camera: MapCameraState): void => {
    const planet = store.getState().world?.planet; if (!planet) return; displayCamera = clampCamera(svg, planet, camera); const visible = visibleWorldSize(svg, planet, displayCamera.zoom);
    svg.setAttribute('viewBox', `${displayCamera.centerX - visible.width / 2} ${displayCamera.centerY - visible.height / 2} ${visible.width} ${visible.height}`);
    if (zoomLabel) { zoomLabel.textContent = formatZoomFactor(displayCamera.zoom); zoomLabel.title = `Approx. visible map width: ${formatPhysicalDistance(worldUnitsToMeters(visible.width))}`; }
    updateZoomVisibility(svg, displayCamera.zoom);
  };
  const publishCamera = (camera: MapCameraState): void => {
    internalCameraUpdate = true;
    store.setCamera(camera);
    internalCameraUpdate = false;
  };
  const cancelNavigationAnimation = (): void => {
    if (navigationAnimationFrame !== null) cancelAnimationFrame(navigationAnimationFrame);
    navigationAnimationFrame = null;
  };
  const cancelWheelAnimation = (publishCurrent = false): void => {
    if (wheelAnimationFrame !== null) cancelAnimationFrame(wheelAnimationFrame);
    wheelAnimationFrame = null;
    wheelTargetCamera = null;
    wheelLastFrameAt = null;
    if (publishCurrent) publishCamera(displayCamera);
  };
  const commitCamera = (camera: MapCameraState): void => {
    const planet = store.getState().world?.planet; if (!planet) return;
    cancelNavigationAnimation(); cancelWheelAnimation(false);
    const next = clampCamera(svg, planet, camera); applyCamera(next); publishCamera(next);
  };
  const animateToCamera = (target: MapCameraState): void => {
    const planet = store.getState().world?.planet; if (!planet) return;
    cancelWheelAnimation(false); cancelNavigationAnimation();
    const next = clampCamera(svg, planet, target); if (camerasEqual(displayCamera, next)) { applyCamera(next); return; }
    const start = { ...displayCamera }; const started = performance.now(); const ratio = Math.max(start.zoom, next.zoom) / Math.max(MAP_MIN_ZOOM, Math.min(start.zoom, next.zoom)); const duration = clamp(320 + Math.log2(Math.max(1, ratio)) * 65, 320, 1600);
    const step = (now: number): void => { const progress = clamp((now - started) / duration, 0, 1); const eased = smoothStep(progress); const zoom = Math.exp(Math.log(start.zoom) + (Math.log(next.zoom) - Math.log(start.zoom)) * eased); applyCamera({ centerX: start.centerX + (next.centerX - start.centerX) * eased, centerY: start.centerY + (next.centerY - start.centerY) * eased, zoom }); if (progress < 1) navigationAnimationFrame = requestAnimationFrame(step); else navigationAnimationFrame = null; };
    navigationAnimationFrame = requestAnimationFrame(step);
  };
  const stepWheelCamera = (now: number): void => {
    if (!wheelTargetCamera) { wheelAnimationFrame = null; wheelLastFrameAt = null; return; }
    const elapsedMs = wheelLastFrameAt == null ? 16.67 : now - wheelLastFrameAt;
    wheelLastFrameAt = now;
    const next = approachCamera(displayCamera, wheelTargetCamera, elapsedMs);
    applyCamera(next);
    if (camerasEqual(next, wheelTargetCamera)) {
      const settled = wheelTargetCamera;
      wheelAnimationFrame = null; wheelTargetCamera = null; wheelLastFrameAt = null;
      applyCamera(settled); publishCamera(settled);
      return;
    }
    wheelAnimationFrame = requestAnimationFrame(stepWheelCamera);
  };
  const queueWheelCamera = (target: MapCameraState): void => {
    const planet = store.getState().world?.planet; if (!planet) return;
    cancelNavigationAnimation();
    wheelTargetCamera = clampCamera(svg, planet, target);
    if (wheelAnimationFrame === null) {
      wheelLastFrameAt = performance.now();
      wheelAnimationFrame = requestAnimationFrame(stepWheelCamera);
    }
  };
  const refreshPreview = (state: Readonly<AppState>): void => { const definition = state.interaction.placementDefinitionId ? apparatusDefinitionById(state.interaction.placementDefinitionId) : null; updatePlacementPreview(svg, definition, hoverWorld); };
"""
text = text[:old_block.start()] + new_block + text[old_block.end():]
old_wheel = re.search(r"  svg\.addEventListener\('wheel', event => \{.*?  \}, \{ passive: false \}\);", text, flags=re.S)
if not old_wheel:
    raise SystemExit('mapRenderer wheel listener not found')
new_wheel = """  svg.addEventListener('wheel', event => {
    const planet = store.getState().world?.planet; if (!planet) return; event.preventDefault(); const rect = svg.getBoundingClientRect(); if (rect.width <= 0 || rect.height <= 0) return;
    const currentVisible = visibleWorldSize(svg, planet, displayCamera.zoom); const nx = clamp((event.clientX - rect.left) / rect.width, 0, 1); const ny = clamp((event.clientY - rect.top) / rect.height, 0, 1); const worldX = displayCamera.centerX + (nx - 0.5) * currentVisible.width; const worldY = displayCamera.centerY + (ny - 0.5) * currentVisible.height;
    const zoomBase = wheelTargetCamera?.zoom ?? displayCamera.zoom;
    const zoom = wheelZoomAfterDelta(zoomBase, normalizeWheelDelta(event, rect.height)); const nextVisible = visibleWorldSize(svg, planet, zoom);
    queueWheelCamera({ centerX: worldX - (nx - 0.5) * nextVisible.width, centerY: worldY - (ny - 0.5) * nextVisible.height, zoom });
  }, { passive: false });"""
text = text[:old_wheel.start()] + new_wheel + text[old_wheel.end():]
text = text.replace(
    "  svg.addEventListener('pointerdown', event => {\n    if (event.button !== 0) return; const state = store.getState();",
    "  svg.addEventListener('pointerdown', event => {\n    if (event.button !== 0) return; cancelWheelAnimation(true); cancelNavigationAnimation(); const state = store.getState();",
)
text = text.replace(
    "    commitCamera({ centerX: panStartCamera.centerX - dx * (visible.width / rect.width), centerY: panStartCamera.centerY - dy * (visible.height / rect.height), zoom: panStartCamera.zoom });\n",
    "    applyCamera({ centerX: panStartCamera.centerX - dx * (visible.width / rect.width), centerY: panStartCamera.centerY - dy * (visible.height / rect.height), zoom: panStartCamera.zoom });\n",
)
old_finish = "  const finishPointer = (event: PointerEvent): void => { if (pointerId !== event.pointerId) return; if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId); pointerId = null; draggedNodeId = null; dragStartNode = null; if (suppressClick) window.setTimeout(() => { suppressClick = false; }, 0); };"
new_finish = "  const finishPointer = (event: PointerEvent): void => { if (pointerId !== event.pointerId) return; const wasPanning = suppressClick && !draggedNodeId; if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId); pointerId = null; draggedNodeId = null; dragStartNode = null; if (wasPanning) publishCamera(displayCamera); if (suppressClick) window.setTimeout(() => { suppressClick = false; }, 0); };"
if old_finish not in text:
    raise SystemExit('finishPointer block not found')
text = text.replace(old_finish, new_finish, 1)
write(path, text)

# NAV: camera-only store updates no longer rebuild the hierarchy DOM.
path = 'src/ui/navigationPanel.ts'
text = read(path)
text = text.replace(
    "  store.subscribe(render);\n}\n",
    "  let lastWorld = store.getState().world;\n  let lastSelection = selectionKey(store.getState().selection);\n  store.subscribe(state => {\n    const nextSelection = selectionKey(state.selection);\n    if (state.world === lastWorld && nextSelection === lastSelection) return;\n    lastWorld = state.world; lastSelection = nextSelection; render();\n  });\n  render();\n}\n",
)
write(path, text)

# NODE status: only update when its visible message can actually change.
path = 'src/ui/nodeCatalogPanel.ts'
text = read(path)
old = """  search.addEventListener('input', render);
  store.subscribe(state => {
    const placement = state.interaction.placementDefinitionId;
    const pending = state.interaction.pendingConnection;
"""
new = """  search.addEventListener('input', render);
  let lastStatusKey = '';
  store.subscribe(state => {
    const placement = state.interaction.placementDefinitionId;
    const pending = state.interaction.pendingConnection;
    const scaleState = placement ? (state.camera.zoom < MECHANICAL_PLACEMENT_MIN_ZOOM ? 'far' : 'ready') : '';
    const statusKey = `${placement ?? ''}|${pending?.nodeId ?? ''}:${pending?.portId ?? ''}|${state.interaction.notice ?? ''}|${scaleState}`;
    if (statusKey === lastStatusKey) return;
    lastStatusKey = statusKey;
"""
if old not in text:
    raise SystemExit('nodeCatalog subscribe block not found')
write(path, text.replace(old, new, 1))

# Inspector: camera-only updates do not tear down and rebuild its DOM.
path = 'src/ui/inspectorPanel.ts'
text = read(path)
old = """  store.subscribe(state => {
    container.replaceChildren(); const planet = state.world?.planet; if (!planet) { container.textContent = 'Generate a world to inspect it.'; return; }
    const selection = state.selection;
"""
new = """  let lastWorld = store.getState().world;
  let lastGraph = store.getState().graph;
  let lastSelectionKey = '';
  store.subscribe(state => {
    const selectionKey = state.selection.type === 'planet'
      ? 'planet'
      : state.selection.type === 'region' ? `region:${state.selection.regionId}`
        : state.selection.type === 'resource' ? `resource:${state.selection.resourceNodeId}`
          : `mechanical:${state.selection.mechanicalNodeId}`;
    if (state.world === lastWorld && state.graph === lastGraph && selectionKey === lastSelectionKey) return;
    lastWorld = state.world; lastGraph = state.graph; lastSelectionKey = selectionKey;
    container.replaceChildren(); const planet = state.world?.planet; if (!planet) { container.textContent = 'Generate a world to inspect it.'; return; }
    const selection = state.selection;
"""
if old not in text:
    raise SystemExit('inspector subscribe block not found')
write(path, text.replace(old, new, 1))

# DEBUG keeps its original 250 ms sampler instead of rendering on every camera store update.
replace_once(
    'src/ui/debugPanel.ts',
    """  store.subscribe(state => {
    latestState = state;
    if (!drawer.hidden) render();
  });
""",
    """  store.subscribe(state => {
    latestState = state;
  });
""",
)

# Camera-driven opacity is already continuous; remove CSS transitions that were retargeted on every wheel frame.
path = 'map.css'
text = read(path)
text = text.replace(".ws-map-resource-node-layer,\n.ws-map-region-label-layer {\n  transition: opacity 90ms linear;\n}\n\n", "")
text = text.replace(".ws-map-mechanical-layer { transition: opacity 90ms linear; }\n", "")
write(path, text)

# Update the established camera tests: text remains part of the node for the full visible lifetime.
path = 'tests/mapCameraState.test.js'
text = read(path)
text = text.replace("  RESOURCE_NODE_DETAIL_MIN_TEXT_PIXELS,\n", "")
text = text.replace("  resourceDetailsVisibleAtPixelHeight,\n", "")
text = re.sub(
    r"\ntest\('resource text detail is hidden before it becomes large enough to render cleanly'.*?\n\}\);\n",
    "\n",
    text,
    flags=re.S,
)
write(path, text)

write('tests/mapRenderingSmoothness.test.js', """import assert from 'node:assert/strict';
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
""")
