from pathlib import Path

files = {}

files['src/map/camera/mapCamera.ts'] = r'''import type { MapCameraState, Planet } from '../../world/types.js';

export const MAP_MIN_ZOOM = 1;
export const MAP_MAX_ZOOM = 2 ** 24;
export const MECHANICAL_PLACEMENT_MIN_ZOOM = 2 ** 17;
export const WHEEL_GEOGRAPHIC_SENSITIVITY = 0.0015;
export const WHEEL_ENGINEERING_SENSITIVITY = 0.00035;
export const WHEEL_ENGINEERING_BLEND_START_ZOOM = 2 ** 14;
export const WHEEL_ENGINEERING_BLEND_END_ZOOM = 2 ** 18;
export const WHEEL_CAMERA_RESPONSE_PER_SECOND = 20;

export interface VisibleWorldSize { width: number; height: number; }

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function smoothStep(value: number): number {
  const clamped = clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

export function wheelSensitivityForZoom(zoom: number): number {
  const logZoom = Math.log2(Math.max(MAP_MIN_ZOOM, zoom));
  const start = Math.log2(WHEEL_ENGINEERING_BLEND_START_ZOOM);
  const end = Math.log2(WHEEL_ENGINEERING_BLEND_END_ZOOM);
  const engineeringWeight = smoothStep((logZoom - start) / (end - start));
  return WHEEL_GEOGRAPHIC_SENSITIVITY
    + (WHEEL_ENGINEERING_SENSITIVITY - WHEEL_GEOGRAPHIC_SENSITIVITY) * engineeringWeight;
}

export function wheelZoomAfterDelta(zoom: number, deltaPixels: number): number {
  return clamp(zoom * Math.exp(-deltaPixels * wheelSensitivityForZoom(zoom)), MAP_MIN_ZOOM, MAP_MAX_ZOOM);
}

/** Frame-rate-independent logarithmic zoom easing used by manual wheel navigation. */
export function approachZoom(
  currentZoom: number,
  targetZoom: number,
  elapsedMs: number,
  responsePerSecond = WHEEL_CAMERA_RESPONSE_PER_SECOND,
): number {
  const seconds = clamp(elapsedMs, 0, 100) / 1000;
  const alpha = 1 - Math.exp(-Math.max(0, responsePerSecond) * seconds);
  if (alpha <= 0) return currentZoom;
  if (alpha >= 0.999999) return targetZoom;
  return Math.exp(Math.log(currentZoom) + (Math.log(targetZoom) - Math.log(currentZoom)) * alpha);
}

export function normalizeWheelDelta(event: WheelEvent, viewportHeight: number): number {
  let deltaPixels = event.deltaY;
  if (event.deltaMode === 1) deltaPixels *= 16;
  else if (event.deltaMode === 2) deltaPixels *= Math.max(1, viewportHeight);
  return clamp(deltaPixels, -240, 240);
}

export function camerasEqual(left: MapCameraState, right: MapCameraState): boolean {
  const positionTolerance = 1e-9;
  const zoomTolerance = Math.max(1e-9, Math.max(Math.abs(left.zoom), Math.abs(right.zoom)) * 1e-10);
  return Math.abs(left.centerX - right.centerX) < positionTolerance
    && Math.abs(left.centerY - right.centerY) < positionTolerance
    && Math.abs(left.zoom - right.zoom) < zoomTolerance;
}

export function formatZoomFactor(zoom: number): string {
  if (zoom < 10) return `${Math.round(zoom * 100)}%`;
  if (zoom < 1000) return `${Math.round(zoom)}×`;
  if (zoom < 1_000_000) {
    const thousands = zoom / 1000;
    return `${thousands >= 100 ? thousands.toFixed(0) : thousands.toFixed(1)}K×`;
  }
  const millions = zoom / 1_000_000;
  return `${millions >= 10 ? millions.toFixed(1) : millions.toFixed(2)}M×`;
}

export function visibleWorldSize(svg: SVGSVGElement, planet: Planet, zoom: number): VisibleWorldSize {
  const rect = svg.getBoundingClientRect();
  const viewportAspect = rect.width > 0 && rect.height > 0 ? rect.width / rect.height : planet.width / planet.height;
  const planetAspect = planet.width / planet.height;
  let fitWidth = planet.width;
  let fitHeight = planet.height;
  if (viewportAspect > planetAspect) fitWidth = planet.height * viewportAspect;
  else fitHeight = planet.width / viewportAspect;
  return { width: fitWidth / zoom, height: fitHeight / zoom };
}

export function clampCamera(svg: SVGSVGElement, planet: Planet, camera: MapCameraState): MapCameraState {
  const zoom = clamp(camera.zoom, MAP_MIN_ZOOM, MAP_MAX_ZOOM);
  const visible = visibleWorldSize(svg, planet, zoom);
  const centerX = visible.width >= planet.width ? planet.width / 2 : clamp(camera.centerX, visible.width / 2, planet.width - visible.width / 2);
  const centerY = visible.height >= planet.height ? planet.height / 2 : clamp(camera.centerY, visible.height / 2, planet.height - visible.height / 2);
  return { centerX, centerY, zoom };
}
'''

