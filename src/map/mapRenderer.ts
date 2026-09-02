import { apparatusDefinitionById } from '../apparatus/definitions.js';
import { connectPorts, moveMechanicalNode, placeMechanicalNode, removeMechanicalNode } from '../graph/graphCommands.js';
import { mechanicalNodeById, portForEndpoint } from '../graph/graphQueries.js';
import type { GraphState, PortEndpoint } from '../graph/types.js';
import type { AppState, AppStore, GraphInteractionState } from '../state/appState.js';
import { formatPhysicalDistance, worldUnitsToMeters } from '../world/scale.js';
import { createWorldSpatialIndex, type WorldSpatialIndex } from '../world/spatialIndex.js';
import type { Bounds, MapCameraState, MapSelection, Planet, Point, Region, ResourceNode, WorldState } from '../world/types.js';
import { cameraForAnchor, worldPointAtNormalizedScreen, type CameraAnchor } from './camera/cameraAnchor.js';
import {
  MAP_MAX_ZOOM, MAP_MIN_ZOOM, MECHANICAL_PLACEMENT_MIN_ZOOM, approachZoom, camerasEqual, clamp, clampCamera, formatZoomFactor,
  normalizeWheelDelta, smoothStep, visibleWorldSize, wheelSensitivityForZoom, wheelZoomAfterDelta,
  WHEEL_ENGINEERING_BLEND_END_ZOOM, WHEEL_ENGINEERING_BLEND_START_ZOOM, WHEEL_ENGINEERING_SENSITIVITY, WHEEL_GEOGRAPHIC_SENSITIVITY,
} from './camera/mapCamera.js';
import { renderMechanicalLayer, updateMechanicalVisibility, updatePlacementPreview } from './rendering/mechanicalRenderer.js';
import {
  renderResourceLayer, updateResourceRuntimePresentation, updateResourceVisibility,
  RESOURCE_NODE_FADE_START_ZOOM, RESOURCE_NODE_FULL_OPACITY_ZOOM, RESOURCE_NODE_HIDE_ZOOM, RESOURCE_NODE_INTERACTIVE_ZOOM,
  RESOURCE_NODE_PHYSICAL_HEIGHT_METERS, RESOURCE_NODE_PHYSICAL_WIDTH_METERS, RESOURCE_NODE_SHOW_ZOOM, RESOURCE_NODE_WORLD_HEIGHT, RESOURCE_NODE_WORLD_WIDTH,
} from './rendering/resourceRenderer.js';
import {
  initialRenderOrigin, renderOriginForCamera, sameRenderOrigin, worldToRenderPoint,
  type RenderOriginState,
} from './rendering/renderOrigin.js';

export {
  MAP_MAX_ZOOM, MAP_MIN_ZOOM, RESOURCE_NODE_FADE_START_ZOOM, RESOURCE_NODE_FULL_OPACITY_ZOOM, RESOURCE_NODE_HIDE_ZOOM,
  RESOURCE_NODE_INTERACTIVE_ZOOM, RESOURCE_NODE_PHYSICAL_HEIGHT_METERS, RESOURCE_NODE_PHYSICAL_WIDTH_METERS, RESOURCE_NODE_SHOW_ZOOM,
  RESOURCE_NODE_WORLD_HEIGHT, RESOURCE_NODE_WORLD_WIDTH, WHEEL_ENGINEERING_BLEND_END_ZOOM, WHEEL_ENGINEERING_BLEND_START_ZOOM,
  WHEEL_ENGINEERING_SENSITIVITY, WHEEL_GEOGRAPHIC_SENSITIVITY, wheelSensitivityForZoom, wheelZoomAfterDelta,
};

export const REGION_INTERACTION_MAX_ZOOM = 10;
export const REGION_RENDER_MIN_ZOOM = 3;
export const REGION_RENDER_MAX_ZOOM = 2 ** 14;
export const REGION_LABEL_MIN_ZOOM = 7;
export const REGION_LABEL_MAX_ZOOM = 512;
export const MAX_VISIBLE_REGION_LABELS = 48;

const SVG_NS = 'http://www.w3.org/2000/svg';

type PointerMode = 'pan' | 'node-drag' | null;

function svgElement<K extends keyof SVGElementTagNameMap>(tagName: K): SVGElementTagNameMap[K] { return document.createElementNS(SVG_NS, tagName); }

