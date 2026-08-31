import type { ApparatusDefinition } from '../../apparatus/definitions.js';
import { apparatusDefinitionById } from '../../apparatus/definitions.js';
import { mechanicalNodeById, resourceNodeById } from '../../graph/graphQueries.js';
import type { GraphState, MechanicalNode, PortEndpoint } from '../../graph/types.js';
import { metersToWorldUnits } from '../../world/scale.js';
import type { Point, Planet } from '../../world/types.js';
import {
  applyEngineeringNodeVisibility,
  ENGINEERING_NODE_FADE_START_ZOOM,
  ENGINEERING_NODE_FULL_OPACITY_ZOOM,
  ENGINEERING_NODE_INTERACTIVE_ZOOM,
} from './engineeringNodeVisibility.js';
import {
  RESOURCE_NODE_PHYSICAL_HEIGHT_METERS,
  RESOURCE_NODE_PHYSICAL_WIDTH_METERS,
  RESOURCE_NODE_WORLD_HEIGHT,
  RESOURCE_NODE_WORLD_WIDTH,
  resourcePortWorldPosition,
} from './resourceRenderer.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const MECHANICAL_NODE_FADE_START_ZOOM = ENGINEERING_NODE_FADE_START_ZOOM;
export const MECHANICAL_NODE_FULL_OPACITY_ZOOM = ENGINEERING_NODE_FULL_OPACITY_ZOOM;
export const MECHANICAL_NODE_INTERACTIVE_ZOOM = ENGINEERING_NODE_INTERACTIVE_ZOOM;
export const ENGINEERING_NODE_CARD_PHYSICAL_WIDTH_METERS = RESOURCE_NODE_PHYSICAL_WIDTH_METERS;
export const ENGINEERING_NODE_CARD_PHYSICAL_HEIGHT_METERS = RESOURCE_NODE_PHYSICAL_HEIGHT_METERS;
const HEADER_HEIGHT = RESOURCE_NODE_WORLD_HEIGHT * 0.2;
const FONT_SIZE_METERS = 1.05;
const CATEGORY_FONT_SIZE_METERS = 0.9;
const PORT_RADIUS_METERS = 0.875;

function svgElement<K extends keyof SVGElementTagNameMap>(tagName: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tagName);
}

export function mechanicalPortWorldPosition(node: MechanicalNode, portId: string): Point | null {
  const port = node.ports.find(candidate => candidate.id === portId);
  if (!port) return null;
  const sameSide = node.ports.filter(candidate => candidate.direction === port.direction);
  const index = sameSide.findIndex(candidate => candidate.id === port.id);
  const y = node.position.y - RESOURCE_NODE_WORLD_HEIGHT / 2
    + RESOURCE_NODE_WORLD_HEIGHT * ((index + 1) / (sameSide.length + 1));
  return {
    x: node.position.x + (port.direction === 'input' ? -RESOURCE_NODE_WORLD_WIDTH / 2 : RESOURCE_NODE_WORLD_WIDTH / 2),
    y,
  };
}

export function endpointWorldPosition(planet: Planet, graph: GraphState, endpoint: PortEndpoint): Point | null {
  const mechanical = mechanicalNodeById(graph, endpoint.nodeId);
  if (mechanical) return mechanicalPortWorldPosition(mechanical, endpoint.portId);
  const resource = resourceNodeById(planet, endpoint.nodeId);
  if (resource && endpoint.portId === resource.resourceAccessPortId) return resourcePortWorldPosition(resource);
  return null;
}

function appendNodeCard(group: SVGGElement, node: MechanicalNode): void {
  const halfWidth = RESOURCE_NODE_WORLD_WIDTH / 2;
  const halfHeight = RESOURCE_NODE_WORLD_HEIGHT / 2;
  const body = svgElement('rect');
  body.setAttribute('x', String(-halfWidth)); body.setAttribute('y', String(-halfHeight));
  body.setAttribute('width', String(RESOURCE_NODE_WORLD_WIDTH)); body.setAttribute('height', String(RESOURCE_NODE_WORLD_HEIGHT));
  body.setAttribute('rx', String(metersToWorldUnits(0.25)));
  body.setAttribute('class', `ws-map-mechanical-card-body ws-map-mechanical-card-body--${node.nodeType}`);
  group.appendChild(body);

  const header = svgElement('rect');
  header.setAttribute('x', String(-halfWidth)); header.setAttribute('y', String(-halfHeight));
  header.setAttribute('width', String(RESOURCE_NODE_WORLD_WIDTH)); header.setAttribute('height', String(HEADER_HEIGHT));
  header.setAttribute('class', `ws-map-mechanical-card-header ws-map-mechanical-card-header--${node.category}`);
  group.appendChild(header);

  const details = svgElement('g'); details.setAttribute('class', 'ws-map-mechanical-details'); group.appendChild(details);
  const category = svgElement('text');
  category.setAttribute('x', String(-halfWidth + metersToWorldUnits(0.9)));
  category.setAttribute('y', String(-halfHeight + HEADER_HEIGHT * 0.7));
  category.setAttribute('font-size', String(metersToWorldUnits(CATEGORY_FONT_SIZE_METERS)));
  category.setAttribute('class', 'ws-map-mechanical-category');
  category.textContent = node.category.toUpperCase(); details.appendChild(category);

  const definition = apparatusDefinitionById(node.definitionId);
  const label = svgElement('text'); label.setAttribute('x', '0'); label.setAttribute('y', String(metersToWorldUnits(0.8)));
  label.setAttribute('font-size', String(metersToWorldUnits(FONT_SIZE_METERS)));
  label.setAttribute('class', 'ws-map-mechanical-label');
  label.textContent = `${definition?.label ?? node.label} [${node.enabled ? 'on' : 'off'}]`;
  details.appendChild(label);

  for (const port of node.ports) {
    const position = mechanicalPortWorldPosition({ ...node, position: { x: 0, y: 0 } }, port.id);
    if (!position) continue;
    const circle = svgElement('circle');
    circle.setAttribute('cx', String(position.x)); circle.setAttribute('cy', String(position.y));
    circle.setAttribute('r', String(metersToWorldUnits(PORT_RADIUS_METERS)));
    circle.setAttribute('class', `ws-map-mechanical-port ws-map-port ws-map-port--${port.direction} ws-map-port--${port.kind} ws-map-port--${port.medium}`);
    circle.setAttribute('data-node-id', node.id); circle.setAttribute('data-port-id', port.id);
    circle.setAttribute('data-port-kind', port.kind); circle.setAttribute('data-port-direction', port.direction); circle.setAttribute('data-port-medium', port.medium);
    const title = svgElement('title'); title.textContent = `${port.label} · ${port.direction} · ${port.medium}`; circle.appendChild(title);
    details.appendChild(circle);
  }
}

