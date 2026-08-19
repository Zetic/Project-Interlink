/** Player-facing recursive workspace and live simulation UI. */

import {
  createBlueprint,
  blueprintAddExtractor,
  blueprintAddHopper,
  blueprintAddCrusher,
  blueprintAddMagSep,
  blueprintConnect,
  blueprintDisconnect,
  checkBlueprintConnection,
  getNodePortDefinitions,
  getStreamForConnection,
  setNodeEnabled,
  getNodeOperatingState,
  createBlueprintLayout,
  layoutMoveNode,
  SIMULATION_STEP_S,
  DEFAULT_HOPPER_CAPACITY_KG,
  DEFAULT_CRUSHER_THROUGHPUT_KG_PER_S,
  DEFAULT_CRUSHER_TARGET_PARTICLE_SIZE_MM,
  DEFAULT_MAG_SEP_FIELD_STRENGTH,
} from '../simulation/simulationEngine.js';
import {
  createWorldSimulation,
  registerSimulationSession,
  registerBoundaryTransfer,
  removeBoundaryTransfer,
  getSimulationWorkspace,
  pauseWorldSimulation,
  resumeWorldSimulation,
  worldSimulationTick,
} from '../simulation/worldSimulation.js';
import { setBoundaryMapping, getSystemNodePort } from '../simulation/systemNode.js';
import { hopperStoredMassKg } from '../simulation/hopperNode.js';
import { totalMassFlowKgPerSecond } from '../simulation/materialStream.js';
import { hopperInspection, streamInspection, machineInspection } from './inspectionViewModel.js';
import {
  projectBlueprintGraph,
  projectBoundaryGraph,
  renderGraphNodes,
  renderGraphConnections,
  renderGraphConnectionPreview,
  disconnectGraphConnection,
} from './workspaceGraph.js';
import { clampZoom, screenToGraph, zoomAroundPoint, fitViewport, centerViewport } from './viewport.js';
import { prototypeNodeTypesForSite, prototypeOccurrenceForSite } from './sitePrototype.js';

const wsState = {
  currentLevel: 'planet',
  selectedRegionId: null,
  selectedSiteId: null,
  selectedOccurrenceId: null,
  world: null,
  knowledge: null,
  blueprint: null,
  blueprintLayout: null,
  siteSessions: {},
  workspaceLayouts: {},
  systemNodeElements: new Map(),
  systemConnectionElements: new Map(),
  simRunning: false,
  simLastTime: null,
  simAccumulatedS: 0,
  simRafId: null,
  nodeElements: new Map(),
  connectionElements: new Map(),
  connectionPreview: null,
  viewports: {},
};

const NODE_WIDTH = 160;
const NODE_HEIGHT = 100;
const PORT_RADIUS = 7;

const pendingGraphConnection = {
  active: false,
  source: null,
  x: 0,
  y: 0,
  scopeId: null,
  adapter: null,
};
const inspector = {
  selectedNodeId: null,
  selectedConnId: null,
  selectedSystemId: null,
  selectedTransferId: null,
  message: '',
  renderKey: null,
};
let dragState = null;
let systemDragState = null;

function el(id) { return document.getElementById(id); }
function renderWorkspaceShell(container, {
  header = '',
  toolbarLeading = '',
  canvasId,
  svgId,
  inspectorBodyId,
  inspectorInitial = '',
} = {}) {
  container.innerHTML = `${header}<div class="ws-toolbar">${toolbarLeading}<button data-viewport="out">Zoom Out</button><span data-zoom-label>100%</span><button data-viewport="in">Zoom In</button><button data-viewport="fit">Fit</button><button data-viewport="center">Center</button></div><div class="ws-layout"><div class="ws-viewport" data-viewport-surface><svg id="${svgId}" class="ws-graph-svg"></svg><div id="${canvasId}" class="ws-graph-canvas"></div></div><div class="ws-inspector"><div class="ws-inspector-title">Inspector</div><div id="${inspectorBodyId}" class="ws-inspector-body">${inspectorInitial}</div></div></div>`;
  return {
    toolbar: container.querySelector('.ws-toolbar'),
    viewport: container.querySelector('.ws-viewport'),
    canvas: el(canvasId),
    svg: el(svgId),
    inspector: container.querySelector('.ws-inspector'),
    inspectorBody: el(inspectorBodyId),
  };
}
function escHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function currentPlanet() { return wsState.world?.planets?.[wsState.world?.planetId] ?? null; }

function requestPlayerWorldGeneration(seed) {
  const input = el('seed-input');
  const button = el('generate-btn');
  if (!input || !button) return;
  input.value = seed.trim();
  button.click();
}

function updateWorldControls() {
  const button = el('ws-world-toggle');
  const clock = el('ws-world-clock');
  if (button) button.textContent = wsState.world?.simulation?.running ? '⏸ Pause World' : '▶ Resume World';
  if (clock) clock.textContent = `${(wsState.world?.simulation?.elapsedSeconds ?? 0).toFixed(1)} s`;
}

function renderBreadcrumbs() {
  const container = el('ws-breadcrumbs');
  if (!container) return;
  const planet = currentPlanet();
  const region = wsState.selectedRegionId ? wsState.world?.regions?.[wsState.selectedRegionId] : null;
  const crumbs = [];
  if (planet) crumbs.push({ label: planet.name, level: 'planet', clickable: wsState.currentLevel !== 'planet' });
  if (region && wsState.currentLevel !== 'planet') {
    crumbs.push({ label: region.name, level: 'region', clickable: wsState.currentLevel === 'site' });
  }
  if (wsState.currentLevel === 'site') {
    const site = wsState.world?.sites?.[wsState.selectedSiteId];
    const feature = site ? wsState.world?.features?.[site.featureIds?.[0]] : null;
    crumbs.push({ label: feature?.name ?? wsState.selectedSiteId ?? 'Site', level: 'site', clickable: false });
  }

  container.innerHTML = `<span class="ws-world-controls"><button id="ws-world-toggle"></button><span id="ws-world-clock"></span></span>${crumbs.map(crumb => crumb.clickable
    ? `<button class="ws-breadcrumb" data-level="${crumb.level}">${escHtml(crumb.label)}</button>`
    : `<span class="ws-breadcrumb ws-breadcrumb--active">${escHtml(crumb.label)}</span>`).join('<span class="ws-breadcrumb-sep">›</span>')}`;
  container.querySelectorAll('.ws-breadcrumb[data-level]').forEach(button => {
    button.addEventListener('click', () => navigateTo(button.dataset.level));
  });
  el('ws-world-toggle')?.addEventListener('click', onToggleWorldSimulation);
  updateWorldControls();
}

