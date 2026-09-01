import type { ApparatusDefinition } from '../../apparatus/definitions.js';
import { apparatusDefinitionById } from '../../apparatus/definitions.js';
import { mechanicalNodeById, resourceNodeById } from '../../graph/graphQueries.js';
import type { GraphState, MechanicalNode, PortEndpoint } from '../../graph/types.js';
import type { RuntimeSnapshot } from '../../runtime/presentation.js';
import { metersToWorldUnits } from '../../world/scale.js';
import type { Point, Planet } from '../../world/types.js';
import {
  applyEngineeringNodeVisibility,
  ENGINEERING_NODE_HIDE_ZOOM,
  ENGINEERING_NODE_INTERACTIVE_ZOOM,
  ENGINEERING_NODE_SHOW_ZOOM,
} from './engineeringNodeVisibility.js';
import {
  localCardTransform,
  NODE_CARD_LOCAL_BODY_FONT_SIZE,
  NODE_CARD_LOCAL_CATEGORY_FONT_SIZE,
  NODE_CARD_LOCAL_HALF_HEIGHT,
  NODE_CARD_LOCAL_HALF_WIDTH,
  NODE_CARD_LOCAL_HEADER_HEIGHT,
  NODE_CARD_LOCAL_HEIGHT,
  NODE_CARD_LOCAL_PORT_RADIUS,
  NODE_CARD_LOCAL_WIDTH,
} from './nodeCardGeometry.js';
import {
  RESOURCE_NODE_PHYSICAL_HEIGHT_METERS,
  RESOURCE_NODE_PHYSICAL_WIDTH_METERS,
  RESOURCE_NODE_WORLD_HEIGHT,
  RESOURCE_NODE_WORLD_WIDTH,
  resourcePortWorldPosition,
} from './resourceRenderer.js';
import type { RenderOriginState } from './renderOrigin.js';
import { worldToRenderPoint } from './renderOrigin.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const MECHANICAL_NODE_HIDE_ZOOM = ENGINEERING_NODE_HIDE_ZOOM;
export const MECHANICAL_NODE_SHOW_ZOOM = ENGINEERING_NODE_SHOW_ZOOM;
export const MECHANICAL_NODE_INTERACTIVE_ZOOM = ENGINEERING_NODE_INTERACTIVE_ZOOM;
/** @deprecated Kept for compatibility; engineering cards no longer alpha-fade. */
export const MECHANICAL_NODE_FADE_START_ZOOM = MECHANICAL_NODE_HIDE_ZOOM;
/** @deprecated Kept for compatibility; engineering cards are fully opaque whenever visible. */
export const MECHANICAL_NODE_FULL_OPACITY_ZOOM = MECHANICAL_NODE_SHOW_ZOOM;
export const ENGINEERING_NODE_CARD_PHYSICAL_WIDTH_METERS = RESOURCE_NODE_PHYSICAL_WIDTH_METERS;
export const ENGINEERING_NODE_CARD_PHYSICAL_HEIGHT_METERS = RESOURCE_NODE_PHYSICAL_HEIGHT_METERS;

function svgElement<K extends keyof SVGElementTagNameMap>(tagName: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tagName);
}

