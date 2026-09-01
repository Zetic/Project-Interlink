import { apparatusDefinitionById } from '../apparatus/definitions.js';
import {
  connectPorts,
  placeMechanicalNode,
  removeMechanicalNode,
  setMechanicalNodeEnabled,
  setMechanicalNodeParameter,
} from '../graph/graphCommands.js';
import type { GraphState, MechanicalNode } from '../graph/types.js';
import { metersToWorldUnits } from '../world/scale.js';
import type { NodePort, Point, ResourceNode } from '../world/types.js';

export const DEBUG_FACTORY_FEEDER_RATE_KG_PER_SECOND = 0.2;

export interface DebugFactoryManifest {
  sourceResourceId: string;
  nodeIds: string[];
}

export interface DebugFactoryPlacement {
  graph: GraphState;
  manifests: DebugFactoryManifest[];
}

type ConnectableNode = Pick<MechanicalNode | ResourceNode, 'id' | 'ports'>;

function requiredDefinition(id: string) {
  const definition = apparatusDefinitionById(id);
  if (!definition) throw new Error(`Debug factory requires apparatus definition '${id}'.`);
  return definition;
}

function portById(node: ConnectableNode, portId: string): NodePort {
  const port = node.ports.find(candidate => candidate.id === portId);
  if (!port) throw new Error(`Debug factory node '${node.id}' has no port '${portId}'.`);
  return port;
}

function connect(
  graph: GraphState,
  source: ConnectableNode,
  sourcePortId: string,
  target: ConnectableNode,
  targetPortId: string,
): GraphState {
  return connectPorts(
    graph,
    { nodeId: source.id, portId: sourcePortId },
    portById(source, sourcePortId),
    { nodeId: target.id, portId: targetPortId },
    portById(target, targetPortId),
  );
}

function offset(origin: Point, xMeters: number, yMeters: number): Point {
  return {
    x: origin.x + metersToWorldUnits(xMeters),
    y: origin.y + metersToWorldUnits(yMeters),
  };
}

function addNode(
  graph: GraphState,
  definitionId: string,
  position: Point,
  { enabled = false, parameterId = null, parameterValue = null }: {
    enabled?: boolean;
    parameterId?: string | null;
    parameterValue?: number | null;
  } = {},
): { graph: GraphState; node: MechanicalNode } {
  const placed = placeMechanicalNode(graph, requiredDefinition(definitionId), position);
  let nextGraph = placed.graph;
  if (enabled) nextGraph = setMechanicalNodeEnabled(nextGraph, placed.node.id, true);
  if (parameterId && parameterValue != null) {
    nextGraph = setMechanicalNodeParameter(nextGraph, placed.node.id, parameterId, parameterValue);
  }
  const node = nextGraph.nodes.find(candidate => candidate.id === placed.node.id);
  if (!node) throw new Error(`Debug factory failed to place '${definitionId}'.`);
  return { graph: nextGraph, node };
}