function createSiteSession(occurrenceId, siteId) {
  const blueprint = createBlueprint();
  const blueprintLayout = createBlueprintLayout();
  const siteWorkspace = getSimulationWorkspace(wsState.world, `${siteId}-workspace`);
  const siteImport = siteWorkspace?.nodes?.[`${siteId}-import-boundary`]
    ?? blueprintAddHopper(blueprint, DEFAULT_HOPPER_CAPACITY_KG);
  const siteExport = siteWorkspace?.nodes?.[`${siteId}-export-boundary`]
    ?? blueprintAddHopper(blueprint, DEFAULT_HOPPER_CAPACITY_KG);

  siteImport.boundaryRole = 'import';
  siteImport.systemType = 'boundary-buffer';
  siteImport.displayName = 'Site Import';
  siteExport.boundaryRole = 'export';
  siteExport.systemType = 'boundary-buffer';
  siteExport.displayName = 'Site Export';
  blueprint.nodes[siteImport.id] = siteImport;
  blueprint.nodes[siteExport.id] = siteExport;

  const site = wsState.world?.sites?.[siteId];
  const featureIds = site?.featureIds ?? [];
  for (const featureId of featureIds) {
    const feature = wsState.world?.features?.[featureId];
    blueprint.nodes[`feature-node-${featureId}`] = {
      id: `feature-node-${featureId}`,
      nodeType: 'feature',
      systemType: 'feature',
      displayName: feature?.name ?? featureId,
      featureId,
      ports: [],
      enabled: false,
    };
  }
  const prototypeOccurrence = prototypeOccurrenceForSite(wsState.world, site);
  const prototypeOccurrenceId = prototypeOccurrence?.id ?? null;
  const prototypeNodeTypes = prototypeNodeTypesForSite(wsState.world, site);
  const extractor = prototypeNodeTypes.includes('extractor')
    ? blueprintAddExtractor(blueprint, prototypeOccurrenceId, 5)
    : null;
  const hopperA = extractor ? blueprintAddHopper(blueprint, DEFAULT_HOPPER_CAPACITY_KG) : null;
  const crusher = extractor ? blueprintAddCrusher(blueprint, {
    throughputKgPerSecond: DEFAULT_CRUSHER_THROUGHPUT_KG_PER_S,
    targetParticleSizeMm: DEFAULT_CRUSHER_TARGET_PARTICLE_SIZE_MM,
  }) : null;
  const hopperB = extractor ? blueprintAddHopper(blueprint, DEFAULT_HOPPER_CAPACITY_KG) : null;
  const magSep = extractor ? blueprintAddMagSep(blueprint, { fieldStrength: DEFAULT_MAG_SEP_FIELD_STRENGTH }) : null;
  const concentrateHopper = extractor ? blueprintAddHopper(blueprint, DEFAULT_HOPPER_CAPACITY_KG) : null;
  const tailingsHopper = extractor ? blueprintAddHopper(blueprint, DEFAULT_HOPPER_CAPACITY_KG) : null;

  const positions = [
    [siteImport, 60, 300],
    ...featureIds.map((featureId, index) => [blueprint.nodes[`feature-node-${featureId}`], 60, 40 + index * 110]),
    ...(extractor ? [[extractor, 60, 140]] : []),
    ...(extractor ? [[hopperA, 260, 140], [crusher, 460, 140], [hopperB, 660, 140], [magSep, 860, 140], [concentrateHopper, 1060, 60], [tailingsHopper, 1060, 220]] : []),
    [siteExport, 1260, 60],
  ];
  positions.forEach(([node, x, y]) => layoutMoveNode(blueprintLayout, node.id, x, y));

  if (extractor) blueprintConnect(blueprint, extractor.id, extractor.outputPortId, hopperA.id, hopperA.inputPortId);
  if (extractor) {
    blueprintConnect(blueprint, hopperA.id, hopperA.outputPortId, crusher.id, crusher.inputPortId);
    blueprintConnect(blueprint, crusher.id, crusher.outputPortId, hopperB.id, hopperB.inputPortId);
    blueprintConnect(blueprint, hopperB.id, hopperB.outputPortId, magSep.id, magSep.inputPortId);
    blueprintConnect(blueprint, magSep.id, magSep.concentratePortId, concentrateHopper.id, concentrateHopper.inputPortId);
    blueprintConnect(blueprint, magSep.id, magSep.tailingsPortId, tailingsHopper.id, tailingsHopper.inputPortId);
  }

  const siteNode = wsState.world?.systemNodes?.[siteId];
  if (siteNode) {
    // Parent-facing ports map to the opposite physical side of the same boundary buffers.
    setBoundaryMapping(siteNode, 'material-input', siteImport.id, siteImport.inputPortId, blueprint);
    setBoundaryMapping(siteNode, 'material-output', siteExport.id, siteExport.outputPortId, blueprint);
  }

  return { id: siteId, siteId, occurrenceId, blueprint, blueprintLayout, boundaryNode: siteNode };
}

function activateSiteSession(occurrenceId, siteId) {
  if (!siteId) return;
  let session = wsState.siteSessions[siteId];
  if (!session) {
    session = createSiteSession(occurrenceId, siteId);
    wsState.siteSessions[siteId] = session;
    registerSimulationSession(wsState.world, siteId, session.blueprint, session.boundaryNode?.childWorkspaceId);
  }
  wsState.blueprint = session.blueprint;
  wsState.blueprintLayout = session.blueprintLayout;
  wsState.selectedSiteId = siteId;
}

export function navigateTo(level, opts = {}) {
  if (level === 'region' && opts.regionId) wsState.selectedRegionId = opts.regionId;

  if (level === 'site') {
    const site = wsState.world?.sites?.[opts.siteId];
    if (!site) return;
    const occurrenceId = opts.occurrenceId && site.resourceOccurrenceIds.includes(opts.occurrenceId)
      ? opts.occurrenceId
      : site.resourceOccurrenceIds[0] ?? null;
    wsState.selectedSiteId = site.id;
    wsState.selectedRegionId = site.regionId;
    wsState.selectedOccurrenceId = occurrenceId;
    activateSiteSession(occurrenceId, site.id);
    level = 'site';
  } else if (level === 'site' && !opts.siteId) {
    const site = wsState.world?.sites?.[wsState.selectedSiteId];
    const occurrenceId = opts.occurrenceId ?? wsState.selectedOccurrenceId ?? site?.resourceOccurrenceIds?.[0] ?? null;
    if (!site) return;
    wsState.selectedOccurrenceId = occurrenceId;
    activateSiteSession(occurrenceId, site.id);
  }

  wsState.currentLevel = level;
  inspector.selectedNodeId = null;
  inspector.selectedConnId = null;
  inspector.selectedSystemId = null;
  inspector.selectedTransferId = null;
  inspector.message = '';
  inspector.renderKey = null;
  renderWorkspace();
}

function systemWorkspaceDefinition() {
  const planet = currentPlanet();
  if (wsState.currentLevel === 'planet') {
    return {
      id: `planet:${planet?.id}`,
      title: planet?.name ?? 'Planet',
      nodes: (planet?.regions ?? []).map(id => wsState.world.systemNodes[id]).filter(Boolean),
      scopeId: planet?.id,
      level: 'planet',
      planetScopeId: planet?.id,
    };
  }

  const region = wsState.world?.regions?.[wsState.selectedRegionId];
  const runtime = region ? getSimulationWorkspace(wsState.world, `${region.id}-workspace`) : null;
  const nodes = Object.values(runtime?.nodes ?? {}).filter(node => node.boundaryRole);

  for (const siteId of region?.siteIds ?? []) {
    const node = wsState.world.systemNodes?.[siteId];
    if (node) nodes.push(node);
  }

  return {
    id: `region:${region?.id}`,
    title: region?.name ?? 'Region',
    nodes,
    scopeId: region?.id,
    level: 'region',
    planetScopeId: currentPlanet()?.id,
  };
}

function systemNodeTitle(node) {
  if (node.boundaryRole) {
    const prefix = wsState.currentLevel === 'region' ? 'Region' : '';
    return node.displayName?.includes('Region') ? node.displayName : `${prefix} ${node.boundaryRole === 'import' ? 'Import' : 'Export'}`.trim();
  }
  if (node.nodeType === 'region') return wsState.world.regions[node.id]?.name ?? node.id;
  if (node.nodeType === 'site') {
    const site = wsState.world.sites[node.id];
    return wsState.world.features[site?.featureIds?.[0]]?.name ?? node.id;
  }
  return node.systemType ?? node.nodeType;
}

function systemNodeDescription(node) {
  if (node.boundaryRole) return `${node.boundaryRole} material boundary buffer`;
  if (node.nodeType === 'region') {
    const region = wsState.world.regions[node.id];
    return `${region?.surfaceCover ?? 'Region'} · ${(region?.siteIds ?? []).length} sites`;
  }
  if (node.nodeType === 'site') {
    const site = wsState.world.sites[node.id];
    const feature = wsState.world.features[site?.featureIds?.[0]];
    return `${feature?.type ?? 'Site'} · enterable site`;
  }
  return node.nodeType;
}

function systemPortEndpoint(node, port) {
  if (wsState.currentLevel === 'region' && node.boundaryRole) {
    const regionId = wsState.selectedRegionId;
    if (node.boundaryRole === 'import' && port.direction === 'output') {
      return { systemId: `${regionId}-import-terminal`, portId: 'material-output' };
    }
    if (node.boundaryRole === 'export' && port.direction === 'input') {
      return { systemId: `${regionId}-export-terminal`, portId: 'material-input' };
    }
  }
  return { systemId: node.id, portId: port.id };
}

function ensureSystemLayout(definition) {
  const layout = wsState.workspaceLayouts[definition.id] ??= { nodePositions: {} };
  definition.nodes.forEach((node, index) => {
    layout.nodePositions[node.id] ??= {
      x: 40 + (index % 4) * 230,
      y: 40 + Math.floor(index / 4) * 170,
    };
  });
  return layout;
}