function screenToWorld(svg: SVGSVGElement, planet: Planet, camera: MapCameraState, clientX: number, clientY: number): Point {
  const rect = svg.getBoundingClientRect();
  const visible = visibleWorldSize(svg, planet, camera.zoom);
  const screen = {
    x: clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1),
    y: clamp((clientY - rect.top) / Math.max(1, rect.height), 0, 1),
  };
  return worldPointAtNormalizedScreen(camera, visible, screen);
}

function selectionMatches(element: Element, selection: MapSelection): boolean {
  const kind = element.getAttribute('data-map-kind');
  if (selection.type === 'planet') return kind === 'planet';
  if (selection.type === 'region') return kind === 'region' && element.getAttribute('data-region-id') === selection.regionId;
  if (selection.type === 'resource') return kind === 'resource' && element.getAttribute('data-resource-id') === selection.resourceNodeId;
  return kind === 'mechanical' && element.getAttribute('data-mechanical-id') === selection.mechanicalNodeId;
}

function viewportBounds(svg: SVGSVGElement, planet: Planet, camera: MapCameraState, margin = 0): Bounds {
  const visible = visibleWorldSize(svg, planet, camera.zoom);
  return {
    x: camera.centerX - visible.width / 2 - margin,
    y: camera.centerY - visible.height / 2 - margin,
    width: visible.width + margin * 2,
    height: visible.height + margin * 2,
  };
}

function appendLandmassLayer(svg: SVGSVGElement, planet: Planet, renderOrigin: RenderOriginState): void {
  const layer = svgElement('g');
  layer.setAttribute('class', 'ws-map-landmass-layer');
  for (const landmass of planet.landmasses) {
    const polygon = svgElement('polygon');
    polygon.setAttribute('points', landmass.polygon.map(point => {
      const local = worldToRenderPoint(point, renderOrigin);
      return `${local.x},${local.y}`;
    }).join(' '));
    polygon.setAttribute('class', 'ws-map-landmass');
    polygon.setAttribute('data-landmass-id', landmass.id);
    layer.appendChild(polygon);
  }
  svg.appendChild(layer);
}

function regionElement(region: Region, renderOrigin: RenderOriginState, store: AppStore): SVGPolygonElement {
  const polygon = svgElement('polygon');
  polygon.setAttribute('points', region.polygon.map(point => {
    const local = worldToRenderPoint(point, renderOrigin);
    return `${local.x},${local.y}`;
  }).join(' '));
  const tone = Number(region.landmassId.split('-').at(-1) ?? 0) % 5;
  polygon.setAttribute('class', `ws-map-region ws-map-region--${tone}`);
  polygon.setAttribute('data-map-kind', 'region');
  polygon.setAttribute('data-region-id', region.id);
  polygon.setAttribute('data-landmass-id', region.landmassId);
  polygon.addEventListener('click', event => { event.stopPropagation(); store.setSelection({ type: 'region', regionId: region.id }); });
  return polygon;
}

function regionLabelElement(region: Region, renderOrigin: RenderOriginState): SVGTextElement {
  const center = worldToRenderPoint(region.center, renderOrigin);
  const label = svgElement('text');
  label.setAttribute('x', center.x.toFixed(6));
  label.setAttribute('y', center.y.toFixed(6));
  label.setAttribute('class', 'ws-map-region-label');
  label.textContent = region.name;
  return label;
}

