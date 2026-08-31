import { apparatusDefinitionById } from '../apparatus/definitions.js';
import { connectPorts, moveMechanicalNode, placeMechanicalNode, removeMechanicalNode } from '../graph/graphCommands.js';
import { mechanicalNodeById, portForEndpoint } from '../graph/graphQueries.js';
import type { GraphState, PortEndpoint } from '../graph/types.js';
import type { AppState, AppStore } from '../state/appState.js';
import { polygonCentroid } from '../world/geometry.js';
import { formatPhysicalDistance, worldUnitsToMeters } from '../world/scale.js';
import type { MapCameraState, MapSelection, Planet, Point } from '../world/types.js';
import {
  MAP_MAX_ZOOM, MAP_MIN_ZOOM, MECHANICAL_PLACEMENT_MIN_ZOOM, approachCamera, camerasEqual, clamp, clampCamera, formatZoomFactor,
  normalizeWheelDelta, smoothStep, visibleWorldSize, wheelSensitivityForZoom, wheelZoomAfterDelta,
  WHEEL_ENGINEERING_BLEND_END_ZOOM, WHEEL_ENGINEERING_BLEND_START_ZOOM, WHEEL_ENGINEERING_SENSITIVITY, WHEEL_GEOGRAPHIC_SENSITIVITY,
} from './camera/mapCamera.js';
import { renderMechanicalLayer, updateMechanicalVisibility, updatePlacementPreview } from './rendering/mechanicalRenderer.js';
import {
  renderResourceLayer, updateResourceVisibility,
  RESOURCE_NODE_FADE_START_ZOOM, RESOURCE_NODE_FULL_OPACITY_ZOOM, RESOURCE_NODE_INTERACTIVE_ZOOM,
  RESOURCE_NODE_PHYSICAL_HEIGHT_METERS, RESOURCE_NODE_PHYSICAL_WIDTH_METERS, RESOURCE_NODE_WORLD_HEIGHT, RESOURCE_NODE_WORLD_WIDTH,
} from './rendering/resourceRenderer.js';

export {
  MAP_MAX_ZOOM, MAP_MIN_ZOOM, RESOURCE_NODE_FADE_START_ZOOM, RESOURCE_NODE_FULL_OPACITY_ZOOM,
  RESOURCE_NODE_INTERACTIVE_ZOOM, RESOURCE_NODE_PHYSICAL_HEIGHT_METERS, RESOURCE_NODE_PHYSICAL_WIDTH_METERS, RESOURCE_NODE_WORLD_HEIGHT,
  RESOURCE_NODE_WORLD_WIDTH, WHEEL_ENGINEERING_BLEND_END_ZOOM, WHEEL_ENGINEERING_BLEND_START_ZOOM, WHEEL_ENGINEERING_SENSITIVITY,
  WHEEL_GEOGRAPHIC_SENSITIVITY, wheelSensitivityForZoom, wheelZoomAfterDelta,
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const REGION_LABEL_FADE_START_ZOOM = 3.5;
const REGION_LABEL_FADE_END_ZOOM = 6.5;

function svgElement<K extends keyof SVGElementTagNameMap>(tagName: K): SVGElementTagNameMap[K] { return document.createElementNS(SVG_NS, tagName); }

function screenToWorld(svg: SVGSVGElement, planet: Planet, camera: MapCameraState, clientX: number, clientY: number): Point {
  const rect = svg.getBoundingClientRect(); const visible = visibleWorldSize(svg, planet, camera.zoom);
  const nx = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1); const ny = clamp((clientY - rect.top) / Math.max(1, rect.height), 0, 1);
  return { x: camera.centerX + (nx - 0.5) * visible.width, y: camera.centerY + (ny - 0.5) * visible.height };
}

function selectionMatches(element: Element, selection: MapSelection): boolean {
  const kind = element.getAttribute('data-map-kind');
  if (selection.type === 'planet') return kind === 'planet';
  if (selection.type === 'region') return kind === 'region' && element.getAttribute('data-region-id') === selection.regionId;
  if (selection.type === 'resource') return kind === 'resource' && element.getAttribute('data-resource-id') === selection.resourceNodeId;
  return kind === 'mechanical' && element.getAttribute('data-mechanical-id') === selection.mechanicalNodeId;
}

