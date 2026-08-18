/**
 * Hierarchical Workspace UI — player-facing interface.
 *
 * Manages three workspace levels:
 *   Planet Workspace  → select a Region
 *   Region Workspace  → select a compatible resource site
 *   Engineering Workspace → drag/connect/run process nodes
 *
 * Physical simulation state lives in blueprint (simulationEngine.js).
 * UI layout state (node positions) lives in blueprintLayout.
 * Workspace navigation state is ui-only.
 *
 * DOM-dependent; keep simulation logic out of this module.
 */

import {
  createBlueprint,
  blueprintAddExtractor,
  blueprintAddHopper,
  blueprintAddCrusher,
  blueprintAddMagSep,
  blueprintConnect,
  blueprintDisconnect,
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
import { isFeatureDiscovered, DISCOVERY_STATES } from '../core/world/knowledgeState.js';

// ─── Workspace state (UI-only, not physical simulation) ──────────────────────

const wsState = {
  currentLevel: 'planet',   // 'planet' | 'region' | 'engineering'
  selectedRegionId: null,
  selectedOccurrenceId: null,
  world: null,
  knowledge: null,

  // Engineering workspace
  blueprint: null,
  blueprintLayout: null,

  // Simulation loop
  simRunning: false,
  simLastTime: null,
  simAccumulatedS: 0,
  simRafId: null,
};

// ─── DOM helpers ─────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function el(id) { return document.getElementById(id); }

// ─── Breadcrumbs ─────────────────────────────────────────────────────────────

function renderBreadcrumbs() {
  const bc = el('ws-breadcrumbs');
  if (!bc) return;

  const { world, selectedRegionId, selectedOccurrenceId, currentLevel } = wsState;
  const planet = world?.planets?.[world?.planetId];
  const region = selectedRegionId ? world?.regions?.[selectedRegionId] : null;

  const crumbs = [];

  if (planet) {
    crumbs.push({
      label: escHtml(planet.name),
      level: 'planet',
      clickable: currentLevel !== 'planet',
    });
  }

  if (region && (currentLevel === 'region' || currentLevel === 'engineering')) {
    crumbs.push({
      label: escHtml(region.name),
      level: 'region',
      clickable: currentLevel === 'engineering',
    });
  }

  if (currentLevel === 'engineering') {
    crumbs.push({ label: 'Engineering', level: 'engineering', clickable: false });
  }

  bc.innerHTML = crumbs.map(c =>
    c.clickable
      ? `<button class="ws-breadcrumb" data-level="${c.level}">${c.label}</button>`
      : `<span class="ws-breadcrumb ws-breadcrumb--active">${c.label}</span>`
  ).join('<span class="ws-breadcrumb-sep">›</span>');

  bc.querySelectorAll('.ws-breadcrumb[data-level]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.level));
  });
}

// ─── Navigation ──────────────────────────────────────────────────────────────

export function navigateTo(level, opts = {}) {
  stopSimulation();

  if (level === 'region' && opts.regionId) wsState.selectedRegionId = opts.regionId;
  if (level === 'engineering' && opts.occurrenceId) wsState.selectedOccurrenceId = opts.occurrenceId;

  wsState.currentLevel = level;
  renderBreadcrumbs();
  renderWorkspace();
}

// ─── Planet Workspace ─────────────────────────────────────────────────────────

function renderPlanetWorkspace(container) {
  const { world } = wsState;
  if (!world) {
    container.innerHTML = '<p class="ws-empty">Generate a planet to begin.</p>';
    return;
  }

  const planet = world.planets[world.planetId];
  const regionIds = planet.regions;

  container.innerHTML = `
    <div class="ws-planet-header">
      <div class="ws-planet-name">${escHtml(planet.name)}</div>
      <div class="ws-planet-meta">${escHtml(planet.planetType)} &middot; ${planet.massEarth} M⊕ &middot; ${planet.gravityG}g</div>
    </div>
    <div class="ws-region-grid" id="ws-region-grid"></div>
  `;

  const grid = el('ws-region-grid');

  // Deterministic layout: arrange regions in a simple grid
  regionIds.forEach((regionId, idx) => {
    const region = world.regions[regionId];
    const card = document.createElement('div');
    card.className = 'ws-region-card';
    card.setAttribute('tabindex', '0');
    card.dataset.regionId = regionId;

    // Count discovered features
    const featureIds = region.features ?? [];
    const discoveredCount = featureIds.filter(fid => isFeatureDiscovered(wsState.knowledge, fid)).length;

    card.innerHTML = `
      <div class="ws-region-card-name">${escHtml(region.name)}</div>
      <div class="ws-region-card-meta">
        ${escHtml(region.surfaceCover)} &middot; ${region.areaPercent}% area
      </div>
      <div class="ws-region-card-features">
        Features: ${discoveredCount} / ${featureIds.length} known
      </div>
      <div class="ws-region-card-enter">Enter →</div>
    `;

    card.addEventListener('click', () => navigateTo('region', { regionId }));
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') navigateTo('region', { regionId }); });

    grid.appendChild(card);
  });
}