function workspaceViewport(key) {
  return wsState.viewports[key] ??= { panX: 0, panY: 0, zoom: 1 };
}

function eventGraphPoint(event, surface, key) {
  const rect = surface?.getBoundingClientRect() ?? { left: 0, top: 0 };
  return screenToGraph(
    { x: event.clientX - rect.left, y: event.clientY - rect.top },
    workspaceViewport(key),
  );
}

function installViewport(surface, canvas, svg, key, boundsProvider, controlsRoot = null) {
  if (!surface || !canvas || !svg) return;
  const apply = () => {
    const viewport = workspaceViewport(key);
    const transform = `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`;
    canvas.style.transformOrigin = '0 0';
    svg.style.transformOrigin = '0 0';
    canvas.style.transform = transform;
    svg.style.transform = transform;
    controlsRoot.querySelectorAll('[data-zoom-label]').forEach(label => {
      label.textContent = `${Math.round(viewport.zoom * 100)}%`;
    });
  };
  controlsRoot.querySelectorAll('[data-viewport]').forEach(button => {
    button.addEventListener('click', () => {
      const viewport = workspaceViewport(key);
      if (button.dataset.viewport === 'in') viewport.zoom = clampZoom(viewport.zoom + 0.1);
      if (button.dataset.viewport === 'out') viewport.zoom = clampZoom(viewport.zoom - 0.1);
      if (button.dataset.viewport === 'fit') Object.assign(viewport, fitViewport(viewport, boundsProvider(), { width: surface.clientWidth, height: surface.clientHeight }));
      if (button.dataset.viewport === 'center') Object.assign(viewport, centerViewport(viewport, boundsProvider(), { width: surface.clientWidth, height: surface.clientHeight }));
      apply();
    });
  });
  let panStart = null;
  surface.addEventListener('wheel', event => {
    event.preventDefault();
    const rect = surface.getBoundingClientRect();
    Object.assign(workspaceViewport(key), zoomAroundPoint(
      workspaceViewport(key),
      workspaceViewport(key).zoom * (event.deltaY < 0 ? 1.1 : 0.9),
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
    ));
    apply();
  }, { passive: false });
  surface.addEventListener('mousedown', event => {
    if (event.button !== 1 && !(event.button === 0 && event.getModifierState('Space'))) return;
    panStart = { x: event.clientX, y: event.clientY, ...workspaceViewport(key) };
    event.preventDefault();
  });
  surface.addEventListener('mousemove', event => {
    if (!panStart) return;
    const viewport = workspaceViewport(key);
    viewport.panX = panStart.panX + event.clientX - panStart.x;
    viewport.panY = panStart.panY + event.clientY - panStart.y;
    apply();
  });
  surface.addEventListener('mouseup', () => { panStart = null; });
  apply();
}

function portOffsetsForSize(port, index, count, width, height) {
  const step = height / (count + 1);
  return { dx: port.direction === 'input' ? 0 : width, dy: step * (index + 1) };
}
function portOffsets(port, index, count) { return portOffsetsForSize(port, index, count, NODE_WIDTH, NODE_HEIGHT); }

function visibleEndpointForTransfer(systemId, portId) {
  const regionId = wsState.selectedRegionId;
  if (systemId === `${regionId}-import-terminal`) {
    return { nodeId: `${regionId}-import-hopper`, portId: 'output' };
  }
  if (systemId === `${regionId}-export-terminal`) {
    return { nodeId: `${regionId}-export-hopper`, portId: 'input' };
  }
  return { nodeId: systemId, portId };
}

function systemEndpointPosition(definition, systemId, portId) {
  const visible = visibleEndpointForTransfer(systemId, portId);
  const layout = ensureSystemLayout(definition);
  const position = layout.nodePositions[visible.nodeId] ?? { x: 0, y: 0 };
  const graph = projectBoundaryGraph(
    { ...definition, layout },
    {},
    (nodeId, endpointPortId) => visibleEndpointForTransfer(nodeId, endpointPortId),
  );
  const node = graph.nodes.find(item => item.id === visible.nodeId);
  const ports = node?.ports ?? [];
  const port = ports.find(item => item.id === visible.portId);
  if (!port) return { x: position.x, y: position.y + NODE_HEIGHT / 2 };
  const side = ports.filter(item => item.direction === port.direction);
  const offset = portOffsets(port, side.indexOf(port), side.length);
  return { x: position.x + offset.dx, y: position.y + offset.dy };
}

function selectTransfer(transferId) {
  inspector.selectedTransferId = transferId;
  inspector.selectedSystemId = null;
  inspector.selectedNodeId = null;
  inspector.selectedConnId = null;
  inspector.message = '';
  inspector.renderKey = null;
  const definition = systemWorkspaceDefinition();
  renderSystemConnections(el('ws-system-svg'), definition);
  updateCompositeInspector(true);
}

function renderSystemConnections(svg, definition) {
  if (!svg) return;
  const graph = projectBoundaryGraph(
    { ...definition, layout: ensureSystemLayout(definition) },
    wsState.world?.simulation?.transfers ?? {},
    (systemId, portId) => visibleEndpointForTransfer(systemId, portId),
    { selectedNodeId: inspector.selectedSystemId },
  );

  renderGraphConnections({
    svg,
    graph,
    elements: wsState.systemConnectionElements,
    endpointPosition: endpoint => systemEndpointPosition(definition, endpoint.nodeId, endpoint.portId),
    flow: connection => connection.transfer.lastRateKgPerSecond ?? 0,
    selectedId: inspector.selectedTransferId,
    onSelect: selectTransfer,
    className: 'ws-system-connection',
  });
  wsState.connectionPreview = renderGraphConnectionPreview({
    svg,
    active: pendingGraphConnection.active && pendingGraphConnection.adapter === 'boundary-transfer',
    preview: wsState.connectionPreview,
    source: pendingGraphConnection.source,
    target: { x: pendingGraphConnection.x, y: pendingGraphConnection.y },
    endpointPosition: endpoint => systemEndpointPosition(definition, endpoint.nodeId, endpoint.portId),
  });
}

function startSystemNodeDrag(nodeId, event) {
  const definition = systemWorkspaceDefinition();
  const layout = ensureSystemLayout(definition);
  const position = layout.nodePositions[nodeId] ?? { x: 0, y: 0 };
  const point = eventGraphPoint(event, el('ws-system-canvas')?.parentElement, definition.id);
  systemDragState = {
    definitionId: definition.id,
    nodeId,
    startMouseX: point.x,
    startMouseY: point.y,
    startX: position.x,
    startY: position.y,
  };
  event.preventDefault();
}

function onSystemCanvasMove(event) {
  const definition = systemWorkspaceDefinition();
  if (systemDragState) {
    if (definition.id !== systemDragState.definitionId) return;
    const layout = ensureSystemLayout(definition);
    const point = eventGraphPoint(event, el('ws-system-canvas')?.parentElement, definition.id);
    layout.nodePositions[systemDragState.nodeId] = {
      x: Math.max(0, systemDragState.startX + point.x - systemDragState.startMouseX),
      y: Math.max(0, systemDragState.startY + point.y - systemDragState.startMouseY),
    };
    const element = wsState.systemNodeElements.get(systemDragState.nodeId);
    if (element) {
      element.style.left = `${layout.nodePositions[systemDragState.nodeId].x}px`;
      element.style.top = `${layout.nodePositions[systemDragState.nodeId].y}px`;
    }
  }
  if (pendingGraphConnection.active) {
    const point = eventGraphPoint(event, el('ws-system-canvas')?.parentElement, definition.id);
    pendingGraphConnection.x = point.x;
    pendingGraphConnection.y = point.y;
  }
  renderSystemConnections(el('ws-system-svg'), definition);
}

