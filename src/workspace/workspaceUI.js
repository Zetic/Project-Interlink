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
import { isFeatureDiscovered, discoverFeature } from '../core/world/knowledgeState.js';
import { hopperInspection, streamInspection, machineInspection } from './inspectionViewModel.js';

const wsState = {
  currentLevel: 'planet',
  selectedRegionId: null,
  selectedSiteId: null,
  selectedOccurrenceId: null,
  world: null,
  knowledge: null,
  blueprint: null,
  blueprintLayout: null,
  engineeringSessions: {},
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
};

const NODE_WIDTH = 160;
const NODE_HEIGHT = 100;
const PARENT_NODE_WIDTH = 180;
const PARENT_NODE_HEIGHT = 110;
const PORT_RADIUS = 7;

const pendingConn = { active: false, sourceNodeId: null, sourcePortId: null, x: 0, y: 0 };
const pendingSystemConn = { active: false, sourceSystemId: null, sourcePortId: null, scopeId: null };
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
    crumbs.push({ label: region.name, level: 'region', clickable: wsState.currentLevel === 'engineering' });
  }
  if (wsState.currentLevel === 'engineering') {
    const site = wsState.world?.sites?.[wsState.selectedSiteId];
    const feature = site ? wsState.world?.features?.[site.featureId] : null;
    crumbs.push({ label: feature?.name ?? wsState.selectedSiteId ?? 'Site', level: 'engineering', clickable: false });
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

function compatibleOccurrenceForFeature(feature) {
  if (!feature) return null;
  for (const occurrenceId of feature.resourceOccurrences ?? []) {
    const occurrence = wsState.world?.resourceOccurrences?.[occurrenceId];
    if (occurrence?.resourceId === 'iron-ore' && occurrence?.composition) return occurrence;
  }
  return null;
}

function compatibleOccurrenceForSite(site) {
  for (const occurrenceId of site?.resourceOccurrenceIds ?? []) {
    const occurrence = wsState.world?.resourceOccurrences?.[occurrenceId];
    if (occurrence?.resourceId === 'iron-ore' && occurrence?.composition) return occurrence;
  }
  return null;
}

function createEngineeringSession(occurrenceId, siteId) {
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

  const extractor = blueprintAddExtractor(blueprint, occurrenceId, 5);
  const hopperA = blueprintAddHopper(blueprint, DEFAULT_HOPPER_CAPACITY_KG);
  const crusher = blueprintAddCrusher(blueprint, {
    throughputKgPerSecond: DEFAULT_CRUSHER_THROUGHPUT_KG_PER_S,
    targetParticleSizeMm: DEFAULT_CRUSHER_TARGET_PARTICLE_SIZE_MM,
  });
  const hopperB = blueprintAddHopper(blueprint, DEFAULT_HOPPER_CAPACITY_KG);
  const magSep = blueprintAddMagSep(blueprint, { fieldStrength: DEFAULT_MAG_SEP_FIELD_STRENGTH });
  const concentrateHopper = blueprintAddHopper(blueprint, DEFAULT_HOPPER_CAPACITY_KG);
  const tailingsHopper = blueprintAddHopper(blueprint, DEFAULT_HOPPER_CAPACITY_KG);

  const positions = [
    [siteImport, 60, 300],
    [extractor, 60, 140],
    [hopperA, 260, 140],
    [crusher, 460, 140],
    [hopperB, 660, 140],
    [magSep, 860, 140],
    [concentrateHopper, 1060, 60],
    [tailingsHopper, 1060, 220],
    [siteExport, 1260, 60],
  ];
  positions.forEach(([node, x, y]) => layoutMoveNode(blueprintLayout, node.id, x, y));

  blueprintConnect(blueprint, extractor.id, extractor.outputPortId, hopperA.id, hopperA.inputPortId);
  blueprintConnect(blueprint, hopperA.id, hopperA.outputPortId, crusher.id, crusher.inputPortId);
  blueprintConnect(blueprint, crusher.id, crusher.outputPortId, hopperB.id, hopperB.inputPortId);
  blueprintConnect(blueprint, hopperB.id, hopperB.outputPortId, magSep.id, magSep.inputPortId);
  blueprintConnect(blueprint, magSep.id, magSep.concentratePortId, concentrateHopper.id, concentrateHopper.inputPortId);
  blueprintConnect(blueprint, magSep.id, magSep.tailingsPortId, tailingsHopper.id, tailingsHopper.inputPortId);

  const siteNode = wsState.world?.systemNodes?.[siteId];
  if (siteNode) {
    // Parent-facing ports map to the opposite physical side of the same boundary buffers.
    setBoundaryMapping(siteNode, 'material-input', siteImport.id, siteImport.inputPortId, blueprint);
    setBoundaryMapping(siteNode, 'material-output', siteExport.id, siteExport.outputPortId, blueprint);
  }

  return { id: siteId, siteId, occurrenceId, blueprint, blueprintLayout, boundaryNode: siteNode };
}

function activateEngineeringSession(occurrenceId, siteId) {
  if (!siteId) return;
  let session = wsState.engineeringSessions[siteId];
  if (!session) {
    session = createEngineeringSession(occurrenceId, siteId);
    wsState.engineeringSessions[siteId] = session;
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
      : compatibleOccurrenceForSite(site)?.id;
    if (!occurrenceId) return;
    wsState.selectedSiteId = site.id;
    wsState.selectedRegionId = site.regionId;
    wsState.selectedOccurrenceId = occurrenceId;
    activateEngineeringSession(occurrenceId, site.id);
    level = 'engineering';
  } else if (level === 'engineering') {
    const site = wsState.world?.sites?.[opts.siteId ?? wsState.selectedSiteId];
    const occurrenceId = opts.occurrenceId ?? wsState.selectedOccurrenceId ?? compatibleOccurrenceForSite(site)?.id;
    if (!site || !occurrenceId) return;
    wsState.selectedOccurrenceId = occurrenceId;
    activateEngineeringSession(occurrenceId, site.id);
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

function knownSiteIds(region) {
  return (region?.siteIds ?? []).filter(siteId => {
    const featureId = wsState.world?.sites?.[siteId]?.featureId;
    return featureId && isFeatureDiscovered(wsState.knowledge, featureId);
  });
}

function prototypeSurveyFeatureId(region) {
  for (const featureId of region?.features ?? []) {
    if (isFeatureDiscovered(wsState.knowledge, featureId)) continue;
    if (compatibleOccurrenceForFeature(wsState.world?.features?.[featureId])) return featureId;
  }
  return null;
}

function systemWorkspaceDefinition() {
  const planet = currentPlanet();
  if (wsState.currentLevel === 'planet') {
    return {
      id: `planet:${planet?.id}`,
      title: planet?.name ?? 'Planet',
      nodes: (planet?.regions ?? []).map(id => wsState.world.systemNodes[id]).filter(Boolean),
      scopeId: planet?.id,
      prototypeSurveyFeatureId: null,
    };
  }

  const region = wsState.world?.regions?.[wsState.selectedRegionId];
  const runtime = region ? getSimulationWorkspace(wsState.world, `${region.id}-workspace`) : null;
  const nodes = Object.values(runtime?.nodes ?? {}).filter(node => node.boundaryRole);

  // Every discovered Site remains a node, even if the current iron-processing
  // prototype cannot drill into it yet.
  for (const siteId of knownSiteIds(region)) {
    const node = wsState.world.systemNodes?.[siteId];
    if (node) nodes.push(node);
  }

  return {
    id: `region:${region?.id}`,
    title: region?.name ?? 'Region',
    nodes,
    scopeId: region?.id,
    prototypeSurveyFeatureId: prototypeSurveyFeatureId(region),
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
    return wsState.world.features[site?.featureId]?.name ?? node.id;
  }
  return node.systemType ?? node.nodeType;
}

function systemNodeDescription(node) {
  if (node.boundaryRole) return `${node.boundaryRole} material boundary buffer`;
  if (node.nodeType === 'region') {
    const region = wsState.world.regions[node.id];
    return `${region?.surfaceCover ?? 'Region'} · ${knownSiteIds(region).length} known sites`;
  }
  if (node.nodeType === 'site') {
    const site = wsState.world.sites[node.id];
    const feature = wsState.world.features[site?.featureId];
    return compatibleOccurrenceForSite(site)
      ? `${feature?.type ?? 'Site'} · engineering available`
      : `${feature?.type ?? 'Site'} · inspectable site`;
  }
  return node.nodeType;
}

function visibleParentPorts(node) {
  const ports = node?.ports ?? [];
  if (node?.boundaryRole === 'import') return ports.filter(port => port.direction === 'output');
  if (node?.boundaryRole === 'export') return ports.filter(port => port.direction === 'input');
  return ports;
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

function portOffsetsForSize(port, index, count, width, height) {
  const step = height / (count + 1);
  return { dx: port.direction === 'input' ? 0 : width, dy: step * (index + 1) };
}
function portOffsets(port, index, count) { return portOffsetsForSize(port, index, count, NODE_WIDTH, NODE_HEIGHT); }
function parentPortOffsets(port, index, count) { return portOffsetsForSize(port, index, count, PARENT_NODE_WIDTH, PARENT_NODE_HEIGHT); }

function renderParentNode(canvas, node, position, definition) {
  let element = wsState.systemNodeElements.get(node.id);
  if (!element || !canvas.contains(element)) {
    element = document.createElement('div');
    element.addEventListener('mousedown', event => {
      if (!event.target.closest('.ws-system-port,.ws-system-enter')) startSystemNodeDrag(node.id, event);
    });
    element.addEventListener('click', event => {
      if (!event.target.closest('.ws-system-port,.ws-system-enter')) selectSystem(node.id);
    });
    canvas.appendChild(element);
    wsState.systemNodeElements.set(node.id, element);
  }

  element.className = `ws-node ws-system-node ws-node--${node.nodeType}${node.boundaryRole ? ' ws-node--boundary' : ''}${inspector.selectedSystemId === node.id ? ' ws-node--selected' : ''}`;
  Object.assign(element.style, {
    left: `${position.x}px`,
    top: `${position.y}px`,
    width: `${PARENT_NODE_WIDTH}px`,
    height: `${PARENT_NODE_HEIGHT}px`,
  });
  element.innerHTML = `<div class="ws-node-label"><strong>${escHtml(systemNodeTitle(node))}</strong><span>${escHtml(systemNodeDescription(node))}</span></div>`;

  const canEnter = node.nodeType === 'region'
    || (node.nodeType === 'site' && Boolean(compatibleOccurrenceForSite(wsState.world.sites[node.id])));
  if (canEnter) {
    const button = document.createElement('button');
    button.className = 'ws-system-enter';
    button.textContent = 'Enter →';
    button.addEventListener('click', event => {
      event.stopPropagation();
      if (node.nodeType === 'region') navigateTo('region', { regionId: node.id });
      else {
        navigateTo('site', {
          siteId: node.id,
          occurrenceId: compatibleOccurrenceForSite(wsState.world.sites[node.id])?.id,
        });
      }
    });
    element.appendChild(button);
  }

  const ports = visibleParentPorts(node);
  for (const direction of ['input', 'output']) {
    const sidePorts = ports.filter(port => port.direction === direction);
    sidePorts.forEach((port, index) => {
      const offset = parentPortOffsets(port, index, sidePorts.length);
      const dot = document.createElement('span');
      dot.className = `ws-system-port ws-system-port--${direction} ws-port ws-port--${direction}`;
      dot.style.left = `${offset.dx - PORT_RADIUS}px`;
      dot.style.top = `${offset.dy - PORT_RADIUS}px`;
      const endpoint = systemPortEndpoint(node, port);
      dot.dataset.systemId = endpoint.systemId;
      dot.dataset.portId = endpoint.portId;
      dot.dataset.scopeId = definition.scopeId;
      dot.title = port.label ?? port.id;
      element.appendChild(dot);
    });
  }
}

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
  const node = definition.nodes.find(item => item.id === visible.nodeId);
  const layout = ensureSystemLayout(definition);
  const position = layout.nodePositions[visible.nodeId] ?? { x: 0, y: 0 };
  const ports = visibleParentPorts(node);
  const port = ports.find(item => item.id === visible.portId);
  if (!port) return { x: position.x, y: position.y + PARENT_NODE_HEIGHT / 2 };
  const side = ports.filter(item => item.direction === port.direction);
  const offset = parentPortOffsets(port, side.indexOf(port), side.length);
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
  const ids = new Set(definition.nodes.map(node => node.id));
  const transfers = Object.values(wsState.world?.simulation?.transfers ?? {}).filter(transfer => {
    if (definition.scopeId === currentPlanet()?.id) {
      return ids.has(transfer.sourceCompositeId) && ids.has(transfer.targetCompositeId);
    }
    return transfer.scopeId === definition.scopeId;
  });

  const active = new Set();
  for (const transfer of transfers) {
    active.add(transfer.id);
    let path = wsState.systemConnectionElements.get(transfer.id);
    if (!path || !svg.contains(path)) {
      path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('fill', 'none');
      path.classList.add('ws-connection', 'ws-system-connection');
      path.addEventListener('click', event => {
        event.stopPropagation();
        selectTransfer(transfer.id);
      });
      svg.appendChild(path);
      wsState.systemConnectionElements.set(transfer.id, path);
    }
    const source = systemEndpointPosition(definition, transfer.sourceCompositeId, transfer.sourcePortId);
    const target = systemEndpointPosition(definition, transfer.targetCompositeId, transfer.targetPortId);
    const midX = (source.x + target.x) / 2;
    path.setAttribute('d', `M ${source.x} ${source.y} C ${midX} ${source.y}, ${midX} ${target.y}, ${target.x} ${target.y}`);
    path.setAttribute('stroke-width', Math.max(1.5, Math.min(6, 1.5 + (transfer.lastRateKgPerSecond ?? 0) * 0.5)));
    path.classList.toggle('ws-connection--selected', inspector.selectedTransferId === transfer.id);
  }
  for (const [id, path] of wsState.systemConnectionElements) {
    if (!active.has(id)) {
      path.remove();
      wsState.systemConnectionElements.delete(id);
    }
  }
}

function attachSystemPortHandlers(container) {
  container.querySelectorAll('.ws-system-port--output').forEach(port => {
    port.addEventListener('mousedown', event => {
      event.stopPropagation();
      pendingSystemConn.active = true;
      pendingSystemConn.sourceSystemId = port.dataset.systemId;
      pendingSystemConn.sourcePortId = port.dataset.portId;
      pendingSystemConn.scopeId = port.dataset.scopeId;
      inspector.message = 'Choose a compatible input port.';
      inspector.selectedTransferId = null;
      updateCompositeInspector(true);
    });
  });

  container.querySelectorAll('.ws-system-port--input').forEach(port => {
    port.addEventListener('mouseup', event => {
      if (!pendingSystemConn.active) return;
      event.stopPropagation();
      try {
        const transfer = registerBoundaryTransfer(wsState.world, {
          sourceCompositeId: pendingSystemConn.sourceSystemId,
          sourcePortId: pendingSystemConn.sourcePortId,
          targetCompositeId: port.dataset.systemId,
          targetPortId: port.dataset.portId,
          capacityKgPerSecond: 10,
          priority: pendingSystemConn.scopeId === wsState.world.planetId ? 1 : 0,
          scopeId: pendingSystemConn.scopeId,
        });
        inspector.selectedTransferId = transfer.id;
        inspector.selectedSystemId = null;
        inspector.message = 'Transfer connected.';
      } catch (error) {
        inspector.message = error.message;
      }
      pendingSystemConn.active = false;
      renderWorkspace();
    });
  });
}

function startSystemNodeDrag(nodeId, event) {
  const definition = systemWorkspaceDefinition();
  const layout = ensureSystemLayout(definition);
  const position = layout.nodePositions[nodeId] ?? { x: 0, y: 0 };
  systemDragState = {
    definitionId: definition.id,
    nodeId,
    startMouseX: event.clientX,
    startMouseY: event.clientY,
    startX: position.x,
    startY: position.y,
  };
  event.preventDefault();
}

function onSystemCanvasMove(event) {
  if (!systemDragState) return;
  const definition = systemWorkspaceDefinition();
  if (definition.id !== systemDragState.definitionId) return;
  const layout = ensureSystemLayout(definition);
  layout.nodePositions[systemDragState.nodeId] = {
    x: Math.max(0, systemDragState.startX + event.clientX - systemDragState.startMouseX),
    y: Math.max(0, systemDragState.startY + event.clientY - systemDragState.startMouseY),
  };
  const element = wsState.systemNodeElements.get(systemDragState.nodeId);
  if (element) {
    element.style.left = `${layout.nodePositions[systemDragState.nodeId].x}px`;
    element.style.top = `${layout.nodePositions[systemDragState.nodeId].y}px`;
  }
  renderSystemConnections(el('ws-system-svg'), definition);
}

function renderParentWorkspace(container) {
  const definition = systemWorkspaceDefinition();
  ensureSystemLayout(definition);
  const survey = definition.prototypeSurveyFeatureId
    ? `<div class="ws-prototype-survey"><strong>Prototype Survey Bootstrap</strong><span>Survey one compatible unknown Site so the current engineering prototype remains reachable.</span><button id="ws-prototype-survey" data-feature-id="${escHtml(definition.prototypeSurveyFeatureId)}">Survey One Compatible Site</button></div>`
    : '';
  const header = wsState.currentLevel === 'planet'
    ? `<div class="ws-planet-header"><div class="ws-planet-name">${escHtml(definition.title)}</div><div class="ws-planet-meta">Draggable planetary system graph</div></div>`
    : `<div class="ws-region-header"><div class="ws-region-heading">${escHtml(definition.title)}</div><div class="ws-region-desc">Draggable region system graph · explicit import/export boundaries</div></div>${survey}`;

  container.innerHTML = `${header}<div class="ws-parent-layout"><div class="ws-system-canvas-wrap"><svg id="ws-system-svg" class="ws-system-svg"></svg><div id="ws-system-canvas" class="ws-system-canvas"></div></div><div class="ws-composite-inspector"><div class="ws-inspector-title">Inspector</div><div id="ws-composite-inspector-body"></div></div></div>`;
  const canvas = el('ws-system-canvas');
  const svg = el('ws-system-svg');
  const layout = ensureSystemLayout(definition);
  const active = new Set(definition.nodes.map(node => node.id));
  for (const node of definition.nodes) renderParentNode(canvas, node, layout.nodePositions[node.id], definition);
  for (const [id, element] of wsState.systemNodeElements) {
    if (!active.has(id)) {
      element.remove();
      wsState.systemNodeElements.delete(id);
    }
  }

  attachSystemPortHandlers(container);
  canvas.addEventListener('mousemove', onSystemCanvasMove);
  canvas.addEventListener('mouseup', () => {
    systemDragState = null;
    if (pendingSystemConn.active) pendingSystemConn.active = false;
  });
  canvas.addEventListener('mouseleave', () => { systemDragState = null; });
  el('ws-prototype-survey')?.addEventListener('click', event => {
    discoverFeature(wsState.knowledge, event.currentTarget.dataset.featureId);
    document.dispatchEvent(new CustomEvent('interlink:knowledge-updated'));
    renderWorkspace();
  });
  renderSystemConnections(svg, definition);
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
    <div class="ws-ins-action"><button class="ws-btn-remove-transfer" data-transfer-id="${escHtml(transfer.id)}">Disconnect</button></div>`;
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
    html += `<div class="ws-ins-row"><b>Known sites:</b> ${knownSiteIds(region).length}</div>`;
    const workspace = getSimulationWorkspace(wsState.world, node.childWorkspaceId);
    const imported = workspace?.nodes?.[`${node.id}-import-hopper`];
    const exported = workspace?.nodes?.[`${node.id}-export-hopper`];
    html += `<div class="ws-ins-row"><b>Import buffer:</b> <span data-live="region-import">${(imported ? hopperStoredMassKg(imported) : 0).toFixed(2)}</span> kg</div>
      <div class="ws-ins-row"><b>Export buffer:</b> <span data-live="region-export">${(exported ? hopperStoredMassKg(exported) : 0).toFixed(2)}</span> kg</div>`;
  } else if (node.nodeType === 'site') {
    const site = wsState.world.sites[node.id];
    html += `<div class="ws-ins-row"><b>Region:</b> ${escHtml(site.regionId)}</div>
      <div class="ws-ins-row"><b>Known occurrences:</b> ${isFeatureDiscovered(wsState.knowledge, site.featureId) ? site.resourceOccurrenceIds.length : 0}</div>`;
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
    body.querySelectorAll('.ws-btn-remove-transfer').forEach(button => {
      button.addEventListener('click', () => {
        removeBoundaryTransfer(wsState.world, button.dataset.transferId);
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

function renderNode(canvas, node, position) {
  let nodeElement = wsState.nodeElements.get(node.id);
  if (!nodeElement || !canvas.contains(nodeElement)) {
    nodeElement = document.createElement('div');
    nodeElement.innerHTML = `${node.nodeType === 'hopper' ? '<div class="ws-hopper-fill"></div>' : ''}<div class="ws-node-label"></div>`;
    const ports = getNodePortDefinitions(node);
    for (const direction of ['input', 'output']) {
      const sidePorts = ports.filter(port => port.direction === direction);
      sidePorts.forEach((port, index) => {
        const offset = portOffsets(port, index, sidePorts.length);
        const dot = document.createElement('div');
        dot.className = `ws-port ws-port--${direction}`;
        dot.title = port.label ?? port.id;
        dot.style.left = `${offset.dx - PORT_RADIUS}px`;
        dot.style.top = `${offset.dy - PORT_RADIUS}px`;
        dot.dataset.nodeId = node.id;
        dot.dataset.portId = port.id;
        if (direction === 'output') {
          dot.addEventListener('mousedown', event => {
            event.stopPropagation();
            startPendingConnection(node.id, port.id, event);
          });
        } else {
          dot.addEventListener('mouseup', event => {
            if (pendingConn.active) {
              event.stopPropagation();
              finishConnection(node.id, port.id);
            }
          });
        }
        nodeElement.appendChild(dot);
      });
    }
    nodeElement.addEventListener('mousedown', event => {
      if (!event.target.classList.contains('ws-port')) startNodeDrag(node.id, event);
    });
    nodeElement.addEventListener('click', event => {
      if (!event.target.classList.contains('ws-port')) selectNode(node.id);
    });
    wsState.nodeElements.set(node.id, nodeElement);
    canvas.appendChild(nodeElement);
  }

  nodeElement.className = `ws-node ws-node--${node.nodeType}${node.boundaryRole ? ' ws-node--boundary' : ''}`;
  nodeElement.classList.toggle('ws-node--selected', inspector.selectedNodeId === node.id);
  Object.assign(nodeElement.style, {
    left: `${position.x}px`,
    top: `${position.y}px`,
    width: `${NODE_WIDTH}px`,
    height: `${NODE_HEIGHT}px`,
  });
  const label = nodeElement.querySelector('.ws-node-label');
  if (label) label.innerHTML = nodeLabel(node).split('\n').map(line => `<span>${escHtml(line)}</span>`).join('');
  const fill = nodeElement.querySelector('.ws-hopper-fill');
  if (fill && node.nodeType === 'hopper') {
    fill.style.height = `${Math.min(100, hopperStoredMassKg(node) / node.capacityKg * 100).toFixed(1)}%`;
  }
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

  const activeIds = new Set();
  for (const connection of Object.values(wsState.blueprint.connections)) {
    activeIds.add(connection.id);
    let path = wsState.connectionElements.get(connection.id);
    if (!path || !svg.contains(path)) {
      path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('fill', 'none');
      path.setAttribute('cursor', 'pointer');
      path.classList.add('ws-connection');
      path.addEventListener('click', () => selectConnection(connection.id));
      svg.appendChild(path);
      wsState.connectionElements.set(connection.id, path);
    }
    const source = portCanvasPosition(connection.sourceNodeId, connection.sourcePortId);
    const target = portCanvasPosition(connection.targetNodeId, connection.targetPortId);
    const midX = (source.x + target.x) / 2;
    const stream = getStreamForConnection(wsState.blueprint, connection.id);
    const flow = stream ? totalMassFlowKgPerSecond(stream.componentMassFlowKgPerSecond) : 0;
    path.setAttribute('d', `M ${source.x} ${source.y} C ${midX} ${source.y}, ${midX} ${target.y}, ${target.x} ${target.y}`);
    path.setAttribute('stroke-width', Math.max(1.5, Math.min(6, 1.5 + flow * 0.5)));
    path.classList.toggle('ws-connection--selected', inspector.selectedConnId === connection.id);
  }
  for (const [id, path] of wsState.connectionElements) {
    if (!activeIds.has(id)) {
      path.remove();
      wsState.connectionElements.delete(id);
    }
  }

  if (pendingConn.active) {
    if (!wsState.connectionPreview || !svg.contains(wsState.connectionPreview)) {
      wsState.connectionPreview = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      wsState.connectionPreview.classList.add('ws-connection-preview');
      svg.appendChild(wsState.connectionPreview);
    }
    const source = portCanvasPosition(pendingConn.sourceNodeId, pendingConn.sourcePortId);
    wsState.connectionPreview.setAttribute('x1', source.x);
    wsState.connectionPreview.setAttribute('y1', source.y);
    wsState.connectionPreview.setAttribute('x2', pendingConn.x);
    wsState.connectionPreview.setAttribute('y2', pendingConn.y);
  } else if (wsState.connectionPreview) {
    wsState.connectionPreview.remove();
    wsState.connectionPreview = null;
  }
}

function renderEngineeringNodes() {
  const canvas = el('ws-eng-canvas');
  const svg = el('ws-eng-svg');
  if (!canvas || !svg || !wsState.blueprint) return;
  const nodeIds = new Set(Object.keys(wsState.blueprint.nodes));
  for (const [id, element] of wsState.nodeElements) {
    if (!nodeIds.has(id)) {
      element.remove();
      wsState.nodeElements.delete(id);
    }
  }
  for (const node of Object.values(wsState.blueprint.nodes)) {
    renderNode(canvas, node, wsState.blueprintLayout.nodePositions[node.id] ?? { x: 0, y: 0 });
  }
  renderConnections(svg);
  updateInspector();
  updateSimStatus();
}

function renderEngineeringWorkspace(container) {
  if (!wsState.selectedOccurrenceId) {
    container.innerHTML = '<p class="ws-empty">No resource occurrence selected.</p>';
    return;
  }
  activateEngineeringSession(wsState.selectedOccurrenceId, wsState.selectedSiteId);
  wsState.nodeElements.clear();
  wsState.connectionElements.clear();
  wsState.connectionPreview = null;
  inspector.renderKey = null;
  const site = wsState.world?.sites?.[wsState.selectedSiteId];
  const feature = site ? wsState.world?.features?.[site.featureId] : null;
  container.innerHTML = `<div class="ws-eng-toolbar"><span class="ws-eng-title">Site — ${escHtml(feature?.name ?? wsState.selectedSiteId)}</span><span class="ws-site-boundary-label">Explicit Site Import / Site Export buffers</span><button id="ws-sim-reset">↺ Reset Site</button><span id="ws-sim-status" class="ws-sim-status"></span></div><div class="ws-eng-layout"><div class="ws-canvas-wrap"><svg id="ws-eng-svg" class="ws-eng-svg"></svg><div id="ws-eng-canvas" class="ws-eng-canvas"></div></div><div id="ws-inspector" class="ws-inspector"><div class="ws-inspector-title">Inspector</div><div id="ws-inspector-body" class="ws-inspector-body">Select a node or connection.</div></div></div>`;
  el('ws-sim-reset')?.addEventListener('click', onResetEngineering);
  el('ws-inspector-body')?.addEventListener('click', onInspectorClick);
  renderEngineeringNodes();
  el('ws-eng-canvas')?.addEventListener('mousemove', onCanvasMouseMove);
  el('ws-eng-canvas')?.addEventListener('mouseup', onCanvasMouseUp);
  el('ws-eng-svg')?.addEventListener('mousemove', onCanvasMouseMove);
  el('ws-eng-svg')?.addEventListener('mouseup', onCanvasMouseUp);
}

function startNodeDrag(nodeId, event) {
  const position = wsState.blueprintLayout.nodePositions[nodeId] ?? { x: 0, y: 0 };
  dragState = {
    nodeId,
    startMouseX: event.clientX,
    startMouseY: event.clientY,
    startX: position.x,
    startY: position.y,
  };
  event.preventDefault();
}

function startPendingConnection(nodeId, portId, event) {
  const canvas = el('ws-eng-canvas');
  const rect = canvas?.getBoundingClientRect() ?? { left: 0, top: 0 };
  Object.assign(pendingConn, {
    active: true,
    sourceNodeId: nodeId,
    sourcePortId: portId,
    x: event.clientX - rect.left + (canvas?.scrollLeft ?? 0),
    y: event.clientY - rect.top + (canvas?.scrollTop ?? 0),
  });
  event.preventDefault();
}

function finishConnection(targetNodeId, targetPortId) {
  if (!pendingConn.active) return;
  const check = checkBlueprintConnection(
    wsState.blueprint,
    pendingConn.sourceNodeId,
    pendingConn.sourcePortId,
    targetNodeId,
    targetPortId
  );
  pendingConn.active = false;
  if (!check.ok) {
    inspector.message = check.reason;
  } else {
    const connection = blueprintConnect(
      wsState.blueprint,
      pendingConn.sourceNodeId,
      pendingConn.sourcePortId,
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
  renderEngineeringNodes();
}

function onCanvasMouseMove(event) {
  if (dragState) {
    layoutMoveNode(
      wsState.blueprintLayout,
      dragState.nodeId,
      Math.max(0, dragState.startX + event.clientX - dragState.startMouseX),
      Math.max(0, dragState.startY + event.clientY - dragState.startMouseY)
    );
    renderEngineeringNodes();
  }
  if (pendingConn.active) {
    const canvas = el('ws-eng-canvas');
    const rect = canvas?.getBoundingClientRect() ?? { left: 0, top: 0 };
    pendingConn.x = event.clientX - rect.left + (canvas?.scrollLeft ?? 0);
    pendingConn.y = event.clientY - rect.top + (canvas?.scrollTop ?? 0);
    renderConnections(el('ws-eng-svg'));
  }
}

function onCanvasMouseUp() {
  dragState = null;
  if (pendingConn.active) {
    pendingConn.active = false;
    renderConnections(el('ws-eng-svg'));
  }
}

function selectNode(nodeId) {
  inspector.selectedNodeId = nodeId;
  inspector.selectedConnId = null;
  inspector.message = '';
  inspector.renderKey = null;
  renderEngineeringNodes();
}

function selectConnection(connectionId) {
  inspector.selectedNodeId = null;
  inspector.selectedConnId = connectionId;
  inspector.message = '';
  inspector.renderKey = null;
  renderEngineeringNodes();
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
    blueprintDisconnect(wsState.blueprint, button.dataset.connId);
    inspector.selectedConnId = null;
  } else if (button.dataset.nodeId) {
    for (const connection of [...Object.values(wsState.blueprint.connections)]) {
      if (connection.sourceNodeId === button.dataset.nodeId || connection.targetNodeId === button.dataset.nodeId) {
        blueprintDisconnect(wsState.blueprint, connection.id);
      }
    }
  }
  inspector.renderKey = null;
  renderEngineeringNodes();
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
  if (wsState.currentLevel === 'engineering') {
    renderEngineeringNodes();
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

function onResetEngineering() {
  const occurrenceId = wsState.selectedOccurrenceId;
  const siteId = wsState.selectedSiteId;
  if (!occurrenceId || !siteId) return;
  const session = createEngineeringSession(occurrenceId, siteId);
  wsState.engineeringSessions[siteId] = session;
  registerSimulationSession(wsState.world, siteId, session.blueprint, session.boundaryNode?.childWorkspaceId);
  wsState.blueprint = session.blueprint;
  wsState.blueprintLayout = session.blueprintLayout;
  inspector.selectedNodeId = null;
  inspector.selectedConnId = null;
  inspector.renderKey = null;
  renderEngineeringWorkspace(el('ws-main'));
}

export function renderWorkspace() {
  const container = el('ws-main');
  if (!container) return;
  renderBreadcrumbs();
  if (wsState.currentLevel === 'region') renderRegionWorkspace(container);
  else if (wsState.currentLevel === 'engineering') renderEngineeringWorkspace(container);
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
  wsState.engineeringSessions = {};
  wsState.workspaceLayouts = {};
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
  if (wsState.currentLevel !== 'engineering') renderWorkspace();
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', renderWorkspace);