// ─── Region Workspace ─────────────────────────────────────────────────────────

function renderRegionWorkspace(container) {
  const { world, knowledge, selectedRegionId } = wsState;
  if (!world || !selectedRegionId) {
    container.innerHTML = '<p class="ws-empty">No region selected.</p>';
    return;
  }

  const region = world.regions[selectedRegionId];
  const featureIds = region.features ?? [];

  let sitesHtml = '';
  let hasEnterableOccurrence = false;

  for (const fid of featureIds) {
    const feature = world.features[fid];
    const discovered = isFeatureDiscovered(knowledge, fid);

    if (!discovered) {
      sitesHtml += `<div class="ws-site-card ws-site-unknown"><span class="ws-site-unknown-label">Unknown site</span></div>`;
      continue;
    }

    // Find iron-ore occurrence (or any occurrence with composition suitable for our chain)
    const occIds = feature.resourceOccurrences ?? [];
    const ironOccurrences = occIds.map(id => world.resourceOccurrences[id]).filter(
      occ => occ?.resourceId === 'iron-ore' && occ?.composition
    );

    const canEnter = ironOccurrences.length > 0;
    if (canEnter) hasEnterableOccurrence = true;

    const occBadges = ironOccurrences.map(occ =>
      `<span class="ws-badge ws-badge--ore">${escHtml(occ.name)} · ${escHtml(occ.quantityClass)}</span>`
    ).join('');

    sitesHtml += `
      <div class="ws-site-card ${canEnter ? 'ws-site-enterable' : ''}">
        <div class="ws-site-name">${escHtml(feature.name)}</div>
        <div class="ws-site-type">${escHtml(feature.type)} · ${escHtml(feature.quantityClass)}</div>
        ${occBadges}
        ${canEnter
          ? `<button class="ws-site-enter-btn" data-occurrence-id="${escHtml(ironOccurrences[0].id)}">Enter Engineering →</button>`
          : '<span class="ws-site-no-entry">No compatible resource for processing chain</span>'
        }
      </div>
    `;
  }

  // Background resources summary
  const bgOccs = (region.backgroundResourceOccurrences ?? []).map(id => world.resourceOccurrences[id]).filter(Boolean);
  const bgSummary = bgOccs.length > 0
    ? bgOccs.map(o => `<span class="ws-badge">${escHtml(o.name)}</span>`).join(' ')
    : '<em>none</em>';

  container.innerHTML = `
    <div class="ws-region-header">
      <div class="ws-region-heading">${escHtml(region.name)}</div>
      <div class="ws-region-desc">
        ${escHtml(region.surfaceCover)} · ${region.areaPercent}% area ·
        Heat: ${region.heat} · Moisture: ${region.moisture}
      </div>
      <div class="ws-region-bgres"><strong>Background resources:</strong> ${bgSummary}</div>
    </div>
    <div class="ws-sites-grid">${sitesHtml || '<p class="ws-empty">No features in this region.</p>'}</div>
  `;

  container.querySelectorAll('.ws-site-enter-btn').forEach(btn => {
    btn.addEventListener('click', () => navigateTo('engineering', { occurrenceId: btn.dataset.occurrenceId }));
  });
}

// ─── Engineering Workspace ────────────────────────────────────────────────────

const NODE_WIDTH = 160;
const NODE_HEIGHT = 100;
const PORT_RADIUS = 7;

// Pending connection drag state
const pendingConn = { active: false, sourceNodeId: null, sourcePortId: null, x: 0, y: 0 };

// Inspector state
const inspector = { selectedNodeId: null, selectedConnId: null };

