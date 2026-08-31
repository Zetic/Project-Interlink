from pathlib import Path


def write(path: str, content: str) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


write('src/world/types.ts', r'''export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ResourceCategory = 'metallic' | 'industrial' | 'fuel' | 'volatile';

export interface ResourceDefinition {
  id: string;
  name: string;
  category: ResourceCategory;
}

export type NodePortDirection = 'input' | 'output';
export type NodePortKind = 'resource-access' | 'material';
export type NodePortMedium = 'resource' | 'solid' | 'gas';

export interface NodePort {
  id: string;
  direction: NodePortDirection;
  kind: NodePortKind;
  medium: NodePortMedium;
  label: string;
}

export interface ResourceNode {
  id: string;
  name: string;
  resourceId: string;
  regionId: string;
  position: Point;
  nodeType: 'feature';
  featureType: 'mineral-deposit';
  resourceAccessPortId: 'resource-access';
  ports: NodePort[];
}

export interface Region {
  id: string;
  name: string;
  bounds: Bounds;
  polygon: Point[];
  resourceNodeIds: string[];
}

export interface Planet {
  id: string;
  seed: string;
  name: string;
  width: number;
  height: number;
  physicalWidthMeters: number;
  physicalHeightMeters: number;
  regions: Region[];
  resourceNodes: ResourceNode[];
}

export interface WorldState {
  planet: Planet;
}

export type MapSelection =
  | { type: 'planet' }
  | { type: 'region'; regionId: string }
  | { type: 'resource'; resourceNodeId: string }
  | { type: 'mechanical'; mechanicalNodeId: string };

export interface MapCameraState {
  centerX: number;
  centerY: number;
  zoom: number;
}
''')

write('src/graph/types.ts', r'''import type { NodePort, Point } from '../world/types.js';

export type MechanicalNodeCategory = 'apparatus' | 'container';

export interface MechanicalNode {
  id: string;
  definitionId: string;
  nodeType: string;
  label: string;
  category: MechanicalNodeCategory;
  position: Point;
  physicalWidthMeters: number;
  physicalHeightMeters: number;
  ports: NodePort[];
  enabled: boolean;
}

export interface PortEndpoint {
  nodeId: string;
  portId: string;
}

export interface NodeConnection {
  id: string;
  from: PortEndpoint;
  to: PortEndpoint;
  kind: NodePort['kind'];
  medium: NodePort['medium'];
}

export interface GraphState {
  nodes: MechanicalNode[];
  connections: NodeConnection[];
  nextNodeSequence: number;
  nextConnectionSequence: number;
}
''')

write('src/apparatus/definitions.ts', r'''import type { MechanicalNodeCategory } from '../graph/types.js';
import type { NodePort } from '../world/types.js';

export interface ApparatusDefinition {
  id: string;
  nodeType: string;
  label: string;
  category: MechanicalNodeCategory;
  description: string;
  searchTerms: readonly string[];
  order: number;
  physicalWidthMeters: number;
  physicalHeightMeters: number;
  ports: readonly NodePort[];
}

const resourceInput = (id: string, label: string): NodePort => ({
  id,
  direction: 'input',
  kind: 'resource-access',
  medium: 'resource',
  label,
});

const solidInput = (id: string, label: string): NodePort => ({
  id,
  direction: 'input',
  kind: 'material',
  medium: 'solid',
  label,
});

const solidOutput = (id: string, label: string): NodePort => ({
  id,
  direction: 'output',
  kind: 'material',
  medium: 'solid',
  label,
});

const gasInput = (id: string, label: string): NodePort => ({
  id,
  direction: 'input',
  kind: 'material',
  medium: 'gas',
  label,
});

const gasOutput = (id: string, label: string): NodePort => ({
  id,
  direction: 'output',
  kind: 'material',
  medium: 'gas',
  label,
});

const define = (definition: ApparatusDefinition): ApparatusDefinition => Object.freeze({
  ...definition,
  searchTerms: Object.freeze([...definition.searchTerms]),
  ports: Object.freeze(definition.ports.map(port => Object.freeze({ ...port }))),
});

export const APPARATUS_DEFINITIONS: readonly ApparatusDefinition[] = Object.freeze([
  define({
    id: 'extractor', nodeType: 'extractor', label: 'Extractor', category: 'apparatus', order: 10,
    description: 'Pulls compatible solid matter from a connected Feature resource source.',
    searchTerms: ['extractor', 'extraction', 'resource access', 'source', 'feed', 'raw material'],
    physicalWidthMeters: 12, physicalHeightMeters: 8,
    ports: [resourceInput('resource-source', 'resource source'), solidOutput('output', 'output')],
  }),
  define({
    id: 'jaw-crusher', nodeType: 'jawCrusher', label: 'Jaw Crusher', category: 'apparatus', order: 20,
    description: 'Primary crusher for reducing run-of-mine rock to a coarse plant feed.',
    searchTerms: ['jaw crusher', 'primary crusher', 'primary crushing', 'run of mine', 'rom', 'ore'],
    physicalWidthMeters: 14, physicalHeightMeters: 9,
    ports: [solidInput('feed', 'feed'), solidOutput('product', 'product')],
  }),
  define({
    id: 'cone-crusher', nodeType: 'coneCrusher', label: 'Cone Crusher', category: 'apparatus', order: 30,
    description: 'Secondary or tertiary crusher for reducing coarse rock to mill-ready sizes.',
    searchTerms: ['cone crusher', 'secondary crusher', 'tertiary crusher', 'size reduction', 'ore'],
    physicalWidthMeters: 14, physicalHeightMeters: 9,
    ports: [solidInput('feed', 'feed'), solidOutput('product', 'product')],
  }),
  define({
    id: 'ball-mill', nodeType: 'ballMill', label: 'Ball Mill', category: 'apparatus', order: 40,
    description: 'Fine grinding equipment that reduces mill-ready feed into the sub-millimetre regime.',
    searchTerms: ['ball mill', 'mill', 'milling', 'grinding', 'comminution', 'liberation'],
    physicalWidthMeters: 18, physicalHeightMeters: 10,
    ports: [solidInput('feed', 'feed'), solidOutput('product', 'product')],
  }),
  define({
    id: 'screen', nodeType: 'screen', label: 'Screen', category: 'apparatus', order: 50,
    description: 'Separates solid particulate material into undersize and oversize streams.',
    searchTerms: ['screen', 'sieve', 'screening', 'size separation', 'undersize', 'oversize'],
    physicalWidthMeters: 14, physicalHeightMeters: 10,
    ports: [solidInput('feed', 'feed'), solidOutput('undersize', 'undersize'), solidOutput('oversize', 'oversize')],
  }),
  define({
    id: 'splitter', nodeType: 'splitter', label: 'Splitter', category: 'apparatus', order: 60,
    description: 'Divides one stored particulate feed into two material outputs.',
    searchTerms: ['splitter', 'split', 'branch', 'routing', 'fan out', 'ratio'],
    physicalWidthMeters: 12, physicalHeightMeters: 9,
    ports: [solidInput('feed', 'feed'), solidOutput('output-a', 'A'), solidOutput('output-b', 'B')],
  }),
  define({
    id: 'material-merger', nodeType: 'merger', label: 'Material Merger', category: 'apparatus', order: 70,
    description: 'Combines two stored particulate feeds into one material output.',
    searchTerms: ['merger', 'merge', 'combine', 'junction', 'routing', 'fan in'],
    physicalWidthMeters: 12, physicalHeightMeters: 9,
    ports: [solidInput('input-a', 'A'), solidInput('input-b', 'B'), solidOutput('product', 'product')],
  }),
  define({
    id: 'feeder', nodeType: 'feeder', label: 'Feeder', category: 'apparatus', order: 80,
    description: 'Meters stored particulate material into downstream equipment.',
    searchTerms: ['feeder', 'feed', 'meter', 'flow control', 'rate', 'throughput'],
    physicalWidthMeters: 12, physicalHeightMeters: 8,
    ports: [solidInput('feed', 'feed'), solidOutput('product', 'product')],
  }),
  define({
    id: 'magnetic-separator', nodeType: 'magSep', label: 'Dry Drum Magnetic Separator', category: 'apparatus', order: 90,
    description: 'Dry coarse magnetic preconcentrator for recovering strongly magnetic material.',
    searchTerms: ['magnetic separator', 'dry drum', 'separator', 'magnetic', 'concentrate', 'tailings'],
    physicalWidthMeters: 16, physicalHeightMeters: 10,
    ports: [solidInput('feed', 'feed'), solidOutput('concentrate', 'concentrate'), solidOutput('tailings', 'tailings')],
  }),
  define({
    id: 'electric-roasting-furnace', nodeType: 'roastingFurnace', label: 'Electric Roasting Furnace', category: 'apparatus', order: 95,
    description: 'Continuous electric roasting apparatus. Runtime process behavior remains disconnected in Phase 4.',
    searchTerms: ['roasting furnace', 'furnace', 'roast', 'thermal', 'thermochemical'],
    physicalWidthMeters: 20, physicalHeightMeters: 12,
    ports: [solidInput('feed', 'feed'), solidOutput('solid-product', 'solid product'), gasOutput('gas-exhaust', 'gas exhaust')],
  }),
  define({
    id: 'exhaust-vent', nodeType: 'exhaustVent', label: 'Exhaust Vent', category: 'container', order: 96,
    description: 'Environmental gas boundary. Runtime discharge accounting remains disconnected in Phase 4.',
    searchTerms: ['exhaust', 'vent', 'gas', 'off-gas', 'emissions'],
    physicalWidthMeters: 10, physicalHeightMeters: 7,
    ports: [gasInput('gas-in', 'gas in')],
  }),
  define({
    id: 'hopper', nodeType: 'hopper', label: 'Hopper', category: 'container', order: 100,
    description: 'Stores material between processing nodes.',
    searchTerms: ['hopper', 'storage', 'buffer', 'container', 'holding', 'material'],
    physicalWidthMeters: 12, physicalHeightMeters: 8,
    ports: [solidInput('input', 'in'), solidOutput('output', 'out')],
  }),
]);

export function apparatusDefinitionById(id: string): ApparatusDefinition | null {
  return APPARATUS_DEFINITIONS.find(definition => definition.id === id) ?? null;
}

export function apparatusDefinitionsByCategory(category: MechanicalNodeCategory): readonly ApparatusDefinition[] {
  return APPARATUS_DEFINITIONS.filter(definition => definition.category === category);
}
''')

