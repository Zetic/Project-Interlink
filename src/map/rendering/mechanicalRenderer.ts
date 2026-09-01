import type { ApparatusDefinition } from '../../apparatus/definitions.js';
import { apparatusDefinitionById } from '../../apparatus/definitions.js';
import { mechanicalNodeById, resourceNodeById } from '../../graph/graphQueries.js';
import type { GraphState, MechanicalNode, PortEndpoint } from '../../graph/types.js';
import type { RuntimeNodeSnapshot, RuntimeSnapshot } from '../../runtime/presentation.js';
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
const NODE_TEXT_MAX_WIDTH = NODE_CARD_LOCAL_WIDTH - 18;
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

function setFittedText(text: SVGTextElement, value: string): void {
  text.textContent = value;
  if (value.length > 22) {
    text.setAttribute('textLength', String(NODE_TEXT_MAX_WIDTH));
    text.setAttribute('lengthAdjust', 'spacingAndGlyphs');
  } else {
    text.removeAttribute('textLength');
    text.removeAttribute('lengthAdjust');
  }
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

function compactNodeLabel(node: MechanicalNode, definition: ApparatusDefinition | null): string {
  if (node.nodeType === 'roastingFurnace') return 'Roasting Furnace';
  if (node.nodeType === 'magSep') return 'Mag. Separator';
  return definition?.label ?? node.label;
}

function operatingState(node: MechanicalNode, runtime: RuntimeNodeSnapshot | undefined): string | null {
  if (node.nodeType === 'hopper' || node.nodeType === 'exhaustVent') return null;
  return runtime?.operatingState ?? (node.enabled ? 'on' : 'off');
}

function formatNodeLabel(node: MechanicalNode, runtime: RuntimeNodeSnapshot | undefined): string {
  const definition = apparatusDefinitionById(node.definitionId);
  const label = compactNodeLabel(node, definition);
  const state = operatingState(node, runtime);
  return state ? `${label} [${state}]` : label;
}

function formatParameterValue(node: MechanicalNode, definition: ApparatusDefinition | null): string | null {
  const parameter = definition?.parameters?.[0];
  if (!parameter || parameter.id === 'capacityKg') return null;
  const raw = node.parameters[parameter.id];
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return null;
  if (parameter.id === 'splitFractionToA') return `A ${(value * 100).toFixed(0)}%`;
  if (parameter.id === 'fieldStrength') return `B=${value.toFixed(2)}`;
  const choice = parameter.choices?.find(candidate => Math.abs(candidate.value - value) <= 1e-12);
  const formatted = choice?.label ?? `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(value < 1 ? 3 : 2)}${parameter.unit ? ` ${parameter.unit}` : ''}`;
  if (parameter.id === 'flowRateKgPerSecond' || parameter.id === 'rateKgPerSecond' || parameter.id === 'temperatureSetpointK') {
    return `Set ${formatted}`;
  }
  return formatted;
}

function formatRate(rate: number | undefined): string {
  return `${Number.isFinite(rate) ? rate!.toFixed(2) : '0.00'} kg/s`;
}

function hopperCapacityPercent(runtime: RuntimeNodeSnapshot | undefined): number | null {
  const stored = runtime?.storedMassKg;
  const free = runtime?.freeCapacityKg;
  if (!Number.isFinite(stored) || !Number.isFinite(free)) return null;
  const capacity = stored! + free!;
  if (!(capacity > 0)) return 0;
  return Math.max(0, Math.min(100, (stored! / capacity) * 100));
}

function formatCardLines(node: MechanicalNode, snapshot: RuntimeSnapshot | null): [string, string] {
  const runtime = snapshot?.nodes[node.id];
  const definition = apparatusDefinitionById(node.definitionId);
  if (node.nodeType === 'hopper') {
    const stored = runtime?.storedMassKg;
    const free = runtime?.freeCapacityKg;
    const mass = Number.isFinite(stored) && Number.isFinite(free)
      ? `${stored!.toFixed(1)} / ${(stored! + free!).toFixed(1)} kg`
      : 'Inventory —';
    const percent = hopperCapacityPercent(runtime);
    return [mass, percent == null ? '—' : `${Math.round(percent)}%`];
  }
  if (node.nodeType === 'roastingFurnace') {
    const zones = Number(definition?.runtimeDefaults?.internalZoneCount ?? 4);
    const holdUp = Number(definition?.runtimeDefaults?.effectiveChamberHoldUpKg ?? 0);
    const setting = formatParameterValue(node, definition)?.replace(/^Set /, '') ?? '—';
    const temperatureC = runtime?.temperatureK != null && Number.isFinite(runtime.temperatureK)
      ? runtime.temperatureK - 273.15
      : null;
    return [
      `${zones} zones · ${holdUp.toFixed(0)} kg`,
      `${temperatureC == null ? 'No charge' : `${temperatureC.toFixed(0)} °C`} · set ${setting}`,
    ];
  }
  if (node.nodeType === 'exhaustVent') {
    const emitted = runtime?.ventedGasMassKg;
    return ['Gas boundary', Number.isFinite(emitted) ? `${emitted!.toFixed(1)} kg vented` : 'Runtime —'];
  }

  const parameter = formatParameterValue(node, definition);
  const rate = runtime?.actualRateKgPerSecond;
  if (parameter) return [parameter, `Flow ${formatRate(rate)}`];
  return [`Flow ${formatRate(rate)}`, runtime?.blockedReason ? 'BLOCKED' : ''];
}

function appendNodeCard(group: SVGGElement, node: MechanicalNode): void {
  const body = svgElement('rect');
  body.setAttribute('x', String(-NODE_CARD_LOCAL_HALF_WIDTH)); body.setAttribute('y', String(-NODE_CARD_LOCAL_HALF_HEIGHT));
  body.setAttribute('width', String(NODE_CARD_LOCAL_WIDTH)); body.setAttribute('height', String(NODE_CARD_LOCAL_HEIGHT));
  body.setAttribute('rx', '3');
  body.setAttribute('class', `ws-map-mechanical-card-body ws-map-mechanical-card-body--${node.nodeType}`);
  group.appendChild(body);

  if (node.nodeType === 'hopper') {
    const fill = svgElement('rect');
    fill.setAttribute('x', String(-NODE_CARD_LOCAL_HALF_WIDTH)); fill.setAttribute('y', String(NODE_CARD_LOCAL_HALF_HEIGHT));
    fill.setAttribute('width', String(NODE_CARD_LOCAL_WIDTH)); fill.setAttribute('height', '0');
    fill.setAttribute('class', 'ws-map-hopper-fill'); fill.setAttribute('data-runtime-hopper-fill', node.id);
    group.appendChild(fill);
  }

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

  const label = svgElement('text'); label.setAttribute('x', '0'); label.setAttribute('y', '-3');
  label.setAttribute('font-size', String(NODE_CARD_LOCAL_BODY_FONT_SIZE));
  label.setAttribute('class', 'ws-map-mechanical-label'); label.setAttribute('data-runtime-node-label', node.id);
  setFittedText(label, formatNodeLabel(node, undefined)); details.appendChild(label);

  const [primaryValue, secondaryValue] = formatCardLines(node, null);
  const primary = svgElement('text'); primary.setAttribute('x', '0'); primary.setAttribute('y', '19');
  primary.setAttribute('font-size', String(NODE_CARD_LOCAL_BODY_FONT_SIZE));
  primary.setAttribute('class', 'ws-map-mechanical-runtime'); primary.setAttribute('data-runtime-node-text', node.id);
  setFittedText(primary, primaryValue); details.appendChild(primary);

  const secondary = svgElement('text'); secondary.setAttribute('x', '0'); secondary.setAttribute('y', '38');
  secondary.setAttribute('font-size', String(NODE_CARD_LOCAL_BODY_FONT_SIZE));
  secondary.setAttribute('class', node.nodeType === 'hopper' ? 'ws-map-mechanical-runtime ws-map-hopper-progress' : 'ws-map-mechanical-runtime');
  secondary.setAttribute('data-runtime-node-secondary', node.id);
  if (node.nodeType === 'hopper') secondary.setAttribute('data-runtime-hopper-percent', node.id);
  setFittedText(secondary, secondaryValue); details.appendChild(secondary);

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

export function updateMechanicalRuntimePresentation(
  svg: SVGSVGElement,
  graph: GraphState,
  snapshot: RuntimeSnapshot | null,
): void {
  for (const node of graph.nodes) {
    const runtime = snapshot?.nodes[node.id];
    const label = svg.querySelector<SVGTextElement>(`[data-runtime-node-label="${CSS.escape(node.id)}"]`);
    if (label) setFittedText(label, formatNodeLabel(node, runtime));

    const [primaryValue, secondaryValue] = formatCardLines(node, snapshot);
    const primary = svg.querySelector<SVGTextElement>(`[data-runtime-node-text="${CSS.escape(node.id)}"]`);
    if (primary) setFittedText(primary, primaryValue);
    const secondary = svg.querySelector<SVGTextElement>(`[data-runtime-node-secondary="${CSS.escape(node.id)}"]`);
    if (secondary) setFittedText(secondary, secondaryValue);

    if (node.nodeType !== 'hopper') continue;
    const percent = hopperCapacityPercent(runtime);
    const fill = svg.querySelector<SVGRectElement>(`[data-runtime-hopper-fill="${CSS.escape(node.id)}"]`);
    if (fill) {
      const fillHeight = percent == null ? 0 : NODE_CARD_LOCAL_HEIGHT * (percent / 100);
      fill.setAttribute('y', String(NODE_CARD_LOCAL_HALF_HEIGHT - fillHeight));
      fill.setAttribute('height', String(fillHeight));
    }
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
  setFittedText(text, definition.label); preview.appendChild(text);
}
