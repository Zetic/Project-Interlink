import { polygonCentroid } from '../world/geometry.js';
const SVG_NS = 'http://www.w3.org/2000/svg';
const MIN_ZOOM = 1;
const MAX_ZOOM = 18;
const RESOURCE_MARKER_ZOOM = 2;
const RESOURCE_LABEL_ZOOM = 5;
function createSvgElement(tagName) {
    return document.createElementNS(SVG_NS, tagName);
}
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function camerasEqual(left, right) {
    return Math.abs(left.centerX - right.centerX) < 0.01
        && Math.abs(left.centerY - right.centerY) < 0.01
        && Math.abs(left.zoom - right.zoom) < 0.001;
}
function visibleWorldSize(svg, planet, zoom) {
    const rect = svg.getBoundingClientRect();
    const viewportAspect = rect.width > 0 && rect.height > 0
        ? rect.width / rect.height
        : planet.width / planet.height;
    const planetAspect = planet.width / planet.height;
    let fitWidth = planet.width;
    let fitHeight = planet.height;
    if (viewportAspect > planetAspect)
        fitWidth = planet.height * viewportAspect;
    else
        fitHeight = planet.width / viewportAspect;
    return { width: fitWidth / zoom, height: fitHeight / zoom };
}
function clampCamera(svg, planet, camera) {
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
function selectionMatches(element, selection) {
    const kind = element.getAttribute('data-map-kind');
    if (selection.type === 'planet')
        return kind === 'planet';
    if (selection.type === 'region')
        return kind === 'region' && element.getAttribute('data-region-id') === selection.regionId;
    return kind === 'resource' && element.getAttribute('data-resource-id') === selection.resourceNodeId;
}
function renderWorld(svg, planet, store, shouldSuppressClick) {
    svg.replaceChildren();
    svg.setAttribute('preserveAspectRatio', 'none');
    const ocean = createSvgElement('rect');
    ocean.setAttribute('x', String(-planet.width));
    ocean.setAttribute('y', String(-planet.height));
    ocean.setAttribute('width', String(planet.width * 3));
    ocean.setAttribute('height', String(planet.height * 3));
    ocean.setAttribute('class', 'ws-map-ocean');
    ocean.setAttribute('data-map-kind', 'planet');
    ocean.addEventListener('click', () => {
        if (!shouldSuppressClick())
            store.setSelection({ type: 'planet' });
    });
    svg.appendChild(ocean);
    const regionLayer = createSvgElement('g');
    regionLayer.setAttribute('class', 'ws-map-region-layer');
    const labelLayer = createSvgElement('g');
    labelLayer.setAttribute('class', 'ws-map-region-label-layer');
    const resourceLayer = createSvgElement('g');
    resourceLayer.setAttribute('class', 'ws-map-resource-layer');
    const resourceLabelLayer = createSvgElement('g');
    resourceLabelLayer.setAttribute('class', 'ws-map-resource-label-layer');
    planet.regions.forEach((region, index) => {
        const polygon = createSvgElement('polygon');
        polygon.setAttribute('points', region.polygon.map(point => `${point.x},${point.y}`).join(' '));
        polygon.setAttribute('class', `ws-map-region ws-map-region--${index % 5}`);
        polygon.setAttribute('data-map-kind', 'region');
        polygon.setAttribute('data-region-id', region.id);
        polygon.addEventListener('click', event => {
            event.stopPropagation();
            if (!shouldSuppressClick())
                store.setSelection({ type: 'region', regionId: region.id });
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
        const marker = createSvgElement('circle');
        marker.setAttribute('cx', String(resource.position.x));
        marker.setAttribute('cy', String(resource.position.y));
        marker.setAttribute('r', '10');
        marker.setAttribute('class', 'ws-map-resource');
        marker.setAttribute('data-map-kind', 'resource');
        marker.setAttribute('data-resource-id', resource.id);
        marker.setAttribute('data-region-id', resource.regionId);
        marker.addEventListener('click', event => {
            event.stopPropagation();
            if (!shouldSuppressClick())
                store.setSelection({ type: 'resource', resourceNodeId: resource.id });
        });
        resourceLayer.appendChild(marker);
        const label = createSvgElement('text');
        label.setAttribute('x', String(resource.position.x + 18));
        label.setAttribute('y', String(resource.position.y + 4));
        label.setAttribute('class', 'ws-map-resource-label');
        label.textContent = resource.name;
        resourceLabelLayer.appendChild(label);
    }
    svg.append(regionLayer, labelLayer, resourceLayer, resourceLabelLayer);
}
function updateSelection(svg, selection) {
    for (const element of svg.querySelectorAll('[data-map-kind], [data-region-id], [data-resource-id]')) {
        element.classList.toggle('ws-map-selected', selectionMatches(element, selection));
    }
}
function updateZoomVisibility(svg, zoom) {
    const resources = svg.querySelector('.ws-map-resource-layer');
    const resourceLabels = svg.querySelector('.ws-map-resource-label-layer');
    if (resources)
        resources.style.display = zoom < RESOURCE_MARKER_ZOOM ? 'none' : '';
    if (resourceLabels)
        resourceLabels.style.display = zoom < RESOURCE_LABEL_ZOOM ? 'none' : '';
    for (const marker of svg.querySelectorAll('.ws-map-resource')) {
        marker.setAttribute('r', String(18 / zoom));
    }
    for (const label of svg.querySelectorAll('.ws-map-region-label')) {
        label.setAttribute('font-size', String(44 / zoom));
    }
    for (const label of svg.querySelectorAll('.ws-map-resource-label')) {
        label.setAttribute('font-size', String(30 / zoom));
    }
}
export function installMapRenderer(root, store) {
    const svg = root.querySelector('#ws-map-svg');
    const canvas = root.querySelector('#ws-map-canvas');
    const zoomLabel = root.querySelector('[data-zoom-label]');
    if (!svg)
        return;
    if (canvas)
        canvas.replaceChildren();
    let renderedPlanet = null;
    let displayCamera = { centerX: 0, centerY: 0, zoom: 1 };
    let animationFrame = null;
    let internalCameraUpdate = false;
    let suppressClick = false;
    let dragPointerId = null;
    let dragStartClient = { x: 0, y: 0 };
    let dragStartCamera = displayCamera;
    const applyCamera = (camera) => {
        const planet = store.getState().world?.planet;
        if (!planet)
            return;
        displayCamera = clampCamera(svg, planet, camera);
        const visible = visibleWorldSize(svg, planet, displayCamera.zoom);
        svg.setAttribute('viewBox', [
            displayCamera.centerX - visible.width / 2,
            displayCamera.centerY - visible.height / 2,
            visible.width,
            visible.height,
        ].join(' '));
        if (zoomLabel)
            zoomLabel.textContent = `${Math.round(displayCamera.zoom * 100)}%`;
        updateZoomVisibility(svg, displayCamera.zoom);
    };
    const commitInteractiveCamera = (camera) => {
        const planet = store.getState().world?.planet;
        if (!planet)
            return;
        const clamped = clampCamera(svg, planet, camera);
        if (animationFrame !== null)
            cancelAnimationFrame(animationFrame);
        animationFrame = null;
        applyCamera(clamped);
        internalCameraUpdate = true;
        store.setCamera(clamped);
        internalCameraUpdate = false;
    };
    const animateToCamera = (target) => {
        const planet = store.getState().world?.planet;
        if (!planet)
            return;
        const clampedTarget = clampCamera(svg, planet, target);
        if (camerasEqual(displayCamera, clampedTarget)) {
            applyCamera(clampedTarget);
            return;
        }
        if (animationFrame !== null)
            cancelAnimationFrame(animationFrame);
        const start = { ...displayCamera };
        const startedAt = performance.now();
        const duration = 280;
        const step = (now) => {
            const progress = clamp((now - startedAt) / duration, 0, 1);
            const eased = 1 - (1 - progress) ** 3;
            applyCamera({
                centerX: start.centerX + (clampedTarget.centerX - start.centerX) * eased,
                centerY: start.centerY + (clampedTarget.centerY - start.centerY) * eased,
                zoom: start.zoom + (clampedTarget.zoom - start.zoom) * eased,
            });
            if (progress < 1)
                animationFrame = requestAnimationFrame(step);
            else
                animationFrame = null;
        };
        animationFrame = requestAnimationFrame(step);
    };
    const shouldSuppressClick = () => suppressClick;
    store.subscribe(state => {
        const planet = state.world?.planet;
        if (!planet)
            return;
        if (renderedPlanet !== planet) {
            renderedPlanet = planet;
            renderWorld(svg, planet, store, shouldSuppressClick);
            displayCamera = state.camera;
            applyCamera(state.camera);
        }
        else if (!internalCameraUpdate && !camerasEqual(displayCamera, state.camera)) {
            animateToCamera(state.camera);
        }
        updateSelection(svg, state.selection);
    });
    svg.addEventListener('wheel', event => {
        const planet = store.getState().world?.planet;
        if (!planet)
            return;
        event.preventDefault();
        const rect = svg.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0)
            return;
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
        if (event.button !== 0)
            return;
        dragPointerId = event.pointerId;
        dragStartClient = { x: event.clientX, y: event.clientY };
        dragStartCamera = { ...displayCamera };
        suppressClick = false;
        svg.setPointerCapture(event.pointerId);
    });
    svg.addEventListener('pointermove', event => {
        if (dragPointerId !== event.pointerId)
            return;
        const planet = store.getState().world?.planet;
        if (!planet)
            return;
        const rect = svg.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0)
            return;
        const dx = event.clientX - dragStartClient.x;
        const dy = event.clientY - dragStartClient.y;
        if (Math.hypot(dx, dy) > 4)
            suppressClick = true;
        const visible = visibleWorldSize(svg, planet, dragStartCamera.zoom);
        commitInteractiveCamera({
            centerX: dragStartCamera.centerX - dx * (visible.width / rect.width),
            centerY: dragStartCamera.centerY - dy * (visible.height / rect.height),
            zoom: dragStartCamera.zoom,
        });
    });
    const finishDrag = (event) => {
        if (dragPointerId !== event.pointerId)
            return;
        if (svg.hasPointerCapture(event.pointerId))
            svg.releasePointerCapture(event.pointerId);
        dragPointerId = null;
        if (suppressClick)
            window.setTimeout(() => { suppressClick = false; }, 0);
    };
    svg.addEventListener('pointerup', finishDrag);
    svg.addEventListener('pointercancel', finishDrag);
    root.querySelector('[data-viewport="in"]')?.addEventListener('click', () => {
        commitInteractiveCamera({ ...displayCamera, zoom: displayCamera.zoom * 1.4 });
    });
    root.querySelector('[data-viewport="out"]')?.addEventListener('click', () => {
        commitInteractiveCamera({ ...displayCamera, zoom: displayCamera.zoom / 1.4 });
    });
    root.querySelector('[data-viewport="fit"]')?.addEventListener('click', () => {
        const planet = store.getState().world?.planet;
        if (!planet)
            return;
        commitInteractiveCamera({ centerX: planet.width / 2, centerY: planet.height / 2, zoom: 1 });
    });
    root.querySelector('[data-viewport="center"]')?.addEventListener('click', () => {
        const planet = store.getState().world?.planet;
        if (!planet)
            return;
        commitInteractiveCamera({ centerX: planet.width / 2, centerY: planet.height / 2, zoom: displayCamera.zoom });
    });
    const resizeObserver = typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => applyCamera(displayCamera))
        : null;
    resizeObserver?.observe(svg);
    if (!resizeObserver)
        window.addEventListener('resize', () => applyCamera(displayCamera));
}