write('src/graph/graphCommands.ts', r'''import type { ApparatusDefinition } from '../apparatus/definitions.js';
import type { GraphState, MechanicalNode, PortEndpoint } from './types.js';
import type { NodePort, Point } from '../world/types.js';

export function createEmptyGraphState(): GraphState {
  return { nodes: [], connections: [], nextNodeSequence: 1, nextConnectionSequence: 1 };
}

export function placeMechanicalNode(
  graph: GraphState,
  definition: ApparatusDefinition,
  position: Point,
): { graph: GraphState; node: MechanicalNode } {
  const sequence = graph.nextNodeSequence;
  const node: MechanicalNode = {
    id: `${definition.id}-${sequence}`,
    definitionId: definition.id,
    nodeType: definition.nodeType,
    label: `${definition.label} ${sequence}`,
    category: definition.category,
    position: { ...position },
    physicalWidthMeters: definition.physicalWidthMeters,
    physicalHeightMeters: definition.physicalHeightMeters,
    ports: definition.ports.map(port => ({ ...port })),
    enabled: false,
  };
  return {
    node,
    graph: {
      ...graph,
      nodes: [...graph.nodes, node],
      nextNodeSequence: sequence + 1,
    },
  };
}

export function moveMechanicalNode(graph: GraphState, nodeId: string, position: Point): GraphState {
  return {
    ...graph,
    nodes: graph.nodes.map(node => node.id === nodeId ? { ...node, position: { ...position } } : node),
  };
}

export function removeMechanicalNode(graph: GraphState, nodeId: string): GraphState {
  return {
    ...graph,
    nodes: graph.nodes.filter(node => node.id !== nodeId),
    connections: graph.connections.filter(connection => connection.from.nodeId !== nodeId && connection.to.nodeId !== nodeId),
  };
}

export function disconnectConnection(graph: GraphState, connectionId: string): GraphState {
  return { ...graph, connections: graph.connections.filter(connection => connection.id !== connectionId) };
}

function endpointsEqual(left: PortEndpoint, right: PortEndpoint): boolean {
  return left.nodeId === right.nodeId && left.portId === right.portId;
}

function orientEndpoints(
  firstEndpoint: PortEndpoint,
  firstPort: NodePort,
  secondEndpoint: PortEndpoint,
  secondPort: NodePort,
): { from: PortEndpoint; fromPort: NodePort; to: PortEndpoint; toPort: NodePort } {
  if (firstPort.direction === secondPort.direction) throw new Error('Connections require one output and one input port.');
  if (firstPort.direction === 'output') return { from: firstEndpoint, fromPort: firstPort, to: secondEndpoint, toPort: secondPort };
  return { from: secondEndpoint, fromPort: secondPort, to: firstEndpoint, toPort: firstPort };
}

export function connectPorts(
  graph: GraphState,
  firstEndpoint: PortEndpoint,
  firstPort: NodePort,
  secondEndpoint: PortEndpoint,
  secondPort: NodePort,
): GraphState {
  if (endpointsEqual(firstEndpoint, secondEndpoint)) throw new Error('Choose a different target port.');
  if (firstEndpoint.nodeId === secondEndpoint.nodeId) throw new Error('A node cannot connect to itself.');
  const oriented = orientEndpoints(firstEndpoint, firstPort, secondEndpoint, secondPort);
  if (oriented.fromPort.kind !== oriented.toPort.kind) throw new Error('Port kinds are incompatible.');
  if (oriented.fromPort.medium !== oriented.toPort.medium) throw new Error('Port media are incompatible.');
  if (graph.connections.some(connection => endpointsEqual(connection.to, oriented.to))) {
    throw new Error('That input port already has a connection.');
  }
  if (graph.connections.some(connection => endpointsEqual(connection.from, oriented.from) && endpointsEqual(connection.to, oriented.to))) {
    throw new Error('That connection already exists.');
  }

  const connection = {
    id: `connection-${graph.nextConnectionSequence}`,
    from: { ...oriented.from },
    to: { ...oriented.to },
    kind: oriented.fromPort.kind,
    medium: oriented.fromPort.medium,
  };
  return {
    ...graph,
    connections: [...graph.connections, connection],
    nextConnectionSequence: graph.nextConnectionSequence + 1,
  };
}
''')

write('src/graph/graphQueries.ts', r'''import type { GraphState, MechanicalNode, NodeConnection, PortEndpoint } from './types.js';
import type { NodePort, Planet, ResourceNode } from '../world/types.js';

export function mechanicalNodeById(graph: GraphState, nodeId: string): MechanicalNode | null {
  return graph.nodes.find(node => node.id === nodeId) ?? null;
}

export function resourceNodeById(planet: Planet, nodeId: string): ResourceNode | null {
  return planet.resourceNodes.find(node => node.id === nodeId) ?? null;
}

export function portForEndpoint(planet: Planet, graph: GraphState, endpoint: PortEndpoint): NodePort | null {
  const mechanical = mechanicalNodeById(graph, endpoint.nodeId);
  if (mechanical) return mechanical.ports.find(port => port.id === endpoint.portId) ?? null;
  const resource = resourceNodeById(planet, endpoint.nodeId);
  if (resource) return resource.ports.find(port => port.id === endpoint.portId) ?? null;
  return null;
}

export function connectionsForNode(graph: GraphState, nodeId: string): NodeConnection[] {
  return graph.connections.filter(connection => connection.from.nodeId === nodeId || connection.to.nodeId === nodeId);
}
''')

