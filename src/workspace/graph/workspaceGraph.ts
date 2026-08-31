/** Shared player-facing graph projection for primitive and composite workspaces. */

import {
  getNodePortDefinitions,
  blueprintTopologyRevision,
  blueprintPresentationRevision,
  blueprintLayoutRevision,
} from '../../simulation/simulationEngine.js';
import { nodeCategory } from './nodePresentation.js';

const blueprintProjectionCache = new WeakMap();

function graphPorts(node, ports = getNodePortDefinitions(node)) {
  return ports.map(port => ({
    id: port.id,
    direction: port.direction,
    kind: port.kind ?? 'material',
    label: port.label ?? port.id,
  }));
}

function graphNode(node, position = { x: 0, y: 0 }, ports, selected = false) {
  return {
    id: node.id,
    label: node.displayName ?? node.systemType ?? node.nodeType ?? node.id,
    type: node.nodeType ?? node.systemType,
    category: nodeCategory(node),
    position: { x: position.x, y: position.y },
    ports: graphPorts(node, ports),
    source: node,
    selected,
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

/**
 * Project a local engineering blueprint without changing its simulation objects.
 * The editable graph, runtime state, and graph layout each expose transient
 * revision counters. Between authoritative changes the identical projection is
 * returned directly instead of allocating a new node/edge graph every display
 * frame.
 */
export function projectBlueprintGraph(blueprint, layout = { nodePositions: {} }, options = {}) {
  if (!blueprint) return { nodes: [], connections: [], renderRevision: 'empty' };

  const topologyRevision = blueprintTopologyRevision(blueprint);
  const presentationRevision = blueprintPresentationRevision(blueprint);
  const layoutRevision = blueprintLayoutRevision(layout);
  const selectedNodeId = options.selectedNodeId ?? null;
  const cache = blueprintProjectionCache.get(blueprint);

  if (
    cache
    && cache.layout === layout
    && cache.topologyRevision === topologyRevision
    && cache.presentationRevision === presentationRevision
    && cache.layoutRevision === layoutRevision
    && cache.selectedNodeId === selectedNodeId
  ) {
    return cache.graph;
  }

  const graph = {
    nodes: Object.values(blueprint.nodes ?? {}).map(node => graphNode(
      node,
      layout.nodePositions?.[node.id] ?? { x: 0, y: 0 },
      undefined,
      selectedNodeId === node.id,
    )),
    connections: Object.values(blueprint.connections ?? {}).map(connection =>
      graphConnection(connection, 'blueprint')),
    renderRevision: `blueprint:${topologyRevision}:${presentationRevision}:${layoutRevision}:${selectedNodeId ?? ''}`,
  };

  blueprintProjectionCache.set(blueprint, {
    layout,
    topologyRevision,
    presentationRevision,
    layoutRevision,
    selectedNodeId,
    graph,
  });
  return graph;
}

/**
 * Project recursive transfers into the same connection contract as local
 * material streams. Endpoint resolution is deliberately supplied by the
 * workspace renderer because visible composite endpoints vary by hierarchy.
 */
export function projectBoundaryGraph(definition, transfers = {}, endpointResolver = null, options = {}) {
  const nodes = (definition?.nodes ?? []).map(node => graphNode(
    node,
    definition.layout?.nodePositions?.[node.id] ?? { x: 0, y: 0 },
    visibleBoundaryPorts(node),
    options.selectedNodeId === node.id,
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
 * Graph rendering may still be requested by requestAnimationFrame for pointer
 * responsiveness, while authoritative simulation advances at a much lower fixed
 * rate. A cheap signature prevents identical node-card DOM from being rewritten
 * between physical-state changes.
 */
function nodeContentSignature(node) {
  const source = node?.source ?? {};
  const primitives = [];
  for (const [key, value] of Object.entries(source)) {
    if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) {
      primitives.push(`${key}=${String(value)}`);
    }
  }
  let storedMass = 0;
  for (const quantity of Object.values(source.materialBody?.solidState?.fractions ?? {})) {
    if (Number.isFinite(quantity) && quantity > 0) storedMass += quantity;
  }
  const runtimeRevision = source.runtimePresentation?.revision ?? '';
  return `${node.label}|${primitives.join('|')}|mass=${storedMass}|runtime=${runtimeRevision}`;
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
  const renderRevision = graph?.renderRevision ?? null;
  if (
    renderRevision
    && canvas.dataset.graphNodeRenderRevision === renderRevision
    && elements.size === (graph?.nodes?.length ?? 0)
  ) {
    return;
  }

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

    const nextClassName = `ws-node ${className} ${nodeClass(node)}`;
    if (element.className !== nextClassName) element.className = nextClassName;
    element.classList.toggle('ws-node--composite', node.composite === true);
    const left = `${node.position.x}px`;
    const top = `${node.position.y}px`;
    const widthPx = `${width}px`;
    const heightPx = `${height}px`;
    if (element.style.left !== left) element.style.left = left;
    if (element.style.top !== top) element.style.top = top;
    if (element.style.width !== widthPx) element.style.width = widthPx;
    if (element.style.height !== heightPx) element.style.height = heightPx;

    let categoryBar = element.querySelector('.ws-node-category');
    if (!categoryBar) {
      categoryBar = document.createElement('div');
      element.appendChild(categoryBar);
    }
    const category = node.category ?? nodeCategory(node.source);
    const categoryClassName = `ws-node-category ws-node-category--${category.key}`;
    if (categoryBar.className !== categoryClassName) categoryBar.className = categoryClassName;
    if (categoryBar.textContent !== category.label) categoryBar.textContent = category.label;
    if (element.getAttribute('data-node-category') !== category.key) {
      element.setAttribute('data-node-category', category.key);
    }

    const contentSignature = nodeContentSignature(node);
    if (isNew || element.dataset.nodeContentSignature !== contentSignature) {
      nodeContent?.(element, node, isNew);
      if (!nodeContent) {
        const nodeLabel = element.querySelector('.ws-node-label') ?? document.createElement('div');
        nodeLabel.className = 'ws-node-label';
        nodeLabel.innerHTML = String(label(node)).split('\n')
          .map(line => `<span>${line}</span>`).join('');
        if (!nodeLabel.parentNode) element.appendChild(nodeLabel);
      }
      element.dataset.nodeContentSignature = contentSignature;
    }

    if (isNew) {
      const portsByDirection = { input: [], output: [] };
      for (const port of node.ports) portsByDirection[port.direction]?.push(port);
      for (const direction of ['input', 'output']) {
        portsByDirection[direction].forEach((port, index) => {
          const step = height / (portsByDirection[direction].length + 1);
          const dot = document.createElement('div');
          const kindClass = `ws-port--kind-${String(port.kind ?? 'material').replace(/[^a-z0-9_-]/gi, '-')}`;
          dot.className = `ws-port ws-port--${direction} ${kindClass} ${portClass(node, port, direction)}`;
          dot.title = port.label ?? port.id;
          dot.dataset.nodeId = node.id;
          dot.dataset.portId = port.id;
          dot.dataset.portKind = port.kind ?? 'material';
          dot.style.left = `${(direction === 'input' ? 0 : width) - portRadius}px`;
          dot.style.top = `${step * (index + 1) - portRadius}px`;
          element.appendChild(dot);
        });
      }
    }
    element.classList.toggle(
      'ws-node--selected',
      node.selected === true,
    );
  }

  for (const [id, element] of elements) {
    if (!activeIds.has(id)) {
      element.remove();
      elements.delete(id);
    }
  }
  if (renderRevision) canvas.dataset.graphNodeRenderRevision = renderRevision;
}

/** Render the common cursor-following edge preview for any workspace adapter. */
export function renderGraphConnectionPreview({
  svg,
  active = false,
  preview = null,
  source,
  target,
  endpointPosition,
} = {}) {
  if (!svg) return null;
  if (!active || !source || !target || typeof endpointPosition !== 'function') {
    preview?.remove();
    return null;
  }
  let line = preview;
  if (!line || !svg.contains(line)) {
    if (typeof document === 'undefined') {
      throw new Error('renderGraphConnectionPreview: document is not available');
    }
    line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.classList.add('ws-connection-preview');
    svg.appendChild(line);
  }
  const start = endpointPosition(source);
  line.setAttribute('x1', start.x);
  line.setAttribute('y1', start.y);
  line.setAttribute('x2', target.x);
  line.setAttribute('y2', target.y);
  return line;
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
  const renderRevision = graph?.renderRevision ?? null;
  const connectionRevision = renderRevision ? `${renderRevision}:${selectedId ?? ''}` : null;
  if (
    connectionRevision
    && svg.dataset.graphConnectionRenderRevision === connectionRevision
    && elements.size === (graph?.connections?.length ?? 0)
  ) {
    return;
  }

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
    const connectionFlow = flow(connection);
    const signature = [
      connection.kind,
      source.x,
      source.y,
      target.x,
      target.y,
      connectionFlow,
      selectedId === connection.id,
    ].join('|');
    if (path.dataset.renderSignature !== signature) {
      path.classList.toggle('ws-connection--material', connection.kind === 'material');
      path.classList.toggle('ws-connection--resource-access', connection.kind === 'resource-access');
      const midX = (source.x + target.x) / 2;
      path.setAttribute('d', `M ${source.x} ${source.y} C ${midX} ${source.y}, ${midX} ${target.y}, ${target.x} ${target.y}`);
      // Keep low-flow edges visible while scaling active material flow within a readable range.
      path.setAttribute('stroke-width', Math.max(1.5, Math.min(6, 1.5 + connectionFlow * 0.5)));
      path.classList.toggle('ws-connection--selected', selectedId === connection.id);
      path.dataset.renderSignature = signature;
    }
  }
  for (const [id, path] of elements) {
    if (!activeIds.has(id)) {
      path.remove();
      elements.delete(id);
    }
  }
  if (connectionRevision) svg.dataset.graphConnectionRenderRevision = connectionRevision;
}