function connectionPath(start: Point, end: Point): string {
  const bend = Math.max(metersToWorldUnits(3), Math.abs(end.x - start.x) * 0.45);
  return `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${end.x - bend} ${end.y}, ${end.x} ${end.y}`;
}

export function renderMechanicalLayer(planet: Planet, graph: GraphState, onSelect: (nodeId: string) => void): SVGGElement {
  const layer = svgElement('g'); layer.setAttribute('class', 'ws-map-mechanical-layer');
  const connections = svgElement('g'); connections.setAttribute('class', 'ws-map-connection-layer');
  for (const connection of graph.connections) {
    const start = endpointWorldPosition(planet, graph, connection.from); const end = endpointWorldPosition(planet, graph, connection.to);
    if (!start || !end) continue;
    const path = svgElement('path'); path.setAttribute('d', connectionPath(start, end));
    path.setAttribute('class', `ws-map-connection ws-map-connection--${connection.kind} ws-map-connection--${connection.medium}`);
    path.setAttribute('data-connection-id', connection.id);
    const title = svgElement('title'); title.textContent = `${connection.from.nodeId}:${connection.from.portId} → ${connection.to.nodeId}:${connection.to.portId}`;
    path.appendChild(title); connections.appendChild(path);
  }
  layer.appendChild(connections);

  const nodes = svgElement('g'); nodes.setAttribute('class', 'ws-map-mechanical-node-layer');
  for (const node of graph.nodes) {
    const group = svgElement('g'); group.setAttribute('transform', `translate(${node.position.x} ${node.position.y})`);
    group.setAttribute('class', `ws-map-mechanical-node ws-map-mechanical-node--${node.category}`);
    group.setAttribute('data-map-kind', 'mechanical'); group.setAttribute('data-mechanical-id', node.id);
    group.addEventListener('click', event => { if ((event.target as Element).closest('[data-port-id]')) return; event.stopPropagation(); onSelect(node.id); });
    appendNodeCard(group, node); nodes.appendChild(group);
  }
  layer.appendChild(nodes);

  const preview = svgElement('g'); preview.setAttribute('id', 'ws-map-placement-preview');
  preview.setAttribute('class', 'ws-map-placement-preview'); preview.style.display = 'none'; layer.appendChild(preview);
  return layer;
}

export function updateMechanicalVisibility(svg: SVGSVGElement, zoom: number): void {
  applyEngineeringNodeVisibility(svg.querySelector<SVGGElement>('.ws-map-mechanical-layer'), zoom);
}

export function updatePlacementPreview(svg: SVGSVGElement, definition: ApparatusDefinition | null, position: Point | null): void {
  const preview = svg.querySelector<SVGGElement>('#ws-map-placement-preview');
  if (!preview) return;
  preview.replaceChildren();
  if (!definition || !position) { preview.style.display = 'none'; return; }
  preview.style.display = 'block'; preview.setAttribute('transform', `translate(${position.x} ${position.y})`);
  const rect = svgElement('rect');
  rect.setAttribute('x', String(-RESOURCE_NODE_WORLD_WIDTH / 2)); rect.setAttribute('y', String(-RESOURCE_NODE_WORLD_HEIGHT / 2));
  rect.setAttribute('width', String(RESOURCE_NODE_WORLD_WIDTH)); rect.setAttribute('height', String(RESOURCE_NODE_WORLD_HEIGHT));
  rect.setAttribute('class', 'ws-map-placement-preview-body'); preview.appendChild(rect);
  const text = svgElement('text'); text.setAttribute('x', '0'); text.setAttribute('y', '0');
  text.setAttribute('font-size', String(metersToWorldUnits(1))); text.setAttribute('class', 'ws-map-placement-preview-label');
  text.textContent = definition.label; preview.appendChild(text);
}