write('src/state/appState.ts', r'''import { createEmptyGraphState } from '../graph/graphCommands.js';
import type { GraphState, PortEndpoint } from '../graph/types.js';
import type { MapCameraState, MapSelection, Region, WorldState } from '../world/types.js';

export interface GraphInteractionState {
  placementDefinitionId: string | null;
  pendingConnection: PortEndpoint | null;
  notice: string | null;
}

export interface AppState {
  world: WorldState | null;
  graph: GraphState;
  selection: MapSelection;
  camera: MapCameraState;
  interaction: GraphInteractionState;
}

export type AppStateListener = (state: Readonly<AppState>) => void;

export const RESOURCE_FOCUS_ZOOM = 2 ** 19;
export const MECHANICAL_FOCUS_ZOOM = 2 ** 20;

function regionFocusZoom(world: WorldState, region: Region): number {
  const widthZoom = world.planet.width / Math.max(1, region.bounds.width * 1.35);
  const heightZoom = world.planet.height / Math.max(1, region.bounds.height * 1.35);
  return Math.min(6, Math.max(2, Math.min(widthZoom, heightZoom)));
}

const emptyInteraction = (): GraphInteractionState => ({ placementDefinitionId: null, pendingConnection: null, notice: null });

export class AppStore {
  private readonly listeners = new Set<AppStateListener>();

  private state: AppState = {
    world: null,
    graph: createEmptyGraphState(),
    selection: { type: 'planet' },
    camera: { centerX: 0, centerY: 0, zoom: 1 },
    interaction: emptyInteraction(),
  };

  getState(): Readonly<AppState> {
    return this.state;
  }

  setWorld(world: WorldState): void {
    this.state = {
      world,
      graph: createEmptyGraphState(),
      selection: { type: 'planet' },
      camera: { centerX: world.planet.width / 2, centerY: world.planet.height / 2, zoom: 1 },
      interaction: emptyInteraction(),
    };
    this.emit();
  }

  setSelection(selection: MapSelection): void {
    this.state = { ...this.state, selection };
    this.emit();
  }

  setCamera(camera: MapCameraState): void {
    this.state = { ...this.state, camera };
    this.emit();
  }

  setGraph(graph: GraphState): void {
    this.state = { ...this.state, graph };
    this.emit();
  }

  setPlacement(placementDefinitionId: string | null): void {
    this.state = {
      ...this.state,
      interaction: { placementDefinitionId, pendingConnection: null, notice: null },
    };
    this.emit();
  }

  setPendingConnection(pendingConnection: PortEndpoint | null): void {
    this.state = {
      ...this.state,
      interaction: { ...this.state.interaction, placementDefinitionId: null, pendingConnection },
    };
    this.emit();
  }

  setInteractionNotice(notice: string | null): void {
    this.state = { ...this.state, interaction: { ...this.state.interaction, notice } };
    this.emit();
  }

  clearInteraction(): void {
    this.state = { ...this.state, interaction: emptyInteraction() };
    this.emit();
  }

  focusSelection(selection: MapSelection): void {
    const world = this.state.world;
    if (!world) {
      this.setSelection(selection);
      return;
    }

    let camera: MapCameraState = this.state.camera;
    if (selection.type === 'planet') {
      camera = { centerX: world.planet.width / 2, centerY: world.planet.height / 2, zoom: 1 };
    } else if (selection.type === 'region') {
      const region = world.planet.regions.find(candidate => candidate.id === selection.regionId);
      if (region) {
        camera = {
          centerX: region.bounds.x + region.bounds.width / 2,
          centerY: region.bounds.y + region.bounds.height / 2,
          zoom: regionFocusZoom(world, region),
        };
      }
    } else if (selection.type === 'resource') {
      const resource = world.planet.resourceNodes.find(candidate => candidate.id === selection.resourceNodeId);
      if (resource) camera = { centerX: resource.position.x, centerY: resource.position.y, zoom: RESOURCE_FOCUS_ZOOM };
    } else {
      const node = this.state.graph.nodes.find(candidate => candidate.id === selection.mechanicalNodeId);
      if (node) camera = { centerX: node.position.x, centerY: node.position.y, zoom: MECHANICAL_FOCUS_ZOOM };
    }

    this.state = { ...this.state, selection, camera };
    this.emit();
  }

  subscribe(listener: AppStateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.state);
  }
}
''')

write('src/map/camera/mapCamera.ts', r'''import type { MapCameraState, Planet } from '../../world/types.js';

export const MAP_MIN_ZOOM = 1;
export const MAP_MAX_ZOOM = 2 ** 24;
export const MECHANICAL_PLACEMENT_MIN_ZOOM = 2 ** 17;
export const WHEEL_GEOGRAPHIC_SENSITIVITY = 0.0015;
export const WHEEL_ENGINEERING_SENSITIVITY = 0.00035;
export const WHEEL_ENGINEERING_BLEND_START_ZOOM = 2 ** 14;
export const WHEEL_ENGINEERING_BLEND_END_ZOOM = 2 ** 18;

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
''')

write('src/map/rendering/resourceRenderer.ts', r'''import { resourceDefinitionById } from '../../world/resources.js';
import { metersToWorldUnits } from '../../world/scale.js';
import type { Point, Planet, ResourceNode } from '../../world/types.js';
import { smoothStep } from '../camera/mapCamera.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const RESOURCE_NODE_FADE_START_ZOOM = 2 ** 16;
export const RESOURCE_NODE_INTERACTIVE_ZOOM = 2 ** 17;
export const RESOURCE_NODE_FULL_OPACITY_ZOOM = 2 ** 17;
export const RESOURCE_NODE_DETAIL_MIN_TEXT_PIXELS = 5.75;
export const RESOURCE_NODE_PHYSICAL_WIDTH_METERS = 20;
export const RESOURCE_NODE_PHYSICAL_HEIGHT_METERS = 12.5;
export const RESOURCE_NODE_WORLD_WIDTH = metersToWorldUnits(RESOURCE_NODE_PHYSICAL_WIDTH_METERS);
export const RESOURCE_NODE_WORLD_HEIGHT = metersToWorldUnits(RESOURCE_NODE_PHYSICAL_HEIGHT_METERS);
const HEADER_HEIGHT = metersToWorldUnits(2.8);
const PORT_RADIUS = metersToWorldUnits(0.9);
const CORNER_RADIUS = metersToWorldUnits(0.45);
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

export function resourceDetailsVisibleAtPixelHeight(pixelHeight: number): boolean {
  return pixelHeight >= RESOURCE_NODE_DETAIL_MIN_TEXT_PIXELS;
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

export function renderResourceLayer(planet: Planet, onSelect: (resourceId: string) => void): SVGGElement {
  const layer = svgElement('g'); layer.setAttribute('class', 'ws-map-resource-node-layer');
  for (const resource of planet.resourceNodes) {
    const node = svgElement('g');
    node.setAttribute('transform', `translate(${resource.position.x} ${resource.position.y})`);
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
  const resources = svg.querySelector<SVGGElement>('.ws-map-resource-node-layer');
  if (resources) {
    const revealProgress = (zoom - RESOURCE_NODE_FADE_START_ZOOM) / (RESOURCE_NODE_FULL_OPACITY_ZOOM - RESOURCE_NODE_FADE_START_ZOOM);
    resources.style.opacity = smoothStep(revealProgress).toFixed(3);
    resources.style.visibility = zoom <= RESOURCE_NODE_FADE_START_ZOOM ? 'hidden' : 'visible';
    resources.style.pointerEvents = zoom >= RESOURCE_NODE_INTERACTIVE_ZOOM ? 'auto' : 'none';
  }
  const rect = svg.getBoundingClientRect();
  const viewBox = svg.viewBox.baseVal;
  const worldUnitsPerPixel = rect.width > 0 && viewBox.width > 0 ? viewBox.width / rect.width : 1;
  const detailVisible = resourceDetailsVisibleAtPixelHeight(worldUnitsPerPixel > 0 ? BODY_FONT_SIZE / worldUnitsPerPixel : 0);
  for (const details of svg.querySelectorAll<SVGGElement>('.ws-map-resource-details')) {
    details.style.opacity = detailVisible ? '1' : '0'; details.style.visibility = detailVisible ? 'visible' : 'hidden'; details.style.pointerEvents = detailVisible ? 'auto' : 'none';
  }
}
''')

write('src/map/rendering/mechanicalRenderer.ts', r'''import type { ApparatusDefinition } from '../../apparatus/definitions.js';
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
''')

write('src/debug/debugModel.ts', r'''import type { AppState } from '../state/appState.js';
import { formatPhysicalDistance } from '../world/scale.js';
import { MECHANICAL_PLACEMENT_MIN_ZOOM } from '../map/camera/mapCamera.js';
import { RESOURCE_NODE_FADE_START_ZOOM } from '../map/rendering/resourceRenderer.js';

export interface DebugSnapshot {
  world: Record<string, string>;
  camera: Record<string, string>;
  graph: Record<string, string>;
  selection: Record<string, string>;
  runtime: Record<string, string>;
}

function lodForZoom(zoom: number): string {
  if (zoom < 8) return 'Planet / Region';
  if (zoom < 2 ** 14) return 'Geographic';
  if (zoom < RESOURCE_NODE_FADE_START_ZOOM) return 'Local approach';
  if (zoom < MECHANICAL_PLACEMENT_MIN_ZOOM) return 'Resource discovery';
  return 'Engineering';
}

export function createDebugSnapshot(state: Readonly<AppState>): DebugSnapshot {
  const planet = state.world?.planet;
  const selected = state.selection.type === 'planet' ? 'planet'
    : state.selection.type === 'region' ? `region:${state.selection.regionId}`
      : state.selection.type === 'resource' ? `resource:${state.selection.resourceNodeId}`
        : `mechanical:${state.selection.mechanicalNodeId}`;
  return {
    world: {
      Seed: planet?.seed ?? '—',
      'Logical size': planet ? `${planet.width} × ${planet.height}` : '—',
      'Physical size': planet ? `${formatPhysicalDistance(planet.physicalWidthMeters)} × ${formatPhysicalDistance(planet.physicalHeightMeters)}` : '—',
      Regions: String(planet?.regions.length ?? 0),
      Resources: String(planet?.resourceNodes.length ?? 0),
    },
    camera: {
      Zoom: `${state.camera.zoom.toLocaleString(undefined, { maximumFractionDigits: 0 })}×`,
      Center: `${state.camera.centerX.toFixed(6)}, ${state.camera.centerY.toFixed(6)}`,
      'Approx. visible width': planet ? formatPhysicalDistance(planet.physicalWidthMeters / Math.max(1, state.camera.zoom)) : '—',
      LOD: lodForZoom(state.camera.zoom),
    },
    graph: {
      'Mechanical nodes': String(state.graph.nodes.length),
      Connections: String(state.graph.connections.length),
      Placement: state.interaction.placementDefinitionId ?? 'none',
      'Pending connection': state.interaction.pendingConnection ? `${state.interaction.pendingConnection.nodeId}:${state.interaction.pendingConnection.portId}` : 'none',
    },
    selection: { Selected: selected },
    runtime: {
      Status: 'Disconnected',
      Authority: 'Phase 6 will reconnect Rust/WASM Worker runtime',
    },
  };
}
''')