function initEngineeringBlueprint(occurrenceId) {
  wsState.blueprint = createBlueprint();
  wsState.blueprintLayout = createBlueprintLayout();

  const bp = wsState.blueprint;
  const layout = wsState.blueprintLayout;

  // Build the standard chain with sensible defaults
  const extractor    = blueprintAddExtractor(bp, occurrenceId, 5);
  const hopperA      = blueprintAddHopper(bp, DEFAULT_HOPPER_CAPACITY_KG);
  const crusher      = blueprintAddCrusher(bp, { throughputKgPerSecond: DEFAULT_CRUSHER_THROUGHPUT_KG_PER_S, targetParticleSizeMm: DEFAULT_CRUSHER_TARGET_PARTICLE_SIZE_MM });
  const hopperB      = blueprintAddHopper(bp, DEFAULT_HOPPER_CAPACITY_KG);
  const magSep       = blueprintAddMagSep(bp, { fieldStrength: DEFAULT_MAG_SEP_FIELD_STRENGTH });
  const concHopper   = blueprintAddHopper(bp, DEFAULT_HOPPER_CAPACITY_KG);
  const tailHopper   = blueprintAddHopper(bp, DEFAULT_HOPPER_CAPACITY_KG);

  // Layout positions (application state only)
  layoutMoveNode(layout, extractor.id,   60,  140);
  layoutMoveNode(layout, hopperA.id,    260,  140);
  layoutMoveNode(layout, crusher.id,    460,  140);
  layoutMoveNode(layout, hopperB.id,    660,  140);
  layoutMoveNode(layout, magSep.id,     860,  140);
  layoutMoveNode(layout, concHopper.id, 1060,  60);
  layoutMoveNode(layout, tailHopper.id, 1060, 220);

  // Wire up connections
  blueprintConnect(bp, extractor.id,  extractor.outputPortId,    hopperA.id,    hopperA.inputPortId);
  blueprintConnect(bp, hopperA.id,    hopperA.outputPortId,      crusher.id,    crusher.inputPortId);
  blueprintConnect(bp, crusher.id,    crusher.outputPortId,      hopperB.id,    hopperB.inputPortId);
  blueprintConnect(bp, hopperB.id,    hopperB.outputPortId,      magSep.id,     magSep.inputPortId);
  blueprintConnect(bp, magSep.id,     magSep.concentratePortId,  concHopper.id, concHopper.inputPortId);
  blueprintConnect(bp, magSep.id,     magSep.tailingsPortId,     tailHopper.id, tailHopper.inputPortId);
}