files['src/map/camera/cameraAnchor.ts'] = r'''import type { MapCameraState, Point } from '../../world/types.js';
import type { VisibleWorldSize } from './mapCamera.js';

export interface NormalizedScreenPoint {
  x: number;
  y: number;
}

export interface CameraAnchor {
  screen: NormalizedScreenPoint;
  world: Point;
}

export function worldPointAtNormalizedScreen(
  camera: MapCameraState,
  visible: VisibleWorldSize,
  screen: NormalizedScreenPoint,
): Point {
  return {
    x: camera.centerX + (screen.x - 0.5) * visible.width,
    y: camera.centerY + (screen.y - 0.5) * visible.height,
  };
}

/**
 * Derives camera center from an invariant world/screen anchor. The center is never
 * interpolated independently during wheel zoom, so the anchored world point cannot
 * perform the old lateral/vertical "wave" while zoom is easing.
 */
export function cameraForAnchor(
  anchor: CameraAnchor,
  visible: VisibleWorldSize,
  zoom: number,
): MapCameraState {
  return {
    centerX: anchor.world.x - (anchor.screen.x - 0.5) * visible.width,
    centerY: anchor.world.y - (anchor.screen.y - 0.5) * visible.height,
    zoom,
  };
}
'''

files['src/map/rendering/renderOrigin.ts'] = r'''import type { MapCameraState, Point } from '../../world/types.js';

export const FLOATING_ORIGIN_ENTER_ZOOM = 2 ** 15;
export const FLOATING_ORIGIN_EXIT_ZOOM = 2 ** 14;
export const FLOATING_ORIGIN_RECENTER_DISTANCE_WORLD_UNITS = 0.25;

export interface RenderOriginState {
  active: boolean;
  origin: Point;
}

export interface RenderOriginOptions {
  recenter?: boolean;
  allowDeactivate?: boolean;
}

export function initialRenderOrigin(): RenderOriginState {
  return { active: false, origin: { x: 0, y: 0 } };
}

export function renderOriginForCamera(
  current: RenderOriginState,
  camera: MapCameraState,
  options: RenderOriginOptions = {},
): RenderOriginState {
  if (!current.active) {
    if (camera.zoom < FLOATING_ORIGIN_ENTER_ZOOM) return current;
    return { active: true, origin: { x: camera.centerX, y: camera.centerY } };
  }

  if (options.allowDeactivate && camera.zoom <= FLOATING_ORIGIN_EXIT_ZOOM) {
    return initialRenderOrigin();
  }

  if (options.recenter) {
    const distance = Math.hypot(camera.centerX - current.origin.x, camera.centerY - current.origin.y);
    if (distance >= FLOATING_ORIGIN_RECENTER_DISTANCE_WORLD_UNITS) {
      return { active: true, origin: { x: camera.centerX, y: camera.centerY } };
    }
  }

  return current;
}

export function sameRenderOrigin(left: RenderOriginState, right: RenderOriginState): boolean {
  return left.active === right.active
    && left.origin.x === right.origin.x
    && left.origin.y === right.origin.y;
}

export function worldToRenderPoint(point: Point, state: RenderOriginState): Point {
  return { x: point.x - state.origin.x, y: point.y - state.origin.y };
}
'''

