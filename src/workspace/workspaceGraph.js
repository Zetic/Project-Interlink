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

function visibleBoundaryPorts(node) {
  const ports = node.visiblePorts ?? node.ports ?? getNodePortDefinitions(node);
  if (node.boundaryRole === 'import') return ports.filter(port => port.direction === 'output');
  if (node.boundaryRole === 'export') return ports.filter(port => port.direction === 'input');
  return ports;
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
    visibleBoundaryPorts(node),
  ));
  const nodeIds = new Set(nodes.map(node => node.id));
  const connections = Object.values(transfers).filter(transfer => {
    if (definition?.level === 'planet') {
      return transfer.scopeId === definition.planetScopeId
        && nodeIds.has(transfer.sourceCompositeId)
        && nodeIds.has(transfer.targetCompositeId);
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
    return {
      ...connection,
      transfer,
      visibleSource: endpointResolver?.(transfer.sourceCompositeId, transfer.sourcePortId) ?? connection.source,
      visibleTarget: endpointResolver?.(transfer.targetCompositeId, transfer.targetPortId) ?? connection.target,
    };
  });
  return { nodes, connections };
}

/**
 * Render projected nodes and install the shared node, port, and pointer
 * interaction hooks used by every workspace level.
 */
export function renderGraphNodes({
  canvas,
  graph,
  elements = new Map(),
  width = 160,
  height = 100,
  portRadius = 7,
  className = '',
  nodeClass = node => `ws-node--${node.type}`,
  label = node => node.label,
  nodeContent,
  portClass = () => '',
  onNodePointerDown,
  onNodeSelect,
  onPortStart,
  onPortFinish,
} = {}) {
  if (!canvas) return;
  const activeIds = new Set();
  for (const node of graph?.nodes ?? []) {
    activeIds.add(node.id);
    let element = elements.get(node.id);
    const isNew = !element || !canvas.contains(element);
    if (isNew) {
      element = document.createElement('div');
      element.addEventListener('mousedown', event => {
        const port = event.target.closest('.ws-port');
        if (port) {
          onPortStart?.(node, port.dataset.portId, event);
          return;
        }
        onNodePointerDown?.(node, event);
      });
      element.addEventListener('mouseup', event => {
        const port = event.target.closest('.ws-port');
        if (port) onPortFinish?.(node, port.dataset.portId, event);
      });
      element.addEventListener('click', event => {
        if (!event.target.closest('.ws-port,.ws-enter')) onNodeSelect?.(node.id);
      });
      canvas.appendChild(element);
      elements.set(node.id, element);
    }

    element.className = `ws-node ${className} ${nodeClass(node)}`;
    Object.assign(element.style, {
      left: `${node.position.x}px`,
      top: `${node.position.y}px`,
      width: `${width}px`,
      height: `${height}px`,
    });
    nodeContent?.(element, node, isNew);
    if (!nodeContent) {
      const nodeLabel = element.querySelector('.ws-node-label') ?? document.createElement('div');
      nodeLabel.className = 'ws-node-label';
      nodeLabel.innerHTML = String(label(node)).split('\n')
        .map(line => `<span>${line}</span>`).join('');
      if (!nodeLabel.parentNode) element.appendChild(nodeLabel);
    }

    if (isNew) {
      const portsByDirection = { input: [], output: [] };
      for (const port of node.ports) portsByDirection[port.direction]?.push(port);
      for (const direction of ['input', 'output']) {
        portsByDirection[direction].forEach((port, index) => {
          const step = height / (portsByDirection[direction].length + 1);
          const dot = document.createElement('div');
          dot.className = `ws-port ws-port--${direction} ${portClass(node, port, direction)}`;
          dot.title = port.label ?? port.id;
          dot.dataset.nodeId = node.id;
          dot.dataset.portId = port.id;
          dot.style.left = `${(direction === 'input' ? 0 : width) - portRadius}px`;
          dot.style.top = `${step * (index + 1) - portRadius}px`;
          element.appendChild(dot);
        });
      }
    }
    element.classList.toggle('ws-node--selected', node.selected === true);
  }
  for (const [id, element] of elements) {
    if (!activeIds.has(id)) {
      element.remove();
      elements.delete(id);
    }
  }
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
  if (typeof disconnect !== 'function') {
    throw new Error(`No disconnect adapter for '${connection.adapter}' (connection '${connectionId}')`);
  }
  disconnect(connection);
  return true;
}

/** Render any projected graph edge set with stable SVG element identity. */
export function renderGraphConnections({
  svg,
  graph,
  elements = new Map(),
  endpointPosition,
  flow = () => 0,
  selectedId = null,
  onSelect,
  className = '',
  createPath = null,
} = {}) {
  if (!svg) return;
  const makePath = createPath ?? (() => {
    if (typeof document === 'undefined') throw new Error('Graph edge rendering requires a document');
    return document.createElementNS('http://www.w3.org/2000/svg', 'path');
  });
  const activeIds = new Set();
  for (const connection of graph?.connections ?? []) {
    activeIds.add(connection.id);
    let path = elements.get(connection.id);
    if (!path || !svg.contains(path)) {
      path = makePath();
      path.setAttribute('fill', 'none');
      path.setAttribute('cursor', 'pointer');
      path.classList.add('ws-connection');
      if (className) path.classList.add(className);
      path.addEventListener('click', event => {
        event.stopPropagation();
        onSelect?.(connection.id);
      });
      svg.appendChild(path);
      elements.set(connection.id, path);
    }
    const source = endpointPosition(graphConnectionEndpoint(connection, 'source'));
    const target = endpointPosition(graphConnectionEndpoint(connection, 'target'));
    const midX = (source.x + target.x) / 2;
    path.setAttribute('d', `M ${source.x} ${source.y} C ${midX} ${source.y}, ${midX} ${target.y}, ${target.x} ${target.y}`);
    // Keep low-flow edges visible while scaling active flow within a readable range.
    path.setAttribute('stroke-width', Math.max(1.5, Math.min(6, 1.5 + flow(connection) * 0.5)));
    path.classList.toggle('ws-connection--selected', selectedId === connection.id);
  }
  for (const [id, path] of elements) {
    if (!activeIds.has(id)) {
      path.remove();
      elements.delete(id);
    }
  }
}
