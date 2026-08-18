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
import { hopperStoredMassKg, hopperFreeCapacityKg } from '../simulation/hopperNode.js';
import { totalMassFlowKgPerSecond } from '../simulation/materialStream.js';
import { isFeatureDiscovered, discoverFeature } from '../core/world/knowledgeState.js';

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
const PORT_RADIUS = 7;

const pendingConn = { active: false, sourceNodeId: null, sourcePortId: null, x: 0, y: 0 };
const pendingSystemConn = { active: false, sourceSystemId: null, sourcePortId: null, scopeId: null };
const inspector = {
  selectedNodeId: null,
  selectedConnId: null,
  selectedSystemId: null,
  message: '',
  renderKey: null,
};
let dragState = null;

function el(id) { return document.getElementById(id); }
function escHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
  if (region && wsState.currentLevel !== 'planet') crumbs.push({ label: region.name, level: 'region', clickable: wsState.currentLevel === 'engineering' });
  if (wsState.currentLevel === 'engineering') crumbs.push({ label: wsState.selectedSiteId ?? 'Site', level: 'engineering', clickable: false });

  container.innerHTML = `<span class="ws-world-controls"><button id="ws-world-toggle"></button><span id="ws-world-clock"></span></span>${crumbs.map(crumb => crumb.clickable
    ? `<button class="ws-breadcrumb" data-level="${crumb.level}">${escHtml(crumb.label)}</button>`
    : `<span class="ws-breadcrumb ws-breadcrumb--active">${escHtml(crumb.label)}</span>`).join('<span class="ws-breadcrumb-sep">›</span>')}`;
  container.querySelectorAll('.ws-breadcrumb[data-level]').forEach(button => button.addEventListener('click', () => navigateTo(button.dataset.level)));
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
  const siteImport = blueprintAddHopper(blueprint, DEFAULT_HOPPER_CAPACITY_KG);
  const extractor = blueprintAddExtractor(blueprint, occurrenceId, 5);
  const hopperA = blueprintAddHopper(blueprint, DEFAULT_HOPPER_CAPACITY_KG);
  const crusher = blueprintAddCrusher(blueprint, { throughputKgPerSecond: DEFAULT_CRUSHER_THROUGHPUT_KG_PER_S, targetParticleSizeMm: DEFAULT_CRUSHER_TARGET_PARTICLE_SIZE_MM });
  const hopperB = blueprintAddHopper(blueprint, DEFAULT_HOPPER_CAPACITY_KG);
  const magSep = blueprintAddMagSep(blueprint, { fieldStrength: DEFAULT_MAG_SEP_FIELD_STRENGTH });
  const concentrateHopper = blueprintAddHopper(blueprint, DEFAULT_HOPPER_CAPACITY_KG);
  const tailingsHopper = blueprintAddHopper(blueprint, DEFAULT_HOPPER_CAPACITY_KG);

  const positions = [
    [siteImport, 60, 300], [extractor, 60, 140], [hopperA, 260, 140], [crusher, 460, 140],
    [hopperB, 660, 140], [magSep, 860, 140], [concentrateHopper, 1060, 60], [tailingsHopper, 1060, 220],
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
    setBoundaryMapping(siteNode, 'material-input', siteImport.id, siteImport.inputPortId, blueprint);
    setBoundaryMapping(siteNode, 'material-output', concentrateHopper.id, concentrateHopper.outputPortId, blueprint);
  }

  return { id: siteId, siteId, occurrenceId, blueprint, blueprintLayout, boundaryNode: siteNode };
}

function ensureRegionalExportTransfer(siteId) {
  const site = wsState.world?.sites?.[siteId];
  if (!site) return;
  const terminalId = `${site.regionId}-export-terminal`;
  const existing = Object.values(wsState.world.simulation.transfers ?? {}).find(t => t.scopeId === site.regionId && t.sourceCompositeId === siteId);
  if (existing) return existing;
  try {
    return registerBoundaryTransfer(wsState.world, {
      sourceCompositeId: siteId,
      sourcePortId: 'material-output',
      targetCompositeId: terminalId,
      targetPortId: 'material-input',
      capacityKgPerSecond: 10,
      priority: 0,
      scopeId: site.regionId,
    });
  } catch (error) {
    return null;
  }
}

