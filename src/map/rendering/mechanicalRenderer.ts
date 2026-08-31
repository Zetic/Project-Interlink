import type { ApparatusDefinition } from '../../apparatus/definitions.js';
import { apparatusDefinitionById } from '../../apparatus/definitions.js';
import { mechanicalNodeById, resourceNodeById } from '../../graph/graphQueries.js';
import type { GraphState, MechanicalNode, PortEndpoint } from '../../graph/types.js';
import { metersToWorldUnits } from '../../world/scale.js';
import type { Point, Planet } from '../../world/types.js';
import { MECHANICAL_PLACEMENT_MIN_ZOOM, smoothStep } from '../camera/mapCamera.js';
import { resourcePortWorldPosition } from './resourceRenderer.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const MECHANICAL_NODE_FADE_START_ZOOM = MECHANICAL_PLACEMENT_MIN_ZOOM;
export const MECHANICAL_NODE_FULL_OPACITY_ZOOM = 2 ** 18;
export const MECHANICAL_NODE_DETAIL_MIN_TEXT_PIXELS = 5.75;
const HEADER_HEIGHT_METERS = 2.5;
const FONT_SIZE_METERS = 1.05;
const PORT_RADIUS_METERS = 0.75;

function svgElement<K extends keyof SVGElementTagNameMap>(tagName: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tagName);
}

function worldSize(node: MechanicalNode): { width: number; height: number } {
  return { width: metersToWorldUnits(node.physicalWidthMeters), height: metersToWorldUnits(node.physicalHeightMeters) };
}

export function mechanicalPortWorldPosition(node: MechanicalNode, portId: string): Point | null {
  const port = node.ports.find(candidate => candidate.id === portId);
  if (!port) return null;
  const size = worldSize(node);
  const sameSide = node.ports.filter(candidate => candidate.direction === port.direction);
  const index = sameSide.findIndex(candidate => candidate.id === port.id);
  const y = node.position.y - size.height / 2 + size.height * ((index + 1) / (sameSide.length + 1));
  return { x: node.position.x + (port.direction === 'input' ? -size.width / 2 : size.width / 2), y };
}

export function endpointWorldPosition(planet: Planet, graph: GraphState, endpoint: PortEndpoint): Point | null {
  const mechanical = mechanicalNodeById(graph, endpoint.nodeId);
  if (mechanical) return mechanicalPortWorldPosition(mechanical, endpoint.portId);
  const resource = resourceNodeById(planet, endpoint.nodeId);
  if (resource && endpoint.portId === resource.resourceAccessPortId) return resourcePortWorldPosition(resource);
  return null;
}

function appendNodeCard(group: SVGGElement, node: MechanicalNode): void {
  const size = worldSize(node); const halfWidth = size.width / 2; const halfHeight = size.height / 2;
  const headerHeight = metersToWorldUnits(Math.min(HEADER_HEIGHT_METERS, node.physicalHeightMeters * 0.32));
  const body = svgElement('rect');
  body.setAttribute('x', String(-halfWidth)); body.setAttribute('y', String(-halfHeight)); body.setAttribute('width', String(size.width)); body.setAttribute('height', String(size.height));
  body.setAttribute('rx', String(metersToWorldUnits(0.4))); body.setAttribute('class', 'ws-map-mechanical-card-body'); group.appendChild(body);
  const header = svgElement('rect'); header.setAttribute('x', String(-halfWidth)); header.setAttribute('y', String(-halfHeight)); header.setAttribute('width', String(size.width)); header.setAttribute('height', String(headerHeight));
  header.setAttribute('class', `ws-map-mechanical-card-header ws-map-mechanical-card-header--${node.category}`); group.appendChild(header);
  const details = svgElement('g'); details.setAttribute('class', 'ws-map-mechanical-details'); group.appendChild(details);
  const category = svgElement('text'); category.setAttribute('x', String(-halfWidth + metersToWorldUnits(0.7))); category.setAttribute('y', String(-halfHeight + headerHeight * 0.7)); category.setAttribute('font-size', String(metersToWorldUnits(0.85)));
  category.setAttribute('class', 'ws-map-mechanical-category'); category.textContent = node.category.toUpperCase(); details.appendChild(category);
  const label = svgElement('text'); label.setAttribute('x', '0'); label.setAttribute('y', String(metersToWorldUnits(0.7))); label.setAttribute('font-size', String(metersToWorldUnits(FONT_SIZE_METERS)));
  label.setAttribute('class', 'ws-map-mechanical-label'); label.textContent = node.label; details.appendChild(label);
  for (const port of node.ports) {
    const position = mechanicalPortWorldPosition({ ...node, position: { x: 0, y: 0 } }, port.id);
    if (!position) continue;
    const circle = svgElement('circle'); circle.setAttribute('cx', String(position.x)); circle.setAttribute('cy', String(position.y)); circle.setAttribute('r', String(metersToWorldUnits(PORT_RADIUS_METERS)));
    circle.setAttribute('class', `ws-map-mechanical-port ws-map-port ws-map-port--${port.direction} ws-map-port--${port.kind} ws-map-port--${port.medium}`);
    circle.setAttribute('data-node-id', node.id); circle.setAttribute('data-port-id', port.id); circle.setAttribute('data-port-kind', port.kind); circle.setAttribute('data-port-direction', port.direction); circle.setAttribute('data-port-medium', port.medium);
    const title = svgElement('title'); title.textContent = `${port.label} · ${port.direction} · ${port.medium}`; circle.appendChild(title); details.appendChild(circle);
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
    const path = svgElement('path'); path.setAttribute('d', connectionPath(start, end)); path.setAttribute('class', `ws-map-connection ws-map-connection--${connection.kind} ws-map-connection--${connection.medium}`);
    path.setAttribute('data-connection-id', connection.id); const title = svgElement('title'); title.textContent = `${connection.from.nodeId}:${connection.from.portId} → ${connection.to.nodeId}:${connection.to.portId}`; path.appendChild(title); connections.appendChild(path);
  }
  layer.appendChild(connections);
  const nodes = svgElement('g'); nodes.setAttribute('class', 'ws-map-mechanical-node-layer');
  for (const node of graph.nodes) {
    const group = svgElement('g'); group.setAttribute('transform', `translate(${node.position.x} ${node.position.y})`); group.setAttribute('class', `ws-map-mechanical-node ws-map-mechanical-node--${node.category}`);
    group.setAttribute('data-map-kind', 'mechanical'); group.setAttribute('data-mechanical-id', node.id);
    group.addEventListener('click', event => { if ((event.target as Element).closest('[data-port-id]')) return; event.stopPropagation(); onSelect(node.id); });
    appendNodeCard(group, node); nodes.appendChild(group);
  }
  layer.appendChild(nodes);
  const preview = svgElement('g'); preview.setAttribute('id', 'ws-map-placement-preview'); preview.setAttribute('class', 'ws-map-placement-preview'); preview.style.display = 'none'; layer.appendChild(preview);
  return layer;
}