function mechanicalPortLocalPosition(node: MechanicalNode, portId: string): Point | null {
  const port = node.ports.find(candidate => candidate.id === portId);
  if (!port) return null;
  const sameSide = node.ports.filter(candidate => candidate.direction === port.direction);
  const index = sameSide.findIndex(candidate => candidate.id === port.id);
  return {
    x: port.direction === 'input' ? -NODE_CARD_LOCAL_HALF_WIDTH : NODE_CARD_LOCAL_HALF_WIDTH,
    y: -NODE_CARD_LOCAL_HALF_HEIGHT + NODE_CARD_LOCAL_HEIGHT * ((index + 1) / (sameSide.length + 1)),
  };
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
  const body = svgElement('rect');
  body.setAttribute('x', String(-NODE_CARD_LOCAL_HALF_WIDTH)); body.setAttribute('y', String(-NODE_CARD_LOCAL_HALF_HEIGHT));
  body.setAttribute('width', String(NODE_CARD_LOCAL_WIDTH)); body.setAttribute('height', String(NODE_CARD_LOCAL_HEIGHT));
  body.setAttribute('rx', '3');
  body.setAttribute('class', `ws-map-mechanical-card-body ws-map-mechanical-card-body--${node.nodeType}`);
  group.appendChild(body);

  const header = svgElement('rect');
  header.setAttribute('x', String(-NODE_CARD_LOCAL_HALF_WIDTH)); header.setAttribute('y', String(-NODE_CARD_LOCAL_HALF_HEIGHT));
  header.setAttribute('width', String(NODE_CARD_LOCAL_WIDTH)); header.setAttribute('height', String(NODE_CARD_LOCAL_HEADER_HEIGHT));
  header.setAttribute('class', `ws-map-mechanical-card-header ws-map-mechanical-card-header--${node.category}`);
  group.appendChild(header);

  const details = svgElement('g'); details.setAttribute('class', 'ws-map-mechanical-details'); group.appendChild(details);
  const category = svgElement('text');
  category.setAttribute('x', '-70'); category.setAttribute('y', '-36');
  category.setAttribute('font-size', String(NODE_CARD_LOCAL_CATEGORY_FONT_SIZE));
  category.setAttribute('class', 'ws-map-mechanical-category');
  category.textContent = node.category.toUpperCase(); details.appendChild(category);

  const definition = apparatusDefinitionById(node.definitionId);
  const label = svgElement('text'); label.setAttribute('x', '0'); label.setAttribute('y', '2');
  label.setAttribute('font-size', String(NODE_CARD_LOCAL_BODY_FONT_SIZE));
  label.setAttribute('class', 'ws-map-mechanical-label');
  label.textContent = `${definition?.label ?? node.label} [${node.enabled ? 'on' : 'off'}]`;
  details.appendChild(label);

  const runtime = svgElement('text'); runtime.setAttribute('x', '0'); runtime.setAttribute('y', '28');
  runtime.setAttribute('font-size', String(NODE_CARD_LOCAL_BODY_FONT_SIZE));
  runtime.setAttribute('class', 'ws-map-mechanical-runtime');
  runtime.setAttribute('data-runtime-node-text', node.id);
  runtime.textContent = 'Runtime —';
  details.appendChild(runtime);

  for (const port of node.ports) {
    const position = mechanicalPortLocalPosition(node, port.id);
    if (!position) continue;
    const circle = svgElement('circle');
    circle.setAttribute('cx', String(position.x)); circle.setAttribute('cy', String(position.y));
    circle.setAttribute('r', String(NODE_CARD_LOCAL_PORT_RADIUS));
    circle.setAttribute('class', `ws-map-mechanical-port ws-map-port ws-map-port--${port.direction} ws-map-port--${port.kind} ws-map-port--${port.medium}`);
    circle.setAttribute('data-node-id', node.id); circle.setAttribute('data-port-id', port.id);
    circle.setAttribute('data-port-kind', port.kind); circle.setAttribute('data-port-direction', port.direction); circle.setAttribute('data-port-medium', port.medium);
    const title = svgElement('title'); title.textContent = `${port.label} · ${port.direction} · ${port.medium}`; circle.appendChild(title);
    details.appendChild(circle);
  }
}

function formatRuntimeText(node: MechanicalNode, snapshot: RuntimeSnapshot | null): string {
  const runtime = snapshot?.nodes[node.id];
  if (!runtime) return 'Runtime —';
  if (node.nodeType === 'extractor') {
    const state = (runtime.operatingState ?? 'idle').toUpperCase();
    const rate = runtime.actualRateKgPerSecond;
    return `${state} · ${Number.isFinite(rate) ? rate!.toFixed(2) : '0.00'} kg/s`;
  }
  if (node.nodeType === 'hopper') {
    const stored = runtime.storedMassKg;
    const free = runtime.freeCapacityKg;
    if (Number.isFinite(stored) && Number.isFinite(free)) return `${stored!.toFixed(1)} / ${(stored! + free!).toFixed(1)} kg`;
    return 'Inventory —';
  }
  return runtime.operatingState ? runtime.operatingState.toUpperCase() : 'Runtime —';
}