function activateEngineeringSession(occurrenceId, siteId) {
  if (!siteId) return;
  let session = wsState.engineeringSessions[siteId];
  if (!session) {
    session = createEngineeringSession(occurrenceId, siteId);
    wsState.engineeringSessions[siteId] = session;
    registerSimulationSession(wsState.world, siteId, session.blueprint, session.boundaryNode?.childWorkspaceId);
    ensureRegionalExportTransfer(siteId);
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
  inspector.message = '';
  inspector.renderKey = null;
  renderWorkspace();
}

function knownSiteIds(region) {
  return (region.siteIds ?? []).filter(siteId => {
    const featureId = wsState.world?.sites?.[siteId]?.featureId;
    return featureId && isFeatureDiscovered(wsState.knowledge, featureId);
  });
}

function systemPortHtml(systemId, port, scopeId) {
  return `<span class="ws-system-port ws-system-port--${port.direction}" data-system-id="${escHtml(systemId)}" data-port-id="${escHtml(port.id)}" data-scope-id="${escHtml(scopeId)}" title="${escHtml(port.label)}">${port.direction === 'input' ? '○ ' : ''}${escHtml(port.label)}${port.direction === 'output' ? ' ○' : ''}</span>`;
}

function attachSystemPortHandlers(container) {
  container.querySelectorAll('.ws-system-port--output').forEach(port => port.addEventListener('mousedown', event => {
    event.stopPropagation();
    pendingSystemConn.active = true;
    pendingSystemConn.sourceSystemId = port.dataset.systemId;
    pendingSystemConn.sourcePortId = port.dataset.portId;
    pendingSystemConn.scopeId = port.dataset.scopeId;
    inspector.message = 'Choose a compatible input port.';
    updateCompositeInspector(true);
  }));
  container.querySelectorAll('.ws-system-port--input').forEach(port => port.addEventListener('mouseup', event => {
    if (!pendingSystemConn.active) return;
    event.stopPropagation();
    try {
      registerBoundaryTransfer(wsState.world, {
        sourceCompositeId: pendingSystemConn.sourceSystemId,
        sourcePortId: pendingSystemConn.sourcePortId,
        targetCompositeId: port.dataset.systemId,
        targetPortId: port.dataset.portId,
        capacityKgPerSecond: 10,
        priority: pendingSystemConn.scopeId === wsState.world.planetId ? 1 : 0,
        scopeId: pendingSystemConn.scopeId,
      });
      inspector.message = 'Transfer connected.';
    } catch (error) {
      inspector.message = error.message;
    }
    pendingSystemConn.active = false;
    renderWorkspace();
  }));
}

function renderPlanetWorkspace(container) {
  const planet = currentPlanet();
  if (!planet) {
    container.innerHTML = `<div class="ws-site-card"><div class="ws-site-name">Create Prototype World</div><div class="ws-site-type">Generate a deterministic planet without leaving Player View.</div><label for="ws-player-seed">Seed</label><input id="ws-player-seed" type="text" placeholder="Enter seed or leave blank for random"><button id="ws-player-generate">Generate World</button></div>`;
    el('ws-player-generate')?.addEventListener('click', () => requestPlayerWorldGeneration(el('ws-player-seed')?.value ?? ''));
    el('ws-player-seed')?.addEventListener('keydown', event => { if (event.key === 'Enter') requestPlayerWorldGeneration(event.currentTarget.value ?? ''); });
    return;
  }

  const cards = (planet.regions ?? []).map(regionId => {
    const region = wsState.world.regions[regionId];
    const node = wsState.world.systemNodes[regionId];
    const featureIds = region.features ?? [];
    const discoveredCount = featureIds.filter(fid => isFeatureDiscovered(wsState.knowledge, fid)).length;
    const knownSites = knownSiteIds(region);
    return `<div class="ws-system-card ${inspector.selectedSystemId === regionId ? 'ws-system-selected' : ''}" data-system-id="${escHtml(regionId)}">
      <div class="ws-region-card-name">${escHtml(region.name)}</div>
      <div class="ws-region-card-meta">${escHtml(region.surfaceCover)} · ${region.areaPercent}% area</div>
      <div class="ws-region-card-features">Features: ${discoveredCount} / ${featureIds.length} known · Known sites: ${knownSites.length}</div>
      <div class="ws-system-ports">${node.ports.map(port => systemPortHtml(node.id, port, planet.id)).join('')}</div>
      <button class="ws-region-card-enter" data-enter-region="${escHtml(regionId)}">Enter →</button>
    </div>`;
  }).join('');

  container.innerHTML = `<div class="ws-planet-header"><div class="ws-planet-name">${escHtml(planet.name)}</div><div class="ws-planet-meta">${escHtml(planet.planetType)} · ${planet.massEarth} M⊕ · ${planet.gravityG}g</div></div><div class="ws-parent-layout"><div class="ws-system-grid">${cards}</div><div class="ws-composite-inspector"><div class="ws-inspector-title">Inspector</div><div id="ws-composite-inspector-body"></div></div></div>`;
  container.querySelectorAll('[data-enter-region]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); navigateTo('region', { regionId: button.dataset.enterRegion }); }));
  container.querySelectorAll('.ws-system-card[data-system-id]').forEach(card => card.addEventListener('click', event => { if (!event.target.closest('button,.ws-system-port')) selectSystem(card.dataset.systemId); }));
  attachSystemPortHandlers(container);
  updateCompositeInspector(true);
}

function renderRegionWorkspace(container) {
  const region = wsState.world?.regions?.[wsState.selectedRegionId];
  if (!region) { container.innerHTML = '<p class="ws-empty">No region selected.</p>'; return; }
  let hasKnownCompatibleSite = false;
  let prototypeSurveyFeatureId = null;
  const siteCards = [];

  for (const featureId of region.features ?? []) {
    const feature = wsState.world.features[featureId];
    const occurrence = compatibleOccurrenceForFeature(feature);
    if (!isFeatureDiscovered(wsState.knowledge, featureId)) {
      if (!prototypeSurveyFeatureId && occurrence) prototypeSurveyFeatureId = featureId;
      continue;
    }
    const siteId = `site-${feature.id}`;
    const site = wsState.world.sites?.[siteId];
    if (!site) continue;
    if (occurrence) hasKnownCompatibleSite = true;
    const node = wsState.world.systemNodes[siteId];
    siteCards.push(`<div class="ws-system-card ${inspector.selectedSystemId === siteId ? 'ws-system-selected' : ''}" data-system-id="${escHtml(siteId)}">
      <div class="ws-site-name">${escHtml(feature.name)}</div><div class="ws-site-type">${escHtml(feature.type)} · ${escHtml(feature.quantityClass)}</div>
      ${occurrence ? `<span class="ws-badge ws-badge--ore">${escHtml(occurrence.name)}</span>` : ''}
      <div class="ws-system-ports">${node.ports.map(port => systemPortHtml(node.id, port, region.id)).join('')}</div>
      ${occurrence ? `<button class="ws-site-enter-btn" data-site-id="${escHtml(siteId)}" data-occurrence-id="${escHtml(occurrence.id)}">Enter Site →</button>` : ''}
    </div>`);
  }

  const terminalId = `${region.id}-export-terminal`;
  const terminal = wsState.world.systemNodes?.[terminalId];
  const terminalCard = terminal ? `<div class="ws-system-card ${inspector.selectedSystemId === terminalId ? 'ws-system-selected' : ''}" data-system-id="${escHtml(terminalId)}"><div class="ws-site-name">Regional Export</div><div class="ws-site-type">Physical export buffer / transfer terminal</div><div class="ws-system-ports">${terminal.ports.map(port => systemPortHtml(terminal.id, port, region.id)).join('')}</div></div>` : '';
  const prototypeSurvey = !hasKnownCompatibleSite && prototypeSurveyFeatureId ? `<div class="ws-site-card"><div class="ws-site-name">Prototype Survey Bootstrap</div><button id="ws-prototype-survey" data-feature-id="${escHtml(prototypeSurveyFeatureId)}">Survey One Compatible Site</button></div>` : '';

  container.innerHTML = `<div class="ws-region-header"><div class="ws-region-heading">${escHtml(region.name)}</div><div class="ws-region-desc">${escHtml(region.surfaceCover)} · ${region.areaPercent}% area</div></div>${prototypeSurvey}<div class="ws-parent-layout"><div class="ws-system-grid">${siteCards.join('')}${terminalCard}</div><div class="ws-composite-inspector"><div class="ws-inspector-title">Inspector</div><div id="ws-composite-inspector-body"></div></div></div>`;
  container.querySelectorAll('.ws-site-enter-btn').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); navigateTo('site', { siteId: button.dataset.siteId, occurrenceId: button.dataset.occurrenceId }); }));
  container.querySelectorAll('.ws-system-card[data-system-id]').forEach(card => card.addEventListener('click', event => { if (!event.target.closest('button,.ws-system-port')) selectSystem(card.dataset.systemId); }));
  attachSystemPortHandlers(container);
  el('ws-prototype-survey')?.addEventListener('click', event => { discoverFeature(wsState.knowledge, event.currentTarget.dataset.featureId); document.dispatchEvent(new CustomEvent('interlink:knowledge-updated')); renderWorkspace(); });
  updateCompositeInspector(true);
}