files['src/map/rendering/engineeringNodeVisibility.ts'] = r'''import { MECHANICAL_PLACEMENT_MIN_ZOOM } from '../camera/mapCamera.js';

/**
 * Engineering cards use a hard visibility boundary with hysteresis instead of
 * fractional alpha. FEATURE, APPARATUS, and CONTAINER cards always appear as one
 * complete unit: box, header, text, and ports.
 */
export const ENGINEERING_NODE_SHOW_ZOOM = 2 ** 16;
export const ENGINEERING_NODE_HIDE_ZOOM = 55_000;
export const ENGINEERING_NODE_INTERACTIVE_ZOOM = MECHANICAL_PLACEMENT_MIN_ZOOM;

export function engineeringNodesVisibleAtZoom(zoom: number, wasVisible: boolean): boolean {
  return wasVisible ? zoom > ENGINEERING_NODE_HIDE_ZOOM : zoom >= ENGINEERING_NODE_SHOW_ZOOM;
}

export function applyEngineeringNodeVisibility(svg: SVGSVGElement, layer: SVGGElement | null, zoom: number): void {
  if (!layer) return;
  const wasVisible = svg.dataset.engineeringNodesVisible === 'true';
  const visible = engineeringNodesVisibleAtZoom(zoom, wasVisible);
  svg.dataset.engineeringNodesVisible = visible ? 'true' : 'false';
  layer.style.opacity = '1';
  layer.style.visibility = visible ? 'visible' : 'hidden';
  layer.style.pointerEvents = visible && zoom >= ENGINEERING_NODE_INTERACTIVE_ZOOM ? 'auto' : 'none';
}
'''

files['src/map/rendering/resourceRenderer.ts'] = r'''import { resourceDefinitionById } from '../../world/resources.js';
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
'''

files['src/map/rendering/mechanicalRenderer.ts'] = r'''import type { ApparatusDefinition } from '../../apparatus/definitions.js';
import { apparatusDefinitionById } from '../../apparatus/definitions.js';
import { mechanicalNodeById, resourceNodeById } from '../../graph/graphQueries.js';
import type { GraphState, MechanicalNode, PortEndpoint } from '../../graph/types.js';
import { metersToWorldUnits } from '../../world/scale.js';
import type { Point, Planet } from '../../world/types.js';
import {
  applyEngineeringNodeVisibility,
  ENGINEERING_NODE_HIDE_ZOOM,
  ENGINEERING_NODE_INTERACTIVE_ZOOM,
  ENGINEERING_NODE_SHOW_ZOOM,
} from './engineeringNodeVisibility.js';
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
    const group = svgElement('g'); group.setAttribute('transform', `translate(${position.x} ${position.y})`);
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
  preview.style.display = 'block'; preview.setAttribute('transform', `translate(${local.x} ${local.y})`);
  const rect = svgElement('rect');
  rect.setAttribute('x', String(-RESOURCE_NODE_WORLD_WIDTH / 2)); rect.setAttribute('y', String(-RESOURCE_NODE_WORLD_HEIGHT / 2));
  rect.setAttribute('width', String(RESOURCE_NODE_WORLD_WIDTH)); rect.setAttribute('height', String(RESOURCE_NODE_WORLD_HEIGHT));
  rect.setAttribute('class', 'ws-map-placement-preview-body'); preview.appendChild(rect);
  const text = svgElement('text'); text.setAttribute('x', '0'); text.setAttribute('y', '0');
  text.setAttribute('font-size', String(metersToWorldUnits(1))); text.setAttribute('class', 'ws-map-placement-preview-label');
  text.textContent = definition.label; preview.appendChild(text);
}
'''

