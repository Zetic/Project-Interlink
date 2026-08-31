import type { ApparatusDefinition } from '../apparatus/definitions.js';
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