function selectSystem(systemId) {
  inspector.selectedSystemId = systemId;
  inspector.selectedNodeId = null;
  inspector.selectedConnId = null;
  inspector.message = '';
  inspector.renderKey = null;
  renderWorkspace();
}

function formatCompositeInspector(node) {
  if (!node) return 'Select a system.';
  let html = `<div class="ws-ins-type">${escHtml(node.systemType?.toUpperCase() ?? node.nodeType.toUpperCase())}</div><div class="ws-ins-row"><b>ID:</b> ${escHtml(node.id)}</div>`;
  if (node.nodeType === 'region') {
    const region = wsState.world.regions[node.id];
    html += `<div class="ws-ins-row"><b>Known sites:</b> ${knownSiteIds(region).length}</div>`;
    const workspace = getSimulationWorkspace(wsState.world, node.childWorkspaceId);
    const imported = workspace?.nodes?.[`${node.id}-import-hopper`];
    const exported = workspace?.nodes?.[`${node.id}-export-hopper`];
    html += `<div class="ws-ins-row"><b>Import buffer:</b> <span data-live="region-import">${(imported ? hopperStoredMassKg(imported) : 0).toFixed(2)}</span> kg</div>`;
    html += `<div class="ws-ins-row"><b>Export buffer:</b> <span data-live="region-export">${(exported ? hopperStoredMassKg(exported) : 0).toFixed(2)}</span> kg</div>`;
  } else if (node.nodeType === 'site') {
    const site = wsState.world.sites[node.id];
    html += `<div class="ws-ins-row"><b>Region:</b> ${escHtml(site.regionId)}</div>`;
    html += `<div class="ws-ins-row"><b>Known occurrences:</b> ${isFeatureDiscovered(wsState.knowledge, site.featureId) ? site.resourceOccurrenceIds.length : 0}</div>`;
    const session = wsState.engineeringSessions[node.id];
    const outputPort = getSystemNodePort(node, 'material-output');
    const outputHopper = session?.blueprint.nodes?.[outputPort?.childNodeId];
    html += `<div class="ws-ins-row"><b>External output stored:</b> <span data-live="site-output">${(outputHopper ? hopperStoredMassKg(outputHopper) : 0).toFixed(2)}</span> kg</div>`;
  } else if (node.nodeType === 'transfer-terminal') {
    const regionId = node.inspectableState.regionId;
    const regionNode = wsState.world.systemNodes[regionId];
    const workspace = getSimulationWorkspace(wsState.world, regionNode.childWorkspaceId);
    const hopper = workspace?.nodes?.[`${regionId}-export-hopper`];
    html += `<div class="ws-ins-row"><b>Buffered:</b> <span data-live="terminal-buffer">${(hopper ? hopperStoredMassKg(hopper) : 0).toFixed(2)}</span> kg</div>`;
  }
  html += `<div class="ws-ins-row"><b>Ports:</b> ${node.ports.map(p => `${escHtml(p.label)} (${p.direction})`).join(', ') || 'none'}</div>`;
  const transfers = Object.values(wsState.world.simulation.transfers ?? {}).filter(t => t.sourceCompositeId === node.id || t.targetCompositeId === node.id);
  for (const t of transfers) html += `<div class="ws-ins-row">Transfer ${escHtml(t.id)}: <span data-transfer-rate="${escHtml(t.id)}">${t.lastRateKgPerSecond.toFixed(2)}</span> kg/s <button class="ws-btn-remove-transfer" data-transfer-id="${escHtml(t.id)}">Disconnect</button></div>`;
  return html;
}