files['src/map/mapRenderer.ts'] = r'''import { apparatusDefinitionById } from '../apparatus/definitions.js';
import { connectPorts, moveMechanicalNode, placeMechanicalNode, removeMechanicalNode } from '../graph/graphCommands.js';
import { mechanicalNodeById, portForEndpoint } from '../graph/graphQueries.js';
import type { GraphState, PortEndpoint } from '../graph/types.js';
import type { AppState, AppStore } from '../state/appState.js';
import { polygonCentroid } from '../world/geometry.js';
import { formatPhysicalDistance, worldUnitsToMeters } from '../world/scale.js';
import type { MapCameraState, MapSelection, Planet, Point } from '../world/types.js';
import { cameraForAnchor, worldPointAtNormalizedScreen, type CameraAnchor } from './camera/cameraAnchor.js';
import {
  MAP_MAX_ZOOM, MAP_MIN_ZOOM, MECHANICAL_PLACEMENT_MIN_ZOOM, approachZoom, camerasEqual, clamp, clampCamera, formatZoomFactor,
  normalizeWheelDelta, smoothStep, visibleWorldSize, wheelSensitivityForZoom, wheelZoomAfterDelta,
  WHEEL_ENGINEERING_BLEND_END_ZOOM, WHEEL_ENGINEERING_BLEND_START_ZOOM, WHEEL_ENGINEERING_SENSITIVITY, WHEEL_GEOGRAPHIC_SENSITIVITY,
} from './camera/mapCamera.js';
import { renderMechanicalLayer, updateMechanicalVisibility, updatePlacementPreview } from './rendering/mechanicalRenderer.js';
import {
  renderResourceLayer, updateResourceVisibility,
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

const SVG_NS = 'http://www.w3.org/2000/svg';
const REGION_LABEL_FADE_START_ZOOM = 3.5;
const REGION_LABEL_FADE_END_ZOOM = 6.5;

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

  const regions = svgElement('g'); regions.setAttribute('class', 'ws-map-region-layer');
  const labels = svgElement('g'); labels.setAttribute('class', 'ws-map-region-label-layer');
  planet.regions.forEach((region, index) => {
    const polygon = svgElement('polygon');
    polygon.setAttribute('points', region.polygon.map(point => {
      const local = worldToRenderPoint(point, renderOrigin);
      return `${local.x},${local.y}`;
    }).join(' '));
    polygon.setAttribute('class', `ws-map-region ws-map-region--${index % 5}`); polygon.setAttribute('data-map-kind', 'region'); polygon.setAttribute('data-region-id', region.id);
    polygon.addEventListener('click', event => { event.stopPropagation(); store.setSelection({ type: 'region', regionId: region.id }); }); regions.appendChild(polygon);
    const centroid = worldToRenderPoint(polygonCentroid(region.polygon), renderOrigin);
    const label = svgElement('text'); label.setAttribute('x', centroid.x.toFixed(6)); label.setAttribute('y', centroid.y.toFixed(6)); label.setAttribute('class', 'ws-map-region-label'); label.textContent = region.name; labels.appendChild(label);
  });

  svg.append(
    regions,
    labels,
    renderResourceLayer(planet, renderOrigin, resourceId => store.setSelection({ type: 'resource', resourceNodeId: resourceId })),
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
  const labels = svg.querySelector<SVGGElement>('.ws-map-region-label-layer');
  if (labels) {
    const progress = (zoom - REGION_LABEL_FADE_START_ZOOM) / (REGION_LABEL_FADE_END_ZOOM - REGION_LABEL_FADE_START_ZOOM);
    labels.style.opacity = (1 - smoothStep(progress)).toFixed(3);
    labels.style.visibility = zoom >= REGION_LABEL_FADE_END_ZOOM ? 'hidden' : 'visible';
  }
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
  let displayCamera: MapCameraState = { centerX: 0, centerY: 0, zoom: 1 };
  let renderOrigin = initialRenderOrigin();
  let navigationAnimationFrame: number | null = null;
  let wheelAnimationFrame: number | null = null;
  let wheelTargetCamera: MapCameraState | null = null;
  let wheelAnchor: CameraAnchor | null = null;
  let wheelLastFrameAt: number | null = null;
  let internalCameraUpdate = false;
  let pointerId: number | null = null;
  let panStartClient = { x: 0, y: 0 };
  let panStartCamera = displayCamera;
  let draggedNodeId: string | null = null;
  let dragStartNode: Point | null = null;
  let hoverWorld: Point | null = null;
  let suppressClick = false;

  const refreshPreview = (state: Readonly<AppState>): void => {
    const definition = state.interaction.placementDefinitionId ? apparatusDefinitionById(state.interaction.placementDefinitionId) : null;
    updatePlacementPreview(svg, definition, hoverWorld, renderOrigin);
  };

  const rerenderCurrentWorld = (): void => {
    const state = store.getState();
    const planet = state.world?.planet;
    if (!planet) return;
    renderedPlanet = planet; renderedGraph = state.graph;
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
    const planet = state.world?.planet;
    if (!planet) return;
    if (renderedPlanet !== planet || renderedGraph !== state.graph) {
      renderedPlanet = planet; renderedGraph = state.graph;
      renderWorld(svg, planet, state.graph, store, renderOrigin);
      applyCamera(displayCamera.zoom === 1 && displayCamera.centerX === 0 ? state.camera : displayCamera);
    } else if (!internalCameraUpdate && !camerasEqual(displayCamera, state.camera)) {
      animateToCamera(state.camera);
    }
    updateSelection(svg, state.selection); updatePendingPort(svg, state.interaction.pendingConnection); refreshPreview(state);
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
    if (event.button !== 0) return;
    cancelWheelAnimation(true); cancelNavigationAnimation();
    const state = store.getState(); const target = event.target as Element; if (target.closest('[data-port-id]')) return;
    pointerId = event.pointerId; panStartClient = { x: event.clientX, y: event.clientY }; panStartCamera = { ...displayCamera }; suppressClick = false; draggedNodeId = null; dragStartNode = null;
    const mechanical = target.closest<SVGGElement>('[data-mechanical-id]');
    if (mechanical && !state.interaction.placementDefinitionId) {
      const id = mechanical.getAttribute('data-mechanical-id'); const node = id ? mechanicalNodeById(state.graph, id) : null;
      if (id && node) { draggedNodeId = id; dragStartNode = { ...node.position }; store.setSelection({ type: 'mechanical', mechanicalNodeId: id }); }
    }
    svg.setPointerCapture(event.pointerId);
  });

  svg.addEventListener('pointermove', event => {
    const planet = store.getState().world?.planet;
    if (!planet) return;
    hoverWorld = screenToWorld(svg, planet, displayCamera, event.clientX, event.clientY); refreshPreview(store.getState());
    if (pointerId !== event.pointerId) return;
    const rect = svg.getBoundingClientRect(); if (rect.width <= 0 || rect.height <= 0) return;
    const dx = event.clientX - panStartClient.x; const dy = event.clientY - panStartClient.y;
    if (Math.hypot(dx, dy) > 4) suppressClick = true;
    const visible = visibleWorldSize(svg, planet, panStartCamera.zoom);
    if (draggedNodeId && dragStartNode) {
      const graph = store.getState().graph;
      store.setGraph(moveMechanicalNode(graph, draggedNodeId, {
        x: dragStartNode.x + dx * (visible.width / rect.width),
        y: dragStartNode.y + dy * (visible.height / rect.height),
      }));
      return;
    }
    applyCamera({
      centerX: panStartCamera.centerX - dx * (visible.width / rect.width),
      centerY: panStartCamera.centerY - dy * (visible.height / rect.height),
      zoom: panStartCamera.zoom,
    });
  });

  const finishPointer = (event: PointerEvent): void => {
    if (pointerId !== event.pointerId) return;
    const wasPanning = suppressClick && !draggedNodeId;
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    pointerId = null; draggedNodeId = null; dragStartNode = null;
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
'''