write('src/ui/debugPanel.ts', r'''import type { AppStore } from '../state/appState.js';
import { createDebugSnapshot } from '../debug/debugModel.js';

function section(title: string, values: Record<string, string>): HTMLElement {
  const container = document.createElement('section'); container.className = 'ws-debug-section';
  const heading = document.createElement('div'); heading.className = 'ws-debug-section-title'; heading.textContent = title; container.appendChild(heading);
  for (const [label, value] of Object.entries(values)) {
    const row = document.createElement('div'); row.className = 'ws-debug-metric';
    const left = document.createElement('span'); left.textContent = label; const right = document.createElement('span'); right.textContent = value; right.title = value;
    row.append(left, right); container.appendChild(row);
  }
  return container;
}

export function installDebugPanel(root: HTMLElement, store: AppStore): void {
  const body = root.querySelector<HTMLElement>('#ws-debug-body');
  if (!body) return;
  store.subscribe(state => {
    const snapshot = createDebugSnapshot(state); body.replaceChildren(
      section('World', snapshot.world), section('Camera', snapshot.camera), section('Graph', snapshot.graph), section('Selection', snapshot.selection), section('Runtime', snapshot.runtime),
    );
  });
}
''')

write('src/ui/nodeCatalogPanel.ts', r'''import { APPARATUS_DEFINITIONS } from '../apparatus/definitions.js';
import { MECHANICAL_PLACEMENT_MIN_ZOOM } from '../map/camera/mapCamera.js';
import type { AppStore } from '../state/appState.js';

const categories = ['apparatus', 'container'] as const;

function searchable(definition: (typeof APPARATUS_DEFINITIONS)[number]): string {
  return [definition.label, definition.category, definition.description, ...definition.searchTerms].join(' ').toLowerCase();
}

export function installNodeCatalogPanel(root: HTMLElement, store: AppStore): void {
  const search = root.querySelector<HTMLInputElement>('#ws-node-catalog-search');
  const filters = root.querySelector<HTMLElement>('#ws-node-catalog-filters .ws-navigation-filters');
  const tree = root.querySelector<HTMLElement>('#ws-node-catalog-tree');
  const count = root.querySelector<HTMLElement>('#ws-node-catalog-match-count');
  const status = root.querySelector<HTMLElement>('#ws-node-catalog-status');
  if (!search || !filters || !tree || !count || !status) return;
  const visible = new Set<string>(categories);

  for (const category of categories) {
    const label = document.createElement('label'); const input = document.createElement('input'); input.type = 'checkbox'; input.checked = true; input.value = category;
    input.addEventListener('change', () => { if (input.checked) visible.add(category); else visible.delete(category); render(); });
    label.append(input, document.createTextNode(` ${category}`)); filters.appendChild(label);
  }

  const render = (): void => {
    const query = search.value.trim().toLowerCase();
    const matches = APPARATUS_DEFINITIONS.filter(definition => visible.has(definition.category) && (!query || query.split(/\s+/).every(token => searchable(definition).includes(token))));
    count.textContent = `${matches.length} constructible node${matches.length === 1 ? '' : 's'}`; tree.replaceChildren();
    for (const category of categories) {
      const definitions = matches.filter(definition => definition.category === category); if (!definitions.length) continue;
      const heading = document.createElement('div'); heading.className = 'ws-node-catalog-category'; heading.textContent = category.toUpperCase(); tree.appendChild(heading);
      for (const definition of definitions) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'ws-node-catalog-item'; button.dataset.nodeDefinitionId = definition.id;
        const name = document.createElement('strong'); name.textContent = definition.label; const description = document.createElement('span'); description.textContent = definition.description;
        button.append(name, description); button.addEventListener('click', () => { store.setPlacement(definition.id); store.setInteractionNotice(`Place ${definition.label} on the map.`); }); tree.appendChild(button);
      }
    }
  };

  search.addEventListener('input', render);
  store.subscribe(state => {
    const placement = state.interaction.placementDefinitionId;
    const pending = state.interaction.pendingConnection;
    if (placement) {
      status.textContent = state.camera.zoom < MECHANICAL_PLACEMENT_MIN_ZOOM
        ? `Placement armed: zoom to at least ${MECHANICAL_PLACEMENT_MIN_ZOOM.toLocaleString()}×.`
        : `Placement armed: click the map to place ${placement}. Esc cancels.`;
    } else if (pending) status.textContent = `Connection started at ${pending.nodeId}:${pending.portId}. Select a compatible target port.`;
    else status.textContent = state.interaction.notice ?? 'Select a node definition to begin placement.';
  });
  render();
}
''')

write('src/ui/inspectorPanel.ts', r'''import { apparatusDefinitionById } from '../apparatus/definitions.js';
import { disconnectConnection, removeMechanicalNode } from '../graph/graphCommands.js';
import { connectionsForNode, mechanicalNodeById } from '../graph/graphQueries.js';
import type { MechanicalNode } from '../graph/types.js';
import type { AppStore } from '../state/appState.js';
import { resourceDefinitionById } from '../world/resources.js';
import { EARTH_SCALE_METERS_PER_WORLD_UNIT, formatPhysicalDistance, worldUnitsToMeters } from '../world/scale.js';
import type { Planet, Region, ResourceNode } from '../world/types.js';

function addRow(container: HTMLElement, label: string, value: string): void {
  const row = document.createElement('div'); row.className = 'ws-ins-row'; const strong = document.createElement('b'); strong.textContent = `${label}: `; row.append(strong, document.createTextNode(value)); container.appendChild(row);
}
function typeLabel(container: HTMLElement, value: string): void { const type = document.createElement('div'); type.className = 'ws-ins-type'; type.textContent = value; container.appendChild(type); }

function renderPlanet(container: HTMLElement, planet: Planet): void {
  typeLabel(container, 'PLANET'); addRow(container, 'Name', planet.name); addRow(container, 'Seed', planet.seed); addRow(container, 'Map', `${planet.width} × ${planet.height}`);
  addRow(container, 'Physical scale', `${formatPhysicalDistance(planet.physicalWidthMeters)} × ${formatPhysicalDistance(planet.physicalHeightMeters)}`); addRow(container, 'World unit', `≈ ${formatPhysicalDistance(EARTH_SCALE_METERS_PER_WORLD_UNIT)}`);
  addRow(container, 'Regions', String(planet.regions.length)); addRow(container, 'Resource nodes', String(planet.resourceNodes.length));
}
function renderRegion(container: HTMLElement, planet: Planet, region: Region): void {
  typeLabel(container, 'REGION'); addRow(container, 'Name', region.name); addRow(container, 'ID', region.id); addRow(container, 'Bounds', `${region.bounds.x.toFixed(0)}, ${region.bounds.y.toFixed(0)} · ${region.bounds.width.toFixed(0)} × ${region.bounds.height.toFixed(0)}`);
  addRow(container, 'Approx. extent', `${formatPhysicalDistance(worldUnitsToMeters(region.bounds.width))} × ${formatPhysicalDistance(worldUnitsToMeters(region.bounds.height))}`); addRow(container, 'Resource nodes', String(region.resourceNodeIds.length)); addRow(container, 'Planet', planet.name);
}
function renderResource(container: HTMLElement, planet: Planet, resource: ResourceNode): void {
  const definition = resourceDefinitionById(resource.resourceId); const region = planet.regions.find(candidate => candidate.id === resource.regionId); typeLabel(container, 'FEATURE');
  addRow(container, 'Name', resource.name); addRow(container, 'Feature type', 'Mineral Deposit'); addRow(container, 'Resource', definition?.name ?? resource.resourceId); addRow(container, 'Category', definition?.category ?? 'unknown'); addRow(container, 'Region', region?.name ?? resource.regionId);
  addRow(container, 'Coordinates', `${resource.position.x.toFixed(6)}, ${resource.position.y.toFixed(6)}`); addRow(container, 'Map position', `${formatPhysicalDistance(worldUnitsToMeters(resource.position.x))}, ${formatPhysicalDistance(worldUnitsToMeters(resource.position.y))}`);
  const port = resource.ports.find(candidate => candidate.id === resource.resourceAccessPortId); if (port) addRow(container, 'Output', `${port.label} · ${port.kind}`);
}
function renderMechanical(container: HTMLElement, node: MechanicalNode, store: AppStore): void {
  const definition = apparatusDefinitionById(node.definitionId); typeLabel(container, node.category.toUpperCase()); addRow(container, 'Name', node.label); addRow(container, 'Definition', definition?.label ?? node.definitionId); addRow(container, 'Node type', node.nodeType);
  addRow(container, 'Coordinates', `${node.position.x.toFixed(6)}, ${node.position.y.toFixed(6)}`); addRow(container, 'Footprint', `${node.physicalWidthMeters} m × ${node.physicalHeightMeters} m`); addRow(container, 'Runtime', 'Disconnected until Phase 6');
  const portsTitle = document.createElement('div'); portsTitle.className = 'ws-ins-section-title'; portsTitle.textContent = 'Ports'; container.appendChild(portsTitle);
  for (const port of node.ports) addRow(container, port.label, `${port.direction} · ${port.kind} · ${port.medium}`);
  const connections = connectionsForNode(store.getState().graph, node.id); const connTitle = document.createElement('div'); connTitle.className = 'ws-ins-section-title'; connTitle.textContent = `Connections (${connections.length})`; container.appendChild(connTitle);
  for (const connection of connections) {
    const row = document.createElement('div'); row.className = 'ws-ins-connection-row'; const text = document.createElement('span'); text.textContent = `${connection.from.nodeId}:${connection.from.portId} → ${connection.to.nodeId}:${connection.to.portId}`;
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Disconnect'; button.addEventListener('click', () => store.setGraph(disconnectConnection(store.getState().graph, connection.id))); row.append(text, button); container.appendChild(row);
  }
  const actions = document.createElement('div'); actions.className = 'ws-ins-actions'; const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove Node'; remove.addEventListener('click', () => { store.setGraph(removeMechanicalNode(store.getState().graph, node.id)); store.setSelection({ type: 'planet' }); }); actions.appendChild(remove); container.appendChild(actions);
}

export function installInspectorPanel(root: HTMLElement, store: AppStore): void {
  const container = root.querySelector<HTMLElement>('#ws-map-inspector-body'); if (!container) return;
  store.subscribe(state => {
    container.replaceChildren(); const planet = state.world?.planet; if (!planet) { container.textContent = 'Generate a world to inspect it.'; return; }
    const selection = state.selection;
    if (selection.type === 'planet') { renderPlanet(container, planet); return; }
    if (selection.type === 'region') { const region = planet.regions.find(candidate => candidate.id === selection.regionId); region ? renderRegion(container, planet, region) : container.append('Selected region is unavailable.'); return; }
    if (selection.type === 'resource') { const resource = planet.resourceNodes.find(candidate => candidate.id === selection.resourceNodeId); resource ? renderResource(container, planet, resource) : container.append('Selected resource is unavailable.'); return; }
    const node = mechanicalNodeById(state.graph, selection.mechanicalNodeId); node ? renderMechanical(container, node, store) : container.append('Selected mechanical node is unavailable.');
  });
}
''')