function updateCompositeInspector(force = false) {
  const body = el('ws-composite-inspector-body');
  if (!body) return;
  const node = wsState.world?.systemNodes?.[inspector.selectedSystemId];
  const key = `system:${node?.id ?? 'none'}:${inspector.message}`;
  if (force || inspector.renderKey !== key) {
    body.innerHTML = `${inspector.message ? `<div class="ws-ins-note">${escHtml(inspector.message)}</div>` : ''}${node ? formatCompositeInspector(node) : 'Select a Region, Site, or transfer node.'}`;
    inspector.renderKey = key;
    body.querySelectorAll('.ws-btn-remove-transfer').forEach(button => button.addEventListener('click', () => { removeBoundaryTransfer(wsState.world, button.dataset.transferId); inspector.renderKey = null; renderWorkspace(); }));
    return;
  }
  if (node?.nodeType === 'region') {
    const workspace = getSimulationWorkspace(wsState.world, node.childWorkspaceId);
    const imp = workspace?.nodes?.[`${node.id}-import-hopper`];
    const exp = workspace?.nodes?.[`${node.id}-export-hopper`];
    if (body.querySelector('[data-live="region-import"]')) body.querySelector('[data-live="region-import"]').textContent = (imp ? hopperStoredMassKg(imp) : 0).toFixed(2);
    if (body.querySelector('[data-live="region-export"]')) body.querySelector('[data-live="region-export"]').textContent = (exp ? hopperStoredMassKg(exp) : 0).toFixed(2);
  }
  body.querySelectorAll('[data-transfer-rate]').forEach(span => { const t = wsState.world.simulation.transfers[span.dataset.transferRate]; if (t) span.textContent = t.lastRateKgPerSecond.toFixed(2); });
}