function renderEngineeringWorkspace(container) {
  const { world, selectedOccurrenceId, blueprint, blueprintLayout } = wsState;
  if (!world || !selectedOccurrenceId) {
    container.innerHTML = '<p class="ws-empty">No occurrence selected.</p>';
    return;
  }

  if (!blueprint) {
    initEngineeringBlueprint(selectedOccurrenceId);
  }

  const occ = world.resourceOccurrences[selectedOccurrenceId];

  container.innerHTML = `
    <div class="ws-eng-toolbar">
      <span class="ws-eng-title">Engineering — ${escHtml(occ?.name ?? selectedOccurrenceId)}</span>
      <button id="ws-sim-toggle">${wsState.simRunning ? '⏸ Pause' : '▶ Run Simulation'}</button>
      <button id="ws-sim-reset">↺ Reset</button>
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

  el('ws-sim-toggle').addEventListener('click', onToggleSimulation);
  el('ws-sim-reset').addEventListener('click', onResetEngineering);

  renderEngineeringNodes();
}

function renderEngineeringNodes() {
  const { blueprint, blueprintLayout, world } = wsState;
  if (!blueprint) return;

  const canvas = el('ws-eng-canvas');
  const svg = el('ws-eng-svg');
  if (!canvas || !svg) return;

  canvas.innerHTML = '';

  // Render each node
  for (const node of Object.values(blueprint.nodes)) {
    const pos = blueprintLayout.nodePositions[node.id] ?? { x: 0, y: 0 };
    renderNode(canvas, node, pos, world);
  }

  // Render connections in SVG
  renderConnections(svg, blueprint, blueprintLayout);

  updateInspector();
  updateSimStatus();
}

function nodeLabel(node, world) {
  switch (node.nodeType) {
    case 'extractor': {
      const occ = world?.resourceOccurrences?.[node.occurrenceId];
      return `Extractor\n${occ?.name ?? node.occurrenceId}\n⚑ ${node.prototypeRateKgPerSecond} kg/s`;
    }
    case 'hopper': {
      const mass = hopperStoredMassKg(node);
      const pct = node.capacityKg > 0 ? (mass / node.capacityKg * 100).toFixed(0) : 0;
      return `Hopper\n${mass.toFixed(1)} / ${node.capacityKg} kg\n${pct}%`;
    }
    case 'crusher':
      return `Crusher\n→ ${node.targetParticleSizeMm} mm\n⚙ ${node.throughputKgPerSecond} kg/s`;
    case 'magSep':
      return `Mag. Sep.\nB=${node.fieldStrength}`;
    default:
      return node.nodeType;
  }
}

function nodeColor(node) {
  switch (node.nodeType) {
    case 'extractor': return '#1e3a2f';
    case 'hopper':    return '#1e2a3a';
    case 'crusher':   return '#3a2a1e';
    case 'magSep':    return '#2a1e3a';
    default:          return '#222';
  }
}

function getNodePorts(node) {
  const ports = [];
  switch (node.nodeType) {
    case 'extractor':
      ports.push({ id: node.outputPortId, side: 'right', kind: 'output', label: 'out' });
      break;
    case 'hopper':
      ports.push({ id: node.inputPortId,  side: 'left',  kind: 'input',  label: 'in'  });
      ports.push({ id: node.outputPortId, side: 'right', kind: 'output', label: 'out' });
      break;
    case 'crusher':
      ports.push({ id: node.inputPortId,  side: 'left',  kind: 'input',  label: 'feed'    });
      ports.push({ id: node.outputPortId, side: 'right', kind: 'output', label: 'product' });
      break;
    case 'magSep':
      ports.push({ id: node.inputPortId,        side: 'left',  kind: 'input',  label: 'feed' });
      ports.push({ id: node.concentratePortId,  side: 'right', kind: 'output', label: 'conc' });
      ports.push({ id: node.tailingsPortId,     side: 'right', kind: 'output', label: 'tail' });
      break;
  }
  return ports;
}

function portOffsets(portDef, idx, totalOnSide) {
  const step = NODE_HEIGHT / (totalOnSide + 1);
  return { dx: portDef.side === 'left' ? 0 : NODE_WIDTH, dy: step * (idx + 1) };
}

function renderNode(canvas, node, pos, world) {
  const el_node = document.createElement('div');
  el_node.className = `ws-node ws-node--${node.nodeType}`;
  el_node.id = `wsnode-${node.id}`;
  el_node.style.left = `${pos.x}px`;
  el_node.style.top  = `${pos.y}px`;
  el_node.style.width  = `${NODE_WIDTH}px`;
  el_node.style.height = `${NODE_HEIGHT}px`;
  el_node.style.background = nodeColor(node);

  if (inspector.selectedNodeId === node.id) {
    el_node.classList.add('ws-node--selected');
  }

  // Hopper fill bar
  let fillBar = '';
  if (node.nodeType === 'hopper') {
    const pct = node.capacityKg > 0 ? hopperStoredMassKg(node) / node.capacityKg * 100 : 0;
    fillBar = `<div class="ws-hopper-fill" style="height:${Math.min(100, pct).toFixed(1)}%"></div>`;
  }

  const labelLines = nodeLabel(node, world).split('\n');
  el_node.innerHTML = `
    ${fillBar}
    <div class="ws-node-label">
      ${labelLines.map(l => `<span>${escHtml(l)}</span>`).join('')}
    </div>
  `;

  // Ports as overlaid circles via SVG port-handles
  const ports = getNodePorts(node);
  const leftPorts  = ports.filter(p => p.side === 'left');
  const rightPorts = ports.filter(p => p.side === 'right');

  [...leftPorts, ...rightPorts].forEach((portDef) => {
    const sideArr = portDef.side === 'left' ? leftPorts : rightPorts;
    const sideIdx = sideArr.indexOf(portDef);
    const offsets = portOffsets(portDef, sideIdx, sideArr.length);

    const dot = document.createElement('div');
    dot.className = `ws-port ws-port--${portDef.kind}`;
    dot.title = portDef.label;
    dot.style.left = `${offsets.dx - PORT_RADIUS}px`;
    dot.style.top  = `${offsets.dy - PORT_RADIUS}px`;
    dot.dataset.nodeId = node.id;
    dot.dataset.portId = portDef.id;
    dot.dataset.portKind = portDef.kind;
    dot.dataset.side = portDef.side;

    dot.addEventListener('mousedown', e => {
      if (portDef.kind === 'output') {
        e.stopPropagation();
        startPendingConnection(node.id, portDef.id, e);
      }
    });
    dot.addEventListener('mouseup', e => {
      if (portDef.kind === 'input' && pendingConn.active) {
        e.stopPropagation();
        finishConnection(node.id, portDef.id);
      }
    });

    el_node.appendChild(dot);
  });

  // Node drag
  el_node.addEventListener('mousedown', e => {
    if (e.target.classList.contains('ws-port')) return;
    startNodeDrag(node.id, e);
  });

  el_node.addEventListener('click', e => {
    if (e.target.classList.contains('ws-port')) return;
    selectNode(node.id);
  });

  canvas.appendChild(el_node);
}

function portCanvasPosition(nodeId, portId) {
  const { blueprintLayout, blueprint } = wsState;
  const node = blueprint.nodes[nodeId];
  const pos  = blueprintLayout.nodePositions[nodeId] ?? { x: 0, y: 0 };
  const ports = getNodePorts(node);
  const portDef = ports.find(p => p.id === portId);
  if (!portDef) return { x: pos.x, y: pos.y };
  const sideArr = ports.filter(p => p.side === portDef.side);
  const sideIdx = sideArr.indexOf(portDef);
  const off = portOffsets(portDef, sideIdx, sideArr.length);
  return { x: pos.x + off.dx, y: pos.y + off.dy };
}

function renderConnections(svg, blueprint, layout) {
  svg.innerHTML = '';

  // Compute canvas size
  let maxX = 800, maxY = 400;
  for (const pos of Object.values(layout.nodePositions)) {
    maxX = Math.max(maxX, pos.x + NODE_WIDTH + 40);
    maxY = Math.max(maxY, pos.y + NODE_HEIGHT + 40);
  }
  svg.setAttribute('width', maxX);
  svg.setAttribute('height', maxY);
  svg.style.width  = `${maxX}px`;
  svg.style.height = `${maxY}px`;

  for (const conn of Object.values(blueprint.connections)) {
    const src = portCanvasPosition(conn.sourceNodeId, conn.sourcePortId);
    const dst = portCanvasPosition(conn.targetNodeId, conn.targetPortId);

    // Stream flow rate for visual thickness
    const stream = Object.values(blueprint.streams).find(s => s.connectionId === conn.id);
    const flow = stream?.totalMassFlowKgPerSecond ?? 0;
    const strokeWidth = Math.max(1.5, Math.min(6, 1.5 + flow * 0.5));

    const isSelected = inspector.selectedConnId === conn.id;
    const mx = (src.x + dst.x) / 2;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${src.x} ${src.y} C ${mx} ${src.y}, ${mx} ${dst.y}, ${dst.x} ${dst.y}`);
    path.setAttribute('stroke', isSelected ? '#ffcc44' : '#5599cc');
    path.setAttribute('stroke-width', strokeWidth);
    path.setAttribute('fill', 'none');
    path.setAttribute('cursor', 'pointer');
    path.dataset.connId = conn.id;
    path.addEventListener('click', () => selectConnection(conn.id));
    svg.appendChild(path);
  }

  // Pending connection preview
  if (pendingConn.active && pendingConn.sourceNodeId) {
    const src = portCanvasPosition(pendingConn.sourceNodeId, pendingConn.sourcePortId);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', src.x); line.setAttribute('y1', src.y);
    line.setAttribute('x2', pendingConn.x); line.setAttribute('y2', pendingConn.y);
    line.setAttribute('stroke', '#88ccff');
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('stroke-dasharray', '5,4');
    svg.appendChild(line);
  }
}

