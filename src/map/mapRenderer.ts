import type { AppStore } from '../state/appState.js';
import { polygonCentroid } from '../world/geometry.js';
import { resourceDefinitionById } from '../world/resources.js';
import { formatPhysicalDistance, metersToWorldUnits, worldUnitsToMeters } from '../world/scale.js';
import type { MapCameraState, MapSelection, Planet, ResourceNode } from '../world/types.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const MAP_MIN_ZOOM = 1;
export const MAP_MAX_ZOOM = 2 ** 24; // 16,777,216×; ~2.39 m visible across a 2:1 viewport.
export const RESOURCE_NODE_FADE_START_ZOOM = 2 ** 16;
export const RESOURCE_NODE_INTERACTIVE_ZOOM = 2 ** 17;
export const RESOURCE_NODE_FULL_OPACITY_ZOOM = 2 ** 17;
export const RESOURCE_NODE_DETAIL_MIN_TEXT_PIXELS = 5.75;
export const WHEEL_GEOGRAPHIC_SENSITIVITY = 0.0015;
export const WHEEL_ENGINEERING_SENSITIVITY = 0.00035;
export const WHEEL_ENGINEERING_BLEND_START_ZOOM = 2 ** 14;
export const WHEEL_ENGINEERING_BLEND_END_ZOOM = 2 ** 18;
export const RESOURCE_NODE_PHYSICAL_WIDTH_METERS = 20;
export const RESOURCE_NODE_PHYSICAL_HEIGHT_METERS = 12.5;
export const RESOURCE_NODE_WORLD_WIDTH = metersToWorldUnits(RESOURCE_NODE_PHYSICAL_WIDTH_METERS);
export const RESOURCE_NODE_WORLD_HEIGHT = metersToWorldUnits(RESOURCE_NODE_PHYSICAL_HEIGHT_METERS);

const REGION_LABEL_FADE_START_ZOOM = 3.5;
const REGION_LABEL_FADE_END_ZOOM = 6.5;
const RESOURCE_NODE_HEADER_HEIGHT = metersToWorldUnits(2.8);
const RESOURCE_NODE_PORT_RADIUS = metersToWorldUnits(0.9);
const RESOURCE_NODE_CORNER_RADIUS = metersToWorldUnits(0.45);
const RESOURCE_NODE_BODY_STROKE = metersToWorldUnits(0.18);
const RESOURCE_NODE_DIVIDER_STROKE = metersToWorldUnits(0.13);
const RESOURCE_NODE_PORT_STROKE = metersToWorldUnits(0.22);
const RESOURCE_NODE_CATEGORY_FONT_SIZE = metersToWorldUnits(0.95);
const RESOURCE_NODE_BODY_FONT_SIZE = metersToWorldUnits(1.05);

interface VisibleWorldSize {
  width: number;
  height: number;
}