function renderParentWorkspace(container) {
  const definition = systemWorkspaceDefinition();
  ensureSystemLayout(definition);
  const header = wsState.currentLevel === 'planet'
    ? `<div class="ws-planet-header"><div class="ws-planet-name">${escHtml(definition.title)}</div><div class="ws-planet-meta">Draggable planetary system graph</div></div>`
    : `<div class="ws-region-header"><div class="ws-region-heading">${escHtml(definition.title)}</div><div class="ws-region-desc">Draggable region system graph · explicit import/export boundaries</div></div>`;

  const shell = renderWorkspaceShell(container, {
    header,
    canvasId: 'ws-system-canvas',
    svgId: 'ws-system-svg',
    inspectorBodyId: 'ws-composite-inspector-body',
  });
  const { canvas, svg } = shell;
  const layout = ensureSystemLayout(definition);
  const graph = projectBoundaryGraph(
    { ...definition, layout },
    wsState.world?.simulation?.transfers ?? {},
    (systemId, portId) => visibleEndpointForTransfer(systemId, portId),
    { selectedNodeId: inspector.selectedSystemId },
  );
  renderGraphNodes({
    canvas,
    graph,
    elements: wsState.systemNodeElements,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    className: 'ws-system-node',
    nodeClass: node => `ws-node--${node.type}${node.source.boundaryRole ? ' ws-node--boundary' : ''}`,
    portClass: (_node, _port, direction) => `ws-system-port ws-system-port--${direction}`,
    nodeContent: (element, graphNode, isNew) => {
      const node = graphNode.source;
      const label = isNew ? document.createElement('div') : element.querySelector('.ws-node-label');
      if (isNew) {
        label.className = 'ws-node-label';
        element.appendChild(label);
      }
      label.innerHTML = `<strong>${escHtml(systemNodeTitle(node))}</strong><span>${escHtml(systemNodeDescription(node))}</span>`;
      const canEnter = node.nodeType === 'region' || node.nodeType === 'site';
      const existingEnter = element.querySelector('.ws-system-enter');
      if (canEnter && !existingEnter) {
        const button = document.createElement('button');
        button.className = 'ws-system-enter ws-enter';
        button.textContent = 'Enter →';
        button.addEventListener('click', event => {
          event.stopPropagation();
          if (node.nodeType === 'region') navigateTo('region', { regionId: node.id });
          else navigateTo('site', {
            siteId: node.id,
            occurrenceId: wsState.world.sites[node.id]?.resourceOccurrenceIds?.[0],
          });
        });
        element.appendChild(button);
      } else if (!canEnter) {
        existingEnter?.remove();
      }
    },
    onNodePointerDown: (node, event) => startSystemNodeDrag(node.id, event),
    onNodeSelect: selectSystem,
    onPortStart: (node, portId, event) => {
      const port = node.ports.find(item => item.id === portId);
      if (port?.direction !== 'output') return;
      const endpoint = systemPortEndpoint(node.source, port);
      pendingGraphConnection.active = true;
      pendingGraphConnection.source = { nodeId: endpoint.systemId, portId: endpoint.portId };
      pendingGraphConnection.scopeId = definition.scopeId;
      pendingGraphConnection.adapter = 'boundary-transfer';
      const point = eventGraphPoint(event, canvas.parentElement, definition.id);
      pendingGraphConnection.x = point.x;
      pendingGraphConnection.y = point.y;
      inspector.message = 'Choose a compatible input port.';
      inspector.selectedTransferId = null;
      updateCompositeInspector(true);
      event.stopPropagation();
    },
    onPortFinish: (node, portId, event) => {
      const port = node.ports.find(item => item.id === portId);
      if (!pendingGraphConnection.active || port?.direction !== 'input') return;
      const endpoint = systemPortEndpoint(node.source, port);
      try {
        const transfer = registerBoundaryTransfer(wsState.world, {
          sourceCompositeId: pendingGraphConnection.source.nodeId,
          sourcePortId: pendingGraphConnection.source.portId,
          targetCompositeId: endpoint.systemId,
          targetPortId: endpoint.portId,
          capacityKgPerSecond: 10,
          priority: pendingGraphConnection.scopeId === wsState.world.planetId ? 1 : 0,
          scopeId: pendingGraphConnection.scopeId,
        });
        inspector.selectedTransferId = transfer.id;
        inspector.selectedSystemId = null;
        inspector.message = 'Transfer connected.';
      } catch (error) {
        inspector.message = error.message;
      }
      pendingGraphConnection.active = false;
      pendingGraphConnection.adapter = null;
      event.stopPropagation();
      renderWorkspace();
    },
  });
  canvas.addEventListener('mousemove', onSystemCanvasMove);
  canvas.addEventListener('mouseup', () => {
    systemDragState = null;
    if (pendingGraphConnection.active) {
      pendingGraphConnection.active = false;
      pendingGraphConnection.adapter = null;
      renderSystemConnections(el('ws-system-svg'), definition);
    }
  });
  canvas.addEventListener('mouseleave', () => { systemDragState = null; });
  renderSystemConnections(svg, definition);
  installViewport(
    shell.viewport,
    canvas,
    svg,
    definition.id,
    () => {
      const positions = Object.values(ensureSystemLayout(definition).nodePositions);
      return positions.reduce((bounds, position) => ({
        minX: Math.min(bounds.minX, position.x),
        minY: Math.min(bounds.minY, position.y),
        maxX: Math.max(bounds.maxX, position.x + NODE_WIDTH),
        maxY: Math.max(bounds.maxY, position.y + NODE_HEIGHT),
      }), { minX: 0, minY: 0, maxX: NODE_WIDTH, maxY: NODE_HEIGHT });
    },
    shell.toolbar,
  );
  updateCompositeInspector(true);
}

function renderPlanetWorkspace(container) {
  const planet = currentPlanet();
  if (!planet) {
    container.innerHTML = `<div class="ws-site-card"><div class="ws-site-name">Create Prototype World</div><div class="ws-site-type">Generate a deterministic planet without leaving Player View.</div><label for="ws-player-seed">Seed</label><input id="ws-player-seed" type="text" placeholder="Enter seed or leave blank for random"><button id="ws-player-generate">Generate World</button></div>`;
    el('ws-player-generate')?.addEventListener('click', () => requestPlayerWorldGeneration(el('ws-player-seed')?.value ?? ''));
    el('ws-player-seed')?.addEventListener('keydown', event => {
      if (event.key === 'Enter') requestPlayerWorldGeneration(event.currentTarget.value ?? '');
    });
    return;
  }
  renderParentWorkspace(container);
}

function renderRegionWorkspace(container) {
  const region = wsState.world?.regions?.[wsState.selectedRegionId];
  if (!region) {
    container.innerHTML = '<p class="ws-empty">No region selected.</p>';
    return;
  }
  renderParentWorkspace(container);
}

function selectSystem(systemId) {
  inspector.selectedSystemId = systemId;
  inspector.selectedTransferId = null;
  inspector.selectedNodeId = null;
  inspector.selectedConnId = null;
  inspector.message = '';
  inspector.renderKey = null;
  renderWorkspace();
}

function componentRowsHtml(components, attributeName = null, suffix = 'kg') {
  if (!components?.length) return '<span>no stored constituents</span>';
  return components.map(component => {
    const attr = attributeName ? ` ${attributeName}="${escHtml(component.componentId)}"` : '';
    return `<div class="ws-ins-comp-row"><span>${escHtml(component.componentId)}</span><span${attr}>${component.massKg.toFixed(3)} ${suffix} (${component.percentage.toFixed(1)}%)</span></div>`;
  }).join('');
}

function streamComponentRowsHtml(rates) {
  const entries = Object.entries(rates ?? {}).filter(([, rate]) => rate > 0);
  if (!entries.length) return '<span>no flow</span>';
  return entries.map(([id, rate]) => `<div class="ws-ins-comp-row"><span>${escHtml(id)}</span><span>${rate.toFixed(3)} kg/s</span></div>`).join('');
}

function formatTransferInspector(transfer) {
  if (!transfer) return 'Select a system or transfer.';
  return `<div class="ws-ins-type">TRANSFER</div>
    <div class="ws-ins-row"><b>ID:</b> ${escHtml(transfer.id)}</div>
    <div class="ws-ins-row"><b>From:</b> ${escHtml(transfer.sourceCompositeId)} / ${escHtml(transfer.sourcePortId)}</div>
    <div class="ws-ins-row"><b>To:</b> ${escHtml(transfer.targetCompositeId)} / ${escHtml(transfer.targetPortId)}</div>
    <div class="ws-ins-row"><b>Capacity:</b> ${transfer.capacityKgPerSecond.toFixed(2)} kg/s</div>
    <div class="ws-ins-row"><b>Actual rate:</b> <span data-live="transfer-rate">${transfer.lastRateKgPerSecond.toFixed(2)}</span> kg/s</div>
    <div class="ws-ins-row"><b>Last moved:</b> <span data-live="transfer-moved">${transfer.lastMovedKg.toFixed(3)}</span> kg/tick</div>
    <div class="ws-ins-action"><button class="ws-btn-disconnect" data-conn-id="${escHtml(transfer.id)}">Disconnect</button></div>`;
}