// ─── Interaction: drag nodes ──────────────────────────────────────────────────

let dragState = null;

function startNodeDrag(nodeId, e) {
  const { blueprintLayout } = wsState;
  const pos = blueprintLayout.nodePositions[nodeId] ?? { x: 0, y: 0 };
  dragState = {
    nodeId,
    startMouseX: e.clientX,
    startMouseY: e.clientY,
    startX: pos.x,
    startY: pos.y,
  };
  e.preventDefault();
}

function onCanvasMouseMove(e) {
  if (dragState) {
    const dx = e.clientX - dragState.startMouseX;
    const dy = e.clientY - dragState.startMouseY;
    const newX = Math.max(0, dragState.startX + dx);
    const newY = Math.max(0, dragState.startY + dy);
    // Only mutate layout state — NOT physical simulation state
    layoutMoveNode(wsState.blueprintLayout, dragState.nodeId, newX, newY);
    renderEngineeringNodes();
  }

  if (pendingConn.active) {
    const canvas = el('ws-eng-canvas');
    const rect = canvas?.getBoundingClientRect() ?? { left: 0, top: 0 };
    pendingConn.x = e.clientX - rect.left;
    pendingConn.y = e.clientY - rect.top;
    renderConnections(el('ws-eng-svg'), wsState.blueprint, wsState.blueprintLayout);
  }
}