function nodeLabel(node) {
  if (node.nodeType === 'extractor') return `Extractor [${getNodeOperatingState(node)}]\n${wsState.world?.resourceOccurrences?.[node.occurrenceId]?.name ?? node.occurrenceId}\n${node.prototypeRateKgPerSecond} kg/s`;
  if (node.nodeType === 'hopper') { const mass = hopperStoredMassKg(node); return `Hopper\n${mass.toFixed(1)} / ${node.capacityKg} kg\n${(mass / node.capacityKg * 100).toFixed(0)}%`; }
  if (node.nodeType === 'crusher') return `Crusher [${getNodeOperatingState(node)}]\n→ ${node.targetParticleSizeMm} mm\n${node.throughputKgPerSecond} kg/s`;
  if (node.nodeType === 'magSep') return `Mag. Sep. [${getNodeOperatingState(node)}]\nB=${node.fieldStrength}\n${node.throughputKgPerSecond} kg/s`;
  return node.nodeType;
}
function portOffsets(port, index, count) { const step = NODE_HEIGHT / (count + 1); return { dx: port.direction === 'input' ? 0 : NODE_WIDTH, dy: step * (index + 1) }; }

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
        dot.style.left = `${offset.dx - PORT_RADIUS}px`; dot.style.top = `${offset.dy - PORT_RADIUS}px`;
        dot.dataset.nodeId = node.id; dot.dataset.portId = port.id;
        if (direction === 'output') dot.addEventListener('mousedown', event => { event.stopPropagation(); startPendingConnection(node.id, port.id, event); });
        else dot.addEventListener('mouseup', event => { if (pendingConn.active) { event.stopPropagation(); finishConnection(node.id, port.id); } });
        nodeElement.appendChild(dot);
      });
    }
    nodeElement.addEventListener('mousedown', event => { if (!event.target.classList.contains('ws-port')) startNodeDrag(node.id, event); });
    nodeElement.addEventListener('click', event => { if (!event.target.classList.contains('ws-port')) selectNode(node.id); });
    wsState.nodeElements.set(node.id, nodeElement); canvas.appendChild(nodeElement);
  }
  nodeElement.className = `ws-node ws-node--${node.nodeType}`;
  nodeElement.classList.toggle('ws-node--selected', inspector.selectedNodeId === node.id);
  Object.assign(nodeElement.style, { left: `${position.x}px`, top: `${position.y}px`, width: `${NODE_WIDTH}px`, height: `${NODE_HEIGHT}px` });
  const label = nodeElement.querySelector('.ws-node-label'); if (label) label.innerHTML = nodeLabel(node).split('\n').map(line => `<span>${escHtml(line)}</span>`).join('');
  const fill = nodeElement.querySelector('.ws-hopper-fill'); if (fill && node.nodeType === 'hopper') fill.style.height = `${Math.min(100, hopperStoredMassKg(node) / node.capacityKg * 100).toFixed(1)}%`;
}

function portCanvasPosition(nodeId, portId) {
  const node = wsState.blueprint.nodes[nodeId]; const position = wsState.blueprintLayout.nodePositions[nodeId] ?? { x: 0, y: 0 };
  const ports = getNodePortDefinitions(node); const port = ports.find(p => p.id === portId); if (!port) return position;
  const side = ports.filter(p => p.direction === port.direction); const offset = portOffsets(port, side.indexOf(port), side.length);
  return { x: position.x + offset.dx, y: position.y + offset.dy };
}

function renderConnections(svg) {
  let maxX = 800, maxY = 400;
  for (const pos of Object.values(wsState.blueprintLayout.nodePositions)) { maxX = Math.max(maxX, pos.x + NODE_WIDTH + 40); maxY = Math.max(maxY, pos.y + NODE_HEIGHT + 40); }
  svg.setAttribute('width', maxX); svg.setAttribute('height', maxY); svg.style.width = `${maxX}px`; svg.style.height = `${maxY}px`;
  const activeIds = new Set();
  for (const connection of Object.values(wsState.blueprint.connections)) {
    activeIds.add(connection.id);
    let path = wsState.connectionElements.get(connection.id);
    if (!path || !svg.contains(path)) {
      path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('fill', 'none'); path.setAttribute('cursor', 'pointer'); path.classList.add('ws-connection');
      path.addEventListener('click', () => selectConnection(connection.id)); svg.appendChild(path); wsState.connectionElements.set(connection.id, path);
    }
    const source = portCanvasPosition(connection.sourceNodeId, connection.sourcePortId); const target = portCanvasPosition(connection.targetNodeId, connection.targetPortId); const midX = (source.x + target.x) / 2;
    const stream = getStreamForConnection(wsState.blueprint, connection.id); const flow = stream ? totalMassFlowKgPerSecond(stream.componentMassFlowKgPerSecond) : 0;
    path.setAttribute('d', `M ${source.x} ${source.y} C ${midX} ${source.y}, ${midX} ${target.y}, ${target.x} ${target.y}`); path.setAttribute('stroke-width', Math.max(1.5, Math.min(6, 1.5 + flow * 0.5)));
    path.classList.toggle('ws-connection--selected', inspector.selectedConnId === connection.id);
  }
  for (const [id, path] of wsState.connectionElements) if (!activeIds.has(id)) { path.remove(); wsState.connectionElements.delete(id); }
  if (pendingConn.active) {
    if (!wsState.connectionPreview || !svg.contains(wsState.connectionPreview)) { wsState.connectionPreview = document.createElementNS('http://www.w3.org/2000/svg', 'line'); wsState.connectionPreview.classList.add('ws-connection-preview'); svg.appendChild(wsState.connectionPreview); }
    const source = portCanvasPosition(pendingConn.sourceNodeId, pendingConn.sourcePortId); wsState.connectionPreview.setAttribute('x1', source.x); wsState.connectionPreview.setAttribute('y1', source.y); wsState.connectionPreview.setAttribute('x2', pendingConn.x); wsState.connectionPreview.setAttribute('y2', pendingConn.y);
  } else if (wsState.connectionPreview) { wsState.connectionPreview.remove(); wsState.connectionPreview = null; }
}