function formatCompositeInspector(node) {
  if (!node) return 'Select a system or transfer.';
  let html = `<div class="ws-ins-type">${escHtml(node.systemType?.toUpperCase() ?? node.nodeType.toUpperCase())}</div><div class="ws-ins-row"><b>ID:</b> ${escHtml(node.id)}</div>`;
  if (node.nodeType === 'hopper') {
    const details = hopperInspection(node);
    html += `<div class="ws-ins-row"><b>Stored:</b> <span data-live="boundary-stored">${details.storedMassKg.toFixed(3)}</span> kg</div>
      <div class="ws-ins-row"><b>Capacity:</b> ${details.capacityKg} kg</div>
      <div class="ws-ins-row"><b>Free:</b> <span data-live="boundary-free">${details.freeCapacityKg.toFixed(3)}</span> kg</div>
      <div class="ws-ins-row"><b>Particle size:</b> <span data-live="boundary-particle-size">${details.particleSizeMm == null ? '—' : `${details.particleSizeMm.toFixed(3)} mm`}</span></div>
      <div class="ws-ins-comp" data-live-section="boundary-components">${componentRowsHtml(details.components)}</div>`;
  } else if (node.nodeType === 'region') {
    const region = wsState.world.regions[node.id];
    html += `<div class="ws-ins-row"><b>Sites:</b> ${(region?.siteIds ?? []).length}</div>`;
    const workspace = getSimulationWorkspace(wsState.world, node.childWorkspaceId);
    const imported = workspace?.nodes?.[`${node.id}-import-hopper`];
    const exported = workspace?.nodes?.[`${node.id}-export-hopper`];
    html += `<div class="ws-ins-row"><b>Import buffer:</b> <span data-live="region-import">${(imported ? hopperStoredMassKg(imported) : 0).toFixed(2)}</span> kg</div>
      <div class="ws-ins-row"><b>Export buffer:</b> <span data-live="region-export">${(exported ? hopperStoredMassKg(exported) : 0).toFixed(2)}</span> kg</div>`;
  } else if (node.nodeType === 'site') {
    const site = wsState.world.sites[node.id];
    html += `<div class="ws-ins-row"><b>Region:</b> ${escHtml(site.regionId)}</div>
      <div class="ws-ins-row"><b>Occurrences:</b> ${site.resourceOccurrenceIds.length}</div>`;
    const workspace = getSimulationWorkspace(wsState.world, node.childWorkspaceId);
    const outputPort = getSystemNodePort(node, 'material-output');
    const output = workspace?.nodes?.[outputPort?.childNodeId];
    html += `<div class="ws-ins-row"><b>External output stored:</b> <span data-live="site-output">${(output ? hopperStoredMassKg(output) : 0).toFixed(2)}</span> kg</div>`;
  }
  html += `<div class="ws-ins-row"><b>Ports:</b> ${(node.ports ?? []).map(port => `${escHtml(port.label)} (${port.direction})`).join(', ') || 'none'}</div>`;
  return html;
}

function updateCompositeInspector(force = false) {
  const body = el('ws-composite-inspector-body');
  if (!body) return;
  const transfer = inspector.selectedTransferId
    ? wsState.world?.simulation?.transfers?.[inspector.selectedTransferId]
    : null;
  const node = transfer ? null : (
    wsState.world?.systemNodes?.[inspector.selectedSystemId]
    ?? (wsState.currentLevel === 'region'
      ? getSimulationWorkspace(wsState.world, `${wsState.selectedRegionId}-workspace`)?.nodes?.[inspector.selectedSystemId]
      : null)
  );
  const key = transfer
    ? `transfer:${transfer.id}:${inspector.message}`
    : `system:${node?.id ?? 'none'}:${inspector.message}`;

  if (force || inspector.renderKey !== key) {
    const content = transfer ? formatTransferInspector(transfer) : formatCompositeInspector(node);
    body.innerHTML = `${inspector.message ? `<div class="ws-ins-note">${escHtml(inspector.message)}</div>` : ''}${content}`;
    inspector.renderKey = key;
    body.querySelectorAll('.ws-btn-disconnect').forEach(button => {
      button.addEventListener('click', () => {
        const definition = systemWorkspaceDefinition();
        const graph = projectBoundaryGraph(
          { ...definition, layout: ensureSystemLayout(definition) },
          wsState.world?.simulation?.transfers ?? {},
          (systemId, portId) => visibleEndpointForTransfer(systemId, portId),
        );
        disconnectGraphConnection(graph, button.dataset.connId, {
          'boundary-transfer': connection => removeBoundaryTransfer(wsState.world, connection.id),
        });
        inspector.selectedTransferId = null;
        inspector.renderKey = null;
        renderWorkspace();
      });
    });
  }

  if (transfer) {
    const rate = body.querySelector('[data-live="transfer-rate"]');
    const moved = body.querySelector('[data-live="transfer-moved"]');
    if (rate) rate.textContent = transfer.lastRateKgPerSecond.toFixed(2);
    if (moved) moved.textContent = transfer.lastMovedKg.toFixed(3);
    return;
  }

  if (node?.nodeType === 'region') {
    const workspace = getSimulationWorkspace(wsState.world, node.childWorkspaceId);
    const imported = workspace?.nodes?.[`${node.id}-import-hopper`];
    const exported = workspace?.nodes?.[`${node.id}-export-hopper`];
    const imp = body.querySelector('[data-live="region-import"]');
    const exp = body.querySelector('[data-live="region-export"]');
    if (imp) imp.textContent = (imported ? hopperStoredMassKg(imported) : 0).toFixed(2);
    if (exp) exp.textContent = (exported ? hopperStoredMassKg(exported) : 0).toFixed(2);
  }
  if (node?.nodeType === 'hopper') {
    const details = hopperInspection(node);
    const stored = body.querySelector('[data-live="boundary-stored"]');
    const free = body.querySelector('[data-live="boundary-free"]');
    const particle = body.querySelector('[data-live="boundary-particle-size"]');
    const components = body.querySelector('[data-live-section="boundary-components"]');
    if (stored) stored.textContent = details.storedMassKg.toFixed(3);
    if (free) free.textContent = details.freeCapacityKg.toFixed(3);
    if (particle) particle.textContent = details.particleSizeMm == null ? '—' : `${details.particleSizeMm.toFixed(3)} mm`;
    if (components) components.innerHTML = componentRowsHtml(details.components);
  }
  if (node?.nodeType === 'site') {
    const workspace = getSimulationWorkspace(wsState.world, node.childWorkspaceId);
    const outputPort = getSystemNodePort(node, 'material-output');
    const output = workspace?.nodes?.[outputPort?.childNodeId];
    const span = body.querySelector('[data-live="site-output"]');
    if (span) span.textContent = (output ? hopperStoredMassKg(output) : 0).toFixed(2);
  }
}

function nodeLabel(node) {
  if (node.nodeType === 'feature') {
    const feature = wsState.world?.features?.[node.featureId];
    return `${feature?.name ?? node.displayName ?? node.featureId}\n${feature?.type ?? 'Feature'}`;
  }
  if (node.nodeType === 'extractor') {
    return `Extractor [${getNodeOperatingState(node)}]\n${wsState.world?.resourceOccurrences?.[node.occurrenceId]?.name ?? node.occurrenceId}\n${node.prototypeRateKgPerSecond} kg/s`;
  }
  if (node.nodeType === 'hopper') {
    const mass = hopperStoredMassKg(node);
    const label = node.boundaryRole ? (node.displayName ?? (node.boundaryRole === 'import' ? 'Site Import' : 'Site Export')) : 'Hopper';
    return `${label}\n${mass.toFixed(1)} / ${node.capacityKg} kg\n${(mass / node.capacityKg * 100).toFixed(0)}%`;
  }
  if (node.nodeType === 'crusher') return `Crusher [${getNodeOperatingState(node)}]\n→ ${node.targetParticleSizeMm} mm\n${node.throughputKgPerSecond} kg/s`;
  if (node.nodeType === 'magSep') return `Mag. Sep. [${getNodeOperatingState(node)}]\nB=${node.fieldStrength}\n${node.throughputKgPerSecond} kg/s`;
  return node.nodeType;
}