files['tests/mapCameraState.test.js'] = r'''import assert from 'node:assert/strict';
import test from 'node:test';

import { RESOURCE_FOCUS_ZOOM, AppStore } from '../dist/state/appState.js';
import {
  MAP_MAX_ZOOM,
  RESOURCE_NODE_HIDE_ZOOM,
  RESOURCE_NODE_INTERACTIVE_ZOOM,
  RESOURCE_NODE_PHYSICAL_WIDTH_METERS,
  RESOURCE_NODE_SHOW_ZOOM,
  RESOURCE_NODE_WORLD_WIDTH,
  WHEEL_ENGINEERING_BLEND_END_ZOOM,
  WHEEL_ENGINEERING_BLEND_START_ZOOM,
  WHEEL_ENGINEERING_SENSITIVITY,
  WHEEL_GEOGRAPHIC_SENSITIVITY,
  wheelSensitivityForZoom,
  wheelZoomAfterDelta,
} from '../dist/map/mapRenderer.js';
import { generateWorld } from '../dist/world/generateWorld.js';
import { worldUnitsToMeters } from '../dist/world/scale.js';

test('NAV-style region focus selects and moves the camera toward the region', () => {
  const world = generateWorld('region-focus');
  const store = new AppStore();
  store.setWorld(world);
  const region = world.planet.regions[2];

  store.focusSelection({ type: 'region', regionId: region.id });
  const state = store.getState();

  assert.deepEqual(state.selection, { type: 'region', regionId: region.id });
  assert.equal(state.camera.centerX, region.bounds.x + region.bounds.width / 2);
  assert.equal(state.camera.centerY, region.bounds.y + region.bounds.height / 2);
  assert.ok(state.camera.zoom >= 2);
});

test('NAV resource focus reaches Earth-scale engineering depth', () => {
  const world = generateWorld('resource-focus');
  const store = new AppStore();
  store.setWorld(world);
  const resource = world.planet.resourceNodes[0];

  store.focusSelection({ type: 'resource', resourceNodeId: resource.id });
  const state = store.getState();

  assert.deepEqual(state.selection, { type: 'resource', resourceNodeId: resource.id });
  assert.equal(state.camera.centerX, resource.position.x);
  assert.equal(state.camera.centerY, resource.position.y);
  assert.equal(state.camera.zoom, RESOURCE_FOCUS_ZOOM);
  assert.equal(RESOURCE_FOCUS_ZOOM, 2 ** 19);
  assert.equal(MAP_MAX_ZOOM, 2 ** 24);
  assert.ok(RESOURCE_FOCUS_ZOOM > RESOURCE_NODE_SHOW_ZOOM);
  assert.ok(MAP_MAX_ZOOM > RESOURCE_FOCUS_ZOOM);

  const nominalVisibleWidthMeters = world.planet.physicalWidthMeters / RESOURCE_FOCUS_ZOOM;
  assert.ok(nominalVisibleWidthMeters > 70 && nominalVisibleWidthMeters < 80);
});

test('resource FEATURE cards use a meter-scale footprint and hysteretic visibility', () => {
  const world = generateWorld('resource-scale');
  assert.equal(RESOURCE_NODE_PHYSICAL_WIDTH_METERS, 20);
  assert.ok(Math.abs(worldUnitsToMeters(RESOURCE_NODE_WORLD_WIDTH) - 20) < 1e-9);
  assert.ok(RESOURCE_NODE_WORLD_WIDTH / world.planet.width < 0.000001);
  assert.equal(RESOURCE_NODE_SHOW_ZOOM, 2 ** 16);
  assert.equal(RESOURCE_NODE_HIDE_ZOOM, 55_000);
  assert.equal(RESOURCE_NODE_INTERACTIVE_ZOOM, 2 ** 17);
});

test('wheel zoom becomes fine-grained around resources and returns to geographic speed when backing out', () => {
  assert.equal(WHEEL_ENGINEERING_BLEND_START_ZOOM, 2 ** 14);
  assert.equal(WHEEL_ENGINEERING_BLEND_END_ZOOM, 2 ** 18);
  assert.ok(WHEEL_ENGINEERING_SENSITIVITY < WHEEL_GEOGRAPHIC_SENSITIVITY);
  assert.equal(wheelSensitivityForZoom(2 ** 13), WHEEL_GEOGRAPHIC_SENSITIVITY);
  assert.ok(Math.abs(wheelSensitivityForZoom(2 ** 19) - WHEEL_ENGINEERING_SENSITIVITY) < 1e-12);

  const engineeringStart = 288_000;
  const engineeringNext = wheelZoomAfterDelta(engineeringStart, 100);
  const engineeringRatio = engineeringNext / engineeringStart;
  assert.ok(engineeringRatio > 0.95 && engineeringRatio < 1, `engineering wheel ratio ${engineeringRatio}`);

  const geographicStart = 8_000;
  const geographicNext = wheelZoomAfterDelta(geographicStart, 100);
  const geographicRatio = geographicNext / geographicStart;
  assert.ok(geographicRatio < 0.9, `geographic wheel ratio ${geographicRatio}`);
  assert.ok(geographicRatio < engineeringRatio);

  const middleSensitivity = wheelSensitivityForZoom(2 ** 16);
  assert.ok(middleSensitivity < WHEEL_GEOGRAPHIC_SENSITIVITY);
  assert.ok(middleSensitivity > WHEEL_ENGINEERING_SENSITIVITY);
});

test('planet focus restores the full-map camera', () => {
  const world = generateWorld('planet-focus');
  const store = new AppStore();
  store.setWorld(world);
  store.setCamera({ centerX: 100, centerY: 100, zoom: 9 });

  store.focusSelection({ type: 'planet' });
  const state = store.getState();

  assert.deepEqual(state.selection, { type: 'planet' });
  assert.deepEqual(state.camera, {
    centerX: world.planet.width / 2,
    centerY: world.planet.height / 2,
    zoom: 1,
  });
});
'''

