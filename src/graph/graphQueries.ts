import type { GraphState, MechanicalNode, NodeConnection, PortEndpoint } from './types.js';
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