function portCanvasPosition(nodeId, portId) {
  const node = wsState.blueprint.nodes[nodeId];
  const position = wsState.blueprintLayout.nodePositions[nodeId] ?? { x: 0, y: 0 };
  const ports = getNodePortDefinitions(node);
  const port = ports.find(item => item.id === portId);
  if (!port) return position;
  const side = ports.filter(item => item.direction === port.direction);
  const offset = portOffsets(port, side.indexOf(port), side.length);
  return { x: position.x + offset.dx, y: position.y + offset.dy };
}

function renderConnections(svg) {
  let maxX = 800;
  let maxY = 400;
  for (const position of Object.values(wsState.blueprintLayout.nodePositions)) {
    maxX = Math.max(maxX, position.x + NODE_WIDTH + 40);
    maxY = Math.max(maxY, position.y + NODE_HEIGHT + 40);
  }
  svg.setAttribute('width', maxX);
  svg.setAttribute('height', maxY);
  svg.style.width = `${maxX}px`;
  svg.style.height = `${maxY}px`;

  const graph = projectBlueprintGraph(wsState.blueprint, wsState.blueprintLayout, {
    selectedNodeId: inspector.selectedNodeId,
  });
  renderGraphConnections({
    svg,
    graph,
    elements: wsState.connectionElements,
    endpointPosition: endpoint => portCanvasPosition(endpoint.nodeId, endpoint.portId),
    flow: connection => {
      const stream = getStreamForConnection(wsState.blueprint, connection.id);
      return stream ? totalMassFlowKgPerSecond(stream.componentMassFlowKgPerSecond) : 0;
    },
    selectedId: inspector.selectedConnId,
    onSelect: selectConnection,
  });

  wsState.connectionPreview = renderGraphConnectionPreview({
    svg,
    active: pendingGraphConnection.active && pendingGraphConnection.adapter === 'blueprint',
    preview: wsState.connectionPreview,
    source: pendingGraphConnection.source,
    target: { x: pendingGraphConnection.x, y: pendingGraphConnection.y },
    endpointPosition: endpoint => portCanvasPosition(endpoint.nodeId, endpoint.portId),
  });
}

function renderSiteNodes() {
  const canvas = el('ws-site-canvas');
  const svg = el('ws-site-svg');
  if (!canvas || !svg || !wsState.blueprint) return;
  const graph = projectBlueprintGraph(wsState.blueprint, wsState.blueprintLayout, {
    selectedNodeId: inspector.selectedNodeId,
  });
  renderGraphNodes({
    canvas,
    graph,
    elements: wsState.nodeElements,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    nodeClass: node => `ws-node--${node.type}${node.source.boundaryRole ? ' ws-node--boundary' : ''}`,
    nodeContent: (element, graphNode, isNew) => {
      const node = graphNode.source;
      if (node.nodeType === 'hopper' && isNew) {
        const fill = document.createElement('div');
        fill.className = 'ws-hopper-fill';
        fill.style.height = `${Math.min(100, hopperStoredMassKg(node) / node.capacityKg * 100).toFixed(1)}%`;
        element.appendChild(fill);
      }
      const label = isNew ? document.createElement('div') : element.querySelector('.ws-node-label');
      if (isNew) {
        label.className = 'ws-node-label';
        element.appendChild(label);
      }
      label.innerHTML = nodeLabel(node).split('\n')
        .map(line => `<span>${escHtml(line)}</span>`).join('');
      const fill = element.querySelector('.ws-hopper-fill');
      if (fill && node.nodeType === 'hopper') {
        fill.style.height = `${Math.min(100, hopperStoredMassKg(node) / node.capacityKg * 100).toFixed(1)}%`;
      }
    },
    onNodePointerDown: (node, event) => startNodeDrag(node.id, event),
    onNodeSelect: selectNode,
    onPortStart: (node, portId, event) => {
      const port = node.ports.find(item => item.id === portId);
      if (port?.direction === 'output') startPendingConnection(node.id, portId, event);
    },
    onPortFinish: (node, portId, event) => {
      const port = node.ports.find(item => item.id === portId);
      if (port?.direction === 'input' && pendingGraphConnection.active) {
        event.stopPropagation();
        finishConnection(node.id, portId);
      }
    },
  });
  renderConnections(svg);
  updateInspector();
  updateSimStatus();
}

function renderSiteWorkspace(container) {
  if (!wsState.selectedSiteId) {
    container.innerHTML = '<p class="ws-empty">No resource occurrence selected.</p>';
    return;
  }
  activateSiteSession(wsState.selectedOccurrenceId, wsState.selectedSiteId);
  wsState.nodeElements.clear();
  wsState.connectionElements.clear();
  wsState.connectionPreview = null;
  inspector.renderKey = null;
  const site = wsState.world?.sites?.[wsState.selectedSiteId];
  const feature = site ? wsState.world?.features?.[site.featureIds?.[0]] : null;
  const shell = renderWorkspaceShell(container, {
    toolbarLeading: `<span class="ws-site-title">Site — ${escHtml(feature?.name ?? wsState.selectedSiteId)}</span><button id="ws-sim-reset">↺ Reset Site</button><span id="ws-sim-status" class="ws-sim-status"></span>`,
    canvasId: 'ws-site-canvas',
    svgId: 'ws-site-svg',
    inspectorBodyId: 'ws-inspector-body',
    inspectorInitial: 'Select a node or connection.',
  });
  el('ws-sim-reset')?.addEventListener('click', onResetSite);
  el('ws-inspector-body')?.addEventListener('click', onInspectorClick);
  renderSiteNodes();
  el('ws-site-canvas')?.addEventListener('mousemove', onCanvasMouseMove);
  el('ws-site-canvas')?.addEventListener('mouseup', onCanvasMouseUp);
  el('ws-site-svg')?.addEventListener('mousemove', onCanvasMouseMove);
  el('ws-site-svg')?.addEventListener('mouseup', onCanvasMouseUp);
  installViewport(
    shell.viewport,
    shell.canvas,
    shell.svg,
    `site:${wsState.selectedSiteId}`,
    () => Object.values(wsState.blueprintLayout.nodePositions).reduce((bounds, position) => ({
      minX: Math.min(bounds.minX, position.x),
      minY: Math.min(bounds.minY, position.y),
      maxX: Math.max(bounds.maxX, position.x + NODE_WIDTH),
      maxY: Math.max(bounds.maxY, position.y + NODE_HEIGHT),
    }), { minX: 0, minY: 0, maxX: NODE_WIDTH, maxY: NODE_HEIGHT }),
    shell.toolbar,
  );
}

function startNodeDrag(nodeId, event) {
  const position = wsState.blueprintLayout.nodePositions[nodeId] ?? { x: 0, y: 0 };
  const surface = el('ws-site-canvas')?.parentElement;
  const point = eventGraphPoint(event, surface, `site:${wsState.selectedSiteId}`);
  dragState = {
    nodeId,
    startMouseX: point.x,
    startMouseY: point.y,
    startX: position.x,
    startY: position.y,
  };
  event.preventDefault();
}

function startPendingConnection(nodeId, portId, event) {
  const canvas = el('ws-site-canvas');
  const point = eventGraphPoint(event, canvas?.parentElement, `site:${wsState.selectedSiteId}`);
  Object.assign(pendingGraphConnection, {
    active: true,
    source: { nodeId, portId },
    adapter: 'blueprint',
    ...point,
  });
  event.preventDefault();
}

function finishConnection(targetNodeId, targetPortId) {
  if (!pendingGraphConnection.active) return;
  const check = checkBlueprintConnection(
    wsState.blueprint,
    pendingGraphConnection.source.nodeId,
    pendingGraphConnection.source.portId,
    targetNodeId,
    targetPortId
  );
  pendingGraphConnection.active = false;
  pendingGraphConnection.adapter = null;
  if (!check.ok) {
    inspector.message = check.reason;
  } else {
    const connection = blueprintConnect(
      wsState.blueprint,
      pendingGraphConnection.source.nodeId,
      pendingGraphConnection.source.portId,
      targetNodeId,
      targetPortId
    );
    if (connection) {
      inspector.selectedConnId = connection.id;
      inspector.selectedNodeId = null;
      inspector.message = '';
    }
  }
  inspector.renderKey = null;
  renderSiteNodes();
}