function renderWorld(svg: SVGSVGElement, planet: Planet, graph: GraphState, store: AppStore): void {
  svg.replaceChildren(); svg.setAttribute('preserveAspectRatio', 'none');
  const background = svgElement('rect'); background.setAttribute('x', '0'); background.setAttribute('y', '0'); background.setAttribute('width', String(planet.width)); background.setAttribute('height', String(planet.height)); background.setAttribute('class', 'ws-map-background'); background.setAttribute('data-map-kind', 'planet');
  background.addEventListener('click', () => store.setSelection({ type: 'planet' })); svg.appendChild(background);
  const regions = svgElement('g'); regions.setAttribute('class', 'ws-map-region-layer'); const labels = svgElement('g'); labels.setAttribute('class', 'ws-map-region-label-layer');
  planet.regions.forEach((region, index) => {
    const polygon = svgElement('polygon'); polygon.setAttribute('points', region.polygon.map(point => `${point.x},${point.y}`).join(' ')); polygon.setAttribute('class', `ws-map-region ws-map-region--${index % 5}`); polygon.setAttribute('data-map-kind', 'region'); polygon.setAttribute('data-region-id', region.id);
    polygon.addEventListener('click', event => { event.stopPropagation(); store.setSelection({ type: 'region', regionId: region.id }); }); regions.appendChild(polygon);
    const centroid = polygonCentroid(region.polygon); const label = svgElement('text'); label.setAttribute('x', centroid.x.toFixed(2)); label.setAttribute('y', centroid.y.toFixed(2)); label.setAttribute('class', 'ws-map-region-label'); label.textContent = region.name; labels.appendChild(label);
  });
  svg.append(regions, labels, renderResourceLayer(planet, resourceId => store.setSelection({ type: 'resource', resourceNodeId: resourceId })), renderMechanicalLayer(planet, graph, nodeId => store.setSelection({ type: 'mechanical', mechanicalNodeId: nodeId })));
}

function updateSelection(svg: SVGSVGElement, selection: MapSelection): void {
  for (const element of svg.querySelectorAll<SVGElement>('[data-map-kind]')) element.classList.toggle('ws-map-selected', selectionMatches(element, selection));
}

function updatePendingPort(svg: SVGSVGElement, endpoint: PortEndpoint | null): void {
  for (const port of svg.querySelectorAll<SVGElement>('[data-node-id][data-port-id]')) {
    port.classList.toggle('ws-map-port--pending', Boolean(endpoint && port.getAttribute('data-node-id') === endpoint.nodeId && port.getAttribute('data-port-id') === endpoint.portId));
  }
}

function updateZoomVisibility(svg: SVGSVGElement, zoom: number): void {
  updateResourceVisibility(svg, zoom); updateMechanicalVisibility(svg, zoom);
  const labels = svg.querySelector<SVGGElement>('.ws-map-region-label-layer');
  if (labels) { const progress = (zoom - REGION_LABEL_FADE_START_ZOOM) / (REGION_LABEL_FADE_END_ZOOM - REGION_LABEL_FADE_START_ZOOM); labels.style.opacity = (1 - smoothStep(progress)).toFixed(3); labels.style.visibility = zoom >= REGION_LABEL_FADE_END_ZOOM ? 'hidden' : 'visible'; }
  const rect = svg.getBoundingClientRect(); const viewBox = svg.viewBox.baseVal; const unitsPerPixel = rect.width > 0 && viewBox.width > 0 ? viewBox.width / rect.width : 1;
  for (const label of svg.querySelectorAll<SVGTextElement>('.ws-map-region-label')) label.setAttribute('font-size', String(Math.max(14, unitsPerPixel * 16)));
}

