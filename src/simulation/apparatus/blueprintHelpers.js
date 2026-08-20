import { setMaterialStreamState } from '../materialStream.js';

export function findInboundConnection(blueprint, targetNodeId, targetPortId) {
  return Object.values(blueprint.connections).find(
    connection => connection.targetNodeId === targetNodeId && connection.targetPortId === targetPortId
  ) ?? null;
}

export function findOutboundConnection(blueprint, sourceNodeId, sourcePortId) {
  return Object.values(blueprint.connections).find(
    connection => connection.sourceNodeId === sourceNodeId && connection.sourcePortId === sourcePortId
  ) ?? null;
}

export function updateConnectionStream(blueprint, connection, solidState) {
  if (!connection) return;
  const stream = Object.values(blueprint.streams).find(item => item.connectionId === connection.id);
  if (stream) setMaterialStreamState(stream, solidState);
}