function renderWorld(
  svg: SVGSVGElement,
  planet: Planet,
  graph: GraphState,
  store: AppStore,
  renderOrigin: RenderOriginState,
): void {
  svg.replaceChildren(); svg.setAttribute('preserveAspectRatio', 'none');
  const background = svgElement('rect');
  background.setAttribute('x', String(-renderOrigin.origin.x)); background.setAttribute('y', String(-renderOrigin.origin.y));
  background.setAttribute('width', String(planet.width)); background.setAttribute('height', String(planet.height));
  background.setAttribute('class', 'ws-map-background'); background.setAttribute('data-map-kind', 'planet');
  background.addEventListener('click', () => store.setSelection({ type: 'planet' })); svg.appendChild(background);

  appendLandmassLayer(svg, planet, renderOrigin);
  const regions = svgElement('g'); regions.setAttribute('class', 'ws-map-region-layer');
  const labels = svgElement('g'); labels.setAttribute('class', 'ws-map-region-label-layer');

  svg.append(
    regions,
    labels,
    renderResourceLayer(planet, renderOrigin, resourceId => store.setSelection({ type: 'resource', resourceNodeId: resourceId }), []),
    renderMechanicalLayer(planet, graph, renderOrigin, nodeId => store.setSelection({ type: 'mechanical', mechanicalNodeId: nodeId })),
  );
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
  const regions = svg.querySelector<SVGGElement>('.ws-map-region-layer');
  if (regions) regions.style.pointerEvents = zoom >= REGION_INTERACTION_MAX_ZOOM ? 'none' : 'auto';
  const landmasses = svg.querySelector<SVGGElement>('.ws-map-landmass-layer');
  if (landmasses) landmasses.style.visibility = zoom >= REGION_RENDER_MIN_ZOOM ? 'hidden' : 'visible';
  const rect = svg.getBoundingClientRect(); const viewBox = svg.viewBox.baseVal;
  const unitsPerPixel = rect.width > 0 && viewBox.width > 0 ? viewBox.width / rect.width : 1;
  for (const label of svg.querySelectorAll<SVGTextElement>('.ws-map-region-label')) label.setAttribute('font-size', String(Math.max(14, unitsPerPixel * 16)));
}

