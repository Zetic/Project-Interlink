/**
 * Small common contract for player-facing primitive and composite systems.
 *
 * A boundary port describes an existing child endpoint. It does not own
 * material, so resolving a boundary never creates a second physical copy.
 */

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
} = {}) {
  assertId(id, 'System port id');
  if (direction !== 'input' && direction !== 'output') {
    throw new Error(`System port '${id}' direction must be input or output`);
  }
  assertId(kind, `System port '${id}' kind`);
  return { id, direction, kind, label, childNodeId, childPortId };
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
  const portIds = new Set();
  for (const port of normalizedPorts) {
    if (portIds.has(port.id)) throw new Error(`System node '${id}' has duplicate port '${port.id}'`);
    portIds.add(port.id);
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

/**
 * Resolve a composite boundary to the physical child endpoint it represents.
 * The returned node/port references are intentionally aliases to child state,
 * not copied stream or storage state.
 */
export function resolveBoundaryPort(composite, portId, childWorkspace) {
  if (!composite || composite.kind !== 'composite') {
    throw new Error('Boundary resolution requires a composite system node');
  }
  const boundary = getSystemNodePort(composite, portId);
  if (!boundary) throw new Error(`Unknown boundary port '${portId}'`);
  if (!childWorkspace?.nodes || !boundary.childNodeId || !boundary.childPortId) {
    return { boundaryPort: boundary, node: null, port: null };
  }
  const node = childWorkspace.nodes[boundary.childNodeId] ?? null;
  const port = node?.ports?.find(candidate => candidate.id === boundary.childPortId)
    ?? (node && { id: boundary.childPortId });
  return { boundaryPort: boundary, node, port };
}

export function setBoundaryMapping(composite, portId, childNodeId, childPortId) {
  const port = getSystemNodePort(composite, portId);
  if (!port) throw new Error(`Unknown boundary port '${portId}'`);
  assertId(childNodeId, 'Boundary childNodeId');
  assertId(childPortId, 'Boundary childPortId');
  port.childNodeId = childNodeId;
  port.childPortId = childPortId;
  return port;
}

export function resolveBoundaryChain(composite, portId, workspaces = {}) {
  let currentNode = composite;
  let currentPortId = portId;
  let workspace = workspaces[currentNode.childWorkspaceId] ?? workspaces;

  for (;;) {
    const resolved = resolveBoundaryPort(currentNode, currentPortId, workspace);
    if (!resolved.node || resolved.node.kind !== 'composite') return resolved;
    currentNode = resolved.node;
    currentPortId = resolved.port?.id;
    workspace = workspaces[currentNode.childWorkspaceId] ?? workspaces;
  }
}