function renderEngineeringNodes() {
  const canvas = el('ws-eng-canvas'), svg = el('ws-eng-svg'); if (!canvas || !svg || !wsState.blueprint) return;
  const nodeIds = new Set(Object.keys(wsState.blueprint.nodes)); for (const [id, element] of wsState.nodeElements) if (!nodeIds.has(id)) { element.remove(); wsState.nodeElements.delete(id); }
  for (const node of Object.values(wsState.blueprint.nodes)) renderNode(canvas, node, wsState.blueprintLayout.nodePositions[node.id] ?? { x: 0, y: 0 });
  renderConnections(svg); updateInspector(); updateSimStatus();
}

function renderEngineeringWorkspace(container) {
  if (!wsState.selectedOccurrenceId) { container.innerHTML = '<p class="ws-empty">No resource occurrence selected.</p>'; return; }
  activateEngineeringSession(wsState.selectedOccurrenceId, wsState.selectedSiteId);
  wsState.nodeElements.clear(); wsState.connectionElements.clear(); wsState.connectionPreview = null; inspector.renderKey = null;
  container.innerHTML = `<div class="ws-eng-toolbar"><span class="ws-eng-title">Site — ${escHtml(wsState.selectedSiteId)}</span><span class="ws-site-boundary-label">Boundary ports: material in / material out</span><button id="ws-sim-reset">↺ Reset Site</button><span id="ws-sim-status" class="ws-sim-status"></span></div><div class="ws-eng-layout"><div class="ws-canvas-wrap"><svg id="ws-eng-svg" class="ws-eng-svg"></svg><div id="ws-eng-canvas" class="ws-eng-canvas"></div></div><div id="ws-inspector" class="ws-inspector"><div class="ws-inspector-title">Inspector</div><div id="ws-inspector-body" class="ws-inspector-body">Select a node or connection.</div></div></div>`;
  el('ws-sim-reset')?.addEventListener('click', onResetEngineering); el('ws-inspector-body')?.addEventListener('click', onInspectorClick); renderEngineeringNodes();
  el('ws-eng-canvas')?.addEventListener('mousemove', onCanvasMouseMove); el('ws-eng-canvas')?.addEventListener('mouseup', onCanvasMouseUp); el('ws-eng-svg')?.addEventListener('mousemove', onCanvasMouseMove); el('ws-eng-svg')?.addEventListener('mouseup', onCanvasMouseUp);
}

function startNodeDrag(nodeId, event) { const pos = wsState.blueprintLayout.nodePositions[nodeId] ?? { x: 0, y: 0 }; dragState = { nodeId, startMouseX: event.clientX, startMouseY: event.clientY, startX: pos.x, startY: pos.y }; event.preventDefault(); }
function startPendingConnection(nodeId, portId, event) { const canvas = el('ws-eng-canvas'); const rect = canvas?.getBoundingClientRect() ?? { left: 0, top: 0 }; Object.assign(pendingConn, { active: true, sourceNodeId: nodeId, sourcePortId: portId, x: event.clientX - rect.left + (canvas?.scrollLeft ?? 0), y: event.clientY - rect.top + (canvas?.scrollTop ?? 0) }); event.preventDefault(); }
function finishConnection(targetNodeId, targetPortId) { if (!pendingConn.active) return; const check = checkBlueprintConnection(wsState.blueprint, pendingConn.sourceNodeId, pendingConn.sourcePortId, targetNodeId, targetPortId); pendingConn.active = false; if (!check.ok) inspector.message = check.reason; else { const c = blueprintConnect(wsState.blueprint, pendingConn.sourceNodeId, pendingConn.sourcePortId, targetNodeId, targetPortId); if (c) { inspector.selectedConnId = c.id; inspector.selectedNodeId = null; inspector.message = ''; } } inspector.renderKey = null; renderEngineeringNodes(); }
function onCanvasMouseMove(event) { if (dragState) { layoutMoveNode(wsState.blueprintLayout, dragState.nodeId, Math.max(0, dragState.startX + event.clientX - dragState.startMouseX), Math.max(0, dragState.startY + event.clientY - dragState.startMouseY)); renderEngineeringNodes(); } if (pendingConn.active) { const canvas = el('ws-eng-canvas'); const rect = canvas?.getBoundingClientRect() ?? { left: 0, top: 0 }; pendingConn.x = event.clientX - rect.left + (canvas?.scrollLeft ?? 0); pendingConn.y = event.clientY - rect.top + (canvas?.scrollTop ?? 0); renderConnections(el('ws-eng-svg')); } }
function onCanvasMouseUp() { dragState = null; if (pendingConn.active) { pendingConn.active = false; renderConnections(el('ws-eng-svg')); } }
function selectNode(nodeId) { inspector.selectedNodeId = nodeId; inspector.selectedConnId = null; inspector.message = ''; inspector.renderKey = null; renderEngineeringNodes(); }
function selectConnection(connectionId) { inspector.selectedNodeId = null; inspector.selectedConnId = connectionId; inspector.message = ''; inspector.renderKey = null; renderEngineeringNodes(); }