function createSvgElement<K extends keyof SVGElementTagNameMap>(tagName: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tagName);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothStep(value: number): number {
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

function camerasEqual(left: MapCameraState, right: MapCameraState): boolean {
  const positionTolerance = 1e-9;
  const zoomTolerance = Math.max(1e-9, Math.max(Math.abs(left.zoom), Math.abs(right.zoom)) * 1e-10);
  return Math.abs(left.centerX - right.centerX) < positionTolerance
    && Math.abs(left.centerY - right.centerY) < positionTolerance
    && Math.abs(left.zoom - right.zoom) < zoomTolerance;
}

function formatZoomFactor(zoom: number): string {
  if (zoom < 10) return `${Math.round(zoom * 100)}%`;
  if (zoom < 1000) return `${Math.round(zoom)}×`;
  if (zoom < 1_000_000) {
    const thousands = zoom / 1000;
    return `${thousands >= 100 ? thousands.toFixed(0) : thousands.toFixed(1)}K×`;
  }
  const millions = zoom / 1_000_000;
  return `${millions >= 10 ? millions.toFixed(1) : millions.toFixed(2)}M×`;
}

function visibleWorldSize(svg: SVGSVGElement, planet: Planet, zoom: number): VisibleWorldSize {
  const rect = svg.getBoundingClientRect();
  const viewportAspect = rect.width > 0 && rect.height > 0
    ? rect.width / rect.height
    : planet.width / planet.height;
  const planetAspect = planet.width / planet.height;

  let fitWidth = planet.width;
  let fitHeight = planet.height;
  if (viewportAspect > planetAspect) fitWidth = planet.height * viewportAspect;
  else fitHeight = planet.width / viewportAspect;

  return { width: fitWidth / zoom, height: fitHeight / zoom };
}

function clampCamera(svg: SVGSVGElement, planet: Planet, camera: MapCameraState): MapCameraState {
  const zoom = clamp(camera.zoom, MAP_MIN_ZOOM, MAP_MAX_ZOOM);
  const visible = visibleWorldSize(svg, planet, zoom);

  const centerX = visible.width >= planet.width
    ? planet.width / 2
    : clamp(camera.centerX, visible.width / 2, planet.width - visible.width / 2);
  const centerY = visible.height >= planet.height
    ? planet.height / 2
    : clamp(camera.centerY, visible.height / 2, planet.height - visible.height / 2);

  return { centerX, centerY, zoom };
}

function selectionMatches(element: Element, selection: MapSelection): boolean {
  const kind = element.getAttribute('data-map-kind');
  if (selection.type === 'planet') return kind === 'planet';
  if (selection.type === 'region') return kind === 'region' && element.getAttribute('data-region-id') === selection.regionId;
  return kind === 'resource' && element.getAttribute('data-resource-id') === selection.resourceNodeId;
}

function appendText(
  group: SVGGElement,
  className: string,
  x: number,
  y: number,
  value: string,
  fontSize: number,
): void {
  const text = createSvgElement('text');
  text.setAttribute('x', String(x));
  text.setAttribute('y', String(y));
  text.setAttribute('font-size', String(fontSize));
  text.setAttribute('class', className);
  text.textContent = value;
  group.appendChild(text);
}

/**
 * Resource nodes are deliberately authored in world units. They do not counter-scale
 * against the camera, so a deposit is microscopic at planet scale and only becomes
 * readable when the player reaches local/engineering scale.
 */
function appendResourceCard(group: SVGGElement, resource: ResourceNode): void {
  const halfWidth = RESOURCE_NODE_WORLD_WIDTH / 2;
  const halfHeight = RESOURCE_NODE_WORLD_HEIGHT / 2;
  const headerBottom = -halfHeight + RESOURCE_NODE_HEADER_HEIGHT;

  const body = createSvgElement('rect');
  body.setAttribute('x', String(-halfWidth));
  body.setAttribute('y', String(-halfHeight));
  body.setAttribute('width', String(RESOURCE_NODE_WORLD_WIDTH));
  body.setAttribute('height', String(RESOURCE_NODE_WORLD_HEIGHT));
  body.setAttribute('rx', String(RESOURCE_NODE_CORNER_RADIUS));
  body.setAttribute('stroke-width', String(RESOURCE_NODE_BODY_STROKE));
  body.setAttribute('class', 'ws-map-resource-card-body');
  group.appendChild(body);

  const header = createSvgElement('path');
  header.setAttribute('d', [
    `M ${-halfWidth + RESOURCE_NODE_CORNER_RADIUS} ${-halfHeight}`,
    `H ${halfWidth - RESOURCE_NODE_CORNER_RADIUS}`,
    `Q ${halfWidth} ${-halfHeight} ${halfWidth} ${-halfHeight + RESOURCE_NODE_CORNER_RADIUS}`,
    `V ${headerBottom}`,
    `H ${-halfWidth}`,
    `V ${-halfHeight + RESOURCE_NODE_CORNER_RADIUS}`,
    `Q ${-halfWidth} ${-halfHeight} ${-halfWidth + RESOURCE_NODE_CORNER_RADIUS} ${-halfHeight}`,
    'Z',
  ].join(' '));
  header.setAttribute('class', 'ws-map-resource-card-header');
  group.appendChild(header);

  const divider = createSvgElement('line');
  divider.setAttribute('x1', String(-halfWidth));
  divider.setAttribute('x2', String(halfWidth));
  divider.setAttribute('y1', String(headerBottom));
  divider.setAttribute('y2', String(headerBottom));
  divider.setAttribute('stroke-width', String(RESOURCE_NODE_DIVIDER_STROKE));
  divider.setAttribute('class', 'ws-map-resource-card-divider');
  group.appendChild(divider);

  const details = createSvgElement('g');
  details.setAttribute('class', 'ws-map-resource-details');
  group.appendChild(details);

  appendText(
    details,
    'ws-map-resource-category',
    -halfWidth + metersToWorldUnits(0.9),
    -halfHeight + metersToWorldUnits(1.9),
    'FEATURE',
    RESOURCE_NODE_CATEGORY_FONT_SIZE,
  );

  const definition = resourceDefinitionById(resource.resourceId);
  appendText(details, 'ws-map-resource-name', 0, metersToWorldUnits(-0.8), resource.name, RESOURCE_NODE_BODY_FONT_SIZE);
  appendText(details, 'ws-map-resource-type', 0, metersToWorldUnits(1.45), 'Mineral Deposit', RESOURCE_NODE_BODY_FONT_SIZE);
  appendText(details, 'ws-map-resource-material', 0, metersToWorldUnits(3.7), definition?.name ?? resource.resourceId, RESOURCE_NODE_BODY_FONT_SIZE);

  const port = createSvgElement('circle');
  port.setAttribute('cx', String(halfWidth));
  port.setAttribute('cy', '0');
  port.setAttribute('r', String(RESOURCE_NODE_PORT_RADIUS));
  port.setAttribute('stroke-width', String(RESOURCE_NODE_PORT_STROKE));
  port.setAttribute('class', 'ws-map-resource-port');
  port.setAttribute('data-node-id', resource.id);
  port.setAttribute('data-port-id', resource.resourceAccessPortId);
  port.setAttribute('data-port-kind', 'resource-access');
  port.setAttribute('data-port-direction', 'output');
  const title = createSvgElement('title');
  title.textContent = resource.ports.find(candidate => candidate.id === resource.resourceAccessPortId)?.label ?? 'resources';
  port.appendChild(title);
  details.appendChild(port);
}

function renderWorld(svg: SVGSVGElement, planet: Planet, store: AppStore, shouldSuppressClick: () => boolean): void {
  svg.replaceChildren();
  svg.setAttribute('preserveAspectRatio', 'none');

  const background = createSvgElement('rect');
  background.setAttribute('x', '0');
  background.setAttribute('y', '0');
  background.setAttribute('width', String(planet.width));
  background.setAttribute('height', String(planet.height));
  background.setAttribute('class', 'ws-map-background');
  background.setAttribute('data-map-kind', 'planet');
  background.addEventListener('click', () => {
    if (!shouldSuppressClick()) store.setSelection({ type: 'planet' });
  });
  svg.appendChild(background);

  const regionLayer = createSvgElement('g');
  regionLayer.setAttribute('class', 'ws-map-region-layer');
  const labelLayer = createSvgElement('g');
  labelLayer.setAttribute('class', 'ws-map-region-label-layer');
  const resourceLayer = createSvgElement('g');
  resourceLayer.setAttribute('class', 'ws-map-resource-node-layer');

  planet.regions.forEach((region, index) => {
    const polygon = createSvgElement('polygon');
    polygon.setAttribute('points', region.polygon.map(point => `${point.x},${point.y}`).join(' '));
    polygon.setAttribute('class', `ws-map-region ws-map-region--${index % 5}`);
    polygon.setAttribute('data-map-kind', 'region');
    polygon.setAttribute('data-region-id', region.id);
    polygon.addEventListener('click', event => {
      event.stopPropagation();
      if (!shouldSuppressClick()) store.setSelection({ type: 'region', regionId: region.id });
    });
    regionLayer.appendChild(polygon);

    const centroid = polygonCentroid(region.polygon);
    const label = createSvgElement('text');
    label.setAttribute('x', centroid.x.toFixed(2));
    label.setAttribute('y', centroid.y.toFixed(2));
    label.setAttribute('class', 'ws-map-region-label');
    label.textContent = region.name;
    labelLayer.appendChild(label);
  });

  for (const resource of planet.resourceNodes) {
    const node = createSvgElement('g');
    node.setAttribute('transform', `translate(${resource.position.x} ${resource.position.y})`);
    node.setAttribute('class', 'ws-map-resource-node');
    node.setAttribute('data-map-kind', 'resource');
    node.setAttribute('data-resource-id', resource.id);
    node.setAttribute('data-region-id', resource.regionId);
    node.addEventListener('click', event => {
      event.stopPropagation();
      if (!shouldSuppressClick()) store.setSelection({ type: 'resource', resourceNodeId: resource.id });
    });
    appendResourceCard(node, resource);
    resourceLayer.appendChild(node);
  }

  svg.append(regionLayer, labelLayer, resourceLayer);
}

function updateSelection(svg: SVGSVGElement, selection: MapSelection): void {
  for (const element of svg.querySelectorAll<SVGElement>('[data-map-kind], [data-region-id], [data-resource-id]')) {
    element.classList.toggle('ws-map-selected', selectionMatches(element, selection));
  }
}

function updateZoomVisibility(svg: SVGSVGElement, zoom: number): void {
  const resources = svg.querySelector<SVGGElement>('.ws-map-resource-node-layer');
  const regionLabels = svg.querySelector<SVGGElement>('.ws-map-region-label-layer');

  if (resources) {
    const revealProgress = (zoom - RESOURCE_NODE_FADE_START_ZOOM)
      / (RESOURCE_NODE_FULL_OPACITY_ZOOM - RESOURCE_NODE_FADE_START_ZOOM);
    const opacity = smoothStep(revealProgress);
    resources.style.opacity = opacity.toFixed(3);
    resources.style.visibility = zoom <= RESOURCE_NODE_FADE_START_ZOOM ? 'hidden' : 'visible';
    resources.style.pointerEvents = zoom >= RESOURCE_NODE_INTERACTIVE_ZOOM ? 'auto' : 'none';
  }

  if (regionLabels) {
    const fadeProgress = (zoom - REGION_LABEL_FADE_START_ZOOM)
      / (REGION_LABEL_FADE_END_ZOOM - REGION_LABEL_FADE_START_ZOOM);
    const opacity = 1 - smoothStep(fadeProgress);
    regionLabels.style.opacity = opacity.toFixed(3);
    regionLabels.style.visibility = zoom >= REGION_LABEL_FADE_END_ZOOM ? 'hidden' : 'visible';
  }

  const rect = svg.getBoundingClientRect();
  const viewBox = svg.viewBox.baseVal;
  const worldUnitsPerPixel = rect.width > 0 && viewBox.width > 0 ? viewBox.width / rect.width : 1;
  const resourceTextPixelHeight = worldUnitsPerPixel > 0 ? RESOURCE_NODE_BODY_FONT_SIZE / worldUnitsPerPixel : 0;
  const resourceDetailsVisible = resourceDetailsVisibleAtPixelHeight(resourceTextPixelHeight);
  for (const details of svg.querySelectorAll<SVGGElement>('.ws-map-resource-details')) {
    details.style.opacity = resourceDetailsVisible ? '1' : '0';
    details.style.visibility = resourceDetailsVisible ? 'visible' : 'hidden';
    details.style.pointerEvents = resourceDetailsVisible ? 'auto' : 'none';
  }

  for (const label of svg.querySelectorAll<SVGTextElement>('.ws-map-region-label')) {
    label.setAttribute('font-size', String(Math.max(14, worldUnitsPerPixel * 16)));
  }
}

export function installMapRenderer(root: HTMLElement, store: AppStore): void {
  const svg = root.querySelector<SVGSVGElement>('#ws-map-svg');
  const canvas = root.querySelector<HTMLElement>('#ws-map-canvas');
  const zoomLabel = root.querySelector<HTMLElement>('[data-zoom-label]');
  if (!svg) return;
  if (canvas) canvas.replaceChildren();

  let renderedPlanet: Planet | null = null;
  let displayCamera: MapCameraState = { centerX: 0, centerY: 0, zoom: 1 };
  let animationFrame: number | null = null;
  let internalCameraUpdate = false;
  let suppressClick = false;
  let dragPointerId: number | null = null;
  let dragStartClient = { x: 0, y: 0 };
  let dragStartCamera = displayCamera;

  const applyCamera = (camera: MapCameraState): void => {
    const planet = store.getState().world?.planet;
    if (!planet) return;
    displayCamera = clampCamera(svg, planet, camera);
    const visible = visibleWorldSize(svg, planet, displayCamera.zoom);
    svg.setAttribute('viewBox', [
      displayCamera.centerX - visible.width / 2,
      displayCamera.centerY - visible.height / 2,
      visible.width,
      visible.height,
    ].join(' '));
    if (zoomLabel) {
      zoomLabel.textContent = formatZoomFactor(displayCamera.zoom);
      zoomLabel.title = `Approx. visible map width: ${formatPhysicalDistance(worldUnitsToMeters(visible.width))}`;
    }
    updateZoomVisibility(svg, displayCamera.zoom);
  };

  const commitInteractiveCamera = (camera: MapCameraState): void => {
    const planet = store.getState().world?.planet;
    if (!planet) return;
    const clamped = clampCamera(svg, planet, camera);
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
    applyCamera(clamped);
    internalCameraUpdate = true;
    store.setCamera(clamped);
    internalCameraUpdate = false;
  };

  const animateToCamera = (target: MapCameraState): void => {
    const planet = store.getState().world?.planet;
    if (!planet) return;
    const clampedTarget = clampCamera(svg, planet, target);
    if (camerasEqual(displayCamera, clampedTarget)) {
      applyCamera(clampedTarget);
      return;
    }

    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    const start = { ...displayCamera };
    const startedAt = performance.now();
    const zoomRatio = Math.max(start.zoom, clampedTarget.zoom) / Math.max(MAP_MIN_ZOOM, Math.min(start.zoom, clampedTarget.zoom));
    const duration = clamp(320 + Math.log2(Math.max(1, zoomRatio)) * 65, 320, 1600);

    const step = (now: number): void => {
      const progress = clamp((now - startedAt) / duration, 0, 1);
      const eased = smoothStep(progress);
      const zoom = Math.exp(
        Math.log(start.zoom) + (Math.log(clampedTarget.zoom) - Math.log(start.zoom)) * eased,
      );
      applyCamera({
        centerX: start.centerX + (clampedTarget.centerX - start.centerX) * eased,
        centerY: start.centerY + (clampedTarget.centerY - start.centerY) * eased,
        zoom,
      });
      if (progress < 1) animationFrame = requestAnimationFrame(step);
      else animationFrame = null;
    };

    animationFrame = requestAnimationFrame(step);
  };

  const shouldSuppressClick = (): boolean => suppressClick;

  store.subscribe(state => {
    const planet = state.world?.planet;
    if (!planet) return;
    if (renderedPlanet !== planet) {
      renderedPlanet = planet;
      renderWorld(svg, planet, store, shouldSuppressClick);
      displayCamera = state.camera;
      applyCamera(state.camera);
    } else if (!internalCameraUpdate && !camerasEqual(displayCamera, state.camera)) {
      animateToCamera(state.camera);
    }
    updateSelection(svg, state.selection);
  });

  svg.addEventListener('wheel', event => {
    const planet = store.getState().world?.planet;
    if (!planet) return;
    event.preventDefault();
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const currentVisible = visibleWorldSize(svg, planet, displayCamera.zoom);
    const normalizedX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const normalizedY = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    const worldX = displayCamera.centerX + (normalizedX - 0.5) * currentVisible.width;
    const worldY = displayCamera.centerY + (normalizedY - 0.5) * currentVisible.height;
    const deltaPixels = normalizeWheelDelta(event, rect.height);
    const zoom = wheelZoomAfterDelta(displayCamera.zoom, deltaPixels);
    const nextVisible = visibleWorldSize(svg, planet, zoom);

    commitInteractiveCamera({
      centerX: worldX - (normalizedX - 0.5) * nextVisible.width,
      centerY: worldY - (normalizedY - 0.5) * nextVisible.height,
      zoom,
    });
  }, { passive: false });

  svg.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    dragPointerId = event.pointerId;
    dragStartClient = { x: event.clientX, y: event.clientY };
    dragStartCamera = { ...displayCamera };
    suppressClick = false;
    svg.setPointerCapture(event.pointerId);
  });

  svg.addEventListener('pointermove', event => {
    if (dragPointerId !== event.pointerId) return;
    const planet = store.getState().world?.planet;
    if (!planet) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const dx = event.clientX - dragStartClient.x;
    const dy = event.clientY - dragStartClient.y;
    if (Math.hypot(dx, dy) > 4) suppressClick = true;
    const visible = visibleWorldSize(svg, planet, dragStartCamera.zoom);
    commitInteractiveCamera({
      centerX: dragStartCamera.centerX - dx * (visible.width / rect.width),
      centerY: dragStartCamera.centerY - dy * (visible.height / rect.height),
      zoom: dragStartCamera.zoom,
    });
  });

  const finishDrag = (event: PointerEvent): void => {
    if (dragPointerId !== event.pointerId) return;
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    dragPointerId = null;
    if (suppressClick) window.setTimeout(() => { suppressClick = false; }, 0);
  };
  svg.addEventListener('pointerup', finishDrag);
  svg.addEventListener('pointercancel', finishDrag);

  root.querySelector<HTMLButtonElement>('[data-viewport="in"]')?.addEventListener('click', () => {
    commitInteractiveCamera({ ...displayCamera, zoom: displayCamera.zoom * 2 });
  });
  root.querySelector<HTMLButtonElement>('[data-viewport="out"]')?.addEventListener('click', () => {
    commitInteractiveCamera({ ...displayCamera, zoom: displayCamera.zoom / 2 });
  });
  root.querySelector<HTMLButtonElement>('[data-viewport="fit"]')?.addEventListener('click', () => {
    const planet = store.getState().world?.planet;
    if (!planet) return;
    commitInteractiveCamera({ centerX: planet.width / 2, centerY: planet.height / 2, zoom: 1 });
  });
  root.querySelector<HTMLButtonElement>('[data-viewport="center"]')?.addEventListener('click', () => {
    const planet = store.getState().world?.planet;
    if (!planet) return;
    commitInteractiveCamera({ centerX: planet.width / 2, centerY: planet.height / 2, zoom: displayCamera.zoom });
  });

  const resizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => applyCamera(displayCamera))
    : null;
  resizeObserver?.observe(svg);
  if (!resizeObserver) window.addEventListener('resize', () => applyCamera(displayCamera));
}
