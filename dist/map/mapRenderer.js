import { apparatusDefinitionById } from '../apparatus/definitions.js';
import { connectPorts, moveMechanicalNode, placeMechanicalNode, removeMechanicalNode } from '../graph/graphCommands.js';
import { mechanicalNodeById, portForEndpoint } from '../graph/graphQueries.js';
import { formatPhysicalDistance, worldUnitsToMeters } from '../world/scale.js';
import { worldSpatialIndexFor } from '../world/spatialIndex.js';
import { cameraForAnchor, worldPointAtNormalizedScreen } from './camera/cameraAnchor.js';
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM, MECHANICAL_PLACEMENT_MIN_ZOOM, approachZoom, camerasEqual, clamp, clampCamera, formatZoomFactor, normalizeWheelDelta, smoothStep, visibleWorldSize, wheelSensitivityForZoom, wheelZoomAfterDelta, WHEEL_ENGINEERING_BLEND_END_ZOOM, WHEEL_ENGINEERING_BLEND_START_ZOOM, WHEEL_ENGINEERING_SENSITIVITY, WHEEL_GEOGRAPHIC_SENSITIVITY, } from './camera/mapCamera.js';
import { renderMechanicalLayer, updateMechanicalVisibility, updatePlacementPreview } from './rendering/mechanicalRenderer.js';
import { renderResourceLayer, updateResourceRuntimePresentation, updateResourceVisibility, RESOURCE_NODE_FADE_START_ZOOM, RESOURCE_NODE_FULL_OPACITY_ZOOM, RESOURCE_NODE_HIDE_ZOOM, RESOURCE_NODE_INTERACTIVE_ZOOM, RESOURCE_NODE_PHYSICAL_HEIGHT_METERS, RESOURCE_NODE_PHYSICAL_WIDTH_METERS, RESOURCE_NODE_SHOW_ZOOM, RESOURCE_NODE_WORLD_HEIGHT, RESOURCE_NODE_WORLD_WIDTH, } from './rendering/resourceRenderer.js';
import { initialRenderOrigin, renderOriginForCamera, sameRenderOrigin, worldToRenderPoint, } from './rendering/renderOrigin.js';
export { MAP_MAX_ZOOM, MAP_MIN_ZOOM, RESOURCE_NODE_FADE_START_ZOOM, RESOURCE_NODE_FULL_OPACITY_ZOOM, RESOURCE_NODE_HIDE_ZOOM, RESOURCE_NODE_INTERACTIVE_ZOOM, RESOURCE_NODE_PHYSICAL_HEIGHT_METERS, RESOURCE_NODE_PHYSICAL_WIDTH_METERS, RESOURCE_NODE_SHOW_ZOOM, RESOURCE_NODE_WORLD_HEIGHT, RESOURCE_NODE_WORLD_WIDTH, WHEEL_ENGINEERING_BLEND_END_ZOOM, WHEEL_ENGINEERING_BLEND_START_ZOOM, WHEEL_ENGINEERING_SENSITIVITY, WHEEL_GEOGRAPHIC_SENSITIVITY, wheelSensitivityForZoom, wheelZoomAfterDelta, };
export const REGION_INTERACTION_MAX_ZOOM = 2 ** 9;
export const REGION_RENDER_MIN_ZOOM = 3;
export const REGION_RENDER_MAX_ZOOM = 2 ** 10;
export const REGION_LABEL_MIN_ZOOM = 2;
export const REGION_LABEL_MAX_ZOOM = 2 ** 10;
export const FEATURE_MARKER_SHOW_ZOOM = 2 ** 8;
export function regionsInteractiveAtZoom(zoom) { return zoom < REGION_INTERACTION_MAX_ZOOM; }
const SVG_NS = 'http://www.w3.org/2000/svg';
function svgElement(tagName) { return document.createElementNS(SVG_NS, tagName); }
function screenToWorld(svg, planet, camera, clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    const visible = visibleWorldSize(svg, planet, camera.zoom);
    const screen = {
        x: clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1),
        y: clamp((clientY - rect.top) / Math.max(1, rect.height), 0, 1),
    };
    return worldPointAtNormalizedScreen(camera, visible, screen);
}
function selectionMatches(element, selection) {
    const kind = element.getAttribute('data-map-kind');
    if (selection.type === 'planet')
        return kind === 'planet';
    if (selection.type === 'continent')
        return kind === 'continent' && element.getAttribute('data-continent-id') === selection.continentId;
    if (selection.type === 'ocean')
        return kind === 'ocean' && element.getAttribute('data-ocean-id') === selection.oceanId;
    if (selection.type === 'region')
        return kind === 'region' && element.getAttribute('data-region-id') === selection.regionId;
    if (selection.type === 'resource')
        return kind === 'resource' && element.getAttribute('data-resource-id') === selection.resourceNodeId;
    return selection.type === 'mechanical' && kind === 'mechanical' && element.getAttribute('data-mechanical-id') === selection.mechanicalNodeId;
}
function viewportBounds(svg, planet, camera, margin = 0) {
    const visible = visibleWorldSize(svg, planet, camera.zoom);
    return {
        x: camera.centerX - visible.width / 2 - margin,
        y: camera.centerY - visible.height / 2 - margin,
        width: visible.width + margin * 2,
        height: visible.height + margin * 2,
    };
}
function appendParentLayer(svg, parents, renderOrigin, store) {
    const layer = svgElement('g');
    const kind = parents[0]?.kind ?? 'continent';
    layer.setAttribute('class', `ws-map-${kind}-layer`);
    for (const parent of parents) {
        const path = svgElement('path');
        path.setAttribute('d', parent.polygons.map(points => points.map((point, index) => { const local = worldToRenderPoint(point, renderOrigin); return `${index === 0 ? 'M' : 'L'} ${local.x} ${local.y}`; }).join(' ') + ' Z').join(' '));
        path.setAttribute('fill-rule', 'evenodd');
        path.setAttribute('class', `ws-map-parent ws-map-${parent.kind}`);
        path.setAttribute('data-map-kind', parent.kind);
        path.setAttribute(`data-${parent.kind}-id`, parent.id);
        path.addEventListener('click', event => {
            event.stopPropagation();
            store.setSelection(parent.kind === 'continent' ? { type: 'continent', continentId: parent.id } : { type: 'ocean', oceanId: parent.id });
        });
        layer.appendChild(path);
    }
    svg.appendChild(layer);
}
function regionElement(region, renderOrigin, store) {
    const polygon = svgElement('polygon');
    polygon.setAttribute('points', region.polygon.map(point => {
        const local = worldToRenderPoint(point, renderOrigin);
        return `${local.x},${local.y}`;
    }).join(' '));
    const tone = Number(region.parentId.split('-').at(-1) ?? 0) % 5;
    polygon.setAttribute('class', `ws-map-region ws-map-region--${region.surfaceType} ws-map-region--${tone}`);
    polygon.setAttribute('data-map-kind', 'region');
    polygon.setAttribute('data-region-id', region.id);
    polygon.setAttribute('data-parent-id', region.parentId);
    polygon.addEventListener('click', event => { event.stopPropagation(); store.setSelection({ type: 'region', regionId: region.id }); });
    return polygon;
}
function regionLabelElement(region, renderOrigin, pixelSize) {
    const center = worldToRenderPoint(region.center, renderOrigin);
    const label = svgElement('text');
    label.setAttribute('x', center.x.toFixed(6));
    label.setAttribute('y', center.y.toFixed(6));
    label.setAttribute('class', 'ws-map-region-label');
    label.setAttribute('opacity', '0');
    label.setAttribute('data-label-px', pixelSize.toFixed(2));
    label.setAttribute('data-world-x', region.center.x.toFixed(6));
    label.setAttribute('data-world-y', region.center.y.toFixed(6));
    label.setAttribute('data-region-id', region.id);
    label.setAttribute('data-feature-count', String(region.resourceNodeIds.length));
    label.textContent = region.name;
    return label;
}
export function regionLabelBudgetForZoom(zoom) {
    if (zoom >= REGION_LABEL_MAX_ZOOM)
        return 0;
    const progress = Math.max(0, Math.min(1, Math.log2(Math.max(REGION_LABEL_MIN_ZOOM, zoom) / REGION_LABEL_MIN_ZOOM) / 8));
    return Math.round(16 + progress * 104);
}
export function regionLabelPixelSizeForZoom(zoom) {
    const progress = Math.max(0, Math.min(1, Math.log2(Math.max(1, zoom)) / 10));
    return 15 - progress * 5;
}
export function regionLabelOpacityAroundPointer(normalizedX, normalizedY, focusX, focusY) {
    const radius = Math.hypot((normalizedX - focusX) * 2, (normalizedY - focusY) * 2);
    if (radius >= 0.95)
        return 0;
    if (radius <= 0.45)
        return 1;
    return 1 - (radius - 0.45) / 0.5;
}
export function regionLabelOpacity(normalizedX, normalizedY) {
    return regionLabelOpacityAroundPointer(normalizedX, normalizedY, 0.5, 0.5);
}
export function regionLabelFocusPoint(hoverFocus) {
    return hoverFocus ? { x: hoverFocus.normalizedX, y: hoverFocus.normalizedY } : { x: 0.5, y: 0.5 };
}
export function featureMarkerWorldRadius(unitsPerPixel, desiredPixelRadius = 3) {
    return Math.max(0, unitsPerPixel) * desiredPixelRadius;
}
function featureMarkerLayer(resources, renderOrigin, store) {
    const layer = svgElement('g');
    layer.setAttribute('class', 'ws-map-feature-marker-layer');
    for (const resource of resources) {
        const local = worldToRenderPoint(resource.position, renderOrigin);
        const marker = svgElement('circle');
        marker.setAttribute('cx', String(local.x));
        marker.setAttribute('cy', String(local.y));
        marker.setAttribute('r', '1');
        marker.setAttribute('data-marker-radius-px', '3');
        marker.setAttribute('class', 'ws-map-feature-marker');
        marker.setAttribute('data-map-kind', 'resource');
        marker.setAttribute('data-resource-id', resource.id);
        marker.addEventListener('click', event => { event.stopPropagation(); store.setSelection({ type: 'resource', resourceNodeId: resource.id }); });
        layer.appendChild(marker);
    }
    return layer;
}
function renderWorld(svg, planet, graph, store, renderOrigin) {
    svg.replaceChildren();
    svg.setAttribute('preserveAspectRatio', 'none');
    const background = svgElement('rect');
    background.setAttribute('x', String(-renderOrigin.origin.x));
    background.setAttribute('y', String(-renderOrigin.origin.y));
    background.setAttribute('width', String(planet.width));
    background.setAttribute('height', String(planet.height));
    background.setAttribute('class', 'ws-map-background');
    background.setAttribute('data-map-kind', 'planet');
    background.addEventListener('click', () => store.setSelection({ type: 'planet' }));
    svg.appendChild(background);
    appendParentLayer(svg, planet.oceans, renderOrigin, store);
    appendParentLayer(svg, planet.continents, renderOrigin, store);
    const regions = svgElement('g');
    regions.setAttribute('class', 'ws-map-region-layer');
    const labels = svgElement('g');
    labels.setAttribute('class', 'ws-map-region-label-layer');
    svg.append(regions, labels, featureMarkerLayer([], renderOrigin, store), renderResourceLayer(planet, renderOrigin, resourceId => store.setSelection({ type: 'resource', resourceNodeId: resourceId }), []), renderMechanicalLayer(planet, graph, renderOrigin, nodeId => store.setSelection({ type: 'mechanical', mechanicalNodeId: nodeId })));
}
function updateSelection(svg, selection) {
    for (const element of svg.querySelectorAll('[data-map-kind]'))
        element.classList.toggle('ws-map-selected', selectionMatches(element, selection));
}
function updatePendingPort(svg, endpoint) {
    for (const port of svg.querySelectorAll('[data-node-id][data-port-id]')) {
        port.classList.toggle('ws-map-port--pending', Boolean(endpoint && port.getAttribute('data-node-id') === endpoint.nodeId && port.getAttribute('data-port-id') === endpoint.portId));
    }
}
function updateZoomVisibility(svg, zoom) {
    updateResourceVisibility(svg, zoom);
    updateMechanicalVisibility(svg, zoom);
    const regions = svg.querySelector('.ws-map-region-layer');
    if (regions)
        regions.style.pointerEvents = regionsInteractiveAtZoom(zoom) ? 'auto' : 'none';
    for (const parents of svg.querySelectorAll('.ws-map-continent-layer, .ws-map-ocean-layer'))
        parents.style.visibility = zoom >= REGION_RENDER_MIN_ZOOM ? 'hidden' : 'visible';
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    const unitsPerPixel = rect.width > 0 && viewBox.width > 0 ? viewBox.width / rect.width : 1;
    for (const label of svg.querySelectorAll('.ws-map-region-label'))
        label.setAttribute('font-size', String(unitsPerPixel * Number(label.dataset.labelPx ?? 12)));
    for (const marker of svg.querySelectorAll('.ws-map-feature-marker'))
        marker.setAttribute('r', String(featureMarkerWorldRadius(unitsPerPixel, Number(marker.dataset.markerRadiusPx ?? 3))));
}
export function installMapRenderer(root, store) {
    const svg = root.querySelector('#ws-map-svg');
    const canvas = root.querySelector('#ws-map-canvas');
    const zoomLabel = root.querySelector('[data-zoom-label]');
    if (!svg)
        return;
    canvas?.replaceChildren();
    let renderedPlanet = null;
    let renderedGraph = null;
    let spatialIndex = null;
    let geographicRenderSignature = '';
    let displayCamera = { centerX: 0, centerY: 0, zoom: 1 };
    let renderOrigin = initialRenderOrigin();
    let navigationAnimationFrame = null;
    let wheelAnimationFrame = null;
    let wheelTargetCamera = null;
    let wheelAnchor = null;
    let wheelLastFrameAt = null;
    let internalCameraUpdate = false;
    let pointerId = null;
    let pointerMode = null;
    let panStartClient = { x: 0, y: 0 };
    let panStartCamera = displayCamera;
    let draggedNodeId = null;
    let dragStartNode = null;
    let hoverWorld = null;
    let hoverFocus = null;
    let labelFocusAnimationFrame = null;
    let suppressClick = false;
    let observedWorld = store.getState().world;
    let observedGraph = store.getState().graph;
    let observedSelection = store.getState().selection;
    let observedCamera = store.getState().camera;
    let observedInteraction = store.getState().interaction;
    const updateRegionLabelFocus = (planet, camera) => {
        labelFocusAnimationFrame = null;
        const labels = [...svg.querySelectorAll('.ws-map-region-label')];
        if (!labels.length)
            return;
        const visible = viewportBounds(svg, planet, camera);
        const focus = regionLabelFocusPoint(hoverFocus);
        const focusX = focus.x;
        const focusY = focus.y;
        const selected = store.getState().selection;
        const selectedRegionId = selected.type === 'region' ? selected.regionId : null;
        const rect = svg.getBoundingClientRect();
        const candidates = labels.map(label => {
            const normalizedX = (Number(label.dataset.worldX) - visible.x) / visible.width;
            const normalizedY = (Number(label.dataset.worldY) - visible.y) / visible.height;
            const opacity = regionLabelOpacityAroundPointer(normalizedX, normalizedY, focusX, focusY);
            return {
                label,
                normalizedX,
                normalizedY,
                opacity,
                distance: Math.hypot(normalizedX - focusX, normalizedY - focusY),
                selected: label.dataset.regionId === selectedRegionId,
                features: Number(label.dataset.featureCount ?? 0),
            };
        }).sort((left, right) => Number(right.selected) - Number(left.selected) || left.distance - right.distance
            || right.features - left.features || (left.label.dataset.regionId ?? '').localeCompare(right.label.dataset.regionId ?? ''));
        for (const label of labels)
            label.setAttribute('opacity', '0');
        const accepted = [];
        const budget = regionLabelBudgetForZoom(camera.zoom);
        let count = 0;
        for (const candidate of candidates) {
            if (candidate.opacity <= 0 || count >= budget)
                continue;
            const pixelSize = Number(candidate.label.dataset.labelPx ?? 12);
            const halfWidth = ((candidate.label.textContent?.length ?? 0) * pixelSize * 0.29) / Math.max(1, rect.width);
            const halfHeight = (pixelSize * 0.65) / Math.max(1, rect.height);
            const bounds = { left: candidate.normalizedX - halfWidth, right: candidate.normalizedX + halfWidth, top: candidate.normalizedY - halfHeight, bottom: candidate.normalizedY + halfHeight };
            const collides = accepted.some(value => bounds.left < value.right && bounds.right > value.left && bounds.top < value.bottom && bounds.bottom > value.top);
            if (collides && !candidate.selected)
                continue;
            accepted.push(bounds);
            count += 1;
            candidate.label.setAttribute('opacity', candidate.opacity.toFixed(3));
        }
    };
    const scheduleRegionLabelFocus = () => {
        if (labelFocusAnimationFrame !== null)
            return;
        labelFocusAnimationFrame = requestAnimationFrame(() => {
            const planet = store.getState().world?.planet;
            if (planet)
                updateRegionLabelFocus(planet, displayCamera);
            else
                labelFocusAnimationFrame = null;
        });
    };
    const refreshGeographicViewport = (planet, camera) => {
        if (!spatialIndex || spatialIndex.planet !== planet)
            spatialIndex = worldSpatialIndexFor(planet);
        const showRegions = camera.zoom >= REGION_RENDER_MIN_ZOOM && camera.zoom < REGION_RENDER_MAX_ZOOM;
        const showLabels = camera.zoom >= REGION_LABEL_MIN_ZOOM && camera.zoom < REGION_LABEL_MAX_ZOOM;
        const showFeatureMarkers = camera.zoom >= FEATURE_MARKER_SHOW_ZOOM && camera.zoom < RESOURCE_NODE_SHOW_ZOOM;
        const showResourceCards = camera.zoom >= RESOURCE_NODE_HIDE_ZOOM;
        const visibleBounds = viewportBounds(svg, planet, camera);
        const bounds = viewportBounds(svg, planet, camera, showRegions ? Math.min(spatialIndex.chunkSize, visibleBounds.width * 0.25) : 2);
        const selection = store.getState().selection;
        const selectedRegionId = selection.type === 'region' ? selection.regionId : null;
        const querySignature = [
            Math.floor(Math.log2(Math.max(1, camera.zoom)) * 4),
            Math.floor(bounds.x / spatialIndex.chunkSize), Math.floor(bounds.y / spatialIndex.chunkSize),
            Math.ceil((bounds.x + bounds.width) / spatialIndex.chunkSize), Math.ceil((bounds.y + bounds.height) / spatialIndex.chunkSize),
            Math.floor(camera.centerX / Math.max(8, visibleBounds.width / 8)), Math.floor(camera.centerY / Math.max(8, visibleBounds.height / 8)),
            renderOrigin.origin.x, renderOrigin.origin.y, selectedRegionId ?? '', showFeatureMarkers, showResourceCards,
        ].join('|');
        if (querySignature === geographicRenderSignature)
            return;
        geographicRenderSignature = querySignature;
        const visibleRegions = showRegions ? spatialIndex.regionsIntersecting(bounds) : [];
        const visibleResources = showFeatureMarkers || showResourceCards ? spatialIndex.resourceNodesIntersecting(viewportBounds(svg, planet, camera, 2)) : [];
        const regionLayer = svg.querySelector('.ws-map-region-layer');
        const labelLayer = svg.querySelector('.ws-map-region-label-layer');
        regionLayer?.replaceChildren(...visibleRegions.map(region => regionElement(region, renderOrigin, store)));
        labelLayer?.replaceChildren(...(showLabels ? visibleRegions.map(region => regionLabelElement(region, renderOrigin, regionLabelPixelSizeForZoom(camera.zoom))) : []));
        const markerLayer = svg.querySelector('.ws-map-feature-marker-layer');
        markerLayer?.replaceWith(featureMarkerLayer(showFeatureMarkers ? visibleResources : [], renderOrigin, store));
        const resourceLayer = svg.querySelector('.ws-map-resource-node-layer');
        resourceLayer?.replaceWith(renderResourceLayer(planet, renderOrigin, resourceId => store.setSelection({ type: 'resource', resourceNodeId: resourceId }), showResourceCards ? visibleResources : []));
        updateResourceRuntimePresentation(svg, planet, store.getState().runtime.snapshot);
        updateSelection(svg, store.getState().selection);
        updatePendingPort(svg, store.getState().interaction.pendingConnection);
        scheduleRegionLabelFocus();
    };
    const refreshPreview = (state) => {
        const definition = state.interaction.placementDefinitionId ? apparatusDefinitionById(state.interaction.placementDefinitionId) : null;
        updatePlacementPreview(svg, definition, hoverWorld, renderOrigin);
    };
    const rerenderCurrentWorld = () => {
        const state = store.getState();
        const planet = state.world?.planet;
        if (!planet)
            return;
        renderedPlanet = planet;
        renderedGraph = state.graph;
        if (!spatialIndex || spatialIndex.planet !== planet)
            spatialIndex = worldSpatialIndexFor(planet);
        geographicRenderSignature = '';
        renderWorld(svg, planet, state.graph, store, renderOrigin);
        updateSelection(svg, state.selection);
        updatePendingPort(svg, state.interaction.pendingConnection);
        refreshPreview(state);
    };
    const prepareRenderOrigin = (camera, options = {}) => {
        const next = renderOriginForCamera(renderOrigin, camera, options);
        if (sameRenderOrigin(renderOrigin, next))
            return;
        renderOrigin = next;
        rerenderCurrentWorld();
    };
    const applyCamera = (camera) => {
        const planet = store.getState().world?.planet;
        if (!planet)
            return;
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
        scheduleRegionLabelFocus();
    };
    const publishCamera = (camera) => {
        internalCameraUpdate = true;
        store.setCamera(camera);
        internalCameraUpdate = false;
    };
    const cancelNavigationAnimation = () => {
        if (navigationAnimationFrame !== null)
            cancelAnimationFrame(navigationAnimationFrame);
        navigationAnimationFrame = null;
    };
    const cancelWheelAnimation = (publishCurrent = false) => {
        if (wheelAnimationFrame !== null)
            cancelAnimationFrame(wheelAnimationFrame);
        wheelAnimationFrame = null;
        wheelTargetCamera = null;
        wheelAnchor = null;
        wheelLastFrameAt = null;
        if (publishCurrent)
            publishCamera(displayCamera);
    };
    const commitCamera = (camera) => {
        const planet = store.getState().world?.planet;
        if (!planet)
            return;
        cancelNavigationAnimation();
        cancelWheelAnimation(false);
        const next = clampCamera(svg, planet, camera);
        prepareRenderOrigin(next, { recenter: true, allowDeactivate: true });
        applyCamera(next);
        publishCamera(next);
    };
    const animateToCamera = (target) => {
        const planet = store.getState().world?.planet;
        if (!planet)
            return;
        cancelWheelAnimation(false);
        cancelNavigationAnimation();
        const next = clampCamera(svg, planet, target);
        prepareRenderOrigin(next, { recenter: true, allowDeactivate: false });
        if (camerasEqual(displayCamera, next)) {
            applyCamera(next);
            prepareRenderOrigin(next, { allowDeactivate: true });
            return;
        }
        const start = { ...displayCamera };
        const started = performance.now();
        const ratio = Math.max(start.zoom, next.zoom) / Math.max(MAP_MIN_ZOOM, Math.min(start.zoom, next.zoom));
        const duration = clamp(320 + Math.log2(Math.max(1, ratio)) * 65, 320, 1600);
        const step = (now) => {
            const progress = clamp((now - started) / duration, 0, 1);
            const eased = smoothStep(progress);
            const zoom = Math.exp(Math.log(start.zoom) + (Math.log(next.zoom) - Math.log(start.zoom)) * eased);
            applyCamera({
                centerX: start.centerX + (next.centerX - start.centerX) * eased,
                centerY: start.centerY + (next.centerY - start.centerY) * eased,
                zoom,
            });
            if (progress < 1)
                navigationAnimationFrame = requestAnimationFrame(step);
            else {
                navigationAnimationFrame = null;
                prepareRenderOrigin(next, { allowDeactivate: true });
                applyCamera(next);
            }
        };
        navigationAnimationFrame = requestAnimationFrame(step);
    };
    const stepWheelCamera = (now) => {
        const planet = store.getState().world?.planet;
        if (!planet || !wheelTargetCamera || !wheelAnchor) {
            wheelAnimationFrame = null;
            wheelLastFrameAt = null;
            return;
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
            wheelAnimationFrame = null;
            wheelTargetCamera = null;
            wheelAnchor = null;
            wheelLastFrameAt = null;
            prepareRenderOrigin(settled, { allowDeactivate: true });
            applyCamera(settled);
            publishCamera(settled);
            return;
        }
        wheelAnimationFrame = requestAnimationFrame(stepWheelCamera);
    };
    const queueWheelCamera = (target, anchor) => {
        const planet = store.getState().world?.planet;
        if (!planet)
            return;
        cancelNavigationAnimation();
        if (!renderOrigin.active)
            prepareRenderOrigin(target, { recenter: false, allowDeactivate: false });
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
        if (!worldChanged && !graphChanged && !selectionChanged && !cameraChanged && !interactionChanged)
            return;
        const planet = state.world?.planet;
        if (!planet)
            return;
        const worldNeedsRender = renderedPlanet !== planet || renderedGraph !== state.graph;
        if (worldNeedsRender) {
            renderedPlanet = planet;
            renderedGraph = state.graph;
            if (!spatialIndex || spatialIndex.planet !== planet)
                spatialIndex = worldSpatialIndexFor(planet);
            geographicRenderSignature = '';
            renderWorld(svg, planet, state.graph, store, renderOrigin);
            applyCamera(displayCamera.zoom === 1 && displayCamera.centerX === 0 ? state.camera : displayCamera);
        }
        else if (cameraChanged && !internalCameraUpdate && !camerasEqual(displayCamera, state.camera)) {
            animateToCamera(state.camera);
        }
        if (selectionChanged) {
            geographicRenderSignature = '';
            scheduleRegionLabelFocus();
        }
        if (worldNeedsRender || selectionChanged)
            updateSelection(svg, state.selection);
        if (worldNeedsRender || interactionChanged) {
            updatePendingPort(svg, state.interaction.pendingConnection);
            refreshPreview(state);
        }
    });
    svg.addEventListener('click', event => {
        if (suppressClick) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        const state = store.getState();
        const planet = state.world?.planet;
        if (!planet)
            return;
        const target = event.target;
        const portElement = target.closest('[data-node-id][data-port-id]');
        if (portElement) {
            event.preventDefault();
            event.stopPropagation();
            const endpoint = { nodeId: portElement.getAttribute('data-node-id') ?? '', portId: portElement.getAttribute('data-port-id') ?? '' };
            const port = portForEndpoint(planet, state.graph, endpoint);
            if (!port)
                return;
            const pending = state.interaction.pendingConnection;
            if (!pending) {
                store.setPendingConnection(endpoint);
                store.setInteractionNotice('Select a compatible target port.');
                return;
            }
            const pendingPort = portForEndpoint(planet, state.graph, pending);
            if (!pendingPort) {
                store.clearInteraction();
                return;
            }
            try {
                store.setGraph(connectPorts(state.graph, pending, pendingPort, endpoint, port));
                store.clearInteraction();
            }
            catch (error) {
                store.setPendingConnection(null);
                store.setInteractionNotice(error instanceof Error ? error.message : 'Connection failed.');
            }
            return;
        }
        if (state.interaction.placementDefinitionId) {
            event.preventDefault();
            event.stopPropagation();
            if (displayCamera.zoom < MECHANICAL_PLACEMENT_MIN_ZOOM) {
                store.setInteractionNotice(`Zoom to at least ${MECHANICAL_PLACEMENT_MIN_ZOOM.toLocaleString()}× before placing machinery.`);
                return;
            }
            const definition = apparatusDefinitionById(state.interaction.placementDefinitionId);
            if (!definition) {
                store.clearInteraction();
                return;
            }
            const point = screenToWorld(svg, planet, displayCamera, event.clientX, event.clientY);
            const result = placeMechanicalNode(state.graph, definition, point);
            store.setGraph(result.graph);
            store.clearInteraction();
            store.setSelection({ type: 'mechanical', mechanicalNodeId: result.node.id });
            return;
        }
        if (state.interaction.pendingConnection) {
            store.clearInteraction();
            event.stopPropagation();
        }
    }, true);
    svg.addEventListener('wheel', event => {
        const planet = store.getState().world?.planet;
        if (!planet)
            return;
        event.preventDefault();
        const rect = svg.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0)
            return;
        const screen = {
            x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
            y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
        };
        const currentVisible = visibleWorldSize(svg, planet, displayCamera.zoom);
        const anchor = { screen, world: worldPointAtNormalizedScreen(displayCamera, currentVisible, screen) };
        const zoomBase = wheelTargetCamera?.zoom ?? displayCamera.zoom;
        const zoom = wheelZoomAfterDelta(zoomBase, normalizeWheelDelta(event, rect.height));
        const nextVisible = visibleWorldSize(svg, planet, zoom);
        queueWheelCamera(cameraForAnchor(anchor, nextVisible, zoom), anchor);
    }, { passive: false });
    svg.addEventListener('pointerdown', event => {
        const state = store.getState();
        const target = event.target;
        if (event.button === 1) {
            event.preventDefault();
            cancelWheelAnimation(true);
            cancelNavigationAnimation();
            pointerId = event.pointerId;
            pointerMode = 'pan';
            panStartClient = { x: event.clientX, y: event.clientY };
            panStartCamera = { ...displayCamera };
            suppressClick = false;
            draggedNodeId = null;
            dragStartNode = null;
            svg.classList.add('ws-map-panning');
            svg.setPointerCapture(event.pointerId);
            return;
        }
        if (event.button !== 0 || target.closest('[data-port-id]'))
            return;
        const mechanical = target.closest('[data-mechanical-id]');
        if (!mechanical || state.interaction.placementDefinitionId)
            return;
        const id = mechanical.getAttribute('data-mechanical-id');
        const node = id ? mechanicalNodeById(state.graph, id) : null;
        if (!id || !node)
            return;
        cancelWheelAnimation(true);
        cancelNavigationAnimation();
        pointerId = event.pointerId;
        pointerMode = 'node-drag';
        panStartClient = { x: event.clientX, y: event.clientY };
        panStartCamera = { ...displayCamera };
        suppressClick = false;
        draggedNodeId = id;
        dragStartNode = { ...node.position };
        store.setSelection({ type: 'mechanical', mechanicalNodeId: id });
        svg.setPointerCapture(event.pointerId);
    });
    svg.addEventListener('auxclick', event => {
        if (event.button === 1)
            event.preventDefault();
    });
    svg.addEventListener('pointermove', event => {
        const planet = store.getState().world?.planet;
        if (!planet)
            return;
        hoverWorld = screenToWorld(svg, planet, displayCamera, event.clientX, event.clientY);
        const hoverRect = svg.getBoundingClientRect();
        hoverFocus = {
            normalizedX: clamp((event.clientX - hoverRect.left) / Math.max(1, hoverRect.width), 0, 1),
            normalizedY: clamp((event.clientY - hoverRect.top) / Math.max(1, hoverRect.height), 0, 1),
            worldPoint: hoverWorld,
        };
        refreshPreview(store.getState());
        scheduleRegionLabelFocus();
        if (pointerId !== event.pointerId || !pointerMode)
            return;
        const rect = svg.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0)
            return;
        const dx = event.clientX - panStartClient.x;
        const dy = event.clientY - panStartClient.y;
        if (Math.hypot(dx, dy) > 4)
            suppressClick = true;
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
    const finishPointer = (event) => {
        if (pointerId !== event.pointerId)
            return;
        const wasPanning = pointerMode === 'pan';
        if (svg.hasPointerCapture(event.pointerId))
            svg.releasePointerCapture(event.pointerId);
        pointerId = null;
        pointerMode = null;
        draggedNodeId = null;
        dragStartNode = null;
        svg.classList.remove('ws-map-panning');
        if (wasPanning) {
            prepareRenderOrigin(displayCamera, { recenter: true, allowDeactivate: true });
            applyCamera(displayCamera);
            publishCamera(displayCamera);
        }
        if (suppressClick)
            window.setTimeout(() => { suppressClick = false; }, 0);
    };
    svg.addEventListener('pointerup', finishPointer);
    svg.addEventListener('pointercancel', finishPointer);
    svg.addEventListener('pointerleave', () => { hoverWorld = null; hoverFocus = null; refreshPreview(store.getState()); scheduleRegionLabelFocus(); });
    window.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            store.clearInteraction();
            hoverWorld = null;
            hoverFocus = null;
            refreshPreview(store.getState());
            scheduleRegionLabelFocus();
        }
        if ((event.key === 'Delete' || event.key === 'Backspace') && store.getState().selection.type === 'mechanical' && !['INPUT', 'TEXTAREA'].includes(event.target?.tagName ?? '')) {
            const selected = store.getState().selection;
            if (selected.type === 'mechanical') {
                store.setGraph(removeMechanicalNode(store.getState().graph, selected.mechanicalNodeId));
                store.setSelection({ type: 'planet' });
            }
        }
    });
    root.querySelector('[data-viewport="in"]')?.addEventListener('click', () => commitCamera({ ...displayCamera, zoom: displayCamera.zoom * 2 }));
    root.querySelector('[data-viewport="out"]')?.addEventListener('click', () => commitCamera({ ...displayCamera, zoom: displayCamera.zoom / 2 }));
    root.querySelector('[data-viewport="fit"]')?.addEventListener('click', () => {
        const planet = store.getState().world?.planet;
        if (planet)
            commitCamera({ centerX: planet.width / 2, centerY: planet.height / 2, zoom: 1 });
    });
    root.querySelector('[data-viewport="center"]')?.addEventListener('click', () => {
        const planet = store.getState().world?.planet;
        if (planet)
            commitCamera({ centerX: planet.width / 2, centerY: planet.height / 2, zoom: displayCamera.zoom });
    });
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => applyCamera(displayCamera)) : null;
    resizeObserver?.observe(svg);
    if (!resizeObserver)
        window.addEventListener('resize', () => applyCamera(displayCamera));
}