export function installMapRenderer(root: HTMLElement, store: AppStore): void {
  const svg = root.querySelector<SVGSVGElement>('#ws-map-svg');
  const canvas = root.querySelector<HTMLElement>('#ws-map-canvas');
  const zoomLabel = root.querySelector<HTMLElement>('[data-zoom-label]');
  if (!svg) return;
  canvas?.replaceChildren();

  let renderedPlanet: Planet | null = null;
  let renderedGraph: GraphState | null = null;
  let spatialIndex: WorldSpatialIndex | null = null;
  let geographicRenderSignature = '';
  let displayCamera: MapCameraState = { centerX: 0, centerY: 0, zoom: 1 };
  let renderOrigin = initialRenderOrigin();
  let navigationAnimationFrame: number | null = null;
  let wheelAnimationFrame: number | null = null;
  let wheelTargetCamera: MapCameraState | null = null;
  let wheelAnchor: CameraAnchor | null = null;
  let wheelLastFrameAt: number | null = null;
  let internalCameraUpdate = false;
  let pointerId: number | null = null;
  let pointerMode: PointerMode = null;
  let panStartClient = { x: 0, y: 0 };
  let panStartCamera = displayCamera;
  let draggedNodeId: string | null = null;
  let dragStartNode: Point | null = null;
  let hoverWorld: Point | null = null;
  let suppressClick = false;

  let observedWorld: WorldState | null = store.getState().world;
  let observedGraph: GraphState = store.getState().graph;
  let observedSelection: MapSelection = store.getState().selection;
  let observedCamera: MapCameraState = store.getState().camera;
  let observedInteraction: GraphInteractionState = store.getState().interaction;

  const refreshGeographicViewport = (planet: Planet, camera: MapCameraState): void => {
    if (!spatialIndex || spatialIndex.planet !== planet) spatialIndex = createWorldSpatialIndex(planet);
    const showRegions = camera.zoom >= REGION_RENDER_MIN_ZOOM && camera.zoom < REGION_RENDER_MAX_ZOOM;
    const bounds = viewportBounds(svg, planet, camera, showRegions ? spatialIndex.chunkSize : 2);
    const visibleRegions = showRegions ? spatialIndex.regionsIntersecting(bounds) : [];
    const showLabels = camera.zoom >= REGION_LABEL_MIN_ZOOM && camera.zoom < REGION_LABEL_MAX_ZOOM;
    const selection = store.getState().selection;
    const selectedRegionId = selection.type === 'region' ? selection.regionId : null;
    const labeledRegions = showLabels
      ? [...visibleRegions]
        .sort((left, right) => Number(right.id === selectedRegionId) - Number(left.id === selectedRegionId)
          || right.resourceNodeIds.length - left.resourceNodeIds.length
          || left.id.localeCompare(right.id))
        .slice(0, MAX_VISIBLE_REGION_LABELS)
      : [];
    const visibleResources: ResourceNode[] = camera.zoom >= RESOURCE_NODE_HIDE_ZOOM
      ? spatialIndex.resourceNodesIntersecting(viewportBounds(svg, planet, camera, 2))
      : [];
    const signature = [
      renderOrigin.origin.x, renderOrigin.origin.y,
      visibleRegions.map(region => region.id).join(','),
      labeledRegions.map(region => region.id).join(','),
      visibleResources.map(resource => resource.id).join(','),
    ].join('|');
    if (signature === geographicRenderSignature) return;
    geographicRenderSignature = signature;

    const regionLayer = svg.querySelector<SVGGElement>('.ws-map-region-layer');
    const labelLayer = svg.querySelector<SVGGElement>('.ws-map-region-label-layer');
    regionLayer?.replaceChildren(...visibleRegions.map(region => regionElement(region, renderOrigin, store)));
    labelLayer?.replaceChildren(...labeledRegions.map(region => regionLabelElement(region, renderOrigin)));
    const resourceLayer = svg.querySelector<SVGGElement>('.ws-map-resource-node-layer');
    resourceLayer?.replaceWith(renderResourceLayer(
      planet,
      renderOrigin,
      resourceId => store.setSelection({ type: 'resource', resourceNodeId: resourceId }),
      visibleResources,
    ));
    updateResourceRuntimePresentation(svg, planet, store.getState().runtime.snapshot);
    updateSelection(svg, store.getState().selection);
    updatePendingPort(svg, store.getState().interaction.pendingConnection);
  };

  const refreshPreview = (state: Readonly<AppState>): void => {
    const definition = state.interaction.placementDefinitionId ? apparatusDefinitionById(state.interaction.placementDefinitionId) : null;
    updatePlacementPreview(svg, definition, hoverWorld, renderOrigin);
  };

  const rerenderCurrentWorld = (): void => {
    const state = store.getState();
    const planet = state.world?.planet;
    if (!planet) return;
    renderedPlanet = planet; renderedGraph = state.graph;
    if (!spatialIndex || spatialIndex.planet !== planet) spatialIndex = createWorldSpatialIndex(planet);
    geographicRenderSignature = '';
    renderWorld(svg, planet, state.graph, store, renderOrigin);
    updateSelection(svg, state.selection);
    updatePendingPort(svg, state.interaction.pendingConnection);
    refreshPreview(state);
  };

  const prepareRenderOrigin = (
    camera: MapCameraState,
    options: { recenter?: boolean; allowDeactivate?: boolean } = {},
  ): void => {
    const next = renderOriginForCamera(renderOrigin, camera, options);
    if (sameRenderOrigin(renderOrigin, next)) return;
    renderOrigin = next;
    rerenderCurrentWorld();
  };

  const applyCamera = (camera: MapCameraState): void => {
    const planet = store.getState().world?.planet;
    if (!planet) return;
    displayCamera = clampCamera(svg, planet, camera);
    const visible = visibleWorldSize(svg, planet, displayCamera.zoom);
    const localCenterX = displayCamera.centerX - renderOrigin.origin.x;
    const localCenterY = displayCamera.centerY - renderOrigin.origin.y;
    svg.setAttribute('viewBox', `${localCenterX - visible.width / 2} ${localCenterY - visible.height / 2} ${visible.width} ${visible.height}`);
    if (zoomLabel) {
      zoomLabel.textContent = formatZoomFactor(displayCamera.zoom);
      zoomLabel.title = `Approx. visible map width: ${formatPhysicalDistance(worldUnitsToMeters(visible.width))}`;
    }
    refreshGeographicViewport(planet, displayCamera);
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
    wheelAnimationFrame = null; wheelTargetCamera = null; wheelAnchor = null; wheelLastFrameAt = null;
    if (publishCurrent) publishCamera(displayCamera);
  };

  const commitCamera = (camera: MapCameraState): void => {
    const planet = store.getState().world?.planet;
    if (!planet) return;
    cancelNavigationAnimation(); cancelWheelAnimation(false);
    const next = clampCamera(svg, planet, camera);
    prepareRenderOrigin(next, { recenter: true, allowDeactivate: true });
    applyCamera(next); publishCamera(next);
  };

  const animateToCamera = (target: MapCameraState): void => {
    const planet = store.getState().world?.planet;
    if (!planet) return;
    cancelWheelAnimation(false); cancelNavigationAnimation();
    const next = clampCamera(svg, planet, target);
    prepareRenderOrigin(next, { recenter: true, allowDeactivate: false });
    if (camerasEqual(displayCamera, next)) { applyCamera(next); prepareRenderOrigin(next, { allowDeactivate: true }); return; }
    const start = { ...displayCamera };
    const started = performance.now();
    const ratio = Math.max(start.zoom, next.zoom) / Math.max(MAP_MIN_ZOOM, Math.min(start.zoom, next.zoom));
    const duration = clamp(320 + Math.log2(Math.max(1, ratio)) * 65, 320, 1600);
    const step = (now: number): void => {
      const progress = clamp((now - started) / duration, 0, 1);
      const eased = smoothStep(progress);
      const zoom = Math.exp(Math.log(start.zoom) + (Math.log(next.zoom) - Math.log(start.zoom)) * eased);
      applyCamera({
        centerX: start.centerX + (next.centerX - start.centerX) * eased,
        centerY: start.centerY + (next.centerY - start.centerY) * eased,
        zoom,
      });
      if (progress < 1) navigationAnimationFrame = requestAnimationFrame(step);
      else {
        navigationAnimationFrame = null;
        prepareRenderOrigin(next, { allowDeactivate: true });
        applyCamera(next);
      }
    };
    navigationAnimationFrame = requestAnimationFrame(step);
  };

  const stepWheelCamera = (now: number): void => {
    const planet = store.getState().world?.planet;
    if (!planet || !wheelTargetCamera || !wheelAnchor) {
      wheelAnimationFrame = null; wheelLastFrameAt = null; return;
    }
    const elapsedMs = wheelLastFrameAt == null ? 16.67 : now - wheelLastFrameAt;
    wheelLastFrameAt = now;
    const nextZoom = approachZoom(displayCamera.zoom, wheelTargetCamera.zoom, elapsedMs);
    const nextVisible = visibleWorldSize(svg, planet, nextZoom);
    const anchored = cameraForAnchor(wheelAnchor, nextVisible, nextZoom);
    const next = clampCamera(svg, planet, anchored);
    applyCamera(next);
    if (camerasEqual(next, wheelTargetCamera)) {
      const settled = wheelTargetCamera;
      wheelAnimationFrame = null; wheelTargetCamera = null; wheelAnchor = null; wheelLastFrameAt = null;
      prepareRenderOrigin(settled, { allowDeactivate: true });
      applyCamera(settled); publishCamera(settled);
      return;
    }
    wheelAnimationFrame = requestAnimationFrame(stepWheelCamera);
  };

  const queueWheelCamera = (target: MapCameraState, anchor: CameraAnchor): void => {
    const planet = store.getState().world?.planet;
    if (!planet) return;
    cancelNavigationAnimation();
    if (!renderOrigin.active) prepareRenderOrigin(target, { recenter: false, allowDeactivate: false });
    wheelTargetCamera = clampCamera(svg, planet, target);
    wheelAnchor = anchor;
    if (wheelAnimationFrame === null) {
      wheelLastFrameAt = performance.now();
      wheelAnimationFrame = requestAnimationFrame(stepWheelCamera);
    }
  };

  store.subscribe(state => {
    const worldChanged = state.world !== observedWorld;
    const graphChanged = state.graph !== observedGraph;
    const selectionChanged = state.selection !== observedSelection;
    const cameraChanged = state.camera !== observedCamera;
    const interactionChanged = state.interaction !== observedInteraction;

    observedWorld = state.world;
    observedGraph = state.graph;
    observedSelection = state.selection;
    observedCamera = state.camera;
    observedInteraction = state.interaction;

    if (!worldChanged && !graphChanged && !selectionChanged && !cameraChanged && !interactionChanged) return;

    const planet = state.world?.planet;
    if (!planet) return;
    const worldNeedsRender = renderedPlanet !== planet || renderedGraph !== state.graph;
    if (worldNeedsRender) {
      renderedPlanet = planet; renderedGraph = state.graph;
      if (!spatialIndex || spatialIndex.planet !== planet) spatialIndex = createWorldSpatialIndex(planet);
      geographicRenderSignature = '';
      renderWorld(svg, planet, state.graph, store, renderOrigin);
      applyCamera(displayCamera.zoom === 1 && displayCamera.centerX === 0 ? state.camera : displayCamera);
    } else if (cameraChanged && !internalCameraUpdate && !camerasEqual(displayCamera, state.camera)) {
      animateToCamera(state.camera);
    }
    if (worldNeedsRender || selectionChanged) updateSelection(svg, state.selection);
    if (worldNeedsRender || interactionChanged) {
      updatePendingPort(svg, state.interaction.pendingConnection);
      refreshPreview(state);
    }
  });

  svg.addEventListener('click', event => {
    if (suppressClick) { event.preventDefault(); event.stopPropagation(); return; }
    const state = store.getState(); const planet = state.world?.planet; if (!planet) return;
    const target = event.target as Element; const portElement = target.closest<SVGElement>('[data-node-id][data-port-id]');
    if (portElement) {
      event.preventDefault(); event.stopPropagation();
      const endpoint = { nodeId: portElement.getAttribute('data-node-id') ?? '', portId: portElement.getAttribute('data-port-id') ?? '' };
      const port = portForEndpoint(planet, state.graph, endpoint); if (!port) return;
      const pending = state.interaction.pendingConnection;
      if (!pending) { store.setPendingConnection(endpoint); store.setInteractionNotice('Select a compatible target port.'); return; }
      const pendingPort = portForEndpoint(planet, state.graph, pending); if (!pendingPort) { store.clearInteraction(); return; }
      try { store.setGraph(connectPorts(state.graph, pending, pendingPort, endpoint, port)); store.clearInteraction(); }
      catch (error) { store.setPendingConnection(null); store.setInteractionNotice(error instanceof Error ? error.message : 'Connection failed.'); }
      return;
    }
    if (state.interaction.placementDefinitionId) {
      event.preventDefault(); event.stopPropagation();
      if (displayCamera.zoom < MECHANICAL_PLACEMENT_MIN_ZOOM) {
        store.setInteractionNotice(`Zoom to at least ${MECHANICAL_PLACEMENT_MIN_ZOOM.toLocaleString()}× before placing machinery.`); return;
      }
      const definition = apparatusDefinitionById(state.interaction.placementDefinitionId); if (!definition) { store.clearInteraction(); return; }
      const point = screenToWorld(svg, planet, displayCamera, (event as MouseEvent).clientX, (event as MouseEvent).clientY);
      const result = placeMechanicalNode(state.graph, definition, point);
      store.setGraph(result.graph); store.clearInteraction(); store.setSelection({ type: 'mechanical', mechanicalNodeId: result.node.id });
      return;
    }
    if (state.interaction.pendingConnection) { store.clearInteraction(); event.stopPropagation(); }
  }, true);

  svg.addEventListener('wheel', event => {
    const planet = store.getState().world?.planet;
    if (!planet) return;
    event.preventDefault();
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const screen = {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    };
    const currentVisible = visibleWorldSize(svg, planet, displayCamera.zoom);
    const anchor: CameraAnchor = { screen, world: worldPointAtNormalizedScreen(displayCamera, currentVisible, screen) };
    const zoomBase = wheelTargetCamera?.zoom ?? displayCamera.zoom;
    const zoom = wheelZoomAfterDelta(zoomBase, normalizeWheelDelta(event, rect.height));
    const nextVisible = visibleWorldSize(svg, planet, zoom);
    queueWheelCamera(cameraForAnchor(anchor, nextVisible, zoom), anchor);
  }, { passive: false });

  svg.addEventListener('pointerdown', event => {
    const state = store.getState();
    const target = event.target as Element;

    if (event.button === 1) {
      event.preventDefault();
      cancelWheelAnimation(true); cancelNavigationAnimation();
      pointerId = event.pointerId; pointerMode = 'pan';
      panStartClient = { x: event.clientX, y: event.clientY }; panStartCamera = { ...displayCamera };
      suppressClick = false; draggedNodeId = null; dragStartNode = null;
      svg.classList.add('ws-map-panning');
      svg.setPointerCapture(event.pointerId);
      return;
    }

    if (event.button !== 0 || target.closest('[data-port-id]')) return;
    const mechanical = target.closest<SVGGElement>('[data-mechanical-id]');
    if (!mechanical || state.interaction.placementDefinitionId) return;
    const id = mechanical.getAttribute('data-mechanical-id');
    const node = id ? mechanicalNodeById(state.graph, id) : null;
    if (!id || !node) return;

    cancelWheelAnimation(true); cancelNavigationAnimation();
    pointerId = event.pointerId; pointerMode = 'node-drag';
    panStartClient = { x: event.clientX, y: event.clientY }; panStartCamera = { ...displayCamera };
    suppressClick = false; draggedNodeId = id; dragStartNode = { ...node.position };
    store.setSelection({ type: 'mechanical', mechanicalNodeId: id });
    svg.setPointerCapture(event.pointerId);
  });

  svg.addEventListener('auxclick', event => {
    if (event.button === 1) event.preventDefault();
  });

  svg.addEventListener('pointermove', event => {
    const planet = store.getState().world?.planet;
    if (!planet) return;
    hoverWorld = screenToWorld(svg, planet, displayCamera, event.clientX, event.clientY); refreshPreview(store.getState());
    if (pointerId !== event.pointerId || !pointerMode) return;
    const rect = svg.getBoundingClientRect(); if (rect.width <= 0 || rect.height <= 0) return;
    const dx = event.clientX - panStartClient.x; const dy = event.clientY - panStartClient.y;
    if (Math.hypot(dx, dy) > 4) suppressClick = true;
    const visible = visibleWorldSize(svg, planet, panStartCamera.zoom);
    if (pointerMode === 'node-drag' && draggedNodeId && dragStartNode) {
      const graph = store.getState().graph;
      store.setGraph(moveMechanicalNode(graph, draggedNodeId, {
        x: dragStartNode.x + dx * (visible.width / rect.width),
        y: dragStartNode.y + dy * (visible.height / rect.height),
      }));
      return;
    }
    if (pointerMode === 'pan') {
      applyCamera({
        centerX: panStartCamera.centerX - dx * (visible.width / rect.width),
        centerY: panStartCamera.centerY - dy * (visible.height / rect.height),
        zoom: panStartCamera.zoom,
      });
    }
  });

  const finishPointer = (event: PointerEvent): void => {
    if (pointerId !== event.pointerId) return;
    const wasPanning = pointerMode === 'pan';
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    pointerId = null; pointerMode = null; draggedNodeId = null; dragStartNode = null;
    svg.classList.remove('ws-map-panning');
    if (wasPanning) {
      prepareRenderOrigin(displayCamera, { recenter: true, allowDeactivate: true });
      applyCamera(displayCamera); publishCamera(displayCamera);
    }
    if (suppressClick) window.setTimeout(() => { suppressClick = false; }, 0);
  };
  svg.addEventListener('pointerup', finishPointer);
  svg.addEventListener('pointercancel', finishPointer);
  svg.addEventListener('pointerleave', () => { hoverWorld = null; refreshPreview(store.getState()); });

  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') { store.clearInteraction(); hoverWorld = null; refreshPreview(store.getState()); }
    if ((event.key === 'Delete' || event.key === 'Backspace') && store.getState().selection.type === 'mechanical' && !['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement | null)?.tagName ?? '')) {
      const selected = store.getState().selection;
      if (selected.type === 'mechanical') {
        store.setGraph(removeMechanicalNode(store.getState().graph, selected.mechanicalNodeId)); store.setSelection({ type: 'planet' });
      }
    }
  });

  root.querySelector<HTMLButtonElement>('[data-viewport="in"]')?.addEventListener('click', () => commitCamera({ ...displayCamera, zoom: displayCamera.zoom * 2 }));
  root.querySelector<HTMLButtonElement>('[data-viewport="out"]')?.addEventListener('click', () => commitCamera({ ...displayCamera, zoom: displayCamera.zoom / 2 }));
  root.querySelector<HTMLButtonElement>('[data-viewport="fit"]')?.addEventListener('click', () => {
    const planet = store.getState().world?.planet; if (planet) commitCamera({ centerX: planet.width / 2, centerY: planet.height / 2, zoom: 1 });
  });
  root.querySelector<HTMLButtonElement>('[data-viewport="center"]')?.addEventListener('click', () => {
    const planet = store.getState().world?.planet; if (planet) commitCamera({ centerX: planet.width / 2, centerY: planet.height / 2, zoom: displayCamera.zoom });
  });
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => applyCamera(displayCamera)) : null;
  resizeObserver?.observe(svg);
  if (!resizeObserver) window.addEventListener('resize', () => applyCamera(displayCamera));
}