export function updateMechanicalVisibility(svg: SVGSVGElement, zoom: number): void {
  const layer = svg.querySelector<SVGGElement>('.ws-map-mechanical-layer');
  if (layer) {
    const progress = (zoom - MECHANICAL_NODE_FADE_START_ZOOM) / (MECHANICAL_NODE_FULL_OPACITY_ZOOM - MECHANICAL_NODE_FADE_START_ZOOM);
    layer.style.opacity = smoothStep(progress).toFixed(3); layer.style.visibility = zoom <= MECHANICAL_NODE_FADE_START_ZOOM ? 'hidden' : 'visible';
    layer.style.pointerEvents = zoom >= MECHANICAL_PLACEMENT_MIN_ZOOM ? 'auto' : 'none';
  }
  const rect = svg.getBoundingClientRect(); const viewBox = svg.viewBox.baseVal;
  const unitsPerPixel = rect.width > 0 && viewBox.width > 0 ? viewBox.width / rect.width : 1;
  const detailVisible = unitsPerPixel > 0 && metersToWorldUnits(FONT_SIZE_METERS) / unitsPerPixel >= MECHANICAL_NODE_DETAIL_MIN_TEXT_PIXELS;
  for (const details of svg.querySelectorAll<SVGGElement>('.ws-map-mechanical-details')) {
    details.style.visibility = detailVisible ? 'visible' : 'hidden'; details.style.opacity = detailVisible ? '1' : '0';
  }
}

export function updatePlacementPreview(svg: SVGSVGElement, definition: ApparatusDefinition | null, position: Point | null): void {
  const preview = svg.querySelector<SVGGElement>('#ws-map-placement-preview');
  if (!preview) return;
  preview.replaceChildren();
  if (!definition || !position) { preview.style.display = 'none'; return; }
  preview.style.display = 'block'; preview.setAttribute('transform', `translate(${position.x} ${position.y})`);
  const rect = svgElement('rect'); const width = metersToWorldUnits(definition.physicalWidthMeters); const height = metersToWorldUnits(definition.physicalHeightMeters);
  rect.setAttribute('x', String(-width / 2)); rect.setAttribute('y', String(-height / 2)); rect.setAttribute('width', String(width)); rect.setAttribute('height', String(height)); rect.setAttribute('class', 'ws-map-placement-preview-body'); preview.appendChild(rect);
  const text = svgElement('text'); text.setAttribute('x', '0'); text.setAttribute('y', '0'); text.setAttribute('font-size', String(metersToWorldUnits(1))); text.setAttribute('class', 'ws-map-placement-preview-label'); text.textContent = definition.label; preview.appendChild(text);
}
