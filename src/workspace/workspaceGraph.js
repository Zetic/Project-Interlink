/** Shared player-facing graph projection for primitive and composite workspaces. */

import { getNodePortDefinitions } from '../simulation/simulationEngine.js';

function graphPorts(node, ports = getNodePortDefinitions(node)) {
  return ports.map(port => ({
    id: port.id,
    direction: port.direction,
    kind: port.kind ?? 'material',
    label: port.label ?? port.id,
  }));
}

function graphNode(node, position = { x: 0, y: 0 }, ports) {
  return {
    id: node.id,
    label: node.displayName ?? node.systemType ?? node.nodeType ?? node.id,
    type: node.nodeType ?? node.systemType,
    position: { x: position.x, y: position.y },
    ports: graphPorts(node, ports),
    source: node,
    composite: node.kind === 'composite' || node.nodeType === 'site' || node.nodeType === 'region',
  };
}

function graphConnection(connection, adapter) {
  return {
    id: connection.id,
    source: { nodeId: connection.sourceNodeId, portId: connection.sourcePortId },
    target: { nodeId: connection.targetNodeId, portId: connection.targetPortId },
    kind: connection.kind ?? 'material',
    adapter,
    sourceConnection: connection,
  };
}

/** Project a local engineering blueprint without changing its simulation objects. */
export function projectBlueprintGraph(blueprint, layout = { nodePositions: {} }) {
  if (!blueprint) return { nodes: [], connections: [] };
  return {
    nodes: Object.values(blueprint.nodes ?? {}).map(node => graphNode(
      node,
      layout.nodePositions?.[node.id] ?? { x: 0, y: 0 },
    )),
    connections: Object.values(blueprint.connections ?? {}).map(connection =>
      graphConnection(connection, 'blueprint')),
  };
}

/**
 * Project recursive transfers into the same connection contract as local
 * material streams. Endpoint resolution is deliberately supplied by the
 * workspace renderer because visible composite endpoints vary by hierarchy.
 */
export function projectBoundaryGraph(definition, transfers = {}, endpointResolver = null) {
  const nodes = (definition?.nodes ?? []).map(node => graphNode(
    node,
    definition.layout?.nodePositions?.[node.id] ?? { x: 0, y: 0 },
    node.visiblePorts ?? node.ports,
  ));
  const nodeIds = new Set(nodes.map(node => node.id));
  const connections = Object.values(transfers).filter(transfer => {
    if (definition?.planetScopeId && definition.scopeId === definition.planetScopeId) {
      return nodeIds.has(transfer.sourceCompositeId) && nodeIds.has(transfer.targetCompositeId);
    }
    return transfer.scopeId === definition?.scopeId;
  }).map(transfer => {
    const connection = graphConnection({
      id: transfer.id,
      sourceNodeId: transfer.sourceCompositeId,
      sourcePortId: transfer.sourcePortId,
      targetNodeId: transfer.targetCompositeId,
      targetPortId: transfer.targetPortId,
      kind: 'material',
    }, 'boundary-transfer');
    connection.transfer = transfer;
    connection.visibleSource = endpointResolver?.(transfer.sourceCompositeId, transfer.sourcePortId) ?? connection.source;
    connection.visibleTarget = endpointResolver?.(transfer.targetCompositeId, transfer.targetPortId) ?? connection.target;
    return connection;
  });
  return { nodes, connections };
}

export function graphConnectionEndpoint(connection, side = 'source') {
  return side === 'source'
    ? (connection.visibleSource ?? connection.source)
    : (connection.visibleTarget ?? connection.target);
}

/** Resolve the simulation object represented by a graph edge. */
export function resolveGraphConnection(graph, connectionId) {
  return graph?.connections?.find(connection => connection.id === connectionId) ?? null;
}

/** Apply the common disconnect action through the adapter-owned callback. */
export function disconnectGraphConnection(graph, connectionId, adapters = {}) {
  const connection = resolveGraphConnection(graph, connectionId);
  if (!connection) return false;
  const disconnect = adapters[connection.adapter];
  if (typeof disconnect !== 'function') throw new Error(`No disconnect adapter for '${connection.adapter}'`);
  disconnect(connection);
  return true;
}
