/**
 * Player-facing hierarchical workspace.
 *
 * Navigation/application state lives here. Physical engineering state lives in
 * per-site blueprint simulation-runtime sessions; visual node positions live in
 * separate BlueprintLayout objects.
 */

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
  simulationTick,
  createBlueprintLayout,
  layoutMoveNode,
  SIMULATION_STEP_S,
  DEFAULT_HOPPER_CAPACITY_KG,
  DEFAULT_CRUSHER_THROUGHPUT_KG_PER_S,
  DEFAULT_CRUSHER_TARGET_PARTICLE_SIZE_MM,
  DEFAULT_MAG_SEP_FIELD_STRENGTH,
} from '../simulation/simulationEngine.js';
import { hopperStoredMassKg, hopperFreeCapacityKg } from '../simulation/hopperNode.js';
import { totalMassFlowKgPerSecond } from '../simulation/materialStream.js';
import { isFeatureDiscovered, discoverFeature } from '../core/world/knowledgeState.js';

const wsState = {
  currentLevel: 'planet',
  selectedRegionId: null,
  selectedOccurrenceId: null,
  world: null,
  knowledge: null,

  blueprint: null,
  blueprintLayout: null,
  engineeringSessions: {},

  simRunning: false,
  simLastTime: null,
  simAccumulatedS: 0,
  simRafId: null,
};

const NODE_WIDTH = 160;
const NODE_HEIGHT = 100;
const PORT_RADIUS = 7;

const pendingConn = {
  active: false,
  sourceNodeId: null,
  sourcePortId: null,
  x: 0,
  y: 0,
};

const inspector = {
  selectedNodeId: null,
  selectedConnId: null,
  message: '',
};

let dragState = null;

function el(id) { return document.getElementById(id); }

function escHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function currentPlanet() {
  return wsState.world?.planets?.[wsState.world?.planetId] ?? null;
}

function requestPlayerWorldGeneration(seed) {
  const seedInput = el('seed-input');
  const generateButton = el('generate-btn');
  if (!seedInput || !generateButton) return;
  seedInput.value = seed.trim();
  generateButton.click();
}

function renderBreadcrumbs() {
  const container = el('ws-breadcrumbs');
  if (!container) return;

  const planet = currentPlanet();
  const region = wsState.selectedRegionId ? wsState.world?.regions?.[wsState.selectedRegionId] : null;
  const crumbs = [];

  if (planet) {
    crumbs.push({ label: planet.name, level: 'planet', clickable: wsState.currentLevel !== 'planet' });
  }
  if (region && wsState.currentLevel !== 'planet') {
    crumbs.push({ label: region.name, level: 'region', clickable: wsState.currentLevel === 'engineering' });
  }
  if (wsState.currentLevel === 'engineering') {
    crumbs.push({ label: 'Engineering', level: 'engineering', clickable: false });
  }

  container.innerHTML = crumbs.map(crumb => (
    crumb.clickable
      ? `<button class="ws-breadcrumb" data-level="${crumb.level}">${escHtml(crumb.label)}</button>`
      : `<span class="ws-breadcrumb ws-breadcrumb--active">${escHtml(crumb.label)}</span>`
  )).join('<span class="ws-breadcrumb-sep">›</span>');

  container.querySelectorAll('.ws-breadcrumb[data-level]').forEach(button => {
    button.addEventListener('click', () => navigateTo(button.dataset.level));
  });
}

function createEngineeringSession(occurrenceId) {
  const blueprint = createBlueprint();
  const blueprintLayout = createBlueprintLayout();

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

  layoutMoveNode(blueprintLayout, extractor.id, 60, 140);
  layoutMoveNode(blueprintLayout, hopperA.id, 260, 140);
  layoutMoveNode(blueprintLayout, crusher.id, 460, 140);
  layoutMoveNode(blueprintLayout, hopperB.id, 660, 140);
  layoutMoveNode(blueprintLayout, magSep.id, 860, 140);
  layoutMoveNode(blueprintLayout, concentrateHopper.id, 1060, 60);
  layoutMoveNode(blueprintLayout, tailingsHopper.id, 1060, 220);

  blueprintConnect(blueprint, extractor.id, extractor.outputPortId, hopperA.id, hopperA.inputPortId);
  blueprintConnect(blueprint, hopperA.id, hopperA.outputPortId, crusher.id, crusher.inputPortId);
  blueprintConnect(blueprint, crusher.id, crusher.outputPortId, hopperB.id, hopperB.inputPortId);
  blueprintConnect(blueprint, hopperB.id, hopperB.outputPortId, magSep.id, magSep.inputPortId);
  blueprintConnect(blueprint, magSep.id, magSep.concentratePortId, concentrateHopper.id, concentrateHopper.inputPortId);
  blueprintConnect(blueprint, magSep.id, magSep.tailingsPortId, tailingsHopper.id, tailingsHopper.inputPortId);

  return { blueprint, blueprintLayout };
}

