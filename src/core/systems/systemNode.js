/**
 * Common contract for player-facing primitive and composite systems.
 * Boundary ports alias real child endpoints; they never own or duplicate matter.
 */

import { normalizePortCapabilities, portCapabilityMatches } from './ports.js';

function assertId(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

export function createSystemPort({
  id,
  direction,
  kind = 'material',
  label = id,
  childNodeId = null,
  childPortId = null,
  accepts = [],
  provides = [],
} = {}) {
  assertId(id, 'System port id');
  if (direction !== 'input' && direction !== 'output') {
    throw new Error(`System port '${id}' direction must be input or output`);
  }
  assertId(kind, `System port '${id}' kind`);
  return {
    id,
    direction,
    kind,
    label,
    childNodeId,
    childPortId,
    accepts: normalizePortCapabilities(accepts),
    provides: normalizePortCapabilities(provides),
  };
}

export function createSystemNode({
  id,
  nodeType,
  systemType = nodeType,
  kind = 'primitive',
  ports = [],
  inspectableState = {},
  childWorkspaceId = null,
} = {}) {
  assertId(id, 'System node id');
  assertId(nodeType, 'System node type');
  if (kind !== 'primitive' && kind !== 'composite') {
    throw new Error(`System node '${id}' kind must be primitive or composite`);
  }
  if (!Array.isArray(ports)) throw new Error(`System node '${id}' ports must be an array`);

  const normalizedPorts = ports.map(port => createSystemPort(port));
  const ids = new Set();
  for (const port of normalizedPorts) {
    if (ids.has(port.id)) throw new Error(`System node '${id}' has duplicate port '${port.id}'`);
    ids.add(port.id);
  }

  return {
    id,
    nodeType,
    systemType,
    kind,
    ports: normalizedPorts,
    inspectableState: { ...inspectableState },
    childWorkspaceId,
  };
}

export function createCompositeNode(params = {}) {
  return createSystemNode({ ...params, kind: 'composite' });
}

export function getSystemNodePort(node, portId) {
  return node?.ports?.find(port => port.id === portId) ?? null;
}

function assertMappedPortCompatibility(boundary, childNode, childPort, context) {
  if (!childNode) throw new Error(`${context} references an unknown child node`);
  if (!childPort) throw new Error(`${context} references an unknown child port`);
  if (childPort.direction !== boundary.direction) {
    throw new Error(`${context} direction '${boundary.direction}' does not match child port direction '${childPort.direction}'`);
  }
  if (childPort.kind !== boundary.kind) {
    throw new Error(`${context} kind '${boundary.kind}' does not match child port kind '${childPort.kind}'`);
  }
}

/** Resolve one composite boundary level to its real child endpoint. */
export function resolveBoundaryPort(composite, portId, childWorkspace) {
  if (!composite || composite.kind !== 'composite') {
    throw new Error('Boundary resolution requires a composite system node');
  }
  const boundary = getSystemNodePort(composite, portId);
  if (!boundary) throw new Error(`Unknown boundary port '${portId}'`);
  if (!boundary.childNodeId || !boundary.childPortId || !childWorkspace?.nodes) {
    return { boundaryPort: boundary, node: null, port: null };
  }

  const node = childWorkspace.nodes[boundary.childNodeId] ?? null;
  const port = getSystemNodePort(node, boundary.childPortId);
  assertMappedPortCompatibility(boundary, node, port, `Boundary '${composite.id}:${portId}'`);
  return { boundaryPort: boundary, node, port };
}

export function setBoundaryMapping(composite, portId, childNodeId, childPortId, childWorkspace = null) {
  const boundary = getSystemNodePort(composite, portId);
  if (!boundary) throw new Error(`Unknown boundary port '${portId}'`);
  assertId(childNodeId, 'Boundary childNodeId');
  assertId(childPortId, 'Boundary childPortId');

  if (childWorkspace?.nodes) {
    const node = childWorkspace.nodes[childNodeId] ?? null;
    const port = getSystemNodePort(node, childPortId);
    assertMappedPortCompatibility(boundary, node, port, `Boundary '${composite.id}:${portId}'`);
  }

  boundary.childNodeId = childNodeId;
  boundary.childPortId = childPortId;
  return boundary;
}

/** Resolve through any number of composite boundaries to a primitive endpoint. */
export function resolveBoundaryChain(composite, portId, workspaces = {}) {
  let currentNode = composite;
  let currentPortId = portId;
  const visited = new Set();

  for (;;) {
    const visitKey = `${currentNode.id}:${currentPortId}`;
    if (visited.has(visitKey)) throw new Error(`Boundary mapping cycle detected at '${visitKey}'`);
    visited.add(visitKey);

    const workspace = workspaces[currentNode.childWorkspaceId];
    if (!workspace) {
      return { boundaryPort: getSystemNodePort(currentNode, currentPortId), node: null, port: null };
    }

    const resolved = resolveBoundaryPort(currentNode, currentPortId, workspace);
    if (!resolved.node || resolved.node.kind !== 'composite') return resolved;
    currentNode = resolved.node;
    currentPortId = resolved.port.id;
  }
}

export function assertSystemConnectionCompatible(sourceNode, sourcePortId, targetNode, targetPortId) {
  const source = getSystemNodePort(sourceNode, sourcePortId);
  const target = getSystemNodePort(targetNode, targetPortId);
  if (!source) throw new Error(`Unknown source port '${sourcePortId}'`);
  if (!target) throw new Error(`Unknown target port '${targetPortId}'`);
  if (source.direction !== 'output') throw new Error(`Source port '${sourcePortId}' must be an output`);
  if (target.direction !== 'input') throw new Error(`Target port '${targetPortId}' must be an input`);
  if (source.kind !== target.kind) throw new Error(`Port kinds '${source.kind}' and '${target.kind}' are incompatible`);
  if (!portCapabilityMatches(source, target)) {
    throw new Error(`Port capabilities '${sourcePortId}' and '${targetPortId}' are incompatible`);
  }
  return { source, target };
}