write('src/map/mapRenderer.ts', r'''import { apparatusDefinitionById } from '../apparatus/definitions.js';
import { connectPorts, moveMechanicalNode, placeMechanicalNode, removeMechanicalNode } from '../graph/graphCommands.js';
import { mechanicalNodeById, portForEndpoint } from '../graph/graphQueries.js';
import type { GraphState, PortEndpoint } from '../graph/types.js';
import type { AppState, AppStore } from '../state/appState.js';
import { polygonCentroid } from '../world/geometry.js';
import { formatPhysicalDistance, worldUnitsToMeters } from '../world/scale.js';
import type { MapCameraState, MapSelection, Planet, Point } from '../world/types.js';
import {
  MAP_MAX_ZOOM, MAP_MIN_ZOOM, MECHANICAL_PLACEMENT_MIN_ZOOM, camerasEqual, clamp, clampCamera, formatZoomFactor,
  normalizeWheelDelta, smoothStep, visibleWorldSize, wheelSensitivityForZoom, wheelZoomAfterDelta,
  WHEEL_ENGINEERING_BLEND_END_ZOOM, WHEEL_ENGINEERING_BLEND_START_ZOOM, WHEEL_ENGINEERING_SENSITIVITY, WHEEL_GEOGRAPHIC_SENSITIVITY,
} from './camera/mapCamera.js';
import { renderMechanicalLayer, updateMechanicalVisibility, updatePlacementPreview } from './rendering/mechanicalRenderer.js';
import {
  renderResourceLayer, resourceDetailsVisibleAtPixelHeight, updateResourceVisibility,
  RESOURCE_NODE_DETAIL_MIN_TEXT_PIXELS, RESOURCE_NODE_FADE_START_ZOOM, RESOURCE_NODE_FULL_OPACITY_ZOOM, RESOURCE_NODE_INTERACTIVE_ZOOM,
  RESOURCE_NODE_PHYSICAL_HEIGHT_METERS, RESOURCE_NODE_PHYSICAL_WIDTH_METERS, RESOURCE_NODE_WORLD_HEIGHT, RESOURCE_NODE_WORLD_WIDTH,
} from './rendering/resourceRenderer.js';

export {
  MAP_MAX_ZOOM, MAP_MIN_ZOOM, RESOURCE_NODE_DETAIL_MIN_TEXT_PIXELS, RESOURCE_NODE_FADE_START_ZOOM, RESOURCE_NODE_FULL_OPACITY_ZOOM,
  RESOURCE_NODE_INTERACTIVE_ZOOM, RESOURCE_NODE_PHYSICAL_HEIGHT_METERS, RESOURCE_NODE_PHYSICAL_WIDTH_METERS, RESOURCE_NODE_WORLD_HEIGHT,
  RESOURCE_NODE_WORLD_WIDTH, WHEEL_ENGINEERING_BLEND_END_ZOOM, WHEEL_ENGINEERING_BLEND_START_ZOOM, WHEEL_ENGINEERING_SENSITIVITY,
  WHEEL_GEOGRAPHIC_SENSITIVITY, resourceDetailsVisibleAtPixelHeight, wheelSensitivityForZoom, wheelZoomAfterDelta,
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const REGION_LABEL_FADE_START_ZOOM = 3.5;
const REGION_LABEL_FADE_END_ZOOM = 6.5;

function svgElement<K extends keyof SVGElementTagNameMap>(tagName: K): SVGElementTagNameMap[K] { return document.createElementNS(SVG_NS, tagName); }

function screenToWorld(svg: SVGSVGElement, planet: Planet, camera: MapCameraState, clientX: number, clientY: number): Point {
  const rect = svg.getBoundingClientRect(); const visible = visibleWorldSize(svg, planet, camera.zoom);
  const nx = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1); const ny = clamp((clientY - rect.top) / Math.max(1, rect.height), 0, 1);
  return { x: camera.centerX + (nx - 0.5) * visible.width, y: camera.centerY + (ny - 0.5) * visible.height };
}

function selectionMatches(element: Element, selection: MapSelection): boolean {
  const kind = element.getAttribute('data-map-kind');
  if (selection.type === 'planet') return kind === 'planet';
  if (selection.type === 'region') return kind === 'region' && element.getAttribute('data-region-id') === selection.regionId;
  if (selection.type === 'resource') return kind === 'resource' && element.getAttribute('data-resource-id') === selection.resourceNodeId;
  return kind === 'mechanical' && element.getAttribute('data-mechanical-id') === selection.mechanicalNodeId;
}

function renderWorld(svg: SVGSVGElement, planet: Planet, graph: GraphState, store: AppStore): void {
  svg.replaceChildren(); svg.setAttribute('preserveAspectRatio', 'none');
  const background = svgElement('rect'); background.setAttribute('x', '0'); background.setAttribute('y', '0'); background.setAttribute('width', String(planet.width)); background.setAttribute('height', String(planet.height)); background.setAttribute('class', 'ws-map-background'); background.setAttribute('data-map-kind', 'planet');
  background.addEventListener('click', () => store.setSelection({ type: 'planet' })); svg.appendChild(background);
  const regions = svgElement('g'); regions.setAttribute('class', 'ws-map-region-layer'); const labels = svgElement('g'); labels.setAttribute('class', 'ws-map-region-label-layer');
  planet.regions.forEach((region, index) => {
    const polygon = svgElement('polygon'); polygon.setAttribute('points', region.polygon.map(point => `${point.x},${point.y}`).join(' ')); polygon.setAttribute('class', `ws-map-region ws-map-region--${index % 5}`); polygon.setAttribute('data-map-kind', 'region'); polygon.setAttribute('data-region-id', region.id);
    polygon.addEventListener('click', event => { event.stopPropagation(); store.setSelection({ type: 'region', regionId: region.id }); }); regions.appendChild(polygon);
    const centroid = polygonCentroid(region.polygon); const label = svgElement('text'); label.setAttribute('x', centroid.x.toFixed(2)); label.setAttribute('y', centroid.y.toFixed(2)); label.setAttribute('class', 'ws-map-region-label'); label.textContent = region.name; labels.appendChild(label);
  });
  svg.append(regions, labels, renderResourceLayer(planet, resourceId => store.setSelection({ type: 'resource', resourceNodeId: resourceId })), renderMechanicalLayer(planet, graph, nodeId => store.setSelection({ type: 'mechanical', mechanicalNodeId: nodeId })));
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
  if (labels) { const progress = (zoom - REGION_LABEL_FADE_START_ZOOM) / (REGION_LABEL_FADE_END_ZOOM - REGION_LABEL_FADE_START_ZOOM); labels.style.opacity = (1 - smoothStep(progress)).toFixed(3); labels.style.visibility = zoom >= REGION_LABEL_FADE_END_ZOOM ? 'hidden' : 'visible'; }
  const rect = svg.getBoundingClientRect(); const viewBox = svg.viewBox.baseVal; const unitsPerPixel = rect.width > 0 && viewBox.width > 0 ? viewBox.width / rect.width : 1;
  for (const label of svg.querySelectorAll<SVGTextElement>('.ws-map-region-label')) label.setAttribute('font-size', String(Math.max(14, unitsPerPixel * 16)));
}

export function installMapRenderer(root: HTMLElement, store: AppStore): void {
  const svg = root.querySelector<SVGSVGElement>('#ws-map-svg'); const canvas = root.querySelector<HTMLElement>('#ws-map-canvas'); const zoomLabel = root.querySelector<HTMLElement>('[data-zoom-label]'); if (!svg) return; canvas?.replaceChildren();
  let renderedPlanet: Planet | null = null; let renderedGraph: GraphState | null = null; let displayCamera: MapCameraState = { centerX: 0, centerY: 0, zoom: 1 }; let animationFrame: number | null = null; let internalCameraUpdate = false;
  let pointerId: number | null = null; let panStartClient = { x: 0, y: 0 }; let panStartCamera = displayCamera; let draggedNodeId: string | null = null; let dragStartNode: Point | null = null; let hoverWorld: Point | null = null; let suppressClick = false;

  const applyCamera = (camera: MapCameraState): void => {
    const planet = store.getState().world?.planet; if (!planet) return; displayCamera = clampCamera(svg, planet, camera); const visible = visibleWorldSize(svg, planet, displayCamera.zoom);
    svg.setAttribute('viewBox', `${displayCamera.centerX - visible.width / 2} ${displayCamera.centerY - visible.height / 2} ${visible.width} ${visible.height}`);
    if (zoomLabel) { zoomLabel.textContent = formatZoomFactor(displayCamera.zoom); zoomLabel.title = `Approx. visible map width: ${formatPhysicalDistance(worldUnitsToMeters(visible.width))}`; }
    updateZoomVisibility(svg, displayCamera.zoom);
  };
  const commitCamera = (camera: MapCameraState): void => { const planet = store.getState().world?.planet; if (!planet) return; const next = clampCamera(svg, planet, camera); if (animationFrame !== null) cancelAnimationFrame(animationFrame); animationFrame = null; applyCamera(next); internalCameraUpdate = true; store.setCamera(next); internalCameraUpdate = false; };
  const animateToCamera = (target: MapCameraState): void => {
    const planet = store.getState().world?.planet; if (!planet) return; const next = clampCamera(svg, planet, target); if (camerasEqual(displayCamera, next)) { applyCamera(next); return; }
    if (animationFrame !== null) cancelAnimationFrame(animationFrame); const start = { ...displayCamera }; const started = performance.now(); const ratio = Math.max(start.zoom, next.zoom) / Math.max(MAP_MIN_ZOOM, Math.min(start.zoom, next.zoom)); const duration = clamp(320 + Math.log2(Math.max(1, ratio)) * 65, 320, 1600);
    const step = (now: number): void => { const progress = clamp((now - started) / duration, 0, 1); const eased = smoothStep(progress); const zoom = Math.exp(Math.log(start.zoom) + (Math.log(next.zoom) - Math.log(start.zoom)) * eased); applyCamera({ centerX: start.centerX + (next.centerX - start.centerX) * eased, centerY: start.centerY + (next.centerY - start.centerY) * eased, zoom }); if (progress < 1) animationFrame = requestAnimationFrame(step); else animationFrame = null; }; animationFrame = requestAnimationFrame(step);
  };
  const refreshPreview = (state: Readonly<AppState>): void => { const definition = state.interaction.placementDefinitionId ? apparatusDefinitionById(state.interaction.placementDefinitionId) : null; updatePlacementPreview(svg, definition, hoverWorld); };

  store.subscribe(state => {
    const planet = state.world?.planet; if (!planet) return;
    if (renderedPlanet !== planet || renderedGraph !== state.graph) { renderedPlanet = planet; renderedGraph = state.graph; renderWorld(svg, planet, state.graph, store); applyCamera(displayCamera.zoom === 1 && displayCamera.centerX === 0 ? state.camera : displayCamera); }
    else if (!internalCameraUpdate && !camerasEqual(displayCamera, state.camera)) animateToCamera(state.camera);
    updateSelection(svg, state.selection); updatePendingPort(svg, state.interaction.pendingConnection); refreshPreview(state);
  });

  svg.addEventListener('click', event => {
    const state = store.getState(); const planet = state.world?.planet; if (!planet) return;
    const target = event.target as Element; const portElement = target.closest<SVGElement>('[data-node-id][data-port-id]');
    if (portElement) {
      event.preventDefault(); event.stopPropagation();
      const endpoint = { nodeId: portElement.getAttribute('data-node-id') ?? '', portId: portElement.getAttribute('data-port-id') ?? '' }; const port = portForEndpoint(planet, state.graph, endpoint); if (!port) return;
      const pending = state.interaction.pendingConnection;
      if (!pending) { store.setPendingConnection(endpoint); store.setInteractionNotice('Select a compatible target port.'); return; }
      const pendingPort = portForEndpoint(planet, state.graph, pending); if (!pendingPort) { store.clearInteraction(); return; }
      try { store.setGraph(connectPorts(state.graph, pending, pendingPort, endpoint, port)); store.clearInteraction(); }
      catch (error) { store.setPendingConnection(null); store.setInteractionNotice(error instanceof Error ? error.message : 'Connection failed.'); }
      return;
    }
    if (state.interaction.placementDefinitionId) {
      event.preventDefault(); event.stopPropagation();
      if (displayCamera.zoom < MECHANICAL_PLACEMENT_MIN_ZOOM) { store.setInteractionNotice(`Zoom to at least ${MECHANICAL_PLACEMENT_MIN_ZOOM.toLocaleString()}× before placing machinery.`); return; }
      const definition = apparatusDefinitionById(state.interaction.placementDefinitionId); if (!definition) { store.clearInteraction(); return; }
      const point = screenToWorld(svg, planet, displayCamera, (event as MouseEvent).clientX, (event as MouseEvent).clientY); const result = placeMechanicalNode(state.graph, definition, point); store.setGraph(result.graph); store.clearInteraction(); store.setSelection({ type: 'mechanical', mechanicalNodeId: result.node.id });
      return;
    }
    if (state.interaction.pendingConnection) { store.clearInteraction(); event.stopPropagation(); }
  }, true);

  svg.addEventListener('wheel', event => {
    const planet = store.getState().world?.planet; if (!planet) return; event.preventDefault(); const rect = svg.getBoundingClientRect(); if (rect.width <= 0 || rect.height <= 0) return;
    const currentVisible = visibleWorldSize(svg, planet, displayCamera.zoom); const nx = clamp((event.clientX - rect.left) / rect.width, 0, 1); const ny = clamp((event.clientY - rect.top) / rect.height, 0, 1); const worldX = displayCamera.centerX + (nx - 0.5) * currentVisible.width; const worldY = displayCamera.centerY + (ny - 0.5) * currentVisible.height;
    const zoom = wheelZoomAfterDelta(displayCamera.zoom, normalizeWheelDelta(event, rect.height)); const nextVisible = visibleWorldSize(svg, planet, zoom); commitCamera({ centerX: worldX - (nx - 0.5) * nextVisible.width, centerY: worldY - (ny - 0.5) * nextVisible.height, zoom });
  }, { passive: false });

  svg.addEventListener('pointerdown', event => {
    if (event.button !== 0) return; const state = store.getState(); const target = event.target as Element; if (target.closest('[data-port-id]')) return;
    pointerId = event.pointerId; panStartClient = { x: event.clientX, y: event.clientY }; panStartCamera = { ...displayCamera }; suppressClick = false; draggedNodeId = null; dragStartNode = null;
    const mechanical = target.closest<SVGGElement>('[data-mechanical-id]');
    if (mechanical && !state.interaction.placementDefinitionId) { const id = mechanical.getAttribute('data-mechanical-id'); const node = id ? mechanicalNodeById(state.graph, id) : null; if (id && node) { draggedNodeId = id; dragStartNode = { ...node.position }; store.setSelection({ type: 'mechanical', mechanicalNodeId: id }); } }
    svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener('pointermove', event => {
    const planet = store.getState().world?.planet; if (!planet) return; hoverWorld = screenToWorld(svg, planet, displayCamera, event.clientX, event.clientY); refreshPreview(store.getState());
    if (pointerId !== event.pointerId) return; const rect = svg.getBoundingClientRect(); if (rect.width <= 0 || rect.height <= 0) return; const dx = event.clientX - panStartClient.x; const dy = event.clientY - panStartClient.y; if (Math.hypot(dx, dy) > 4) suppressClick = true;
    const visible = visibleWorldSize(svg, planet, panStartCamera.zoom);
    if (draggedNodeId && dragStartNode) { const graph = store.getState().graph; store.setGraph(moveMechanicalNode(graph, draggedNodeId, { x: dragStartNode.x + dx * (visible.width / rect.width), y: dragStartNode.y + dy * (visible.height / rect.height) })); return; }
    commitCamera({ centerX: panStartCamera.centerX - dx * (visible.width / rect.width), centerY: panStartCamera.centerY - dy * (visible.height / rect.height), zoom: panStartCamera.zoom });
  });
  const finishPointer = (event: PointerEvent): void => { if (pointerId !== event.pointerId) return; if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId); pointerId = null; draggedNodeId = null; dragStartNode = null; if (suppressClick) window.setTimeout(() => { suppressClick = false; }, 0); };
  svg.addEventListener('pointerup', finishPointer); svg.addEventListener('pointercancel', finishPointer); svg.addEventListener('pointerleave', () => { hoverWorld = null; refreshPreview(store.getState()); });

  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') { store.clearInteraction(); hoverWorld = null; refreshPreview(store.getState()); }
    if ((event.key === 'Delete' || event.key === 'Backspace') && store.getState().selection.type === 'mechanical' && !['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement | null)?.tagName ?? '')) {
      const selected = store.getState().selection; if (selected.type === 'mechanical') { store.setGraph(removeMechanicalNode(store.getState().graph, selected.mechanicalNodeId)); store.setSelection({ type: 'planet' }); }
    }
  });

  root.querySelector<HTMLButtonElement>('[data-viewport="in"]')?.addEventListener('click', () => commitCamera({ ...displayCamera, zoom: displayCamera.zoom * 2 }));
  root.querySelector<HTMLButtonElement>('[data-viewport="out"]')?.addEventListener('click', () => commitCamera({ ...displayCamera, zoom: displayCamera.zoom / 2 }));
  root.querySelector<HTMLButtonElement>('[data-viewport="fit"]')?.addEventListener('click', () => { const planet = store.getState().world?.planet; if (planet) commitCamera({ centerX: planet.width / 2, centerY: planet.height / 2, zoom: 1 }); });
  root.querySelector<HTMLButtonElement>('[data-viewport="center"]')?.addEventListener('click', () => { const planet = store.getState().world?.planet; if (planet) commitCamera({ centerX: planet.width / 2, centerY: planet.height / 2, zoom: displayCamera.zoom }); });
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => applyCamera(displayCamera)) : null; resizeObserver?.observe(svg); if (!resizeObserver) window.addEventListener('resize', () => applyCamera(displayCamera));
}
''')