function activateEngineeringSession(occurrenceId) {
  let session = wsState.engineeringSessions[occurrenceId];
  if (!session) {
    session = createEngineeringSession(occurrenceId);
    wsState.engineeringSessions[occurrenceId] = session;
  }
  wsState.blueprint = session.blueprint;
  wsState.blueprintLayout = session.blueprintLayout;
}

export function navigateTo(level, opts = {}) {
  stopSimulation();

  if (level === 'region' && opts.regionId) {
    wsState.selectedRegionId = opts.regionId;
  }
  if (level === 'engineering') {
    const occurrenceId = opts.occurrenceId ?? wsState.selectedOccurrenceId;
    if (!occurrenceId) return;
    wsState.selectedOccurrenceId = occurrenceId;
    activateEngineeringSession(occurrenceId);
  }

  wsState.currentLevel = level;
  inspector.selectedNodeId = null;
  inspector.selectedConnId = null;
  inspector.message = '';
  renderWorkspace();
}

function renderPlanetWorkspace(container) {
  const planet = currentPlanet();
  if (!planet) {
    container.innerHTML = `
      <div class="ws-site-card">
        <div class="ws-site-name">Create Prototype World</div>
        <div class="ws-site-type">Generate a deterministic planet without leaving Player View.</div>
        <label for="ws-player-seed">Seed</label>
        <input id="ws-player-seed" type="text" placeholder="Enter seed or leave blank for random">
        <button id="ws-player-generate">Generate World</button>
      </div>
    `;
    el('ws-player-generate')?.addEventListener('click', () => {
      requestPlayerWorldGeneration(el('ws-player-seed')?.value ?? '');
    });
    el('ws-player-seed')?.addEventListener('keydown', event => {
      if (event.key === 'Enter') requestPlayerWorldGeneration(event.currentTarget.value ?? '');
    });
    return;
  }

  container.innerHTML = `
    <div class="ws-planet-header">
      <div class="ws-planet-name">${escHtml(planet.name)}</div>
      <div class="ws-planet-meta">${escHtml(planet.planetType)} · ${planet.massEarth} M⊕ · ${planet.gravityG}g</div>
    </div>
    <div class="ws-region-grid" id="ws-region-grid"></div>
  `;

  const grid = el('ws-region-grid');
  for (const regionId of planet.regions ?? []) {
    const region = wsState.world.regions[regionId];
    if (!region) continue;
    const featureIds = region.features ?? [];
    const discoveredCount = featureIds.filter(featureId => isFeatureDiscovered(wsState.knowledge, featureId)).length;

    const card = document.createElement('div');
    card.className = 'ws-region-card';
    card.tabIndex = 0;
    card.innerHTML = `
      <div class="ws-region-card-name">${escHtml(region.name)}</div>
      <div class="ws-region-card-meta">${escHtml(region.surfaceCover)} · ${region.areaPercent}% area</div>
      <div class="ws-region-card-features">Features: ${discoveredCount} / ${featureIds.length} known</div>
      <div class="ws-region-card-enter">Enter →</div>
    `;
    const enter = () => navigateTo('region', { regionId });
    card.addEventListener('click', enter);
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') enter();
    });
    grid?.appendChild(card);
  }
}

function compatibleOccurrenceForFeature(feature) {
  if (!feature) return null;
  for (const occurrenceId of feature.resourceOccurrences ?? []) {
    const occurrence = wsState.world?.resourceOccurrences?.[occurrenceId];
    if (occurrence?.resourceId === 'iron-ore' && occurrence?.composition) return occurrence;
  }
  return null;
}