export function updateMechanicalRuntimePresentation(
  svg: SVGSVGElement,
  graph: GraphState,
  snapshot: RuntimeSnapshot | null,
): void {
  for (const node of graph.nodes) {
    const text = svg.querySelector<SVGTextElement>(`[data-runtime-node-text="${CSS.escape(node.id)}"]`);
    if (text) text.textContent = formatRuntimeText(node, snapshot);
  }
}

function connectionPath(start: Point, end: Point): string {
  const bend = Math.max(metersToWorldUnits(3), Math.abs(end.x - start.x) * 0.45);
  return `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${end.x - bend} ${end.y}, ${end.x} ${end.y}`;
}

export function renderMechanicalLayer(
  planet: Planet,
  graph: GraphState,
  renderOrigin: RenderOriginState,
  onSelect: (nodeId: string) => void,
): SVGGElement {
  const layer = svgElement('g'); layer.setAttribute('class', 'ws-map-mechanical-layer');
  const connections = svgElement('g'); connections.setAttribute('class', 'ws-map-connection-layer');
  for (const connection of graph.connections) {
    const startWorld = endpointWorldPosition(planet, graph, connection.from);
    const endWorld = endpointWorldPosition(planet, graph, connection.to);
    if (!startWorld || !endWorld) continue;
    const start = worldToRenderPoint(startWorld, renderOrigin);
    const end = worldToRenderPoint(endWorld, renderOrigin);
    const path = svgElement('path'); path.setAttribute('d', connectionPath(start, end));
    path.setAttribute('class', `ws-map-connection ws-map-connection--${connection.kind} ws-map-connection--${connection.medium}`);
    path.setAttribute('data-connection-id', connection.id);
    const title = svgElement('title'); title.textContent = `${connection.from.nodeId}:${connection.from.portId} → ${connection.to.nodeId}:${connection.to.portId}`;
    path.appendChild(title); connections.appendChild(path);
  }
  layer.appendChild(connections);

  const nodes = svgElement('g'); nodes.setAttribute('class', 'ws-map-mechanical-node-layer');
  for (const node of graph.nodes) {
    const position = worldToRenderPoint(node.position, renderOrigin);
    const group = svgElement('g'); group.setAttribute('transform', localCardTransform(position.x, position.y));
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
  applyEngineeringNodeVisibility(svg, svg.querySelector<SVGGElement>('.ws-map-mechanical-layer'), zoom);
}

export function updatePlacementPreview(
  svg: SVGSVGElement,
  definition: ApparatusDefinition | null,
  position: Point | null,
  renderOrigin: RenderOriginState,
): void {
  const preview = svg.querySelector<SVGGElement>('#ws-map-placement-preview');
  if (!preview) return;
  preview.replaceChildren();
  if (!definition || !position) { preview.style.display = 'none'; return; }
  const local = worldToRenderPoint(position, renderOrigin);
  preview.style.display = 'block'; preview.setAttribute('transform', localCardTransform(local.x, local.y));
  const rect = svgElement('rect');
  rect.setAttribute('x', String(-NODE_CARD_LOCAL_HALF_WIDTH)); rect.setAttribute('y', String(-NODE_CARD_LOCAL_HALF_HEIGHT));
  rect.setAttribute('width', String(NODE_CARD_LOCAL_WIDTH)); rect.setAttribute('height', String(NODE_CARD_LOCAL_HEIGHT));
  rect.setAttribute('class', 'ws-map-placement-preview-body'); preview.appendChild(rect);
  const text = svgElement('text'); text.setAttribute('x', '0'); text.setAttribute('y', '4');
  text.setAttribute('font-size', String(NODE_CARD_LOCAL_BODY_FONT_SIZE)); text.setAttribute('class', 'ws-map-placement-preview-label');
  text.textContent = definition.label; preview.appendChild(text);
}