function onCanvasMouseMove(event) {
  if (dragState) {
    const surface = el('ws-site-canvas')?.parentElement;
    const point = eventGraphPoint(event, surface, `site:${wsState.selectedSiteId}`);
    layoutMoveNode(
      wsState.blueprintLayout,
      dragState.nodeId,
      Math.max(0, dragState.startX + point.x - dragState.startMouseX),
      Math.max(0, dragState.startY + point.y - dragState.startMouseY)
    );
    renderSiteNodes();
  }
  if (pendingGraphConnection.active) {
    const point = eventGraphPoint(event, el('ws-site-canvas')?.parentElement, `site:${wsState.selectedSiteId}`);
    pendingGraphConnection.x = point.x;
    pendingGraphConnection.y = point.y;
    renderConnections(el('ws-site-svg'));
  }
}

function onCanvasMouseUp() {
  dragState = null;
  if (pendingGraphConnection.active) {
    pendingGraphConnection.active = false;
    pendingGraphConnection.adapter = null;
    renderConnections(el('ws-site-svg'));
  }
}

function selectNode(nodeId) {
  inspector.selectedNodeId = nodeId;
  inspector.selectedConnId = null;
  inspector.message = '';
  inspector.renderKey = null;
  renderSiteNodes();
}

function selectConnection(connectionId) {
  inspector.selectedNodeId = null;
  inspector.selectedConnId = connectionId;
  inspector.message = '';
  inspector.renderKey = null;
  renderSiteNodes();
}

function formatNodeInspector(node) {
  const hopper = ['hopper', 'boundary-buffer'].includes(node.systemType) || node.nodeType === 'hopper';
  const typeLabel = node.systemType === 'boundary-buffer' ? node.displayName : node.nodeType;
  let html = `<div class="ws-ins-type">${escHtml(typeLabel.toUpperCase())}</div><div class="ws-ins-row"><b>ID:</b> ${escHtml(node.id)}</div>`;

  if (['extractor', 'crusher', 'magSep'].includes(node.nodeType)) {
    const details = machineInspection(wsState.blueprint, node);
    html += `<div class="ws-ins-row"><b>State:</b> <span data-live="state">${escHtml(details.operatingState)}</span></div>
      <div class="ws-ins-row"><b>Enabled:</b> <button class="ws-btn-enable" data-node-id="${escHtml(node.id)}">${details.enabled ? 'On' : 'Off'}</button></div>
      <div class="ws-ins-row"><b>Configured throughput:</b> ${details.configuredThroughputKgPerSecond} kg/s</div>
      <div class="ws-ins-row"><b>Actual feed:</b> <span data-live="machine-feed">${details.actualFeedKgPerSecond.toFixed(3)}</span> kg/s</div>
      <div class="ws-ins-row"><b>Actual product:</b> <span data-live="machine-product">${details.actualProductKgPerSecond.toFixed(3)}</span> kg/s</div>`;
    if (node.nodeType === 'extractor') {
      html += `<div class="ws-ins-row"><b>Occurrence:</b> ${escHtml(wsState.world?.resourceOccurrences?.[node.occurrenceId]?.name ?? node.occurrenceId)}</div>`;
    }
    if (node.nodeType === 'crusher') {
      html += `<div class="ws-ins-row"><b>Target size:</b> ${node.targetParticleSizeMm} mm</div>`;
    }
    if (node.nodeType === 'magSep') {
      html += `<div class="ws-ins-row"><b>Field strength:</b> ${node.fieldStrength}</div>
        <div class="ws-ins-row"><b>Max feed size:</b> ${node.maxFeedParticleSizeMm} mm</div>
        <div class="ws-ins-row"><b>Feed:</b> <span data-live="feed-flow">${(details.feed?.totalFlowKgPerSecond ?? 0).toFixed(3)}</span> kg/s</div>
        <div class="ws-ins-row"><b>Concentrate:</b> <span data-live="concentrate-flow">${(details.concentrate?.totalFlowKgPerSecond ?? 0).toFixed(3)}</span> kg/s</div>
        <div class="ws-ins-row"><b>Tailings:</b> <span data-live="tailings-flow">${(details.tailings?.totalFlowKgPerSecond ?? 0).toFixed(3)}</span> kg/s</div>`;
    }
    html += `<div class="ws-ins-note" data-live="error"${details.lastError ? '' : ' hidden'}>${escHtml(details.lastError ?? '')}</div>`;
  } else if (hopper) {
    const details = hopperInspection(node);
    html += `<div class="ws-ins-row"><b>Stored:</b> <span data-live="stored">${details.storedMassKg.toFixed(3)}</span> kg</div>
      <div class="ws-ins-row"><b>Capacity:</b> ${details.capacityKg} kg</div>
      <div class="ws-ins-row"><b>Free:</b> <span data-live="free">${details.freeCapacityKg.toFixed(3)}</span> kg</div>
      <div class="ws-ins-row"><b>Particle size:</b> <span data-live="particle-size">${details.particleSizeMm == null ? '—' : `${details.particleSizeMm.toFixed(3)} mm`}</span></div>
      <div class="ws-ins-comp" data-live-section="components">${componentRowsHtml(details.components)}</div>`;
  } else if (node.nodeType === 'feature') {
    const feature = wsState.world?.features?.[node.featureId];
    const occurrences = feature?.resourceOccurrences ?? [];
    html += `<div class="ws-ins-row"><b>Name:</b> ${escHtml(feature?.name ?? node.displayName)}</div>
      <div class="ws-ins-row"><b>Feature type:</b> ${escHtml(feature?.type ?? 'Feature')}</div>
      <div class="ws-ins-row"><b>Depth:</b> ${feature?.depthM ?? '—'} m</div>
      <div class="ws-ins-row"><b>Geometry:</b> ${escHtml(feature?.geometry ?? '—')}</div>
      <div class="ws-ins-row"><b>Accessibility:</b> ${escHtml(feature?.accessibility ?? '—')}</div>
      <div class="ws-ins-row"><b>Physical state:</b> ${escHtml(feature?.physicalState ?? '—')}</div>
      <div class="ws-ins-row"><b>Quantity class:</b> ${escHtml(feature?.quantityClass ?? '—')}</div>
      <div class="ws-ins-row"><b>Resource occurrences:</b> ${occurrences.length}</div>`;
  }

  html += `<div class="ws-ins-action"><button class="ws-btn-disconnect" data-node-id="${escHtml(node.id)}">Remove all connections</button></div>`;
  return html;
}

function formatConnectionInspector(connection) {
  const details = streamInspection(getStreamForConnection(wsState.blueprint, connection.id));
  return `<div class="ws-ins-type">CONNECTION</div>
    <div class="ws-ins-row"><b>From:</b> ${escHtml(details.sourceNodeId)} / ${escHtml(details.sourcePortId)}</div>
    <div class="ws-ins-row"><b>To:</b> ${escHtml(details.targetNodeId)} / ${escHtml(details.targetPortId)}</div>
    <div class="ws-ins-row"><b>Total flow:</b> <span data-live="flow">${details.totalFlowKgPerSecond.toFixed(3)}</span> kg/s</div>
    <div class="ws-ins-row"><b>Particle size:</b> <span data-live="stream-particle-size">${details.particleSizeMm == null ? '—' : `${details.particleSizeMm.toFixed(3)} mm`}</span></div>
    <div class="ws-ins-comp" data-live-section="stream-components">${streamComponentRowsHtml(details.componentMassFlowKgPerSecond)}</div>
    <div class="ws-ins-action"><button class="ws-btn-disconnect" data-conn-id="${escHtml(connection.id)}">Disconnect</button></div>`;
}