export function installMapRenderer(root: HTMLElement, store: AppStore): void {
  const svg = root.querySelector<SVGSVGElement>('#ws-map-svg'); const canvas = root.querySelector<HTMLElement>('#ws-map-canvas'); const zoomLabel = root.querySelector<HTMLElement>('[data-zoom-label]'); if (!svg) return; canvas?.replaceChildren();
  let renderedPlanet: Planet | null = null;
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

  store.subscribe(state => {
    const planet = state.world?.planet; if (!planet) return;
    if (renderedPlanet !== planet || renderedGraph !== state.graph) { renderedPlanet = planet; renderedGraph = state.graph; renderWorld(svg, planet, state.graph, store); applyCamera(displayCamera.zoom === 1 && displayCamera.centerX === 0 ? state.camera : displayCamera); }
    else if (!internalCameraUpdate && !camerasEqual(displayCamera, state.camera)) animateToCamera(state.camera);
    updateSelection(svg, state.selection); updatePendingPort(svg, state.interaction.pendingConnection); refreshPreview(state);
  });

  svg.addEventListener('click', event => {
    if (suppressClick) { event.preventDefault(); event.stopPropagation(); return; }
    const state = store.getState(); const planet = state.world?.planet; if (!planet) return;
    const target = event.target as Element; const portElement = target.closest<SVGElement>('[data-node-id][data-port-id]');
    if (portElement) {
      event.preventDefault(); event.stopPropagation();
      const endpoint = { nodeId: portElement.getAttribute('data-node-id') ?? '', portId: portElement.getAttribute('data-port-id') ?? '' }; const port = portForEndpoint(planet, state.graph, endpoint); if (!port) return;
      const pending = state.interaction.pendingConnection;
      if (!pending) { store.setPendingConnection(endpoint); store.setInteractionNotice('Select a compatible target port.'); return; }
      const pendingPort = portForEndpoint(planet, state.graph, pending); if (!pendingPort) { store.clearInteraction(); return; }
      try { store.setGraph(connectPorts(state.graph, pending, pendingPort, endpoint, port)); store.clearInteraction(); }
      catch (error) { store.setPendingConnection(null); store.setInteractionNotice(error instanceof Error ? error.message : 'Connection failed.'); }
      return;
    }
    if (state.interaction.placementDefinitionId) {
      event.preventDefault(); event.stopPropagation();
      if (displayCamera.zoom < MECHANICAL_PLACEMENT_MIN_ZOOM) { store.setInteractionNotice(`Zoom to at least ${MECHANICAL_PLACEMENT_MIN_ZOOM.toLocaleString()}× before placing machinery.`); return; }
      const definition = apparatusDefinitionById(state.interaction.placementDefinitionId); if (!definition) { store.clearInteraction(); return; }
      const point = screenToWorld(svg, planet, displayCamera, (event as MouseEvent).clientX, (event as MouseEvent).clientY); const result = placeMechanicalNode(state.graph, definition, point); store.setGraph(result.graph); store.clearInteraction(); store.setSelection({ type: 'mechanical', mechanicalNodeId: result.node.id });
      return;
    }
    if (state.interaction.pendingConnection) { store.clearInteraction(); event.stopPropagation(); }
  }, true);

  svg.addEventListener('wheel', event => {
    const planet = store.getState().world?.planet; if (!planet) return; event.preventDefault(); const rect = svg.getBoundingClientRect(); if (rect.width <= 0 || rect.height <= 0) return;
    const currentVisible = visibleWorldSize(svg, planet, displayCamera.zoom); const nx = clamp((event.clientX - rect.left) / rect.width, 0, 1); const ny = clamp((event.clientY - rect.top) / rect.height, 0, 1); const worldX = displayCamera.centerX + (nx - 0.5) * currentVisible.width; const worldY = displayCamera.centerY + (ny - 0.5) * currentVisible.height;
    const zoomBase = wheelTargetCamera?.zoom ?? displayCamera.zoom;
    const zoom = wheelZoomAfterDelta(zoomBase, normalizeWheelDelta(event, rect.height)); const nextVisible = visibleWorldSize(svg, planet, zoom);
    queueWheelCamera({ centerX: worldX - (nx - 0.5) * nextVisible.width, centerY: worldY - (ny - 0.5) * nextVisible.height, zoom });
  }, { passive: false });

  svg.addEventListener('pointerdown', event => {
    if (event.button !== 0) return; cancelWheelAnimation(true); cancelNavigationAnimation(); const state = store.getState(); const target = event.target as Element; if (target.closest('[data-port-id]')) return;
    pointerId = event.pointerId; panStartClient = { x: event.clientX, y: event.clientY }; panStartCamera = { ...displayCamera }; suppressClick = false; draggedNodeId = null; dragStartNode = null;
    const mechanical = target.closest<SVGGElement>('[data-mechanical-id]');
    if (mechanical && !state.interaction.placementDefinitionId) { const id = mechanical.getAttribute('data-mechanical-id'); const node = id ? mechanicalNodeById(state.graph, id) : null; if (id && node) { draggedNodeId = id; dragStartNode = { ...node.position }; store.setSelection({ type: 'mechanical', mechanicalNodeId: id }); } }
    svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener('pointermove', event => {
    const planet = store.getState().world?.planet; if (!planet) return; hoverWorld = screenToWorld(svg, planet, displayCamera, event.clientX, event.clientY); refreshPreview(store.getState());
    if (pointerId !== event.pointerId) return; const rect = svg.getBoundingClientRect(); if (rect.width <= 0 || rect.height <= 0) return; const dx = event.clientX - panStartClient.x; const dy = event.clientY - panStartClient.y; if (Math.hypot(dx, dy) > 4) suppressClick = true;
    const visible = visibleWorldSize(svg, planet, panStartCamera.zoom);
    if (draggedNodeId && dragStartNode) { const graph = store.getState().graph; store.setGraph(moveMechanicalNode(graph, draggedNodeId, { x: dragStartNode.x + dx * (visible.width / rect.width), y: dragStartNode.y + dy * (visible.height / rect.height) })); return; }
    applyCamera({ centerX: panStartCamera.centerX - dx * (visible.width / rect.width), centerY: panStartCamera.centerY - dy * (visible.height / rect.height), zoom: panStartCamera.zoom });
  });
  const finishPointer = (event: PointerEvent): void => { if (pointerId !== event.pointerId) return; const wasPanning = suppressClick && !draggedNodeId; if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId); pointerId = null; draggedNodeId = null; dragStartNode = null; if (wasPanning) publishCamera(displayCamera); if (suppressClick) window.setTimeout(() => { suppressClick = false; }, 0); };
  svg.addEventListener('pointerup', finishPointer); svg.addEventListener('pointercancel', finishPointer); svg.addEventListener('pointerleave', () => { hoverWorld = null; refreshPreview(store.getState()); });

  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') { store.clearInteraction(); hoverWorld = null; refreshPreview(store.getState()); }
    if ((event.key === 'Delete' || event.key === 'Backspace') && store.getState().selection.type === 'mechanical' && !['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement | null)?.tagName ?? '')) {
      const selected = store.getState().selection; if (selected.type === 'mechanical') { store.setGraph(removeMechanicalNode(store.getState().graph, selected.mechanicalNodeId)); store.setSelection({ type: 'planet' }); }
    }
  });

  root.querySelector<HTMLButtonElement>('[data-viewport="in"]')?.addEventListener('click', () => commitCamera({ ...displayCamera, zoom: displayCamera.zoom * 2 }));
  root.querySelector<HTMLButtonElement>('[data-viewport="out"]')?.addEventListener('click', () => commitCamera({ ...displayCamera, zoom: displayCamera.zoom / 2 }));
  root.querySelector<HTMLButtonElement>('[data-viewport="fit"]')?.addEventListener('click', () => { const planet = store.getState().world?.planet; if (planet) commitCamera({ centerX: planet.width / 2, centerY: planet.height / 2, zoom: 1 }); });
  root.querySelector<HTMLButtonElement>('[data-viewport="center"]')?.addEventListener('click', () => { const planet = store.getState().world?.planet; if (planet) commitCamera({ centerX: planet.width / 2, centerY: planet.height / 2, zoom: displayCamera.zoom }); });
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => applyCamera(displayCamera)) : null; resizeObserver?.observe(svg); if (!resizeObserver) window.addEventListener('resize', () => applyCamera(displayCamera));
}