write('src/app.ts', r'''import { installMapRenderer } from './map/mapRenderer.js';
import { AppStore, type AppState } from './state/appState.js';
import { generateWorld } from './world/generateWorld.js';
import { installDebugPanel } from './ui/debugPanel.js';
import { installInspectorPanel } from './ui/inspectorPanel.js';
import { installNavigationPanel } from './ui/navigationPanel.js';
import { installNodeCatalogPanel } from './ui/nodeCatalogPanel.js';
import { renderWorkspaceShell } from './ui/workspaceShell.js';

const store = new AppStore();
function elementById<T extends HTMLElement>(id: string): T | null { return document.getElementById(id) as T | null; }
function resolveSeed(): string { const input = elementById<HTMLInputElement>('seed-input'); const requested = input?.value.trim(); return requested || String(Math.floor(Math.random() * 1_000_000_000)); }

function renderBreadcrumbs(state: Readonly<AppState>): void {
  const breadcrumbs = elementById<HTMLElement>('ws-breadcrumbs'); const planet = state.world?.planet; if (!breadcrumbs || !planet) return; const labels = [planet.name]; const selection = state.selection;
  if (selection.type === 'region') labels.push(planet.regions.find(region => region.id === selection.regionId)?.name ?? selection.regionId);
  else if (selection.type === 'resource') { const resource = planet.resourceNodes.find(node => node.id === selection.resourceNodeId); const region = resource ? planet.regions.find(candidate => candidate.id === resource.regionId) : null; if (region) labels.push(region.name); labels.push(resource?.name ?? selection.resourceNodeId); }
  else if (selection.type === 'mechanical') labels.push(state.graph.nodes.find(node => node.id === selection.mechanicalNodeId)?.label ?? selection.mechanicalNodeId);
  breadcrumbs.replaceChildren(); labels.forEach((label, index) => { if (index > 0) { const separator = document.createElement('span'); separator.className = 'ws-breadcrumb-sep'; separator.textContent = '›'; breadcrumbs.appendChild(separator); } const item = document.createElement('span'); item.className = index === labels.length - 1 ? 'ws-breadcrumb--active' : 'ws-breadcrumb'; item.textContent = label; breadcrumbs.appendChild(item); });
}

function enterPlayerWorkspace(): void {
  const seed = resolveSeed(); const world = generateWorld(seed); const landing = elementById<HTMLElement>('landing-screen'); const playerView = elementById<HTMLElement>('player-view'); const main = elementById<HTMLElement>('ws-main'); if (!playerView || !main) return;
  landing?.remove(); playerView.style.removeProperty('display'); const root = renderWorkspaceShell(main, { title: `${world.planet.name} · Planet Map`, subtitle: `Seed ${world.planet.seed} · ${world.planet.regions.length} regions · ${world.planet.resourceNodes.length} resource nodes` });
  installNavigationPanel(root, store); installNodeCatalogPanel(root, store); installInspectorPanel(root, store); installDebugPanel(root, store); installMapRenderer(root, store); store.subscribe(renderBreadcrumbs); store.setWorld(world);
}
function installLandingScreen(): void { elementById<HTMLButtonElement>('generate-btn')?.addEventListener('click', enterPlayerWorkspace); elementById<HTMLInputElement>('seed-input')?.addEventListener('keydown', event => { if (event.key === 'Enter') enterPlayerWorkspace(); }); }
document.addEventListener('DOMContentLoaded', installLandingScreen);
''')