function placeOneFactory(graph: GraphState, resource: ResourceNode, origin: Point): { graph: GraphState; manifest: DebugFactoryManifest } {
  let nextGraph = graph;
  const nodes: MechanicalNode[] = [];
  const place = (
    definitionId: string,
    xMeters: number,
    yMeters: number,
    options: Parameters<typeof addNode>[3] = {},
  ): MechanicalNode => {
    const result = addNode(nextGraph, definitionId, offset(origin, xMeters, yMeters), options);
    nextGraph = result.graph;
    nodes.push(result.node);
    return result.node;
  };

  const extractor = place('extractor', 0, 0, { enabled: true });
  const rawHopper = place('hopper', 0, 18);
  const jawCrusher = place('jaw-crusher', 0, 36, { enabled: true });
  const jawProductHopper = place('hopper', 0, 54);
  const coneCrusher = place('cone-crusher', 0, 72, { enabled: true });
  const coneProductHopper = place('hopper', 0, 90);
  const screen = place('screen', 0, 108, { enabled: true });
  const screenMillHopper = place('hopper', 0, 126);
  const screenBranchHopper = place('hopper', 28, 126);
  const ballMill = place('ball-mill', 0, 144, { enabled: true });
  const millProductHopper = place('hopper', 0, 162);
  const splitter = place('splitter', 0, 180, { enabled: true });
  const splitBranchHopper = place('hopper', 0, 198);
  const furnaceFeedHopper = place('hopper', 28, 198);
  const feeder = place('feeder', 56, 198, {
    enabled: true,
    parameterId: 'flowRateKgPerSecond',
    parameterValue: DEBUG_FACTORY_FEEDER_RATE_KG_PER_SECOND,
  });
  const furnace = place('electric-roasting-furnace', 82, 198, { enabled: true });
  const productHopper = place('hopper', 112, 198);
  const vent = place('exhaust-vent', 112, 218);

  nextGraph = connect(nextGraph, resource, resource.resourceAccessPortId, extractor, 'resource-source');
  nextGraph = connect(nextGraph, extractor, 'output', rawHopper, 'input');
  nextGraph = connect(nextGraph, rawHopper, 'output', jawCrusher, 'feed');
  nextGraph = connect(nextGraph, jawCrusher, 'product', jawProductHopper, 'input');
  nextGraph = connect(nextGraph, jawProductHopper, 'output', coneCrusher, 'feed');
  nextGraph = connect(nextGraph, coneCrusher, 'product', coneProductHopper, 'input');
  nextGraph = connect(nextGraph, coneProductHopper, 'output', screen, 'feed');
  nextGraph = connect(nextGraph, screen, 'undersize', screenMillHopper, 'input');
  nextGraph = connect(nextGraph, screen, 'oversize', screenBranchHopper, 'input');
  nextGraph = connect(nextGraph, screenMillHopper, 'output', ballMill, 'feed');
  nextGraph = connect(nextGraph, ballMill, 'product', millProductHopper, 'input');
  nextGraph = connect(nextGraph, millProductHopper, 'output', splitter, 'feed');
  nextGraph = connect(nextGraph, splitter, 'output-a', splitBranchHopper, 'input');
  nextGraph = connect(nextGraph, splitter, 'output-b', furnaceFeedHopper, 'input');
  nextGraph = connect(nextGraph, furnaceFeedHopper, 'output', feeder, 'feed');
  nextGraph = connect(nextGraph, feeder, 'product', furnace, 'feed');
  nextGraph = connect(nextGraph, furnace, 'solid-product', productHopper, 'input');
  nextGraph = connect(nextGraph, furnace, 'gas-exhaust', vent, 'gas-in');

  return {
    graph: nextGraph,
    manifest: {
      sourceResourceId: resource.id,
      nodeIds: nodes.map(node => node.id),
    },
  };
}

export function placeDebugProcessingFactories(
  graph: GraphState,
  resource: ResourceNode,
  count = 1,
): DebugFactoryPlacement {
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    throw new Error('Debug factory count must be an integer from 1 to 100.');
  }
  let nextGraph = graph;
  const manifests: DebugFactoryManifest[] = [];
  for (let index = 0; index < count; index += 1) {
    const block = Math.floor(index / 10);
    const row = index % 10;
    const origin = offset(resource.position, 32 + block * 140, row * 250);
    const placed = placeOneFactory(nextGraph, resource, origin);
    nextGraph = placed.graph;
    manifests.push(placed.manifest);
  }
  return { graph: nextGraph, manifests };
}

export function removeDebugProcessingFactories(
  graph: GraphState,
  manifests: readonly DebugFactoryManifest[],
): GraphState {
  let nextGraph = graph;
  for (const manifest of manifests) {
    for (const nodeId of manifest.nodeIds) nextGraph = removeMechanicalNode(nextGraph, nodeId);
  }
  return nextGraph;
}