function onCanvasMouseUp(e) {
  dragState = null;
  if (pendingConn.active) {
    pendingConn.active = false;
    renderEngineeringNodes();
  }
}

// ─── Interaction: connect ports ───────────────────────────────────────────────

function startPendingConnection(nodeId, portId, e) {
  const canvas = el('ws-eng-canvas');
  const rect = canvas?.getBoundingClientRect() ?? { left: 0, top: 0 };
  pendingConn.active = true;
  pendingConn.sourceNodeId = nodeId;
  pendingConn.sourcePortId = portId;
  pendingConn.x = e.clientX - rect.left;
  pendingConn.y = e.clientY - rect.top;
  e.preventDefault();
}

function finishConnection(targetNodeId, targetPortId) {
  if (!pendingConn.active) return;
  const { sourceNodeId, sourcePortId } = pendingConn;
  pendingConn.active = false;

  if (sourceNodeId === targetNodeId) return; // no self-connections

  const conn = blueprintConnect(wsState.blueprint, sourceNodeId, sourcePortId, targetNodeId, targetPortId);
  if (conn) {
    inspector.selectedConnId = conn.id;
  }
  renderEngineeringNodes();
}

// ─── Interaction: selection + inspector ───────────────────────────────────────

function selectNode(nodeId) {
  inspector.selectedNodeId = nodeId;
  inspector.selectedConnId = null;
  updateInspector();
  renderEngineeringNodes();
}

function selectConnection(connId) {
  inspector.selectedConnId = connId;
  inspector.selectedNodeId = null;
  updateInspector();
  renderEngineeringNodes();
}

function updateInspector() {
  const body = el('ws-inspector-body');
  if (!body) return;

  const { blueprint, world } = wsState;
  if (!blueprint) { body.textContent = 'No blueprint.'; return; }

  if (inspector.selectedNodeId) {
    const node = blueprint.nodes[inspector.selectedNodeId];
    if (!node) { body.textContent = 'Node not found.'; return; }
    body.innerHTML = formatNodeInspector(node, world);
  } else if (inspector.selectedConnId) {
    const conn = blueprint.connections[inspector.selectedConnId];
    const stream = Object.values(blueprint.streams).find(s => s.connectionId === inspector.selectedConnId);
    body.innerHTML = formatConnectionInspector(conn, stream);
  } else {
    body.textContent = 'Select a node or connection.';
  }
}