# Small targeted patches to existing modules.
generate = Path('src/world/generateWorld.ts').read_text()
generate = generate.replace("kind: 'resource-access',\n          label: 'resources',", "kind: 'resource-access',\n          medium: 'resource',\n          label: 'resources',")
Path('src/world/generateWorld.ts').write_text(generate)

navigation = Path('src/ui/navigationPanel.ts').read_text()
navigation = navigation.replace("if (selection.type === 'region') return `region:${selection.regionId}`;\n  return `resource:${selection.resourceNodeId}`;", "if (selection.type === 'region') return `region:${selection.regionId}`;\n  if (selection.type === 'resource') return `resource:${selection.resourceNodeId}`;\n  return `mechanical:${selection.mechanicalNodeId}`;")
Path('src/ui/navigationPanel.ts').write_text(navigation)

shell = Path('src/ui/workspaceShell.ts').read_text()
start = shell.index('function debugDrawerMarkup(): string {')
end = shell.index('export function workspaceShellMarkup')
new_debug = '''function debugDrawerMarkup(): string {\n  return `<aside id="ws-debug-drawer" class="ws-debug-drawer" aria-label="Debug and performance tools" aria-hidden="true" hidden>\n    <div class="ws-navigation-header ws-debug-header"><strong>DEBUG</strong><div class="ws-navigation-actions"><button id="ws-debug-close" class="ws-navigation-close" type="button" aria-label="Close debug tools" title="Close">×</button></div></div>\n    <div id="ws-debug-body" class="ws-debug-scroll"><p class="ws-empty">Debug model initializing…</p></div>\n  </aside>`;\n}\n\n'''
shell = shell[:start] + new_debug + shell[end:]
shell = shell.replace('No constructible nodes are connected during the map rewrite.', 'Loading constructible node definitions…')
Path('src/ui/workspaceShell.ts').write_text(shell)

