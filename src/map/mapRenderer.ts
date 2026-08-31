import type { AppStore } from '../state/appState.js';
import { polygonCentroid } from '../world/geometry.js';
import { resourceDefinitionById } from '../world/resources.js';
import type { MapCameraState, MapSelection, Planet, ResourceNode } from '../world/types.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MIN_ZOOM = 1;
const MAX_ZOOM = 18;
const RESOURCE_NODE_ZOOM = 2.2;
const REGION_LABEL_HIDE_ZOOM = 4.5;
const RESOURCE_NODE_WIDTH_PX = 230;
const RESOURCE_NODE_HEIGHT_PX = 144;
const RESOURCE_NODE_SHELL_WIDTH_PX = 248;

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

function camerasEqual(left: MapCameraState, right: MapCameraState): boolean {
  return Math.abs(left.centerX - right.centerX) < 0.01
    && Math.abs(left.centerY - right.centerY) < 0.01
    && Math.abs(left.zoom - right.zoom) < 0.001;
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
  const zoom = clamp(camera.zoom, MIN_ZOOM, MAX_ZOOM);
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

function appendResourceCard(group: SVGGElement, resource: ResourceNode): void {
  const scaleGroup = createSvgElement('g');
  scaleGroup.setAttribute('class', 'ws-map-resource-node-scale');

  const foreignObject = createSvgElement('foreignObject');
  foreignObject.setAttribute('x', String(-RESOURCE_NODE_SHELL_WIDTH_PX / 2));
  foreignObject.setAttribute('y', String(-RESOURCE_NODE_HEIGHT_PX / 2));
  foreignObject.setAttribute('width', String(RESOURCE_NODE_SHELL_WIDTH_PX));
  foreignObject.setAttribute('height', String(RESOURCE_NODE_HEIGHT_PX));

  const shell = document.createElement('div');
  shell.className = 'ws-map-resource-shell';

  const card = document.createElement('div');
  card.className = 'ws-node ws-map-resource-card';
  card.style.width = `${RESOURCE_NODE_WIDTH_PX}px`;
  card.style.height = `${RESOURCE_NODE_HEIGHT_PX}px`;

  const category = document.createElement('div');
  category.className = 'ws-node-category ws-node-category--feature';
  category.textContent = 'FEATURE';

  const label = document.createElement('div');
  label.className = 'ws-node-label';
  const definition = resourceDefinitionById(resource.resourceId);
  for (const line of [resource.name, 'Mineral Deposit', definition?.name ?? resource.resourceId]) {
    const span = document.createElement('span');
    span.textContent = line;
    label.appendChild(span);
  }

  const port = document.createElement('div');
  port.className = 'ws-port ws-port--output ws-port--kind-resource-access ws-map-resource-port';
  port.title = resource.ports.find(candidate => candidate.id === resource.resourceAccessPortId)?.label ?? 'resources';
  port.dataset.nodeId = resource.id;
  port.dataset.portId = resource.resourceAccessPortId;
  port.dataset.portKind = 'resource-access';
  port.dataset.portDirection = 'output';

  card.append(category, label, port);
  shell.appendChild(card);
  foreignObject.appendChild(shell);
  scaleGroup.appendChild(foreignObject);
  group.appendChild(scaleGroup);
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
  if (resources) resources.style.display = zoom < RESOURCE_NODE_ZOOM ? 'none' : '';
  if (regionLabels) regionLabels.style.display = zoom >= REGION_LABEL_HIDE_ZOOM ? 'none' : '';

  const rect = svg.getBoundingClientRect();
  const viewBox = svg.viewBox.baseVal;
  const worldUnitsPerPixel = rect.width > 0 && viewBox.width > 0 ? viewBox.width / rect.width : 1;
  for (const scaleGroup of svg.querySelectorAll<SVGGElement>('.ws-map-resource-node-scale')) {
    scaleGroup.setAttribute('transform', `scale(${worldUnitsPerPixel})`);
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
    if (zoomLabel) zoomLabel.textContent = `${Math.round(displayCamera.zoom * 100)}%`;
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
    const duration = 280;

    const step = (now: number): void => {
      const progress = clamp((now - startedAt) / duration, 0, 1);
      const eased = 1 - (1 - progress) ** 3;
      applyCamera({
        centerX: start.centerX + (clampedTarget.centerX - start.centerX) * eased,
        centerY: start.centerY + (clampedTarget.centerY - start.centerY) * eased,
        zoom: start.zoom + (clampedTarget.zoom - start.zoom) * eased,
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
    const zoom = clamp(displayCamera.zoom * Math.exp(-event.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM);
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
    commitInteractiveCamera({ ...displayCamera, zoom: displayCamera.zoom * 1.4 });
  });
  root.querySelector<HTMLButtonElement>('[data-viewport="out"]')?.addEventListener('click', () => {
    commitInteractiveCamera({ ...displayCamera, zoom: displayCamera.zoom / 1.4 });
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