function formatNodeInspector(node) {
  let html = `<div class="ws-ins-type">${escHtml(node.nodeType.toUpperCase())}</div><div class="ws-ins-row"><b>ID:</b> ${escHtml(node.id)}</div>`;
  if (['extractor', 'crusher', 'magSep'].includes(node.nodeType)) html += `<div class="ws-ins-row"><b>State:</b> <span data-live="state">${escHtml(getNodeOperatingState(node) ?? 'off')}</span></div><div class="ws-ins-row"><b>Enabled:</b> <button class="ws-btn-enable" data-node-id="${escHtml(node.id)}">${node.enabled ? 'On' : 'Off'}</button></div>`;
  if (node.nodeType === 'extractor') html += `<div class="ws-ins-row"><b>Occurrence:</b> ${escHtml(wsState.world?.resourceOccurrences?.[node.occurrenceId]?.name ?? node.occurrenceId)}</div><div class="ws-ins-row"><b>Prototype rate:</b> ${node.prototypeRateKgPerSecond} kg/s</div>`;
  else if (node.nodeType === 'hopper') html += `<div class="ws-ins-row"><b>Stored:</b> <span data-live="stored">${hopperStoredMassKg(node).toFixed(3)}</span> kg</div><div class="ws-ins-row"><b>Capacity:</b> ${node.capacityKg} kg</div><div class="ws-ins-row"><b>Free:</b> <span data-live="free">${hopperFreeCapacityKg(node).toFixed(3)}</span> kg</div>`;
  else if (node.nodeType === 'crusher') html += `<div class="ws-ins-row"><b>Throughput:</b> ${node.throughputKgPerSecond} kg/s</div><div class="ws-ins-row"><b>Target size:</b> ${node.targetParticleSizeMm} mm</div>`;
  else if (node.nodeType === 'magSep') html += `<div class="ws-ins-row"><b>Throughput:</b> ${node.throughputKgPerSecond} kg/s</div><div class="ws-ins-row"><b>Field strength:</b> ${node.fieldStrength}</div>`;
  html += `<div class="ws-ins-action"><button class="ws-btn-disconnect" data-node-id="${escHtml(node.id)}">Remove all connections</button></div>`;
  return html;
}
function formatConnectionInspector(connection) { const stream = getStreamForConnection(wsState.blueprint, connection.id); const flow = stream ? totalMassFlowKgPerSecond(stream.componentMassFlowKgPerSecond) : 0; return `<div class="ws-ins-type">CONNECTION</div><div class="ws-ins-row"><b>From:</b> ${escHtml(connection.sourceNodeId)} / ${escHtml(connection.sourcePortId)}</div><div class="ws-ins-row"><b>To:</b> ${escHtml(connection.targetNodeId)} / ${escHtml(connection.targetPortId)}</div><div class="ws-ins-row"><b>Total flow:</b> <span data-live="flow">${flow.toFixed(3)}</span> kg/s</div><div class="ws-ins-action"><button class="ws-btn-disconnect" data-conn-id="${escHtml(connection.id)}">Disconnect</button></div>`; }
function updateInspector(force = false) {
  const body = el('ws-inspector-body'); if (!body || !wsState.blueprint) return;
  const key = `${inspector.selectedNodeId ?? ''}:${inspector.selectedConnId ?? ''}:${inspector.message}`;
  if (force || inspector.renderKey !== key) { let html = inspector.message ? `<div class="ws-ins-note">${escHtml(inspector.message)}</div>` : ''; if (inspector.selectedNodeId) html += formatNodeInspector(wsState.blueprint.nodes[inspector.selectedNodeId]); else if (inspector.selectedConnId) html += formatConnectionInspector(wsState.blueprint.connections[inspector.selectedConnId]); else if (!html) html = 'Select a node or connection.'; body.innerHTML = html; inspector.renderKey = key; return; }
  if (inspector.selectedNodeId) { const node = wsState.blueprint.nodes[inspector.selectedNodeId]; const state = body.querySelector('[data-live="state"]'); if (state) state.textContent = getNodeOperatingState(node) ?? 'off'; const stored = body.querySelector('[data-live="stored"]'); if (stored) stored.textContent = hopperStoredMassKg(node).toFixed(3); const free = body.querySelector('[data-live="free"]'); if (free) free.textContent = hopperFreeCapacityKg(node).toFixed(3); }
  if (inspector.selectedConnId) { const stream = getStreamForConnection(wsState.blueprint, inspector.selectedConnId); const flow = body.querySelector('[data-live="flow"]'); if (flow) flow.textContent = (stream ? totalMassFlowKgPerSecond(stream.componentMassFlowKgPerSecond) : 0).toFixed(3); }
}
function onInspectorClick(event) { const enable = event.target.closest('.ws-btn-enable'); if (enable) { const node = wsState.blueprint.nodes[enable.dataset.nodeId]; if (node) setNodeEnabled(wsState.blueprint, node.id, !node.enabled); inspector.renderKey = null; updateInspector(true); return; } const button = event.target.closest('.ws-btn-disconnect'); if (!button) return; if (button.dataset.connId) { blueprintDisconnect(wsState.blueprint, button.dataset.connId); inspector.selectedConnId = null; } else if (button.dataset.nodeId) for (const c of [...Object.values(wsState.blueprint.connections)]) if (c.sourceNodeId === button.dataset.nodeId || c.targetNodeId === button.dataset.nodeId) blueprintDisconnect(wsState.blueprint, c.id); inspector.renderKey = null; renderEngineeringNodes(); }