function formatNodeInspector(node, world) {
  let html = `<div class="ws-ins-type">${escHtml(node.nodeType.toUpperCase())}</div>`;
  html += `<div class="ws-ins-row"><b>ID:</b> ${escHtml(node.id)}</div>`;

  switch (node.nodeType) {
    case 'extractor': {
      const occ = world?.resourceOccurrences?.[node.occurrenceId];
      html += `<div class="ws-ins-row"><b>Occurrence:</b> ${escHtml(occ?.name ?? node.occurrenceId)}</div>`;
      html += `<div class="ws-ins-row"><b>Rate (prototype):</b> ${node.prototypeRateKgPerSecond} kg/s</div>`;
      html += `<div class="ws-ins-note">⚠ Prototype rate — not geological truth</div>`;
      break;
    }
    case 'hopper': {
      const mass = hopperStoredMassKg(node);
      const free = hopperFreeCapacityKg(node);
      html += `<div class="ws-ins-row"><b>Stored:</b> ${mass.toFixed(3)} kg</div>`;
      html += `<div class="ws-ins-row"><b>Capacity:</b> ${node.capacityKg} kg</div>`;
      html += `<div class="ws-ins-row"><b>Free:</b> ${free.toFixed(3)} kg</div>`;
      html += `<div class="ws-ins-row"><b>Particle size:</b> ${node.particleSizeMm != null ? node.particleSizeMm.toFixed(1) + ' mm' : 'empty'}</div>`;
      if (node.storedComponentsKg) {
        const total = mass;
        const compRows = Object.entries(node.storedComponentsKg)
          .filter(([, kg]) => kg > 0)
          .map(([cid, kg]) => {
            const pct = total > 0 ? (kg / total * 100).toFixed(1) : '0.0';
            return `<div class="ws-ins-comp-row"><span>${escHtml(cid)}</span><span>${kg.toFixed(3)} kg (${pct}%)</span></div>`;
          }).join('');
        if (compRows) html += `<div class="ws-ins-comp">${compRows}</div>`;
      }
      html += `<div class="ws-ins-action"><button class="ws-btn-disconnect" data-node-id="${escHtml(node.id)}">Remove all connections</button></div>`;
      break;
    }
    case 'crusher':
      html += `<div class="ws-ins-row"><b>Throughput:</b> ${node.throughputKgPerSecond} kg/s</div>`;
      html += `<div class="ws-ins-row"><b>Target size:</b> ${node.targetParticleSizeMm} mm</div>`;
      break;
    case 'magSep':
      html += `<div class="ws-ins-row"><b>Field strength:</b> ${node.fieldStrength}</div>`;
      html += `<div class="ws-ins-row"><b>Max feed size:</b> ${node.maxFeedParticleSizeMm} mm</div>`;
      break;
  }
  return html;
}

function formatConnectionInspector(conn, stream) {
  if (!conn) return 'Connection not found.';
  let html = `<div class="ws-ins-type">CONNECTION</div>`;
  html += `<div class="ws-ins-row"><b>From:</b> ${escHtml(conn.sourceNodeId)} / ${escHtml(conn.sourcePortId)}</div>`;
  html += `<div class="ws-ins-row"><b>To:</b> ${escHtml(conn.targetNodeId)} / ${escHtml(conn.targetPortId)}</div>`;
  if (stream) {
    html += `<div class="ws-ins-row"><b>Total flow:</b> ${(stream.totalMassFlowKgPerSecond ?? 0).toFixed(3)} kg/s</div>`;
    html += `<div class="ws-ins-row"><b>Particle size:</b> ${stream.particleSizeMm?.toFixed(1) ?? '—'} mm</div>`;
    if (stream.componentMassFlowKgPerSecond) {
      const compRows = Object.entries(stream.componentMassFlowKgPerSecond)
        .filter(([, r]) => r > 0)
        .map(([cid, r]) => `<div class="ws-ins-comp-row"><span>${escHtml(cid)}</span><span>${r.toFixed(4)} kg/s</span></div>`)
        .join('');
      if (compRows) html += `<div class="ws-ins-comp">${compRows}</div>`;
    }
  }
  html += `<div class="ws-ins-action"><button class="ws-btn-disconnect" data-conn-id="${escHtml(conn.id)}">Disconnect</button></div>`;
  return html;
}

// ─── Simulation loop ──────────────────────────────────────────────────────────

function onToggleSimulation() {
  if (wsState.simRunning) {
    stopSimulation();
  } else {
    startSimulation();
  }
}

function startSimulation() {
  if (wsState.simRunning) return;
  wsState.simRunning = true;
  wsState.simLastTime = performance.now();
  wsState.simAccumulatedS = 0;
  wsState.simRafId = requestAnimationFrame(simLoop);
  updateSimStatus();
  const btn = el('ws-sim-toggle');
  if (btn) btn.textContent = '⏸ Pause';
}

function stopSimulation() {
  wsState.simRunning = false;
  if (wsState.simRafId != null) {
    cancelAnimationFrame(wsState.simRafId);
    wsState.simRafId = null;
  }
  const btn = el('ws-sim-toggle');
  if (btn) btn.textContent = '▶ Run Simulation';
}

