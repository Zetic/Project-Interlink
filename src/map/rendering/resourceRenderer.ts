import { resourceDefinitionById } from '../../world/resources.js';
import { metersToWorldUnits } from '../../world/scale.js';
import type { Point, Planet, ResourceNode } from '../../world/types.js';
import {
  applyEngineeringNodeVisibility,
  ENGINEERING_NODE_HIDE_ZOOM,
  ENGINEERING_NODE_INTERACTIVE_ZOOM,
  ENGINEERING_NODE_SHOW_ZOOM,
} from './engineeringNodeVisibility.js';
import type { RenderOriginState } from './renderOrigin.js';
import { worldToRenderPoint } from './renderOrigin.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const RESOURCE_NODE_HIDE_ZOOM = ENGINEERING_NODE_HIDE_ZOOM;
export const RESOURCE_NODE_SHOW_ZOOM = ENGINEERING_NODE_SHOW_ZOOM;
export const RESOURCE_NODE_INTERACTIVE_ZOOM = ENGINEERING_NODE_INTERACTIVE_ZOOM;
/** @deprecated Kept for compatibility; engineering cards no longer alpha-fade. */
export const RESOURCE_NODE_FADE_START_ZOOM = RESOURCE_NODE_HIDE_ZOOM;
/** @deprecated Kept for compatibility; engineering cards are fully opaque whenever visible. */
export const RESOURCE_NODE_FULL_OPACITY_ZOOM = RESOURCE_NODE_SHOW_ZOOM;
export const RESOURCE_NODE_PHYSICAL_WIDTH_METERS = 20;
export const RESOURCE_NODE_PHYSICAL_HEIGHT_METERS = 12.5;
export const RESOURCE_NODE_WORLD_WIDTH = metersToWorldUnits(RESOURCE_NODE_PHYSICAL_WIDTH_METERS);
export const RESOURCE_NODE_WORLD_HEIGHT = metersToWorldUnits(RESOURCE_NODE_PHYSICAL_HEIGHT_METERS);
const HEADER_HEIGHT = RESOURCE_NODE_WORLD_HEIGHT * 0.2;
const PORT_RADIUS = metersToWorldUnits(0.9);
const CORNER_RADIUS = metersToWorldUnits(0.25);
const BODY_STROKE = metersToWorldUnits(0.18);
const DIVIDER_STROKE = metersToWorldUnits(0.13);
const PORT_STROKE = metersToWorldUnits(0.22);
const CATEGORY_FONT_SIZE = metersToWorldUnits(0.95);
const BODY_FONT_SIZE = metersToWorldUnits(1.05);

function svgElement<K extends keyof SVGElementTagNameMap>(tagName: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tagName);
}

function appendText(group: SVGGElement, className: string, x: number, y: number, value: string, fontSize: number): void {
  const text = svgElement('text');
  text.setAttribute('x', String(x));
  text.setAttribute('y', String(y));
  text.setAttribute('font-size', String(fontSize));
  text.setAttribute('class', className);
  text.textContent = value;
  group.appendChild(text);
}

export function resourcePortWorldPosition(resource: ResourceNode): Point {
  return { x: resource.position.x + RESOURCE_NODE_WORLD_WIDTH / 2, y: resource.position.y };
}