function renderRegionWorkspace(container) {
  const region = wsState.world?.regions?.[wsState.selectedRegionId];
  if (!region) {
    container.innerHTML = '<p class="ws-empty">No region selected.</p>';
    return;
  }

  let sitesHtml = '';
  let hasKnownCompatibleSite = false;
  let prototypeSurveyFeatureId = null;

  for (const featureId of region.features ?? []) {
    const feature = wsState.world.features[featureId];
    const occurrence = compatibleOccurrenceForFeature(feature);
    const discovered = isFeatureDiscovered(wsState.knowledge, featureId);

    if (!discovered) {
      if (!prototypeSurveyFeatureId && occurrence) prototypeSurveyFeatureId = featureId;
      sitesHtml += '<div class="ws-site-card ws-site-unknown"><span class="ws-site-unknown-label">Unknown site</span></div>';
      continue;
    }

    if (occurrence) hasKnownCompatibleSite = true;
    sitesHtml += `
      <div class="ws-site-card ${occurrence ? 'ws-site-enterable' : ''}">
        <div class="ws-site-name">${escHtml(feature.name)}</div>
        <div class="ws-site-type">${escHtml(feature.type)} · ${escHtml(feature.quantityClass)}</div>
        ${occurrence ? `<span class="ws-badge ws-badge--ore">${escHtml(occurrence.name)} · ${escHtml(occurrence.quantityClass)}</span>` : ''}
        ${occurrence
          ? `<button class="ws-site-enter-btn" data-occurrence-id="${escHtml(occurrence.id)}">Enter Engineering →</button>`
          : '<span class="ws-site-no-entry">No compatible resource for this prototype chain</span>'}
      </div>
    `;
  }

  const backgroundOccurrences = (region.backgroundResourceOccurrences ?? [])
    .map(id => wsState.world.resourceOccurrences[id])
    .filter(Boolean);
  const backgroundSummary = backgroundOccurrences.length
    ? backgroundOccurrences.map(occurrence => `<span class="ws-badge">${escHtml(occurrence.name)}</span>`).join(' ')
    : '<em>none</em>';

  const prototypeSurvey = !hasKnownCompatibleSite && prototypeSurveyFeatureId
    ? `<div class="ws-site-card">
         <div class="ws-site-name">Prototype Survey Bootstrap</div>
         <div class="ws-site-type">Temporary until the automated surveying system is implemented.</div>
         <button id="ws-prototype-survey" data-feature-id="${escHtml(prototypeSurveyFeatureId)}">Survey One Compatible Site</button>
       </div>`
    : '';

  container.innerHTML = `
    <div class="ws-region-header">
      <div class="ws-region-heading">${escHtml(region.name)}</div>
      <div class="ws-region-desc">${escHtml(region.surfaceCover)} · ${region.areaPercent}% area · Heat: ${region.heat} · Moisture: ${region.moisture}</div>
      <div class="ws-region-bgres"><strong>Background resources:</strong> ${backgroundSummary}</div>
    </div>
    ${prototypeSurvey}
    <div class="ws-sites-grid">${sitesHtml || '<p class="ws-empty">No features in this region.</p>'}</div>
  `;

  container.querySelectorAll('.ws-site-enter-btn').forEach(button => {
    button.addEventListener('click', () => navigateTo('engineering', { occurrenceId: button.dataset.occurrenceId }));
  });

  el('ws-prototype-survey')?.addEventListener('click', event => {
    const featureId = event.currentTarget.dataset.featureId;
    if (!featureId || !wsState.knowledge) return;
    discoverFeature(wsState.knowledge, featureId);
    document.dispatchEvent(new CustomEvent('interlink:knowledge-updated', { detail: { featureId } }));
    renderWorkspace();
  });
}

function nodeLabel(node) {
  switch (node.nodeType) {
    case 'extractor': {
      const occurrence = wsState.world?.resourceOccurrences?.[node.occurrenceId];
      return `Extractor\n${occurrence?.name ?? node.occurrenceId}\n${node.prototypeRateKgPerSecond} kg/s`;
    }
    case 'hopper': {
      const mass = hopperStoredMassKg(node);
      return `Hopper\n${mass.toFixed(1)} / ${node.capacityKg} kg\n${(mass / node.capacityKg * 100).toFixed(0)}%`;
    }
    case 'crusher':
      return `Crusher\n→ ${node.targetParticleSizeMm} mm\n${node.throughputKgPerSecond} kg/s`;
    case 'magSep':
      return `Mag. Sep.\nB=${node.fieldStrength}\n${node.throughputKgPerSecond} kg/s`;
    default:
      return node.nodeType;
  }
}