files['tests/mapRenderingSmoothness.test.js'] = r'''import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { cameraForAnchor, worldPointAtNormalizedScreen } from '../dist/map/camera/cameraAnchor.js';
import { approachZoom } from '../dist/map/camera/mapCamera.js';
import {
  ENGINEERING_NODE_HIDE_ZOOM,
  ENGINEERING_NODE_INTERACTIVE_ZOOM,
  ENGINEERING_NODE_SHOW_ZOOM,
  engineeringNodesVisibleAtZoom,
} from '../dist/map/rendering/engineeringNodeVisibility.js';
import {
  FLOATING_ORIGIN_ENTER_ZOOM,
  FLOATING_ORIGIN_EXIT_ZOOM,
  initialRenderOrigin,
  renderOriginForCamera,
  worldToRenderPoint,
} from '../dist/map/rendering/renderOrigin.js';
import {
  MECHANICAL_NODE_HIDE_ZOOM,
  MECHANICAL_NODE_INTERACTIVE_ZOOM,
  MECHANICAL_NODE_SHOW_ZOOM,
} from '../dist/map/rendering/mechanicalRenderer.js';
import {
  RESOURCE_NODE_HIDE_ZOOM,
  RESOURCE_NODE_INTERACTIVE_ZOOM,
  RESOURCE_NODE_SHOW_ZOOM,
} from '../dist/map/rendering/resourceRenderer.js';

test('FEATURE and mechanical cards share one hysteretic engineering visibility policy', () => {
  assert.equal(RESOURCE_NODE_HIDE_ZOOM, ENGINEERING_NODE_HIDE_ZOOM);
  assert.equal(MECHANICAL_NODE_HIDE_ZOOM, ENGINEERING_NODE_HIDE_ZOOM);
  assert.equal(RESOURCE_NODE_SHOW_ZOOM, ENGINEERING_NODE_SHOW_ZOOM);
  assert.equal(MECHANICAL_NODE_SHOW_ZOOM, ENGINEERING_NODE_SHOW_ZOOM);
  assert.equal(RESOURCE_NODE_INTERACTIVE_ZOOM, ENGINEERING_NODE_INTERACTIVE_ZOOM);
  assert.equal(MECHANICAL_NODE_INTERACTIVE_ZOOM, ENGINEERING_NODE_INTERACTIVE_ZOOM);

  assert.equal(engineeringNodesVisibleAtZoom(ENGINEERING_NODE_SHOW_ZOOM - 1, false), false);
  assert.equal(engineeringNodesVisibleAtZoom(ENGINEERING_NODE_SHOW_ZOOM, false), true);
  assert.equal(engineeringNodesVisibleAtZoom(60_000, true), true);
  assert.equal(engineeringNodesVisibleAtZoom(60_000, false), false);
  assert.equal(engineeringNodesVisibleAtZoom(ENGINEERING_NODE_HIDE_ZOOM, true), false);
});

test('node text remains part of the card and engineering nodes never alpha-fade', () => {
  const resourceRenderer = fs.readFileSync('src/map/rendering/resourceRenderer.ts', 'utf8');
  const mechanicalRenderer = fs.readFileSync('src/map/rendering/mechanicalRenderer.ts', 'utf8');
  const visibility = fs.readFileSync('src/map/rendering/engineeringNodeVisibility.ts', 'utf8');
  assert.doesNotMatch(resourceRenderer, /DETAIL_MIN_TEXT_PIXELS|details\.style\.(?:visibility|opacity)/);
  assert.doesNotMatch(mechanicalRenderer, /DETAIL_MIN_TEXT_PIXELS|details\.style\.(?:visibility|opacity)/);
  assert.doesNotMatch(visibility, /smoothStep|toFixed\(3\)/);
  assert.match(visibility, /layer\.style\.opacity = '1'/);
});

test('every intermediate wheel frame preserves the exact cursor/world anchor', () => {
  const screen = { x: 0.31, y: 0.68 };
  const initialZoom = 288_000;
  const targetZoom = 180_000;
  const fitWidth = 4096;
  const fitHeight = 2048;
  let camera = { centerX: 2187.428194, centerY: 916.582013, zoom: initialZoom };
  let visible = { width: fitWidth / camera.zoom, height: fitHeight / camera.zoom };
  const anchor = { screen, world: worldPointAtNormalizedScreen(camera, visible, screen) };

  for (let frame = 0; frame < 20; frame += 1) {
    const zoom = approachZoom(camera.zoom, targetZoom, 16.67);
    visible = { width: fitWidth / zoom, height: fitHeight / zoom };
    camera = cameraForAnchor(anchor, visible, zoom);
    const resolved = worldPointAtNormalizedScreen(camera, visible, screen);
    assert.ok(Math.abs(resolved.x - anchor.world.x) < 1e-12, `frame ${frame} x drift`);
    assert.ok(Math.abs(resolved.y - anchor.world.y) < 1e-12, `frame ${frame} y drift`);
  }
});

test('floating origin keeps engineering geometry close to zero and has its own hysteresis', () => {
  const worldCamera = { centerX: 2187.428194, centerY: 916.582013, zoom: 2 ** 19 };
  let state = initialRenderOrigin();
  state = renderOriginForCamera(state, worldCamera);
  assert.equal(state.active, true);
  assert.equal(FLOATING_ORIGIN_ENTER_ZOOM, 2 ** 15);
  assert.equal(FLOATING_ORIGIN_EXIT_ZOOM, 2 ** 14);

  const local = worldToRenderPoint({ x: worldCamera.centerX + 0.002, y: worldCamera.centerY - 0.001 }, state);
  assert.ok(Math.abs(local.x - 0.002) < 1e-12);
  assert.ok(Math.abs(local.y + 0.001) < 1e-12);

  state = renderOriginForCamera(state, { ...worldCamera, zoom: FLOATING_ORIGIN_EXIT_ZOOM - 1 }, { allowDeactivate: true });
  assert.deepEqual(state, initialRenderOrigin());
});

test('camera updates no longer force unrelated panels to rebuild every frame', () => {
  const nav = fs.readFileSync('src/ui/navigationPanel.ts', 'utf8');
  const inspector = fs.readFileSync('src/ui/inspectorPanel.ts', 'utf8');
  const debug = fs.readFileSync('src/ui/debugPanel.ts', 'utf8');
  const renderer = fs.readFileSync('src/map/mapRenderer.ts', 'utf8');
  assert.match(nav, /state\.world === lastWorld/);
  assert.match(inspector, /state\.world === lastWorld && state\.graph === lastGraph/);
  assert.doesNotMatch(debug, /if \(!drawer\.hidden\) render\(\);/);
  assert.match(renderer, /wheelAnchor/);
  assert.match(renderer, /cameraForAnchor/);
});

test('engineering renderer uses camera-relative coordinates at deep zoom', () => {
  const renderer = fs.readFileSync('src/map/mapRenderer.ts', 'utf8');
  const resource = fs.readFileSync('src/map/rendering/resourceRenderer.ts', 'utf8');
  const mechanical = fs.readFileSync('src/map/rendering/mechanicalRenderer.ts', 'utf8');
  assert.match(renderer, /localCenterX = displayCamera\.centerX - renderOrigin\.origin\.x/);
  assert.match(resource, /worldToRenderPoint\(resource\.position, renderOrigin\)/);
  assert.match(mechanical, /worldToRenderPoint\(node\.position, renderOrigin\)/);
  assert.match(mechanical, /worldToRenderPoint\(startWorld, renderOrigin\)/);
});
'''

for path, content in files.items():
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding='utf-8')

css_path = Path('map.css')
css = css_path.read_text(encoding='utf-8')
marker = '/* Deep-zoom SVG rasterization hints. */'
if marker not in css:
    css += r'''

/* Deep-zoom SVG rasterization hints. */
.ws-map-resource-node,
.ws-map-mechanical-node,
.ws-map-connection {
  shape-rendering: geometricPrecision;
}

.ws-map-resource-category,
.ws-map-resource-name,
.ws-map-resource-type,
.ws-map-resource-material,
.ws-map-mechanical-category,
.ws-map-mechanical-label {
  text-rendering: geometricPrecision;
}
'''
    css_path.write_text(css, encoding='utf-8')