function onToggleWorldSimulation() { if (wsState.world?.simulation?.running) stopSimulation(); else startSimulation(); updateWorldControls(); }
function startSimulation() { if (wsState.simRunning || !wsState.world) return; resumeWorldSimulation(wsState.world); wsState.simRunning = true; wsState.simLastTime = performance.now(); wsState.simAccumulatedS = 0; wsState.simRafId = requestAnimationFrame(simLoop); updateWorldControls(); }
function stopSimulation() { wsState.simRunning = false; if (wsState.world) pauseWorldSimulation(wsState.world); if (wsState.simRafId != null) cancelAnimationFrame(wsState.simRafId); wsState.simRafId = null; updateWorldControls(); }
function simLoop(now) { if (!wsState.simRunning) return; const elapsed = Math.min((now - wsState.simLastTime) / 1000, 0.25); wsState.simLastTime = now; wsState.simAccumulatedS += elapsed; while (wsState.simAccumulatedS >= SIMULATION_STEP_S) { worldSimulationTick(wsState.world, SIMULATION_STEP_S); wsState.simAccumulatedS -= SIMULATION_STEP_S; } updateWorldControls(); if (wsState.currentLevel === 'engineering') renderEngineeringNodes(); else updateCompositeInspector(); wsState.simRafId = requestAnimationFrame(simLoop); }
function updateSimStatus() { const status = el('ws-sim-status'); if (!status || !wsState.blueprint) return; const stored = Object.values(wsState.blueprint.nodes).filter(n => n.nodeType === 'hopper').reduce((sum, h) => sum + hopperStoredMassKg(h), 0); status.textContent = `${wsState.world?.simulation?.running ? '● ' : ''}Stored ${stored.toFixed(2)} kg · Extracted ${(wsState.blueprint.simulationStats?.extractedKg ?? 0).toFixed(2)} kg`; }
function onResetEngineering() { const occurrenceId = wsState.selectedOccurrenceId, siteId = wsState.selectedSiteId; if (!occurrenceId || !siteId) return; const session = createEngineeringSession(occurrenceId, siteId); wsState.engineeringSessions[siteId] = session; registerSimulationSession(wsState.world, siteId, session.blueprint, session.boundaryNode?.childWorkspaceId); wsState.blueprint = session.blueprint; wsState.blueprintLayout = session.blueprintLayout; ensureRegionalExportTransfer(siteId); inspector.selectedNodeId = null; inspector.selectedConnId = null; inspector.renderKey = null; renderEngineeringWorkspace(el('ws-main')); }

export function renderWorkspace() { const container = el('ws-main'); if (!container) return; renderBreadcrumbs(); if (wsState.currentLevel === 'region') renderRegionWorkspace(container); else if (wsState.currentLevel === 'engineering') renderEngineeringWorkspace(container); else renderPlanetWorkspace(container); }
export function initWorkspace(world, knowledge) { if (wsState.world) stopSimulation(); wsState.world = world; createWorldSimulation(world); wsState.knowledge = knowledge; wsState.currentLevel = 'planet'; wsState.selectedRegionId = null; wsState.selectedSiteId = null; wsState.selectedOccurrenceId = null; wsState.blueprint = null; wsState.blueprintLayout = null; wsState.engineeringSessions = {}; wsState.nodeElements.clear(); wsState.connectionElements.clear(); inspector.selectedNodeId = null; inspector.selectedConnId = null; inspector.selectedSystemId = null; inspector.message = ''; inspector.renderKey = null; renderWorkspace(); startSimulation(); }
export function updateWorkspaceKnowledge(knowledge) { wsState.knowledge = knowledge; if (wsState.currentLevel !== 'engineering') renderWorkspace(); }

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', renderWorkspace);