function portOffsets(port, index, count) {
  const step = NODE_HEIGHT / (count + 1);
  return {
    dx: port.direction === 'input' ? 0 : NODE_WIDTH,
    dy: step * (index + 1),
  };
}

function renderNode(canvas, node, position) {
  const nodeElement = document.createElement('div');
  nodeElement.className = `ws-node ws-node--${node.nodeType}`;
  if (inspector.selectedNodeId === node.id) nodeElement.classList.add('ws-node--selected');
  nodeElement.style.left = `${position.x}px`;
  nodeElement.style.top = `${position.y}px`;
  nodeElement.style.width = `${NODE_WIDTH}px`;
  nodeElement.style.height = `${NODE_HEIGHT}px`;

  const fillBar = node.nodeType === 'hopper'
    ? `<div class="ws-hopper-fill" style="height:${Math.min(100, hopperStoredMassKg(node) / node.capacityKg * 100).toFixed(1)}%"></div>`
    : '';
  nodeElement.innerHTML = `
    ${fillBar}
    <div class="ws-node-label">${nodeLabel(node).split('\n').map(line => `<span>${escHtml(line)}</span>`).join('')}</div>
  `;

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
      dot.dataset.portKind = direction;

      if (direction === 'output') {
        dot.addEventListener('mousedown', event => {
          event.stopPropagation();
          startPendingConnection(node.id, port.id, event);
        });
      } else {
        dot.addEventListener('mouseup', event => {
          if (!pendingConn.active) return;
          event.stopPropagation();
          finishConnection(node.id, port.id);
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

  canvas.appendChild(nodeElement);
}

function portCanvasPosition(nodeId, portId) {
  const node = wsState.blueprint.nodes[nodeId];
  const position = wsState.blueprintLayout.nodePositions[nodeId] ?? { x: 0, y: 0 };
  const ports = getNodePortDefinitions(node);
  const port = ports.find(candidate => candidate.id === portId);
  if (!port) return position;
  const sidePorts = ports.filter(candidate => candidate.direction === port.direction);
  const offset = portOffsets(port, sidePorts.indexOf(port), sidePorts.length);
  return { x: position.x + offset.dx, y: position.y + offset.dy };
}

function renderConnections(svg) {
  svg.innerHTML = '';
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

  for (const connection of Object.values(wsState.blueprint.connections)) {
    const source = portCanvasPosition(connection.sourceNodeId, connection.sourcePortId);
    const target = portCanvasPosition(connection.targetNodeId, connection.targetPortId);
    const stream = getStreamForConnection(wsState.blueprint, connection.id);
    const flow = stream ? totalMassFlowKgPerSecond(stream.componentMassFlowKgPerSecond) : 0;
    const midX = (source.x + target.x) / 2;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${source.x} ${source.y} C ${midX} ${source.y}, ${midX} ${target.y}, ${target.x} ${target.y}`);
    path.setAttribute('stroke-width', Math.max(1.5, Math.min(6, 1.5 + flow * 0.5)));
    path.setAttribute('fill', 'none');
    path.setAttribute('cursor', 'pointer');
    path.classList.add('ws-connection');
    if (inspector.selectedConnId === connection.id) path.classList.add('ws-connection--selected');
    path.addEventListener('click', () => selectConnection(connection.id));
    svg.appendChild(path);
  }

  if (pendingConn.active && pendingConn.sourceNodeId) {
    const source = portCanvasPosition(pendingConn.sourceNodeId, pendingConn.sourcePortId);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', source.x);
    line.setAttribute('y1', source.y);
    line.setAttribute('x2', pendingConn.x);
    line.setAttribute('y2', pendingConn.y);
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('stroke-dasharray', '5,4');
    line.classList.add('ws-connection-preview');
    svg.appendChild(line);
  }
}

function renderEngineeringNodes() {
  const canvas = el('ws-eng-canvas');
  const svg = el('ws-eng-svg');
  if (!canvas || !svg || !wsState.blueprint) return;

  canvas.innerHTML = '';
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
  activateEngineeringSession(wsState.selectedOccurrenceId);
  const occurrence = wsState.world.resourceOccurrences[wsState.selectedOccurrenceId];

  container.innerHTML = `
    <div class="ws-eng-toolbar">
      <span class="ws-eng-title">Engineering — ${escHtml(occurrence?.name ?? wsState.selectedOccurrenceId)}</span>
      <button id="ws-sim-toggle">${wsState.simRunning ? '⏸ Pause' : '▶ Run Simulation'}</button>
      <button id="ws-sim-reset">↺ Reset Site</button>
      <span id="ws-sim-status" class="ws-sim-status"></span>
    </div>
    <div class="ws-eng-layout">
      <div class="ws-canvas-wrap">
        <svg id="ws-eng-svg" class="ws-eng-svg"></svg>
        <div id="ws-eng-canvas" class="ws-eng-canvas"></div>
      </div>
      <div id="ws-inspector" class="ws-inspector">
        <div class="ws-inspector-title">Inspector</div>
        <div id="ws-inspector-body" class="ws-inspector-body">Select a node or connection.</div>
      </div>
    </div>
  `;

  el('ws-sim-toggle')?.addEventListener('click', onToggleSimulation);
  el('ws-sim-reset')?.addEventListener('click', onResetEngineering);
  renderEngineeringNodes();

  requestAnimationFrame(() => {
    el('ws-eng-canvas')?.addEventListener('mousemove', onCanvasMouseMove);
    el('ws-eng-canvas')?.addEventListener('mouseup', onCanvasMouseUp);
    el('ws-eng-svg')?.addEventListener('mousemove', onCanvasMouseMove);
    el('ws-eng-svg')?.addEventListener('mouseup', onCanvasMouseUp);
    el('ws-inspector-body')?.addEventListener('click', onInspectorClick);
  });
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
  pendingConn.active = true;
  pendingConn.sourceNodeId = nodeId;
  pendingConn.sourcePortId = portId;
  pendingConn.x = event.clientX - rect.left + (canvas?.scrollLeft ?? 0);
  pendingConn.y = event.clientY - rect.top + (canvas?.scrollTop ?? 0);
  inspector.message = '';
  event.preventDefault();
}

function finishConnection(targetNodeId, targetPortId) {
  if (!pendingConn.active) return;
  const sourceNodeId = pendingConn.sourceNodeId;
  const sourcePortId = pendingConn.sourcePortId;
  pendingConn.active = false;

  const compatibility = checkBlueprintConnection(
    wsState.blueprint,
    sourceNodeId,
    sourcePortId,
    targetNodeId,
    targetPortId
  );
  if (!compatibility.ok) {
    inspector.message = compatibility.reason;
    renderEngineeringNodes();
    return;
  }

  const connection = blueprintConnect(wsState.blueprint, sourceNodeId, sourcePortId, targetNodeId, targetPortId);
  if (connection) {
    inspector.selectedNodeId = null;
    inspector.selectedConnId = connection.id;
    inspector.message = '';
  }
  renderEngineeringNodes();
}

function onCanvasMouseMove(event) {
  if (dragState) {
    const x = Math.max(0, dragState.startX + event.clientX - dragState.startMouseX);
    const y = Math.max(0, dragState.startY + event.clientY - dragState.startMouseY);
    layoutMoveNode(wsState.blueprintLayout, dragState.nodeId, x, y);
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
    renderEngineeringNodes();
  }
}

function selectNode(nodeId) {
  inspector.selectedNodeId = nodeId;
  inspector.selectedConnId = null;
  inspector.message = '';
  renderEngineeringNodes();
}

function selectConnection(connectionId) {
  inspector.selectedNodeId = null;
  inspector.selectedConnId = connectionId;
  inspector.message = '';
  renderEngineeringNodes();
}

function formatNodeInspector(node) {
  let html = `<div class="ws-ins-type">${escHtml(node.nodeType.toUpperCase())}</div>`;
  html += `<div class="ws-ins-row"><b>ID:</b> ${escHtml(node.id)}</div>`;

  if (node.nodeType === 'extractor') {
    const occurrence = wsState.world?.resourceOccurrences?.[node.occurrenceId];
    html += `<div class="ws-ins-row"><b>Occurrence:</b> ${escHtml(occurrence?.name ?? node.occurrenceId)}</div>`;
    html += `<div class="ws-ins-row"><b>Prototype rate:</b> ${node.prototypeRateKgPerSecond} kg/s</div>`;
  } else if (node.nodeType === 'hopper') {
    const mass = hopperStoredMassKg(node);
    html += `<div class="ws-ins-row"><b>Stored:</b> ${mass.toFixed(3)} kg</div>`;
    html += `<div class="ws-ins-row"><b>Capacity:</b> ${node.capacityKg} kg</div>`;
    html += `<div class="ws-ins-row"><b>Free:</b> ${hopperFreeCapacityKg(node).toFixed(3)} kg</div>`;
    html += `<div class="ws-ins-row"><b>Particle size:</b> ${node.particleSizeMm == null ? 'empty' : `${node.particleSizeMm.toFixed(1)} mm`}</div>`;
    const componentRows = Object.entries(node.storedComponentsKg)
      .filter(([, kg]) => kg > 0)
      .map(([componentId, kg]) => `<div class="ws-ins-comp-row"><span>${escHtml(componentId)}</span><span>${kg.toFixed(3)} kg</span></div>`)
      .join('');
    if (componentRows) html += `<div class="ws-ins-comp">${componentRows}</div>`;
  } else if (node.nodeType === 'crusher') {
    html += `<div class="ws-ins-row"><b>Throughput:</b> ${node.throughputKgPerSecond} kg/s</div>`;
    html += `<div class="ws-ins-row"><b>Target size:</b> ${node.targetParticleSizeMm} mm</div>`;
    if (node.lastError) html += `<div class="ws-ins-note">${escHtml(node.lastError)}</div>`;
  } else if (node.nodeType === 'magSep') {
    html += `<div class="ws-ins-row"><b>Throughput:</b> ${node.throughputKgPerSecond} kg/s</div>`;
    html += `<div class="ws-ins-row"><b>Field strength:</b> ${node.fieldStrength}</div>`;
    html += `<div class="ws-ins-row"><b>Max feed size:</b> ${node.maxFeedParticleSizeMm} mm</div>`;
    if (node.lastError) html += `<div class="ws-ins-note">${escHtml(node.lastError)}</div>`;
  }

  html += `<div class="ws-ins-action"><button class="ws-btn-disconnect" data-node-id="${escHtml(node.id)}">Remove all connections</button></div>`;
  return html;
}

function formatConnectionInspector(connection) {
  const stream = getStreamForConnection(wsState.blueprint, connection.id);
  const flow = stream ? totalMassFlowKgPerSecond(stream.componentMassFlowKgPerSecond) : 0;
  let html = '<div class="ws-ins-type">CONNECTION</div>';
  html += `<div class="ws-ins-row"><b>From:</b> ${escHtml(connection.sourceNodeId)} / ${escHtml(connection.sourcePortId)}</div>`;
  html += `<div class="ws-ins-row"><b>To:</b> ${escHtml(connection.targetNodeId)} / ${escHtml(connection.targetPortId)}</div>`;
  html += `<div class="ws-ins-row"><b>Total flow:</b> ${flow.toFixed(3)} kg/s</div>`;
  html += `<div class="ws-ins-row"><b>Particle size:</b> ${stream?.particleSizeMm == null ? '—' : `${stream.particleSizeMm.toFixed(1)} mm`}</div>`;
  const componentRows = Object.entries(stream?.componentMassFlowKgPerSecond ?? {})
    .filter(([, rate]) => rate > 0)
    .map(([componentId, rate]) => `<div class="ws-ins-comp-row"><span>${escHtml(componentId)}</span><span>${rate.toFixed(4)} kg/s</span></div>`)
    .join('');
  if (componentRows) html += `<div class="ws-ins-comp">${componentRows}</div>`;
  html += `<div class="ws-ins-action"><button class="ws-btn-disconnect" data-conn-id="${escHtml(connection.id)}">Disconnect</button></div>`;
  return html;
}

function updateInspector() {
  const body = el('ws-inspector-body');
  if (!body || !wsState.blueprint) return;

  let html = inspector.message ? `<div class="ws-ins-note">${escHtml(inspector.message)}</div>` : '';
  if (inspector.selectedNodeId) {
    const node = wsState.blueprint.nodes[inspector.selectedNodeId];
    html += node ? formatNodeInspector(node) : 'Node not found.';
  } else if (inspector.selectedConnId) {
    const connection = wsState.blueprint.connections[inspector.selectedConnId];
    html += connection ? formatConnectionInspector(connection) : 'Connection not found.';
  } else if (!inspector.message) {
    html = 'Select a node or connection.';
  }
  body.innerHTML = html;
}

function onInspectorClick(event) {
  const button = event.target.closest('.ws-btn-disconnect');
  if (!button || !wsState.blueprint) return;

  if (button.dataset.connId) {
    blueprintDisconnect(wsState.blueprint, button.dataset.connId);
    inspector.selectedConnId = null;
  } else if (button.dataset.nodeId) {
    const nodeId = button.dataset.nodeId;
    for (const connection of [...Object.values(wsState.blueprint.connections)]) {
      if (connection.sourceNodeId === nodeId || connection.targetNodeId === nodeId) {
        blueprintDisconnect(wsState.blueprint, connection.id);
      }
    }
  }
  inspector.message = '';
  renderEngineeringNodes();
}

function onToggleSimulation() {
  if (wsState.simRunning) stopSimulation();
  else startSimulation();
}

function startSimulation() {
  if (wsState.simRunning || !wsState.blueprint) return;
  wsState.simRunning = true;
  wsState.simLastTime = performance.now();
  wsState.simAccumulatedS = 0;
  wsState.simRafId = requestAnimationFrame(simLoop);
  const button = el('ws-sim-toggle');
  if (button) button.textContent = '⏸ Pause';
  updateSimStatus();
}

function stopSimulation() {
  wsState.simRunning = false;
  if (wsState.simRafId != null) {
    cancelAnimationFrame(wsState.simRafId);
    wsState.simRafId = null;
  }
  const button = el('ws-sim-toggle');
  if (button) button.textContent = '▶ Run Simulation';
}

function simLoop(now) {
  if (!wsState.simRunning) return;
  const elapsed = Math.min((now - wsState.simLastTime) / 1000, 0.25);
  wsState.simLastTime = now;
  wsState.simAccumulatedS += elapsed;

  while (wsState.simAccumulatedS >= SIMULATION_STEP_S) {
    simulationTick(wsState.blueprint, wsState.world, SIMULATION_STEP_S);
    wsState.simAccumulatedS -= SIMULATION_STEP_S;
  }

  renderEngineeringNodes();
  wsState.simRafId = requestAnimationFrame(simLoop);
}

function updateSimStatus() {
  const status = el('ws-sim-status');
  if (!status || !wsState.blueprint) return;
  const storedKg = Object.values(wsState.blueprint.nodes)
    .filter(node => node.nodeType === 'hopper')
    .reduce((sum, hopper) => sum + hopperStoredMassKg(hopper), 0);
  const extractedKg = wsState.blueprint.simulationStats?.extractedKg ?? 0;
  status.textContent = `${wsState.simRunning ? '● ' : ''}Stored ${storedKg.toFixed(2)} kg · Extracted ${extractedKg.toFixed(2)} kg`;
}

function onResetEngineering() {
  stopSimulation();
  const occurrenceId = wsState.selectedOccurrenceId;
  if (!occurrenceId) return;
  const session = createEngineeringSession(occurrenceId);
  wsState.engineeringSessions[occurrenceId] = session;
  wsState.blueprint = session.blueprint;
  wsState.blueprintLayout = session.blueprintLayout;
  inspector.selectedNodeId = null;
  inspector.selectedConnId = null;
  inspector.message = '';
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
  stopSimulation();
  wsState.world = world;
  wsState.knowledge = knowledge;
  wsState.currentLevel = 'planet';
  wsState.selectedRegionId = null;
  wsState.selectedOccurrenceId = null;
  wsState.blueprint = null;
  wsState.blueprintLayout = null;
  wsState.engineeringSessions = {};
  inspector.selectedNodeId = null;
  inspector.selectedConnId = null;
  inspector.message = '';
  renderWorkspace();
}

export function updateWorkspaceKnowledge(knowledge) {
  wsState.knowledge = knowledge;
  if (wsState.currentLevel !== 'engineering') renderWorkspace();
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    renderWorkspace();
    el('mode-toggle-btn')?.addEventListener('click', () => {
      setTimeout(() => {
        if (el('player-view')?.style.display === 'none') stopSimulation();
      }, 0);
    });
  });
}