function appendResourceCard(group: SVGGElement, resource: ResourceNode): void {
  const halfWidth = RESOURCE_NODE_WORLD_WIDTH / 2;
  const halfHeight = RESOURCE_NODE_WORLD_HEIGHT / 2;
  const headerBottom = -halfHeight + HEADER_HEIGHT;
  const body = svgElement('rect');
  body.setAttribute('x', String(-halfWidth)); body.setAttribute('y', String(-halfHeight));
  body.setAttribute('width', String(RESOURCE_NODE_WORLD_WIDTH)); body.setAttribute('height', String(RESOURCE_NODE_WORLD_HEIGHT));
  body.setAttribute('rx', String(CORNER_RADIUS)); body.setAttribute('stroke-width', String(BODY_STROKE));
  body.setAttribute('class', 'ws-map-resource-card-body'); group.appendChild(body);
  const header = svgElement('path');
  header.setAttribute('d', `M ${-halfWidth + CORNER_RADIUS} ${-halfHeight} H ${halfWidth - CORNER_RADIUS} Q ${halfWidth} ${-halfHeight} ${halfWidth} ${-halfHeight + CORNER_RADIUS} V ${headerBottom} H ${-halfWidth} V ${-halfHeight + CORNER_RADIUS} Q ${-halfWidth} ${-halfHeight} ${-halfWidth + CORNER_RADIUS} ${-halfHeight} Z`);
  header.setAttribute('class', 'ws-map-resource-card-header'); group.appendChild(header);
  const divider = svgElement('line');
  divider.setAttribute('x1', String(-halfWidth)); divider.setAttribute('x2', String(halfWidth)); divider.setAttribute('y1', String(headerBottom)); divider.setAttribute('y2', String(headerBottom));
  divider.setAttribute('stroke-width', String(DIVIDER_STROKE)); divider.setAttribute('class', 'ws-map-resource-card-divider'); group.appendChild(divider);
  const details = svgElement('g'); details.setAttribute('class', 'ws-map-resource-details'); group.appendChild(details);
  appendText(details, 'ws-map-resource-category', -halfWidth + metersToWorldUnits(0.9), -halfHeight + metersToWorldUnits(1.9), 'FEATURE', CATEGORY_FONT_SIZE);
  const definition = resourceDefinitionById(resource.resourceId);
  appendText(details, 'ws-map-resource-name', 0, metersToWorldUnits(-0.8), resource.name, BODY_FONT_SIZE);
  appendText(details, 'ws-map-resource-type', 0, metersToWorldUnits(1.45), 'Mineral Deposit', BODY_FONT_SIZE);
  appendText(details, 'ws-map-resource-material', 0, metersToWorldUnits(3.7), definition?.name ?? resource.resourceId, BODY_FONT_SIZE);
  const port = svgElement('circle');
  port.setAttribute('cx', String(halfWidth)); port.setAttribute('cy', '0'); port.setAttribute('r', String(PORT_RADIUS)); port.setAttribute('stroke-width', String(PORT_STROKE));
  port.setAttribute('class', 'ws-map-resource-port ws-map-port'); port.setAttribute('data-node-id', resource.id); port.setAttribute('data-port-id', resource.resourceAccessPortId);
  port.setAttribute('data-port-kind', 'resource-access'); port.setAttribute('data-port-direction', 'output'); port.setAttribute('data-port-medium', 'resource');
  const title = svgElement('title'); title.textContent = 'resources'; port.appendChild(title); details.appendChild(port);
}

export function renderResourceLayer(planet: Planet, renderOrigin: RenderOriginState, onSelect: (resourceId: string) => void): SVGGElement {
  const layer = svgElement('g'); layer.setAttribute('class', 'ws-map-resource-node-layer');
  for (const resource of planet.resourceNodes) {
    const position = worldToRenderPoint(resource.position, renderOrigin);
    const node = svgElement('g');
    node.setAttribute('transform', `translate(${position.x} ${position.y})`);
    node.setAttribute('class', 'ws-map-resource-node'); node.setAttribute('data-map-kind', 'resource'); node.setAttribute('data-resource-id', resource.id); node.setAttribute('data-region-id', resource.regionId);
    node.addEventListener('click', event => {
      if ((event.target as Element).closest('[data-port-id]')) return;
      event.stopPropagation(); onSelect(resource.id);
    });
    appendResourceCard(node, resource); layer.appendChild(node);
  }
  return layer;
}

export function updateResourceVisibility(svg: SVGSVGElement, zoom: number): void {
  applyEngineeringNodeVisibility(svg, svg.querySelector<SVGGElement>('.ws-map-resource-node-layer'), zoom);
}