/**
 * Simulation loop — physical simulation advances at SIMULATION_STEP_S intervals,
 * UI renders at requestAnimationFrame rate. These are intentionally decoupled.
 */
function simLoop(now) {
  if (!wsState.simRunning) return;

  const elapsed = (now - wsState.simLastTime) / 1000;
  wsState.simLastTime = now;
  wsState.simAccumulatedS += elapsed;

  // Advance fixed-timestep simulation ticks
  while (wsState.simAccumulatedS >= SIMULATION_STEP_S) {
    simulationTick(wsState.blueprint, wsState.world, SIMULATION_STEP_S);
    wsState.simAccumulatedS -= SIMULATION_STEP_S;
  }

  // Re-render nodes + inspector at animation frame rate (layout is cheap)
  renderEngineeringNodes();

  wsState.simRafId = requestAnimationFrame(simLoop);
}

function updateSimStatus() {
  const status = el('ws-sim-status');
  if (!status) return;
  if (!wsState.blueprint) { status.textContent = ''; return; }
  const total = Object.values(wsState.blueprint.nodes)
    .filter(n => n.nodeType === 'hopper')
    .reduce((sum, h) => sum + hopperStoredMassKg(h), 0);
  status.textContent = `${wsState.simRunning ? '● ' : ''}Total stored: ${total.toFixed(2)} kg`;
}

function onResetEngineering() {
  stopSimulation();
  if (wsState.selectedOccurrenceId) {
    initEngineeringBlueprint(wsState.selectedOccurrenceId);
    inspector.selectedNodeId = null;
    inspector.selectedConnId = null;
    renderEngineeringNodes();
  }
}

// ─── Main workspace render ────────────────────────────────────────────────────

export function renderWorkspace() {
  const container = el('ws-main');
  if (!container) return;

  renderBreadcrumbs();

  switch (wsState.currentLevel) {
    case 'planet':
      renderPlanetWorkspace(container);
      break;
    case 'region':
      renderRegionWorkspace(container);
      break;
    case 'engineering':
      renderEngineeringWorkspace(container);
      // Attach canvas global event listeners after render
      requestAnimationFrame(() => {
        const canvas = el('ws-eng-canvas');
        if (canvas) {
          canvas.addEventListener('mousemove', onCanvasMouseMove);
          canvas.addEventListener('mouseup', onCanvasMouseUp);
        }
        // Inspector disconnect buttons
        const insp = el('ws-inspector-body');
        if (insp) {
          insp.addEventListener('click', e => {
            const btn = e.target.closest('.ws-btn-disconnect');
            if (!btn) return;
            if (btn.dataset.connId) {
              blueprintDisconnect(wsState.blueprint, btn.dataset.connId);
              inspector.selectedConnId = null;
            } else if (btn.dataset.nodeId) {
              // Remove all connections to/from this node
              const nid = btn.dataset.nodeId;
              for (const conn of Object.values(wsState.blueprint.connections)) {
                if (conn.sourceNodeId === nid || conn.targetNodeId === nid) {
                  blueprintDisconnect(wsState.blueprint, conn.id);
                }
              }
            }
            renderEngineeringNodes();
          });
        }
        // Global SVG mouse events for canvas
        const svgEl = el('ws-eng-svg');
        if (svgEl) {
          svgEl.addEventListener('mousemove', onCanvasMouseMove);
          svgEl.addEventListener('mouseup', onCanvasMouseUp);
        }
      });
      break;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialise the workspace with a world + knowledge state.
 * Called by app.js after world generation.
 *
 * @param {object} world
 * @param {object} knowledge
 */
export function initWorkspace(world, knowledge) {
  wsState.world = world;
  wsState.knowledge = knowledge;
  wsState.currentLevel = 'planet';
  wsState.selectedRegionId = null;
  wsState.selectedOccurrenceId = null;
  wsState.blueprint = null;
  wsState.blueprintLayout = null;
  stopSimulation();
  inspector.selectedNodeId = null;
  inspector.selectedConnId = null;
  renderWorkspace();
}

/**
 * Update knowledge (e.g. after feature discovery) without resetting navigation.
 *
 * @param {object} knowledge
 */
export function updateWorkspaceKnowledge(knowledge) {
  wsState.knowledge = knowledge;
  if (wsState.currentLevel !== 'engineering') {
    renderWorkspace();
  }
}
