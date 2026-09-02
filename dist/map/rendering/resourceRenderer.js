import { resourceDefinitionById } from '../../world/resources.js';
import { worldSpatialIndexFor } from '../../world/spatialIndex.js';
import { applyEngineeringNodeVisibility, ENGINEERING_NODE_HIDE_ZOOM, ENGINEERING_NODE_INTERACTIVE_ZOOM, ENGINEERING_NODE_SHOW_ZOOM, } from './engineeringNodeVisibility.js';
import { localCardTransform, NODE_CARD_LOCAL_BODY_FONT_SIZE, NODE_CARD_LOCAL_CATEGORY_FONT_SIZE, NODE_CARD_LOCAL_HALF_HEIGHT, NODE_CARD_LOCAL_HALF_WIDTH, NODE_CARD_LOCAL_HEADER_HEIGHT, NODE_CARD_LOCAL_HEIGHT, NODE_CARD_LOCAL_PORT_RADIUS, NODE_CARD_LOCAL_WIDTH, NODE_CARD_PHYSICAL_HEIGHT_METERS, NODE_CARD_PHYSICAL_WIDTH_METERS, NODE_CARD_WORLD_HEIGHT, NODE_CARD_WORLD_WIDTH, } from './nodeCardGeometry.js';
import { worldToRenderPoint } from './renderOrigin.js';
const SVG_NS = 'http://www.w3.org/2000/svg';
export const RESOURCE_NODE_HIDE_ZOOM = ENGINEERING_NODE_HIDE_ZOOM;
export const RESOURCE_NODE_SHOW_ZOOM = ENGINEERING_NODE_SHOW_ZOOM;
export const RESOURCE_NODE_INTERACTIVE_ZOOM = ENGINEERING_NODE_INTERACTIVE_ZOOM;
/** @deprecated Kept for compatibility; engineering cards no longer alpha-fade. */
export const RESOURCE_NODE_FADE_START_ZOOM = RESOURCE_NODE_HIDE_ZOOM;
/** @deprecated Kept for compatibility; engineering cards are fully opaque whenever visible. */
export const RESOURCE_NODE_FULL_OPACITY_ZOOM = RESOURCE_NODE_SHOW_ZOOM;
export const RESOURCE_NODE_PHYSICAL_WIDTH_METERS = NODE_CARD_PHYSICAL_WIDTH_METERS;
export const RESOURCE_NODE_PHYSICAL_HEIGHT_METERS = NODE_CARD_PHYSICAL_HEIGHT_METERS;
export const RESOURCE_NODE_WORLD_WIDTH = NODE_CARD_WORLD_WIDTH;
export const RESOURCE_NODE_WORLD_HEIGHT = NODE_CARD_WORLD_HEIGHT;
function svgElement(tagName) {
    return document.createElementNS(SVG_NS, tagName);
}
function appendText(group, className, x, y, value, fontSize) {
    const text = svgElement('text');
    text.setAttribute('x', String(x));
    text.setAttribute('y', String(y));
    text.setAttribute('font-size', String(fontSize));
    text.setAttribute('class', className);
    text.textContent = value;
    group.appendChild(text);
    return text;
}
export function resourcePortWorldPosition(resource) {
    return { x: resource.position.x + RESOURCE_NODE_WORLD_WIDTH / 2, y: resource.position.y };
}
function appendResourceCard(group, resource) {
    const headerBottom = -NODE_CARD_LOCAL_HALF_HEIGHT + NODE_CARD_LOCAL_HEADER_HEIGHT;
    const body = svgElement('rect');
    body.setAttribute('x', String(-NODE_CARD_LOCAL_HALF_WIDTH));
    body.setAttribute('y', String(-NODE_CARD_LOCAL_HALF_HEIGHT));
    body.setAttribute('width', String(NODE_CARD_LOCAL_WIDTH));
    body.setAttribute('height', String(NODE_CARD_LOCAL_HEIGHT));
    body.setAttribute('rx', '3');
    body.setAttribute('stroke-width', '1.5');
    body.setAttribute('class', 'ws-map-resource-card-body');
    group.appendChild(body);
    const header = svgElement('path');
    header.setAttribute('d', `M ${-NODE_CARD_LOCAL_HALF_WIDTH + 3} ${-NODE_CARD_LOCAL_HALF_HEIGHT} H ${NODE_CARD_LOCAL_HALF_WIDTH - 3} Q ${NODE_CARD_LOCAL_HALF_WIDTH} ${-NODE_CARD_LOCAL_HALF_HEIGHT} ${NODE_CARD_LOCAL_HALF_WIDTH} ${-NODE_CARD_LOCAL_HALF_HEIGHT + 3} V ${headerBottom} H ${-NODE_CARD_LOCAL_HALF_WIDTH} V ${-NODE_CARD_LOCAL_HALF_HEIGHT + 3} Q ${-NODE_CARD_LOCAL_HALF_WIDTH} ${-NODE_CARD_LOCAL_HALF_HEIGHT} ${-NODE_CARD_LOCAL_HALF_WIDTH + 3} ${-NODE_CARD_LOCAL_HALF_HEIGHT} Z`);
    header.setAttribute('class', 'ws-map-resource-card-header');
    group.appendChild(header);
    const divider = svgElement('line');
    divider.setAttribute('x1', String(-NODE_CARD_LOCAL_HALF_WIDTH));
    divider.setAttribute('x2', String(NODE_CARD_LOCAL_HALF_WIDTH));
    divider.setAttribute('y1', String(headerBottom));
    divider.setAttribute('y2', String(headerBottom));
    divider.setAttribute('stroke-width', '1');
    divider.setAttribute('class', 'ws-map-resource-card-divider');
    group.appendChild(divider);
    const details = svgElement('g');
    details.setAttribute('class', 'ws-map-resource-details');
    group.appendChild(details);
    appendText(details, 'ws-map-resource-category', -70, -36, 'FEATURE', NODE_CARD_LOCAL_CATEGORY_FONT_SIZE);
    const definition = resourceDefinitionById(resource.resourceId);
    appendText(details, 'ws-map-resource-name', 0, -8, resource.name, NODE_CARD_LOCAL_BODY_FONT_SIZE);
    appendText(details, 'ws-map-resource-type', 0, 13, definition?.name ?? resource.resourceId, NODE_CARD_LOCAL_BODY_FONT_SIZE);
    const runtime = appendText(details, 'ws-map-resource-runtime', 0, 34, 'Reserve —', NODE_CARD_LOCAL_BODY_FONT_SIZE);
    runtime.setAttribute('data-runtime-resource-text', resource.id);
    const port = svgElement('circle');
    port.setAttribute('cx', String(NODE_CARD_LOCAL_HALF_WIDTH));
    port.setAttribute('cy', '0');
    port.setAttribute('r', String(NODE_CARD_LOCAL_PORT_RADIUS));
    port.setAttribute('stroke-width', '2');
    port.setAttribute('class', 'ws-map-resource-port ws-map-port');
    port.setAttribute('data-node-id', resource.id);
    port.setAttribute('data-port-id', resource.resourceAccessPortId);
    port.setAttribute('data-port-kind', 'resource-access');
    port.setAttribute('data-port-direction', 'output');
    port.setAttribute('data-port-medium', 'resource');
    const title = svgElement('title');
    title.textContent = 'resources';
    port.appendChild(title);
    details.appendChild(port);
}
function formatResourceRuntime(resource, snapshot) {
    const runtime = snapshot?.sources[resource.id];
    if (!runtime)
        return 'Reserve —';
    if (runtime.remainingMassKg == null)
        return `${runtime.extractedMassKg.toFixed(1)} kg extracted`;
    return `${runtime.remainingMassKg.toFixed(1)} kg remaining`;
}
export function updateResourceRuntimePresentation(svg, planet, snapshot) {
    const spatialIndex = worldSpatialIndexFor(planet);
    for (const text of svg.querySelectorAll('[data-runtime-resource-text]')) {
        const resource = spatialIndex.featureById(text.dataset.runtimeResourceText ?? '');
        if (resource)
            text.textContent = formatResourceRuntime(resource, snapshot);
    }
}
export function renderResourceLayer(planet, renderOrigin, onSelect, resources = planet.resourceNodes) {
    const layer = svgElement('g');
    layer.setAttribute('class', 'ws-map-resource-node-layer');
    for (const resource of resources) {
        const position = worldToRenderPoint(resource.position, renderOrigin);
        const node = svgElement('g');
        node.setAttribute('transform', localCardTransform(position.x, position.y));
        node.setAttribute('class', 'ws-map-resource-node');
        node.setAttribute('data-map-kind', 'resource');
        node.setAttribute('data-resource-id', resource.id);
        node.setAttribute('data-region-id', resource.regionId);
        node.addEventListener('click', event => {
            if (event.target.closest('[data-port-id]'))
                return;
            event.stopPropagation();
            onSelect(resource.id);
        });
        appendResourceCard(node, resource);
        layer.appendChild(node);
    }
    return layer;
}
export function updateResourceVisibility(svg, zoom) {
    applyEngineeringNodeVisibility(svg, svg.querySelector('.ws-map-resource-node-layer'), zoom);
}