with Path('map.css').open('a') as f:
    f.write(r'''

/* Phase 4 mechanical graph: world-space machinery and connections. */
.ws-map-mechanical-layer { transition: opacity 90ms linear; }
.ws-map-mechanical-node { cursor: move; }
.ws-map-mechanical-card-body { fill: #111922; stroke: #866a42; stroke-width: 0.0000184; }
.ws-map-mechanical-card-header--apparatus { fill: #6c4d24; }
.ws-map-mechanical-card-header--container { fill: #324a66; }
.ws-map-mechanical-category, .ws-map-mechanical-label, .ws-map-placement-preview-label { font-family: 'Courier New', Courier, monospace; user-select: none; pointer-events: none; }
.ws-map-mechanical-category { fill: #e7edf3; font-weight: 700; letter-spacing: 0.12em; text-anchor: start; }
.ws-map-mechanical-label { fill: #d6e4ed; text-anchor: middle; }
.ws-map-mechanical-port { fill: #172431; stroke: #8aa1b3; stroke-width: 0.0000225; cursor: crosshair; }
.ws-map-port--resource-access { fill: #1f3823; stroke: #7aa879; }
.ws-map-port--gas { fill: #29324a; stroke: #8c9bd0; }
.ws-map-port--pending { stroke: #ffcc44 !important; stroke-width: 0.00004 !important; }
.ws-map-mechanical-node.ws-map-selected .ws-map-mechanical-card-body { stroke: #ffcc44; }
.ws-map-connection { fill: none; stroke: #5599cc; stroke-width: 0.000025; pointer-events: stroke; }
.ws-map-connection--resource-access { stroke: #7aa879; stroke-dasharray: 0.00008 0.00005; }
.ws-map-connection--gas { stroke: #8c9bd0; }
.ws-map-placement-preview { pointer-events: none; opacity: 0.72; }
.ws-map-placement-preview-body { fill: #6c4d2433; stroke: #ffcc44; stroke-width: 0.000025; stroke-dasharray: 0.00006 0.00004; }
.ws-map-placement-preview-label { fill: #ffdf80; text-anchor: middle; }
''')

with Path('workspace-overrides.css').open('a') as f:
    f.write(r'''

/* Phase 4 typed NODE catalog and observer-only DEBUG presentation. */
.ws-node-catalog-category { margin: 8px 7px 4px; color: #78aa9d; font-size: 9px; font-weight: 700; letter-spacing: 0.12em; }
.ws-node-catalog-item { display: flex; flex-direction: column; gap: 3px; width: calc(100% - 10px); margin: 2px 5px; padding: 7px 8px; text-align: left; background: #111d29; border: 1px solid #29465b; color: #d6e4ed; }
.ws-node-catalog-item:hover, .ws-node-catalog-item:focus-visible { background: #193042; border-color: #4a9b88; }
.ws-node-catalog-item strong { color: #b8d9ca; font-size: 11px; }
.ws-node-catalog-item span { color: #8497a8; font-size: 9px; line-height: 1.35; }
.ws-node-catalog-status { flex: 0 0 auto; min-height: 34px; padding: 7px 10px; border-top: 1px solid #1e3e39; color: #9fc8bc; font-size: 10px; line-height: 1.35; }
.ws-debug-metric > span:last-child { max-width: 58%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; }
.ws-ins-connection-row { display: flex; align-items: center; gap: 5px; margin: 4px 0; font-size: 9px; }
.ws-ins-connection-row span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.ws-ins-connection-row button, .ws-ins-actions button { padding: 2px 5px; font-size: 9px; }
.ws-ins-actions { margin-top: 12px; padding-top: 8px; border-top: 1px solid #243443; }
''')

write('tests/phase4Graph.test.js', r'''import assert from 'node:assert/strict';
import test from 'node:test';
import { APPARATUS_DEFINITIONS, apparatusDefinitionById } from '../dist/apparatus/definitions.js';
import { connectPorts, createEmptyGraphState, moveMechanicalNode, placeMechanicalNode, removeMechanicalNode } from '../dist/graph/graphCommands.js';
import { portForEndpoint } from '../dist/graph/graphQueries.js';
import { createDebugSnapshot } from '../dist/debug/debugModel.js';
import { AppStore } from '../dist/state/appState.js';
import { generateWorld } from '../dist/world/generateWorld.js';
import fs from 'node:fs';

test('Phase 4 catalog is definition-driven and restores the engineering vocabulary', () => {
  const ids = APPARATUS_DEFINITIONS.map(definition => definition.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const required of ['extractor', 'jaw-crusher', 'cone-crusher', 'ball-mill', 'screen', 'splitter', 'material-merger', 'feeder', 'magnetic-separator', 'hopper']) assert.ok(ids.includes(required), required);
  assert.equal(apparatusDefinitionById('extractor').ports[0].kind, 'resource-access');
  assert.equal(apparatusDefinitionById('hopper').category, 'container');
});

test('graph commands place, move, and remove mechanical nodes without UI ownership', () => {
  let graph = createEmptyGraphState();
  const placed = placeMechanicalNode(graph, apparatusDefinitionById('hopper'), { x: 10, y: 20 }); graph = placed.graph;
  assert.equal(graph.nodes.length, 1); assert.equal(placed.node.position.x, 10); assert.equal(placed.node.ports.length, 2);
  graph = moveMechanicalNode(graph, placed.node.id, { x: 30, y: 40 }); assert.deepEqual(graph.nodes[0].position, { x: 30, y: 40 });
  graph = removeMechanicalNode(graph, placed.node.id); assert.equal(graph.nodes.length, 0);
});

test('resource-access connects FEATURE output only to compatible Extractor input', () => {
  const world = generateWorld('phase4-connect'); const planet = world.planet; const resource = planet.resourceNodes[0];
  let graph = createEmptyGraphState(); const extractor = placeMechanicalNode(graph, apparatusDefinitionById('extractor'), resource.position); graph = extractor.graph;
  const resourceEndpoint = { nodeId: resource.id, portId: resource.resourceAccessPortId }; const extractorEndpoint = { nodeId: extractor.node.id, portId: 'resource-source' };
  graph = connectPorts(graph, resourceEndpoint, portForEndpoint(planet, graph, resourceEndpoint), extractorEndpoint, portForEndpoint(planet, graph, extractorEndpoint));
  assert.equal(graph.connections.length, 1); assert.equal(graph.connections[0].kind, 'resource-access');
  const hopper = placeMechanicalNode(graph, apparatusDefinitionById('hopper'), { x: resource.position.x + 1, y: resource.position.y }); graph = hopper.graph;
  const hopperInput = { nodeId: hopper.node.id, portId: 'input' };
  assert.throws(() => connectPorts(graph, resourceEndpoint, portForEndpoint(planet, graph, resourceEndpoint), hopperInput, portForEndpoint(planet, graph, hopperInput)), /Port kinds are incompatible/);
});

test('removing a mechanical node also removes its attached connections', () => {
  const world = generateWorld('phase4-remove'); const planet = world.planet; let graph = createEmptyGraphState();
  const extractor = placeMechanicalNode(graph, apparatusDefinitionById('extractor'), { x: 2, y: 2 }); graph = extractor.graph; const hopper = placeMechanicalNode(graph, apparatusDefinitionById('hopper'), { x: 3, y: 2 }); graph = hopper.graph;
  const output = { nodeId: extractor.node.id, portId: 'output' }; const input = { nodeId: hopper.node.id, portId: 'input' };
  graph = connectPorts(graph, output, portForEndpoint(planet, graph, output), input, portForEndpoint(planet, graph, input)); assert.equal(graph.connections.length, 1);
  graph = removeMechanicalNode(graph, hopper.node.id); assert.equal(graph.connections.length, 0);
});

test('DEBUG is a read-only projection of world, camera, graph, and runtime status', () => {
  const store = new AppStore(); store.setWorld(generateWorld('phase4-debug'));
  const snapshot = createDebugSnapshot(store.getState()); assert.equal(snapshot.graph['Mechanical nodes'], '0'); assert.equal(snapshot.runtime.Status, 'Disconnected'); assert.equal(snapshot.world.Regions, '5');
});

test('Phase 4 active TypeScript architecture keeps catalog, graph, rendering, and debug responsibilities separated', () => {
  const renderer = fs.readFileSync('src/map/mapRenderer.ts', 'utf8');
  assert.match(renderer, /from '.\/camera\/mapCamera\.js'/); assert.match(renderer, /from '.\/rendering\/mechanicalRenderer\.js'/); assert.doesNotMatch(renderer, /APPARATUS_DEFINITIONS\s*=|workspaceController/);
  const app = fs.readFileSync('src/app.ts', 'utf8'); assert.match(app, /installNodeCatalogPanel/); assert.match(app, /installDebugPanel/); assert.doesNotMatch(app, /workspaceController\.js/);
});
''')