function updateInspector(force = false) {
  const body = el('ws-inspector-body');
  if (!body || !wsState.blueprint) return;
  const key = `${inspector.selectedNodeId ?? ''}:${inspector.selectedConnId ?? ''}:${inspector.message}`;
  if (force || inspector.renderKey !== key) {
    let html = inspector.message ? `<div class="ws-ins-note">${escHtml(inspector.message)}</div>` : '';
    if (inspector.selectedNodeId) html += formatNodeInspector(wsState.blueprint.nodes[inspector.selectedNodeId]);
    else if (inspector.selectedConnId) html += formatConnectionInspector(wsState.blueprint.connections[inspector.selectedConnId]);
    else if (!html) html = 'Select a node or connection.';
    body.innerHTML = html;
    inspector.renderKey = key;
  }

  if (inspector.selectedNodeId) {
    const node = wsState.blueprint.nodes[inspector.selectedNodeId];
    const state = body.querySelector('[data-live="state"]');
    if (state) state.textContent = getNodeOperatingState(node) ?? 'off';
    const hopper = ['hopper', 'boundary-buffer'].includes(node.systemType) || node.nodeType === 'hopper';
    if (hopper) {
      const details = hopperInspection(node);
      const stored = body.querySelector('[data-live="stored"]');
      const free = body.querySelector('[data-live="free"]');
      const particle = body.querySelector('[data-live="particle-size"]');
      const components = body.querySelector('[data-live-section="components"]');
      if (stored) stored.textContent = details.storedMassKg.toFixed(3);
      if (free) free.textContent = details.freeCapacityKg.toFixed(3);
      if (particle) particle.textContent = details.particleSizeMm == null ? '—' : `${details.particleSizeMm.toFixed(3)} mm`;
      if (components) components.innerHTML = componentRowsHtml(details.components);
    } else {
      const details = machineInspection(wsState.blueprint, node);
      const feed = body.querySelector('[data-live="machine-feed"]');
      const product = body.querySelector('[data-live="machine-product"]');
      if (feed) feed.textContent = details.actualFeedKgPerSecond.toFixed(3);
      if (product) product.textContent = details.actualProductKgPerSecond.toFixed(3);
      for (const [name, stream] of [
        ['feed', details.feed],
        ['concentrate', details.concentrate],
        ['tailings', details.tailings],
      ]) {
        const span = body.querySelector(`[data-live="${name}-flow"]`);
        if (span) span.textContent = (stream?.totalFlowKgPerSecond ?? 0).toFixed(3);
      }
      const error = body.querySelector('[data-live="error"]');
      if (error) {
        error.textContent = details.lastError ?? '';
        error.hidden = !details.lastError;
      }
    }
  }

  if (inspector.selectedConnId) {
    const details = streamInspection(getStreamForConnection(wsState.blueprint, inspector.selectedConnId));
    const flow = body.querySelector('[data-live="flow"]');
    const particle = body.querySelector('[data-live="stream-particle-size"]');
    const components = body.querySelector('[data-live-section="stream-components"]');
    if (flow) flow.textContent = details.totalFlowKgPerSecond.toFixed(3);
    if (particle) particle.textContent = details.particleSizeMm == null ? '—' : `${details.particleSizeMm.toFixed(3)} mm`;
    if (components) components.innerHTML = streamComponentRowsHtml(details.componentMassFlowKgPerSecond);
  }
}

function onInspectorClick(event) {
  const enable = event.target.closest('.ws-btn-enable');
  if (enable) {
    const node = wsState.blueprint.nodes[enable.dataset.nodeId];
    if (node) setNodeEnabled(wsState.blueprint, node.id, !node.enabled);
    inspector.renderKey = null;
    updateInspector(true);
    return;
  }
  const button = event.target.closest('.ws-btn-disconnect');
  if (!button) return;
  if (button.dataset.connId) {
    const graph = projectBlueprintGraph(wsState.blueprint, wsState.blueprintLayout);
    disconnectGraphConnection(graph, button.dataset.connId, {
      blueprint: connection => blueprintDisconnect(wsState.blueprint, connection.id),
    });
    inspector.selectedConnId = null;
  } else if (button.dataset.nodeId) {
    const graph = projectBlueprintGraph(wsState.blueprint, wsState.blueprintLayout);
    for (const connection of [...Object.values(wsState.blueprint.connections)]) {
      if (connection.sourceNodeId === button.dataset.nodeId || connection.targetNodeId === button.dataset.nodeId) {
        disconnectGraphConnection(graph, connection.id, {
          blueprint: item => blueprintDisconnect(wsState.blueprint, item.id),
        });
      }
    }
  }
  inspector.renderKey = null;
  renderSiteNodes();
}

function onToggleWorldSimulation() {
  if (wsState.world?.simulation?.running) stopSimulation();
  else startSimulation();
  updateWorldControls();
}

function startSimulation() {
  if (wsState.simRunning || !wsState.world) return;
  resumeWorldSimulation(wsState.world);
  wsState.simRunning = true;
  wsState.simLastTime = performance.now();
  wsState.simAccumulatedS = 0;
  wsState.simRafId = requestAnimationFrame(simLoop);
  updateWorldControls();
}

function stopSimulation() {
  wsState.simRunning = false;
  if (wsState.world) pauseWorldSimulation(wsState.world);
  if (wsState.simRafId != null) cancelAnimationFrame(wsState.simRafId);
  wsState.simRafId = null;
  updateWorldControls();
}

function simLoop(now) {
  if (!wsState.simRunning) return;
  const elapsed = Math.min((now - wsState.simLastTime) / 1000, 0.25);
  wsState.simLastTime = now;
  wsState.simAccumulatedS += elapsed;
  while (wsState.simAccumulatedS >= SIMULATION_STEP_S) {
    worldSimulationTick(wsState.world, SIMULATION_STEP_S);
    wsState.simAccumulatedS -= SIMULATION_STEP_S;
  }
  updateWorldControls();
  if (wsState.currentLevel === 'site') {
    renderSiteNodes();
  } else {
    const definition = systemWorkspaceDefinition();
    renderSystemConnections(el('ws-system-svg'), definition);
    updateCompositeInspector();
  }
  wsState.simRafId = requestAnimationFrame(simLoop);
}

function updateSimStatus() {
  const status = el('ws-sim-status');
  if (!status || !wsState.blueprint) return;
  const stored = Object.values(wsState.blueprint.nodes)
    .filter(node => node.nodeType === 'hopper')
    .reduce((sum, hopper) => sum + hopperStoredMassKg(hopper), 0);
  status.textContent = `${wsState.world?.simulation?.running ? '● ' : ''}Stored ${stored.toFixed(2)} kg · Extracted ${(wsState.blueprint.simulationStats?.extractedKg ?? 0).toFixed(2)} kg`;
}

function onResetSite() {
  const occurrenceId = wsState.selectedOccurrenceId;
  const siteId = wsState.selectedSiteId;
  if (!siteId) return;
  const session = createSiteSession(occurrenceId, siteId);
  wsState.siteSessions[siteId] = session;
  registerSimulationSession(wsState.world, siteId, session.blueprint, session.boundaryNode?.childWorkspaceId);
  wsState.blueprint = session.blueprint;
  wsState.blueprintLayout = session.blueprintLayout;
  inspector.selectedNodeId = null;
  inspector.selectedConnId = null;
  inspector.renderKey = null;
  renderSiteWorkspace(el('ws-main'));
}

export function renderWorkspace() {
  const container = el('ws-main');
  if (!container) return;
  renderBreadcrumbs();
  if (wsState.currentLevel === 'region') renderRegionWorkspace(container);
  else if (wsState.currentLevel === 'site') renderSiteWorkspace(container);
  else renderPlanetWorkspace(container);
}

export function initWorkspace(world, knowledge) {
  if (wsState.world) stopSimulation();
  wsState.world = world;
  createWorldSimulation(world);
  wsState.knowledge = knowledge;
  wsState.currentLevel = 'planet';
  wsState.selectedRegionId = null;
  wsState.selectedSiteId = null;
  wsState.selectedOccurrenceId = null;
  wsState.blueprint = null;
  wsState.blueprintLayout = null;
  wsState.siteSessions = {};
  wsState.workspaceLayouts = {};
  wsState.viewports = {};
  wsState.nodeElements.clear();
  wsState.connectionElements.clear();
  wsState.systemNodeElements.clear();
  wsState.systemConnectionElements.clear();
  inspector.selectedNodeId = null;
  inspector.selectedConnId = null;
  inspector.selectedSystemId = null;
  inspector.selectedTransferId = null;
  inspector.message = '';
  inspector.renderKey = null;
  renderWorkspace();
  startSimulation();
}

export function updateWorkspaceKnowledge(knowledge) {
  wsState.knowledge = knowledge;
  if (wsState.currentLevel !== 'site') renderWorkspace();
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', renderWorkspace);
