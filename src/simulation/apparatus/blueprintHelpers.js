import {
  setGasMaterialStreamState,
  setMaterialStreamState,
} from '../materialStream.js';

const topologyCache = new WeakMap();

function cacheFor(blueprint) {
  let cache = topologyCache.get(blueprint);
  if (!cache) {
    cache = {
      inbound: new Map(),
      outbound: new Map(),
      streamByConnection: new Map(),
    };
    topologyCache.set(blueprint, cache);
  }
  return cache;
}

function portKey(nodeId, portId) {
  return `${nodeId}\u0000${portId}`;
}

function cachedConnectionStillAttached(blueprint, connection) {
  return Boolean(connection && blueprint.connections?.[connection.id] === connection);
}

/**
 * Cache only positive topology lookups. Existing cached objects are verified
 * against the authoritative maps on every access, so disconnect/reconnect is
 * safe without introducing a graph-revision contract. Missing ports continue
 * to rescan, allowing a newly connected edge to become visible immediately.
 */
export function findInboundConnection(blueprint, targetNodeId, targetPortId) {
  const cache = cacheFor(blueprint);
  const key = portKey(targetNodeId, targetPortId);
  const cached = cache.inbound.get(key);
  if (cachedConnectionStillAttached(blueprint, cached)) return cached;
  if (cached) cache.inbound.delete(key);

  const connection = Object.values(blueprint.connections).find(
    item => item.targetNodeId === targetNodeId && item.targetPortId === targetPortId
  ) ?? null;
  if (connection) cache.inbound.set(key, connection);
  return connection;
}

export function findOutboundConnection(blueprint, sourceNodeId, sourcePortId) {
  const cache = cacheFor(blueprint);
  const key = portKey(sourceNodeId, sourcePortId);
  const cached = cache.outbound.get(key);
  if (cachedConnectionStillAttached(blueprint, cached)) return cached;
  if (cached) cache.outbound.delete(key);

  const connection = Object.values(blueprint.connections).find(
    item => item.sourceNodeId === sourceNodeId && item.sourcePortId === sourcePortId
  ) ?? null;
  if (connection) cache.outbound.set(key, connection);
  return connection;
}

function streamForConnection(blueprint, connectionId) {
  const cache = cacheFor(blueprint);
  const cached = cache.streamByConnection.get(connectionId);
  if (cached && blueprint.streams?.[cached.id] === cached && cached.connectionId === connectionId) {
    return cached;
  }
  if (cached) cache.streamByConnection.delete(connectionId);

  const stream = Object.values(blueprint.streams).find(item => item.connectionId === connectionId) ?? null;
  if (stream) cache.streamByConnection.set(connectionId, stream);
  return stream;
}

export function updateConnectionStream(
  blueprint,
  connection,
  materialState,
  specificSensibleEnthalpyJPerKg = 0,
) {
  if (!connection) return;
  const stream = streamForConnection(blueprint, connection.id);
  if (!stream) return;
  if (materialState?.speciesMassKg) {
    setGasMaterialStreamState(stream, materialState, specificSensibleEnthalpyJPerKg);
  } else {
    setMaterialStreamState(stream, materialState, null, specificSensibleEnthalpyJPerKg);
  }
}