/** Player-facing recursive workspace and live simulation UI. */

import {
  blueprintConnect,
  blueprintDisconnect,
  checkBlueprintConnection,
  getNodePortDefinitions,
  getStreamForConnection,
  setApparatusParameter,
  setNodeEnabled,
  getNodeOperatingState,
  layoutMoveNode,
  SIMULATION_STEP_S,
} from '../simulation/simulationEngine.js';
import { apparatusParametersForNode } from '../content/apparatus/definitions.js';
import {
  createWorldSimulation,
  registerSimulationSession,
  registerBoundaryTransfer,
  removeBoundaryTransfer,
  getSimulationWorkspace,
} from '../simulation/worldSimulation.js';
import {
  createRealtimeRuntime,
  REALTIME_RUNTIME_BACKENDS,
} from '../simulation/realtimeRuntime.js';
import {
  applyRustWorkerRuntimeSnapshot,
  clearRustWorkerRuntimePresentation,
} from '../simulation/runtimePresentation.js';
import { getSystemNodePort } from '../core/systems/systemNode.js';
import { hopperStoredMassKg } from '../simulation/hopperNode.js';
import { totalMaterialStreamMassFlowKgPerSecond } from '../simulation/materialStream.js';
import {
  hopperInspection,
  streamInspection,
  machineInspection,
  featureInspection,
  connectionInspection,
  exhaustVentInspection,
} from './inspector/inspectionViewModel.js';
import { renderFeatureResources } from './inspector/featureInspectorUI.js';
import {
  projectBlueprintGraph,
  projectBoundaryGraph,
  renderGraphNodes,
  renderGraphConnections,
  renderGraphConnectionPreview,
  disconnectGraphConnection,
} from './graph/workspaceGraph.js';
import {
  boundsForNodePositions,
  clampZoom,
  centerViewport,
  fitViewport,
  screenToGraph,
  translateGraphPosition,
  zoomAroundPoint,
} from './graph/viewport.js';
import { siteResourceOccurrenceIds } from './sitePrototype.js';
import { buildSiteSession } from './siteSession.js';
import {
  buildNavigationIndex,
  expandNavigationPath,
  getNavigationRows,
  navigationExpandableKeys,
  navigationEntryForTarget,
} from './navigation/navigationProjection.js';
import {
  nodeDefinitionById,
  projectNodeCatalog,
} from './catalog/nodeCatalog.js';
import {
  cancelPlacement,
  commitNodePlacement,
  createPlacementState,
  graphPositionForCenteredPoint,
  graphPositionForViewportCenter,
  pointerMovementExceedsThreshold,
  placementIsActive,
} from './graph/nodePlacement.js';
import {
  nodeRemovalEligibility,
  removeBlueprintNode,
} from './graph/nodeRemoval.js';
import { wsState, pendingGraphConnection, inspector } from './workspaceState.js';
import {
  navigationVisibilityState,
  navigationFilterState,
} from './navigation/navigationState.js';
import { nodeCatalogFilterState } from './catalog/catalogState.js';
import { escHtml } from './shell/utils.js';
import { renderWorkspaceShell, workspaceShellMarkup } from './shell/workspaceUI.js';

export { renderWorkspaceShell, workspaceShellMarkup };

export { navigationVisibilityState, navigationFilterState, nodeCatalogFilterState };

const NODE_WIDTH = 160;
const NODE_HEIGHT = 100;
const PORT_RADIUS = 7;
const MACHINE_NODE_TYPES = new Set([
  'extractor',
  'crusher',
  'jawCrusher',
  'coneCrusher',
  'ballMill',
  'screen',
  'splitter',
  'merger',
  'feeder',
  'magSep',
  'roastingFurnace',
]);

let dragState = null;
let systemDragState = null;

function el(id) { return document.getElementById(id); }
function installWindowDragTracking(moveHandler, upHandler) {
  wsState.dragTrackingCleanup?.();
  wsState.dragTrackingCleanup = null;
  if (typeof window === 'undefined') return;

  const onMove = event => {
    if (!dragState && !systemDragState && !pendingGraphConnection.active) return;
    moveHandler(event);
  };
  const onUp = event => {
    if (!dragState && !systemDragState && !pendingGraphConnection.active) return;
    upHandler(event);
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  wsState.dragTrackingCleanup = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
}
function currentPlanet() { return wsState.world?.planets?.[wsState.world?.planetId] ?? null; }

function runtimeUsesRustWorker() {
  return wsState.realtimeRuntime?.backend === REALTIME_RUNTIME_BACKENDS.RUST_WASM_WORKER;
}

function projectRuntimeSnapshot(snapshot) {
  if (!snapshot || !wsState.world || !runtimeUsesRustWorker()) return;
  applyRustWorkerRuntimeSnapshot(wsState.world, wsState.realtimeRuntime, snapshot);
}

function handleRuntimeFailure(error, epoch = wsState.runtimeEpoch) {
  if (epoch !== wsState.runtimeEpoch) return;
  wsState.runtimeError = error instanceof Error ? error : new Error(String(error));
  wsState.simRunning = false;
  wsState.simStepInFlight = false;
  if (wsState.world?.simulation) wsState.world.simulation.running = false;
  if (wsState.simRafId != null) cancelAnimationFrame(wsState.simRafId);
  wsState.simRafId = null;
  inspector.message = `Simulation runtime error: ${wsState.runtimeError.message}`;
  inspector.renderKey = null;
  updateWorldControls();
  if (wsState.currentLevel === 'site') updateInspector(true);
}

function queueRuntimeReconfigure({ resetNodeIds = [] } = {}) {
  const runtime = wsState.realtimeRuntime;
  if (!runtime || runtime.backend === REALTIME_RUNTIME_BACKENDS.MAIN_THREAD) return Promise.resolve(null);
  const epoch = wsState.runtimeEpoch;
  wsState.runtimeMutationPending += 1;
  const previous = wsState.runtimeMutationChain ?? Promise.resolve();
  const task = previous.catch(() => null).then(async () => {
    if (epoch !== wsState.runtimeEpoch) return null;
    const payload = await runtime.reconfigure(wsState.world, { resetNodeIds });
    if (epoch !== wsState.runtimeEpoch) return null;
    projectRuntimeSnapshot(payload?.snapshot ?? runtime.snapshot);
    renderRealtimePresentation();
    return payload;
  }).catch(error => {
    handleRuntimeFailure(error, epoch);
    return null;
  }).finally(() => {
    if (epoch === wsState.runtimeEpoch) wsState.runtimeMutationPending = Math.max(0, wsState.runtimeMutationPending - 1);
  });
  wsState.runtimeMutationChain = task;
  return task;
}

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
    crumbs.push({ label: site?.name ?? wsState.selectedSiteId ?? 'Site', level: 'site', clickable: false });
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

function navigationIndex() {
  return wsState.navigationIndexCache ??= buildNavigationIndex(wsState.world, {
    siteSessions: wsState.siteSessions,
  });
}

function invalidateNavigationIndex() {
  wsState.navigationIndexCache = null;
}

function activeNavigationKey(index) {
  const planet = currentPlanet();
  if (!planet) return null;
  if (wsState.currentLevel === 'site' && wsState.selectedSiteId) {
    return index.byKey.has(`site:${wsState.selectedSiteId}`) ? `site:${wsState.selectedSiteId}` : null;
  }
  if (wsState.currentLevel === 'region' && wsState.selectedRegionId) {
    return index.byKey.has(`region:${wsState.selectedRegionId}`) ? `region:${wsState.selectedRegionId}` : null;
  }
  return `planet:${planet.id}`;
}

function selectedNavigationKey(index) {
  const selectedId = wsState.currentLevel === 'site'
    ? inspector.selectedNodeId
    : inspector.selectedSystemId;
  return navigationEntryForTarget(index, selectedId)?.key ?? null;
}

function navigationCategoryLabel(index, category) {
  return index.categoryLabels?.[category] ?? category.toUpperCase();
}

function setNavigationOpen(open) {
  const visibility = navigationVisibilityState(open);
  wsState.navigationOpen = visibility.visible;
  if (visibility.visible) {
    clearCatalogPointerGesture();
    wsState.nodeCatalogOpen = false;
  }
  const drawer = el('ws-navigation-drawer');
  const toggle = el('ws-navigation-toggle');
  const nodeDrawer = el('ws-node-catalog-drawer');
  const nodeToggle = el('ws-node-catalog-toggle');
  if (drawer) {
    drawer.hidden = visibility.hidden;
    drawer.setAttribute('aria-hidden', visibility.ariaHidden);
  }
  if (toggle) {
    toggle.setAttribute('aria-expanded', visibility.ariaExpanded);
    toggle.querySelector('.ws-visually-hidden')?.replaceChildren(
      document.createTextNode(wsState.navigationOpen ? 'Close hierarchy navigation' : 'Open hierarchy navigation'),
    );
  }
  if (nodeDrawer && visibility.visible) {
    nodeDrawer.hidden = true;
    nodeDrawer.setAttribute('aria-hidden', 'true');
  }
  if (nodeToggle && visibility.visible) {
    nodeToggle.setAttribute('aria-expanded', 'false');
    nodeToggle.querySelector('.ws-visually-hidden')?.replaceChildren(
      document.createTextNode('Open node catalog'),
    );
  }
  if (visibility.visible) renderPlacementPreview();
}

function setNodeCatalogOpen(open) {
  const visible = Boolean(open);
  if (visible) {
    setNavigationOpen(false);
  } else {
    clearCatalogPointerGesture();
  }
  wsState.nodeCatalogOpen = visible;
  const drawer = el('ws-node-catalog-drawer');
  const toggle = el('ws-node-catalog-toggle');
  if (drawer) {
    drawer.hidden = !visible;
    drawer.setAttribute('aria-hidden', String(!visible));
  }
  if (toggle) {
    toggle.setAttribute('aria-expanded', String(visible));
    toggle.querySelector('.ws-visually-hidden')?.replaceChildren(
      document.createTextNode(visible ? 'Close node catalog' : 'Open node catalog'),
    );
  }
  if (!visible) renderPlacementPreview();
}

function renderNavigationDrawer() {
  const tree = el('ws-navigation-tree');
  const drawer = el('ws-navigation-drawer');
  if (!tree || !drawer || !wsState.world) return;

  const index = navigationIndex();
  const { categories: filterCategories, visibleCategories } = navigationFilterState(wsState.navigationHiddenCategories);

  const filters = el('ws-navigation-filters')?.querySelector('.ws-navigation-filters');
  if (filters) {
    filters.innerHTML = filterCategories.map(category => {
      const id = `ws-navigation-filter-${category}`;
      return `<label for="${id}"><input id="${id}" type="checkbox" data-navigation-filter="${escHtml(category)}"${visibleCategories.has(category) ? ' checked' : ''}>${escHtml(navigationCategoryLabel(index, category))}</label>`;
    }).join('');
  }

  const projection = getNavigationRows(index, {
    query: wsState.navigationQuery,
    visibleCategories,
    manualExpandedKeys: wsState.navigationManualExpandedKeys,
    activeKey: activeNavigationKey(index),
    selectedKey: selectedNavigationKey(index),
  });

  tree.innerHTML = projection.rows.length
    ? projection.rows.map(row => {
      const expandButton = row.hasChildren
        ? `<button class="ws-navigation-expand" type="button" data-navigation-expand="${escHtml(row.key)}" aria-label="${row.isExpanded ? 'Collapse' : 'Expand'} ${escHtml(row.label)}">${row.isExpanded ? '▾' : '▸'}</button>`
        : '<span class="ws-navigation-expand-spacer" aria-hidden="true"></span>';
      const stateLabel = row.isMatch ? 'match' : row.isContext ? 'context' : '';
      return `<div class="ws-navigation-row-wrap" role="treeitem" aria-level="${row.depth + 1}" data-navigation-row-wrap="${escHtml(row.key)}"><div class="ws-navigation-row ${row.isActive ? 'ws-navigation-row--active' : ''} ${row.isSelected ? 'ws-navigation-row--selected' : ''} ${row.isMatch ? 'ws-navigation-row--match' : ''} ${row.isContext ? 'ws-navigation-row--context' : ''} ${row.isFiltered ? 'ws-navigation-row--filtered' : ''}" style="--ws-navigation-depth:${row.depth}">${expandButton}<button class="ws-navigation-entry" type="button" data-navigation-entry="${escHtml(row.key)}" aria-current="${row.isActive ? 'location' : 'false'}"><span class="ws-navigation-category ws-node-category--${escHtml(row.category)}" aria-hidden="true"></span><span class="ws-navigation-label">${escHtml(row.label)}</span>${stateLabel ? `<span class="ws-navigation-state">${stateLabel}</span>` : ''}</button></div></div>`;
    }).join('')
    : `<div class="ws-navigation-empty">${wsState.navigationQuery ? 'No matching entries.' : 'No indexed entries.'}</div>`;

  const count = el('ws-navigation-match-count');
  if (count) count.textContent = projection.query ? `${projection.matchCount} match${projection.matchCount === 1 ? '' : 'es'}` : '';
  setNavigationOpen(wsState.navigationOpen);
}

function renderNodeCatalogDrawer() {
  const tree = el('ws-node-catalog-tree');
  const drawer = el('ws-node-catalog-drawer');
  if (!tree || !drawer) return;

  const { categories: filterCategories, visibleCategories } = nodeCatalogFilterState(
    wsState.nodeCatalogHiddenCategories,
  );
  const filters = el('ws-node-catalog-filters')?.querySelector('.ws-navigation-filters');
  if (filters) {
    filters.innerHTML = filterCategories.map(category => {
      const id = `ws-node-catalog-filter-${category}`;
      return `<label for="${id}"><input id="${id}" type="checkbox" data-node-catalog-filter="${escHtml(category)}"${visibleCategories.has(category) ? ' checked' : ''}>${escHtml(category.toUpperCase())}</label>`;
    }).join('');
  }

  const projection = projectNodeCatalog({
    query: wsState.nodeCatalogQuery,
    visibleCategories,
  });
  tree.innerHTML = projection.rows.length
    ? projection.rows.map(group => {
      const expanded = Boolean(wsState.nodeCatalogQuery) || !wsState.nodeCatalogCollapsedCategories.has(group.category);
      return `<div class="ws-node-catalog-group" role="group"><button class="ws-node-catalog-category" type="button" data-node-catalog-expand="${escHtml(group.category)}" aria-expanded="${String(expanded)}"><span aria-hidden="true">${expanded ? '▾' : '▸'}</span>${escHtml(group.category.toUpperCase())}</button>${expanded ? group.definitions.map(definition => `<button class="ws-node-catalog-entry" type="button" data-node-definition="${escHtml(definition.id)}"><span class="ws-navigation-category ws-node-category--${escHtml(definition.category)}" aria-hidden="true"></span><span><strong>${escHtml(definition.label)}</strong><small>${escHtml(definition.description)}</small></span></button>`).join('') : ''}</div>`;
    }).join('')
    : `<div class="ws-navigation-empty">${wsState.nodeCatalogQuery ? 'No matching nodes.' : 'No placeable nodes.'}</div>`;

  const count = el('ws-node-catalog-match-count');
  if (count) count.textContent = wsState.nodeCatalogQuery
    ? `${projection.matchCount} match${projection.matchCount === 1 ? '' : 'es'}`
    : '';
  const status = el('ws-node-catalog-status');
  if (status) {
    const definition = nodeDefinitionById(wsState.placement.definitionId);
    status.innerHTML = placementIsActive(wsState.placement)
      ? `Placing: <strong>${escHtml(definition?.label ?? 'Node')}</strong> <button type="button" data-node-placement-cancel>Cancel</button>`
      : (wsState.currentLevel === 'site' ? 'Select a node to place it in this Site.' : 'Open a Site to place nodes.');
  }
  setNodeCatalogOpen(wsState.nodeCatalogOpen);
}

function navigateNavigationEntry(key) {
  const entry = navigationIndex().byKey.get(key);
  if (!entry) return;

  if (entry.isComposite && entry.category === 'planet') {
    navigateTo('planet');
    return;
  }
  if (entry.isComposite && entry.category === 'region') {
    navigateTo('region', { regionId: entry.targetId });
    return;
  }
  if (entry.isComposite && entry.category === 'site') {
    navigateTo('site', { siteId: entry.targetId });
    return;
  }

  const level = entry.workspaceLevel;
  const targetId = entry.nodeId ?? entry.targetId;
  if (level === 'site' && entry.workspaceId) {
    const feature = entry.category === 'feature' ? wsState.world?.features?.[entry.targetId] : null;
    const occurrenceId = feature?.resourceOccurrences?.[0] ?? null;
    navigateTo('site', {
      siteId: entry.workspaceId,
      occurrenceId,
      focusNodeId: targetId,
    });
  } else if (level === 'region' && entry.workspaceId) {
    navigateTo('region', { regionId: entry.workspaceId, selectSystemId: targetId });
  } else if (level === 'planet') {
    navigateTo('planet', { selectSystemId: targetId });
  }
}

function installNavigationEvents() {
  if (wsState.navigationEventsInstalled) return;
  const navigationEventRoot = el('ws-main') ?? el('player-view');
  if (!navigationEventRoot) return;
  const controller = new AbortController();
  wsState.navigationEventController = controller;
  const eventOptions = { signal: controller.signal };
  navigationEventRoot.addEventListener('pointerdown', event => {
    const definitionEntry = event.target.closest('[data-node-definition]');
    if (!definitionEntry) return;
    const definition = nodeDefinitionById(definitionEntry.dataset.nodeDefinition);
    if (definition) beginCatalogPointer(definition, event);
  }, eventOptions);
  if (typeof window !== 'undefined') {
    window.addEventListener('pointermove', updateCatalogPointer, eventOptions);
    window.addEventListener('pointerup', finishCatalogPointer, eventOptions);
    window.addEventListener('pointercancel', event => {
      const gesture = wsState.catalogPointer;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      clearCatalogPointerGesture({ suppressClick: true });
      renderNodeCatalogDrawer();
      renderPlacementPreview();
    }, eventOptions);
  }
  navigationEventRoot.addEventListener('click', event => {
    const toggle = event.target.closest('#ws-navigation-toggle');
    if (toggle) {
      setNavigationOpen(!wsState.navigationOpen);
      return;
    }
    const nodeToggle = event.target.closest('#ws-node-catalog-toggle');
    if (nodeToggle) {
      setNodeCatalogOpen(!wsState.nodeCatalogOpen);
      renderNodeCatalogDrawer();
      return;
    }
    const close = event.target.closest('#ws-navigation-close');
    if (close) {
      setNavigationOpen(false);
      return;
    }
    const nodeClose = event.target.closest('#ws-node-catalog-close');
    if (nodeClose) {
      setNodeCatalogOpen(false);
      renderNodeCatalogDrawer();
      return;
    }
    const definition = event.target.closest('[data-node-definition]');
    if (definition) {
      const selected = nodeDefinitionById(definition.dataset.nodeDefinition);
      if (selected && wsState.currentLevel === 'site') {
        if (wsState.suppressCatalogClick) {
          wsState.suppressCatalogClick = false;
          return;
        }
        quickPlaceDefinition(selected);
      }
      return;
    }
    const expandNodeCategory = event.target.closest('[data-node-catalog-expand]');
    if (expandNodeCategory) {
      const category = expandNodeCategory.dataset.nodeCatalogExpand;
      if (wsState.nodeCatalogCollapsedCategories.has(category)) wsState.nodeCatalogCollapsedCategories.delete(category);
      else wsState.nodeCatalogCollapsedCategories.add(category);
      renderNodeCatalogDrawer();
      return;
    }
    const cancel = event.target.closest('[data-node-placement-cancel]');
    if (cancel) {
      cancelPlacement(wsState.placement);
      renderNodeCatalogDrawer();
      renderPlacementPreview();
      return;
    }
    const collapse = event.target.closest('#ws-navigation-collapse-all');
    if (collapse) {
      wsState.navigationManualExpandedKeys = new Set();
      renderNavigationDrawer();
      return;
    }
    const expand = event.target.closest('#ws-navigation-expand-all');
    if (expand) {
      wsState.navigationManualExpandedKeys = navigationExpandableKeys(navigationIndex());
      renderNavigationDrawer();
      return;
    }
    const expandEntry = event.target.closest('[data-navigation-expand]');
    if (expandEntry) {
      const key = expandEntry.dataset.navigationExpand;
      if (wsState.navigationManualExpandedKeys.has(key)) wsState.navigationManualExpandedKeys.delete(key);
      else wsState.navigationManualExpandedKeys.add(key);
      renderNavigationDrawer();
      return;
    }
    const entry = event.target.closest('[data-navigation-entry]');
    if (entry) {
      navigateNavigationEntry(entry.dataset.navigationEntry);
      return;
    }
  }, eventOptions);
  navigationEventRoot.addEventListener('input', event => {
    if (!event.target.matches('#ws-navigation-search')) return;
    wsState.navigationQuery = event.target.value;
    renderNavigationDrawer();
  }, eventOptions);
  navigationEventRoot.addEventListener('change', event => {
    const input = event.target.closest('[data-navigation-filter]');
    if (!input || !event.target.closest('#ws-navigation-drawer')) return;
    if (input.checked) wsState.navigationHiddenCategories.delete(input.dataset.navigationFilter);
    else wsState.navigationHiddenCategories.add(input.dataset.navigationFilter);
    renderNavigationDrawer();
  }, eventOptions);
  navigationEventRoot.addEventListener('input', event => {
    if (!event.target.matches('#ws-node-catalog-search')) return;
    wsState.nodeCatalogQuery = event.target.value;
    renderNodeCatalogDrawer();
  }, eventOptions);
  navigationEventRoot.addEventListener('change', event => {
    const input = event.target.closest('[data-node-catalog-filter]');
    if (!input || !event.target.closest('#ws-node-catalog-drawer')) return;
    if (input.checked) wsState.nodeCatalogHiddenCategories.delete(input.dataset.nodeCatalogFilter);
    else wsState.nodeCatalogHiddenCategories.add(input.dataset.nodeCatalogFilter);
    renderNodeCatalogDrawer();
  }, eventOptions);
  navigationEventRoot.addEventListener('keydown', event => {
    if (event.key === 'Delete') {
      if (isEditableWorkspaceTarget(event.target)) return;
      const selectedNode = wsState.blueprint?.nodes?.[inspector.selectedNodeId];
      if (
        wsState.currentLevel === 'site'
        && selectedNode
        && nodeRemovalEligibility(wsState.blueprint, selectedNode).removable
      ) {
        event.preventDefault();
        attemptNodeRemoval(inspector.selectedNodeId);
      }
      return;
    }
    if (event.key !== 'Escape') return;
    if (wsState.catalogPointer || placementIsActive(wsState.placement)) {
      clearCatalogPointerGesture({ suppressClick: true });
      renderNodeCatalogDrawer();
      renderPlacementPreview();
      return;
    }
    if (wsState.navigationOpen) {
      const shouldRestoreFocus = event.target.closest('#ws-navigation-drawer, #ws-navigation-toggle');
      setNavigationOpen(false);
      if (shouldRestoreFocus) el('ws-navigation-toggle')?.focus();
    } else if (wsState.nodeCatalogOpen) {
      const shouldRestoreFocus = event.target.closest('#ws-node-catalog-drawer, #ws-node-catalog-toggle');
      setNodeCatalogOpen(false);
      if (shouldRestoreFocus) el('ws-node-catalog-toggle')?.focus();
    }
  }, eventOptions);
  wsState.navigationEventsInstalled = true;
}

function createSiteSession(_occurrenceId, siteId) {
  const siteWorkspace = getSimulationWorkspace(wsState.world, `${siteId}-workspace`);
  return buildSiteSession(wsState.world, siteId, {
    siteImport: siteWorkspace?.nodes?.[`${siteId}-import-boundary`] ?? null,
    siteExport: siteWorkspace?.nodes?.[`${siteId}-export-boundary`] ?? null,
  });
}

function activateSiteSession(occurrenceId, siteId) {
  if (!siteId) return;
  let session = wsState.siteSessions[siteId];
  if (!session) {
    session = createSiteSession(occurrenceId, siteId);
    wsState.siteSessions[siteId] = session;
    registerSimulationSession(wsState.world, siteId, session.blueprint, session.boundaryNode?.childWorkspaceId);
    invalidateNavigationIndex();
    queueRuntimeReconfigure();
  }
  wsState.blueprint = session.blueprint;
  wsState.blueprintLayout = session.blueprintLayout;
  wsState.selectedSiteId = siteId;
}

export function navigateTo(level, opts = {}) {
  clearCatalogPointerGesture();
  if (level === 'planet') {
    wsState.selectedRegionId = null;
    wsState.selectedSiteId = null;
    wsState.selectedOccurrenceId = null;
    wsState.blueprint = null;
    wsState.blueprintLayout = null;
  }

  if (level === 'region') {
    if (opts.regionId) wsState.selectedRegionId = opts.regionId;
    wsState.selectedSiteId = null;
    wsState.selectedOccurrenceId = null;
    wsState.blueprint = null;
    wsState.blueprintLayout = null;
  }

  if (level === 'site') {
    const siteId = opts.siteId ?? wsState.selectedSiteId;
    const site = wsState.world?.sites?.[siteId];
    if (!site) return;
    const occurrenceIds = siteResourceOccurrenceIds(wsState.world, site);
    const occurrenceId = opts.occurrenceId && occurrenceIds.includes(opts.occurrenceId)
      ? opts.occurrenceId
      : occurrenceIds[0] ?? null;
    wsState.selectedSiteId = site.id;
    wsState.selectedRegionId = site.regionId;
    wsState.selectedOccurrenceId = occurrenceId;
    activateSiteSession(occurrenceId, site.id);
  }

  wsState.currentLevel = level;
  const index = navigationIndex();
  wsState.navigationManualExpandedKeys = expandNavigationPath(
    index,
    activeNavigationKey(index),
    wsState.navigationManualExpandedKeys,
  );
  inspector.selectedNodeId = null;
  inspector.selectedConnId = null;
  inspector.selectedSystemId = null;
  inspector.selectedTransferId = null;
  inspector.message = '';
  inspector.renderKey = null;
  renderWorkspace();

  if (level === 'site' && opts.focusNodeId) {
    const nodeId = wsState.blueprint?.nodes?.[opts.focusNodeId]
      ? opts.focusNodeId
      : Object.values(wsState.blueprint?.nodes ?? {}).find(node => node.featureId === opts.focusNodeId)?.id;
    if (nodeId) {
      selectNode(nodeId);
      focusSiteNode(nodeId);
    }
  } else if ((level === 'planet' || level === 'region') && opts.selectSystemId) {
    selectSystem(opts.selectSystemId);
    focusSystemNode(opts.selectSystemId);
  }
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
  if (node.nodeType === 'site') return wsState.world.sites[node.id]?.name ?? node.id;
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
    return `${feature?.type ?? 'Site'} · ${site?.siteKind === 'regional-access' ? 'broad resource access' : 'physical site'}`;
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

function placementContext() {
  const site = wsState.world?.sites?.[wsState.selectedSiteId];
  return {
    world: wsState.world,
    siteId: wsState.selectedSiteId,
    occurrenceId: wsState.selectedOccurrenceId ?? siteResourceOccurrenceIds(wsState.world, site)[0] ?? null,
    occurrenceIds: siteResourceOccurrenceIds(wsState.world, site),
  };
}

function siteViewportSurface() {
  return el('ws-site-canvas')?.parentElement ?? null;
}

function siteViewportSize(surface) {
  const rect = surface?.getBoundingClientRect?.() ?? { width: 0, height: 0 };
  return {
    width: surface?.clientWidth || rect.width || 0,
    height: surface?.clientHeight || rect.height || 0,
  };
}

function localPointForEvent(event, surface = siteViewportSurface()) {
  const rect = surface?.getBoundingClientRect?.() ?? { left: 0, top: 0 };
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function pointIsInsideSurface(event, surface = siteViewportSurface()) {
  if (!surface) return false;
  const rect = surface.getBoundingClientRect();
  return event.clientX >= rect.left
    && event.clientX <= rect.right
    && event.clientY >= rect.top
    && event.clientY <= rect.bottom;
}

function clearCatalogPointerGesture({ suppressClick = false } = {}) {
  wsState.catalogPointer = null;
  cancelPlacement(wsState.placement);
  if (suppressClick) {
    wsState.suppressCatalogClick = true;
    setTimeout(() => { wsState.suppressCatalogClick = false; }, 0);
  }
}

function commitCatalogDefinition(definition, graphPosition) {
  if (!definition || !wsState.blueprint || !wsState.blueprintLayout) return false;
  try {
    const node = commitNodePlacement(
      wsState.blueprint,
      wsState.blueprintLayout,
      definition,
      placementContext(),
      graphPosition,
    );
    cancelPlacement(wsState.placement);
    inspector.selectedNodeId = node.id;
    inspector.selectedConnId = null;
    inspector.message = '';
    inspector.renderKey = null;
    invalidateNavigationIndex();
    queueRuntimeReconfigure();
    renderSiteNodes();
    renderNavigationDrawer();
    renderNodeCatalogDrawer();
    return true;
  } catch (error) {
    cancelPlacement(wsState.placement);
    inspector.message = error.message;
    inspector.renderKey = null;
    renderNodeCatalogDrawer();
    updateInspector(true);
    return false;
  }
}

function quickPlaceDefinition(definition) {
  if (wsState.currentLevel !== 'site') return false;
  const surface = siteViewportSurface();
  const viewport = workspaceViewport(`site:${wsState.selectedSiteId}`);
  const position = graphPositionForViewportCenter(
    viewport,
    siteViewportSize(surface),
    NODE_WIDTH,
    NODE_HEIGHT,
  );
  return commitCatalogDefinition(definition, position);
}

function beginCatalogPointer(definition, event) {
  if (event.button !== 0 || wsState.currentLevel !== 'site') return;
  clearCatalogPointerGesture();
  wsState.catalogPointer = {
    definitionId: definition.id,
    pointerId: event.pointerId,
    start: { x: event.clientX, y: event.clientY },
    dragging: false,
  };
  event.currentTarget?.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function updateCatalogPointer(event) {
  const gesture = wsState.catalogPointer;
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  const current = { x: event.clientX, y: event.clientY };
  if (!gesture.dragging && !pointerMovementExceedsThreshold(gesture.start, current)) return;
  gesture.dragging = true;
  const definition = nodeDefinitionById(gesture.definitionId);
  if (!definition) return;
  wsState.placement.definitionId = definition.id;
  const surface = siteViewportSurface();
  if (pointIsInsideSurface(event, surface)) {
    wsState.placement.graphPosition = graphPositionForCenteredPoint(
      localPointForEvent(event, surface),
      workspaceViewport(`site:${wsState.selectedSiteId}`),
      NODE_WIDTH,
      NODE_HEIGHT,
    );
  } else {
    wsState.placement.graphPosition = null;
  }
  renderNodeCatalogDrawer();
  renderPlacementPreview();
}

function finishCatalogPointer(event) {
  const gesture = wsState.catalogPointer;
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  const definition = nodeDefinitionById(gesture.definitionId);
  const wasDragging = gesture.dragging;
  const surface = siteViewportSurface();
  clearCatalogPointerGesture({ suppressClick: true });
  if (!definition) return;

  if (!wasDragging) {
    quickPlaceDefinition(definition);
  } else if (pointIsInsideSurface(event, surface)) {
    const graphPosition = graphPositionForCenteredPoint(
      localPointForEvent(event, surface),
      workspaceViewport(`site:${wsState.selectedSiteId}`),
      NODE_WIDTH,
      NODE_HEIGHT,
    );
    commitCatalogDefinition(definition, graphPosition);
  } else {
    renderNodeCatalogDrawer();
    renderPlacementPreview();
  }
  event.preventDefault();
}

function renderPlacementPreview() {
  const canvas = el('ws-site-canvas');
  const existing = canvas?.querySelector('[data-node-placement-preview]');
  if (!canvas || !placementIsActive(wsState.placement) || !wsState.placement.graphPosition) {
    existing?.remove();
    return;
  }
  const definition = nodeDefinitionById(wsState.placement.definitionId);
  if (!definition) {
    existing?.remove();
    return;
  }
  const preview = existing ?? document.createElement('div');
  if (!existing) {
    preview.dataset.nodePlacementPreview = 'true';
    preview.className = 'ws-node ws-node--placement-preview';
    preview.innerHTML = `<div class="ws-node-category"></div><div class="ws-node-label"></div>`;
    canvas.appendChild(preview);
  }
  preview.className = `ws-node ws-node--placement-preview ws-node--${escHtml(definition.nodeType)}`;
  preview.querySelector('.ws-node-category').className = `ws-node-category ws-node-category--${escHtml(definition.category)}`;
  preview.querySelector('.ws-node-category').textContent = definition.category.toUpperCase();
  preview.querySelector('.ws-node-label').innerHTML = `<span>${escHtml(definition.label)}</span><span>Preview</span>`;
  preview.style.width = `${NODE_WIDTH}px`;
  preview.style.height = `${NODE_HEIGHT}px`;
  preview.style.left = `${wsState.placement.graphPosition.x}px`;
  preview.style.top = `${wsState.placement.graphPosition.y}px`;
}

function applyViewportTransform(key) {
  const viewport = workspaceViewport(key);
  const canvas = key.startsWith('site:')
    ? el('ws-site-canvas')
    : el('ws-system-canvas');
  const svg = key.startsWith('site:')
    ? el('ws-site-svg')
    : el('ws-system-svg');
  const transform = `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`;
  if (canvas) {
    canvas.style.transformOrigin = '0 0';
    canvas.style.transform = transform;
  }
  if (svg) {
    svg.style.transformOrigin = '0 0';
    svg.style.transform = transform;
  }
  const root = canvas?.closest('.ws-workspace');
  root?.querySelectorAll('[data-zoom-label]').forEach(label => {
    label.textContent = `${Math.round(viewport.zoom * 100)}%`;
  });
}

function installViewport(surface, canvas, svg, key, boundsProvider, controlsRoot = null) {
  if (!surface || !canvas || !svg || !controlsRoot) return;
  const apply = () => applyViewportTransform(key);
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

function focusGraphPosition(key, position) {
  const surface = key.startsWith('site:')
    ? el('ws-site-canvas')?.parentElement
    : el('ws-system-canvas')?.parentElement;
  if (!surface || !position) return;
  const viewport = workspaceViewport(key);
  const centerX = position.x + NODE_WIDTH / 2;
  const centerY = position.y + NODE_HEIGHT / 2;
  viewport.panX = surface.clientWidth / 2 - centerX * viewport.zoom;
  viewport.panY = surface.clientHeight / 2 - centerY * viewport.zoom;
  applyViewportTransform(key);
}

function focusSiteNode(nodeId) {
  if (!wsState.blueprint?.nodes?.[nodeId]) return;
  const position = wsState.blueprintLayout?.nodePositions?.[nodeId] ?? { x: 0, y: 0 };
  focusGraphPosition(`site:${wsState.selectedSiteId}`, position);
}

function focusSystemNode(nodeId) {
  const definition = systemWorkspaceDefinition();
  if (!definition.nodes.some(node => node.id === nodeId)) return;
  const position = ensureSystemLayout(definition).nodePositions[nodeId] ?? { x: 0, y: 0 };
  focusGraphPosition(definition.id, position);
}

function portOffsetsForSize(port, index, count, width, height) {
  const step = height / (count + 1);
  return { dx: port.direction === 'input' ? 0 : width, dy: step * (index + 1) };
}
function portOffsets(port, index, count) { return portOffsetsForSize(port, index, count, NODE_WIDTH, NODE_HEIGHT); }

function visibleEndpointForTransfer(systemId, portId) {
  const regionId = wsState.selectedRegionId;
  if (systemId === `${regionId}-import-terminal`) return { nodeId: `${regionId}-import-hopper`, portId: 'output' };
  if (systemId === `${regionId}-export-terminal`) return { nodeId: `${regionId}-export-hopper`, portId: 'input' };
  return { nodeId: systemId, portId };
}

function systemEndpointPosition(definition, systemId, portId) {
  const visible = visibleEndpointForTransfer(systemId, portId);
  const layout = ensureSystemLayout(definition);
  const position = layout.nodePositions[visible.nodeId] ?? { x: 0, y: 0 };
  const graph = projectBoundaryGraph(
    { ...definition, layout }, {},
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
    const nextPosition = translateGraphPosition(
      { x: systemDragState.startX, y: systemDragState.startY },
      { x: systemDragState.startMouseX, y: systemDragState.startMouseY },
      point,
    );
    layout.nodePositions[systemDragState.nodeId] = nextPosition;
    const element = wsState.systemNodeElements.get(systemDragState.nodeId);
    if (element) {
      element.style.left = `${nextPosition.x}px`;
      element.style.top = `${nextPosition.y}px`;
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

  const shell = renderWorkspaceShell(container, {
    title: definition.title,
    subtitle: wsState.currentLevel === 'planet'
      ? 'Draggable planetary system graph'
      : 'Sites are the physical access points for all regional resources and Features.',
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
          else {
            const site = wsState.world.sites[node.id];
            navigateTo('site', { siteId: node.id, occurrenceId: siteResourceOccurrenceIds(wsState.world, site)[0] });
          }
        });
        element.appendChild(button);
      } else if (!canEnter) existingEnter?.remove();
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
        queueRuntimeReconfigure();
      } catch (error) {
        inspector.message = error.message;
      }
      pendingGraphConnection.active = false;
      pendingGraphConnection.adapter = null;
      event.stopPropagation();
      renderWorkspace();
    },
  });
  installWindowDragTracking(onSystemCanvasMove, () => {
    systemDragState = null;
    if (pendingGraphConnection.active) {
      pendingGraphConnection.active = false;
      pendingGraphConnection.adapter = null;
      renderSystemConnections(el('ws-system-svg'), definition);
    }
  });
  renderSystemConnections(svg, definition);
  installViewport(
    shell.viewport,
    canvas,
    svg,
    definition.id,
    () => boundsForNodePositions(ensureSystemLayout(definition).nodePositions, NODE_WIDTH, NODE_HEIGHT),
    shell.viewportControls,
  );
  updateCompositeInspector(true);
}

function renderPlanetWorkspace(container) {
  const planet = currentPlanet();
  if (!planet) {
    container.innerHTML = `<div class="ws-site-card"><div class="ws-site-name">Create World</div><div class="ws-site-type">Generate a deterministic planet.</div><label for="ws-player-seed">Seed</label><input id="ws-player-seed" type="text" placeholder="Enter seed or leave blank for random"><button id="ws-player-generate">Generate World</button></div>`;
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

function summaryRowsHtml(rows, emptyLabel, suffix = 'kg') {
  if (!rows?.length) return `<span>${escHtml(emptyLabel)}</span>`;
  return rows.map(row => summaryRowHtml(row, suffix)).join('');
}

function summaryRowHtml(row, suffix) {
  return `<div class="ws-ins-comp-row"><span>${escHtml(row.label ?? row.id)}</span><span>${row.quantity.toFixed(3)} ${suffix} (${row.percentage.toFixed(1)}%)</span></div>`;
}

function formatTemperature(temperatureK) {
  if (!Number.isFinite(temperatureK)) return 'Unavailable';
  return `${(temperatureK - 273.15).toFixed(1)} °C (${temperatureK.toFixed(1)} K)`;
}

function formatEnergyMj(energyJ) {
  return Number.isFinite(energyJ) ? `${(energyJ / 1e6).toFixed(3)} MJ` : 'Unavailable';
}

function furnaceZonesHtml(zones) {
  if (!zones?.length) return '<span>No retained process material.</span>';
  return zones.map(zone => `<div class="ws-ins-comp-row"><span>Zone ${zone.index}</span><span>${zone.massKg.toFixed(3)} / ${zone.capacityKg.toFixed(3)} kg · ${escHtml(formatTemperature(zone.temperatureK))} · Goethite ${zone.goethiteKg.toFixed(3)} kg · Hematite ${zone.hematiteKg.toFixed(3)} kg</span></div>`).join('');
}

export function compactCompositionSummaryHtml(rows, emptyLabel, suffix = 'kg') {
  if (!rows?.length) return `<span>${escHtml(emptyLabel)}</span>`;
  const primaryRows = rows.slice(0, 4);
  const overflowRows = rows.slice(4);
  const primaryHtml = primaryRows.map(row => summaryRowHtml(row, suffix)).join('');
  if (!overflowRows.length) return primaryHtml;

  const otherQuantity = overflowRows.reduce((sum, row) => sum + row.quantity, 0);
  const otherPercentage = overflowRows.reduce((sum, row) => sum + row.percentage, 0);
  const otherHtml = summaryRowHtml({ label: 'Other', quantity: otherQuantity, percentage: otherPercentage }, suffix);
  const detailHtml = overflowRows.map(row => summaryRowHtml(row, suffix)).join('');
  return `${primaryHtml}${otherHtml}<details class="ws-ins-comp-details"><summary>Show ${overflowRows.length} more species</summary>${detailHtml}</details>`;
}

function replaceInspectorSectionHtml(section, html) {
  if (!section) return;
  const wasExpanded = section.querySelector('.ws-ins-comp-details')?.open ?? false;
  if (section.innerHTML === html) return;
  section.innerHTML = html;
  if (wasExpanded) {
    const details = section.querySelector('.ws-ins-comp-details');
    if (details) details.open = true;
  }
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
      <div class="ws-ins-row"><b>Physical form:</b> ${escHtml(details.physicalForm ?? 'unknown')}</div>
      <div class="ws-ins-row"><b>Temperature:</b> <span data-live="boundary-temperature">${escHtml(formatTemperature(details.temperatureK))}</span></div>
      <div class="ws-ins-row"><b>Thermal energy:</b> <span data-live="boundary-energy">${escHtml(formatEnergyMj(details.sensibleEnthalpyJ))}</span></div>
      ${details.thermalError ? `<div class="ws-ins-note">${escHtml(details.thermalError)}</div>` : ''}
      <div class="ws-ins-comp"><b>Composition</b><div data-live-section="boundary-components">${compactCompositionSummaryHtml(details.composition, 'no stored material')}</div></div>
      <div class="ws-ins-comp"><b>Particle Size</b><div data-live-section="boundary-size">${summaryRowsHtml(details.particleSizeDistribution, 'no stored material')}</div></div>
      <div class="ws-ins-comp"><b>Liberation</b><div data-live-section="boundary-liberation">${summaryRowsHtml(details.liberationDistribution, 'no stored material')}</div></div>`;
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
    html += `<div class="ws-ins-row"><b>Name:</b> ${escHtml(site?.name ?? node.id)}</div>
      <div class="ws-ins-row"><b>Region:</b> ${escHtml(site?.regionId)}</div>
      <div class="ws-ins-row"><b>Features:</b> ${(site?.featureIds ?? []).length}</div>
      <div class="ws-ins-row"><b>Accessible resources:</b> ${siteResourceOccurrenceIds(wsState.world, site).length}</div>`;
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
        queueRuntimeReconfigure();
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
    const temperature = body.querySelector('[data-live="boundary-temperature"]');
    const energy = body.querySelector('[data-live="boundary-energy"]');
    const components = body.querySelector('[data-live-section="boundary-components"]');
    const size = body.querySelector('[data-live-section="boundary-size"]');
    const liberation = body.querySelector('[data-live-section="boundary-liberation"]');
    if (stored) stored.textContent = details.storedMassKg.toFixed(3);
    if (free) free.textContent = details.freeCapacityKg.toFixed(3);
    if (temperature) temperature.textContent = formatTemperature(details.temperatureK);
    if (energy) energy.textContent = formatEnergyMj(details.sensibleEnthalpyJ);
    replaceInspectorSectionHtml(components, compactCompositionSummaryHtml(details.composition, 'no stored material'));
    if (size) size.innerHTML = summaryRowsHtml(details.particleSizeDistribution, 'no stored material');
    if (liberation) liberation.innerHTML = summaryRowsHtml(details.liberationDistribution, 'no stored material');
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
    const resources = (feature?.resourceOccurrences ?? [])
      .map(id => wsState.world?.resourceOccurrences?.[id]?.name)
      .filter(Boolean);
    const resourceSummary = resources.length > 1 ? `${resources[0]} +${resources.length - 1}` : (resources[0] ?? 'No resources');
    return `${feature?.name ?? node.displayName ?? node.featureId}\n${feature?.type ?? 'Feature'}\n${resourceSummary}`;
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
  if (node.nodeType === 'jawCrusher') return `Jaw Crusher [${getNodeOperatingState(node)}]\n${node.throughputKgPerSecond} kg/s`;
  if (node.nodeType === 'coneCrusher') return `Cone Crusher [${getNodeOperatingState(node)}]\n${node.throughputKgPerSecond} kg/s`;
  if (node.nodeType === 'ballMill') return `Ball Mill [${getNodeOperatingState(node)}]\n${node.throughputKgPerSecond} kg/s`;
  if (node.nodeType === 'feeder') return `Feeder [${getNodeOperatingState(node)}]\nSet ${node.flowRateKgPerSecond.toFixed(2)} kg/s`;
  if (node.nodeType === 'magSep') return `Mag. Sep. [${getNodeOperatingState(node)}]\nB=${node.fieldStrength}\n${node.throughputKgPerSecond} kg/s`;
  if (node.nodeType === 'roastingFurnace') {
    const temperatureC = Number.isFinite(node.actualChargeTemperatureK) ? node.actualChargeTemperatureK - 273.15 : null;
    return `Roasting Furnace [${getNodeOperatingState(node)}]\n${node.internalZoneCount ?? 4} zones · ${node.effectiveChamberHoldUpKg} kg\n${temperatureC == null ? 'No charge' : `${temperatureC.toFixed(0)} °C`}`;
  }
  if (node.nodeType === 'exhaustVent') return 'Exhaust Vent\nGas boundary';
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
      return stream ? totalMaterialStreamMassFlowKgPerSecond(stream) : 0;
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
      label.innerHTML = nodeLabel(node).split('\n').map(line => `<span>${escHtml(line)}</span>`).join('');
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
  renderPlacementPreview();
  updateInspector();
  updateSimStatus();
}

function renderSiteWorkspace(container) {
  if (!wsState.selectedSiteId) {
    container.innerHTML = '<p class="ws-empty">No Site selected.</p>';
    return;
  }
  activateSiteSession(wsState.selectedOccurrenceId, wsState.selectedSiteId);
  wsState.nodeElements.clear();
  wsState.connectionElements.clear();
  wsState.connectionPreview = null;
  inspector.renderKey = null;
  const site = wsState.world?.sites?.[wsState.selectedSiteId];
  const shell = renderWorkspaceShell(container, {
    title: `Site — ${site?.name ?? wsState.selectedSiteId}`,
    subtitle: 'Configure apparatus and observe live material flow.',
    contextControls: `<button id="ws-sim-reset">↺ Reset Site</button><span id="ws-sim-status" class="ws-sim-status"></span>`,
    canvasId: 'ws-site-canvas',
    svgId: 'ws-site-svg',
    inspectorBodyId: 'ws-inspector-body',
    inspectorInitial: 'Select a node or connection.',
  });
  el('ws-sim-reset')?.addEventListener('click', onResetSite);
  el('ws-inspector-body')?.addEventListener('click', onInspectorClick);
  el('ws-inspector-body')?.addEventListener('change', onInspectorParameterChange);
  renderSiteNodes();
  installWindowDragTracking(onCanvasMouseMove, onCanvasMouseUp);
  installViewport(
    shell.viewport,
    shell.canvas,
    shell.svg,
    `site:${wsState.selectedSiteId}`,
    () => boundsForNodePositions(wsState.blueprintLayout.nodePositions, NODE_WIDTH, NODE_HEIGHT),
    shell.viewportControls,
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
    lastX: position.x,
    lastY: position.y,
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
      queueRuntimeReconfigure();
    }
  }
  inspector.renderKey = null;
  renderSiteNodes();
}

function onCanvasMouseMove(event) {
  if (dragState) {
    const surface = el('ws-site-canvas')?.parentElement;
    const point = eventGraphPoint(event, surface, `site:${wsState.selectedSiteId}`);
    const nextPosition = translateGraphPosition(
      { x: dragState.startX, y: dragState.startY },
      { x: dragState.startMouseX, y: dragState.startMouseY },
      point,
    );
    // Drag feedback is a presentation concern. Mutate the transient layout
    // position directly, move only the dragged DOM node, and redraw the SVG
    // edges. The canonical layout revision is committed once on pointer-up.
    wsState.blueprintLayout.nodePositions[dragState.nodeId] = nextPosition;
    dragState.lastX = nextPosition.x;
    dragState.lastY = nextPosition.y;
    const element = wsState.nodeElements.get(dragState.nodeId);
    if (element) {
      element.style.left = `${nextPosition.x}px`;
      element.style.top = `${nextPosition.y}px`;
    }
    const svg = el('ws-site-svg');
    if (svg) {
      svg.dataset.graphConnectionRenderRevision = '';
      renderConnections(svg);
    }
  }
  if (pendingGraphConnection.active) {
    const point = eventGraphPoint(event, el('ws-site-canvas')?.parentElement, `site:${wsState.selectedSiteId}`);
    pendingGraphConnection.x = point.x;
    pendingGraphConnection.y = point.y;
    renderConnections(el('ws-site-svg'));
  }
}

function onCanvasMouseUp() {
  if (dragState) {
    layoutMoveNode(
      wsState.blueprintLayout,
      dragState.nodeId,
      dragState.lastX,
      dragState.lastY,
    );
    dragState = null;
    renderSiteNodes();
  }
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
  renderNavigationDrawer();
}

function selectConnection(connectionId) {
  inspector.selectedNodeId = null;
  inspector.selectedConnId = connectionId;
  inspector.message = '';
  inspector.renderKey = null;
  renderSiteNodes();
}

function isEditableWorkspaceTarget(target) {
  return Boolean(target?.closest?.('input, textarea, select, [contenteditable]'));
}

function attemptNodeRemoval(nodeId) {
  if (!wsState.blueprint) return { removed: false, reason: 'No Site blueprint is active.' };
  const result = removeBlueprintNode(wsState.blueprint, wsState.blueprintLayout, nodeId);
  if (!result.removed) {
    inspector.message = result.reason;
    inspector.renderKey = null;
    updateInspector(true);
    return result;
  }

  inspector.selectedNodeId = null;
  inspector.selectedConnId = null;
  inspector.message = '';
  inspector.renderKey = null;
  invalidateNavigationIndex();
  queueRuntimeReconfigure();
  renderSiteNodes();
  renderNavigationDrawer();
  renderNodeCatalogDrawer();
  return result;
}

function featureResourcesHtml(details) {
  return renderFeatureResources(details);
}

function machineControlsHtml(node, details) {
  let html = `<div class="ws-ins-row"><b>State:</b> <span data-live="state">${escHtml(details.operatingState)}</span></div>
    <div class="ws-ins-row"><b>Enabled:</b> <button class="ws-btn-enable" data-node-id="${escHtml(node.id)}">${details.enabled ? 'On' : 'Off'}</button></div>`;
  for (const capability of details.capabilities ?? []) {
    const unit = capability.unit ? ` ${escHtml(capability.unit)}` : '';
    html += `<div class="ws-ins-row"><b>${escHtml(capability.label)}:</b> ${escHtml(capability.value)}${unit}</div>`;
  }
  for (const parameter of apparatusParametersForNode(node)) {
    if (!parameter.playerConfigurable) continue;
    const unit = parameter.unit ? ` ${escHtml(parameter.unit)}` : '';
    html += `<div class="ws-ins-row"><label><b>${escHtml(parameter.label)}:</b> <input class="ws-apparatus-parameter" data-node-id="${escHtml(node.id)}" data-parameter-id="${escHtml(parameter.id)}" type="${escHtml(parameter.controlType ?? 'number')}" min="${parameter.min}" max="${parameter.max}" step="any" value="${node[parameter.id]}">${unit}</label></div>`;
  }
  return html;
}

function formatNodeInspector(node) {
  if (!node) return 'Select a node or connection.';
  const hopper = ['hopper', 'boundary-buffer'].includes(node.systemType) || node.nodeType === 'hopper';
  const typeLabel = node.systemType === 'boundary-buffer' ? node.displayName : node.nodeType;
  const isFeature = node.nodeType === 'feature';
  const removal = nodeRemovalEligibility(wsState.blueprint, node);
  let html = `<div class="ws-ins-type">${escHtml(typeLabel.toUpperCase())}</div>`;
  if (!isFeature) html += `<div class="ws-ins-row"><b>ID:</b> ${escHtml(node.id)}</div>`;

  if (MACHINE_NODE_TYPES.has(node.nodeType)) {
    const details = machineInspection(wsState.blueprint, node);
    html += machineControlsHtml(node, details);
    if (node.nodeType === 'extractor') {
      const sourceNode = details.resourceAccess ? wsState.blueprint.nodes[details.resourceAccess.sourceNodeId] : null;
      const sourceFeature = sourceNode ? wsState.world?.features?.[sourceNode.featureId] : null;
      html += `<div class="ws-ins-row"><b>Resource source:</b> ${escHtml(sourceFeature?.name ?? 'Not connected')}</div>
        <div class="ws-ins-row"><b>Target material:</b> ${escHtml(wsState.world?.resourceOccurrences?.[node.occurrenceId]?.name ?? node.occurrenceId)}</div>`;
    } else {
      html += `<div class="ws-ins-row"><b>Actual feed:</b> <span data-live="machine-feed">${details.actualFeedKgPerSecond.toFixed(3)}</span> kg/s</div>`;
    }
    html += `<div class="ws-ins-row"><b>Actual product:</b> <span data-live="machine-product">${details.actualProductKgPerSecond.toFixed(3)}</span> kg/s</div>`;
    if (node.nodeType === 'magSep') {
      html += `<div class="ws-ins-row"><b>Feed:</b> <span data-live="feed-flow">${(details.feed?.totalFlowKgPerSecond ?? 0).toFixed(3)}</span> kg/s</div>
        <div class="ws-ins-row"><b>Concentrate:</b> <span data-live="concentrate-flow">${(details.concentrate?.totalFlowKgPerSecond ?? 0).toFixed(3)}</span> kg/s</div>
        <div class="ws-ins-row"><b>Tailings:</b> <span data-live="tailings-flow">${(details.tailings?.totalFlowKgPerSecond ?? 0).toFixed(3)}</span> kg/s</div>`;
    }
    if (node.nodeType === 'roastingFurnace') {
      const thermo = details.thermochemical;
      html += `<div class="ws-ins-section-title">Thermochemical state</div>
        <div class="ws-ins-row"><b>Retained charge:</b> <span data-live="furnace-charge">${thermo.chargeMassKg.toFixed(3)}</span> kg</div>
        <div class="ws-ins-row"><b>Pending inlet:</b> <span data-live="furnace-pending">${thermo.pendingFeedMassKg.toFixed(3)}</span> kg</div>
        <div class="ws-ins-row"><b>Charge temperature:</b> <span data-live="furnace-temperature">${escHtml(formatTemperature(thermo.chargeTemperatureK))}</span></div>
        <div class="ws-ins-row"><b>Nominal mean residence:</b> <span data-live="furnace-residence">${thermo.meanResidenceTimeSeconds == null ? '—' : `${thermo.meanResidenceTimeSeconds.toFixed(2)} s`}</span></div>
        <div class="ws-ins-row"><b>Heater:</b> <span data-live="furnace-heater">${thermo.actualHeaterPowerKw.toFixed(2)}</span> / ${thermo.ratedHeaterPowerKw.toFixed(2)} kW</div>
        <div class="ws-ins-row"><b>Heat loss:</b> <span data-live="furnace-loss">${thermo.heatLossPowerKw.toFixed(2)}</span> kW</div>
        <div class="ws-ins-row"><b>Reaction heat demand:</b> <span data-live="furnace-reaction-power">${thermo.reactionPowerKw.toFixed(2)}</span> kW</div>
        <div class="ws-ins-row"><b>Goethite conversion this tick:</b> <span data-live="furnace-conversion">${thermo.goethiteConversionPercent.toFixed(2)}</span>%</div>
        <div class="ws-ins-row"><b>Solid product:</b> <span data-live="furnace-product">${thermo.solidProductRateKgPerSecond.toFixed(3)}</span> kg/s</div>
        <div class="ws-ins-row"><b>Exhaust:</b> <span data-live="furnace-exhaust">${thermo.exhaustRateKgPerSecond.toFixed(3)}</span> kg/s</div>
        <div class="ws-ins-comp"><b>Internal zones</b><div data-live-section="furnace-zones">${furnaceZonesHtml(thermo.zones)}</div></div>`;
    }
    html += `<div class="ws-ins-note" data-live="error"${details.lastError ? '' : ' hidden'}>${escHtml(details.lastError ?? '')}</div>`;
  } else if (hopper) {
    const details = hopperInspection(node);
    html += `<div class="ws-ins-row"><b>Stored:</b> <span data-live="stored">${details.storedMassKg.toFixed(3)}</span> kg</div>
      <div class="ws-ins-row"><b>Capacity:</b> ${details.capacityKg} kg</div>
      <div class="ws-ins-row"><b>Free:</b> <span data-live="free">${details.freeCapacityKg.toFixed(3)}</span> kg</div>
      <div class="ws-ins-row"><b>Physical form:</b> ${escHtml(details.physicalForm ?? 'unknown')}</div>
      <div class="ws-ins-row"><b>Temperature:</b> <span data-live="hopper-temperature">${escHtml(formatTemperature(details.temperatureK))}</span></div>
      <div class="ws-ins-row"><b>Thermal energy:</b> <span data-live="hopper-energy">${escHtml(formatEnergyMj(details.sensibleEnthalpyJ))}</span></div>
      <div class="ws-ins-note" data-live="thermal-error"${details.thermalError ? '' : ' hidden'}>${escHtml(details.thermalError ?? '')}</div>
      <div class="ws-ins-comp"><b>Composition</b><div data-live-section="components">${compactCompositionSummaryHtml(details.composition, 'no stored material')}</div></div>
      <div class="ws-ins-comp"><b>Particle Size</b><div data-live-section="particle-size-distribution">${summaryRowsHtml(details.particleSizeDistribution, 'no stored material')}</div></div>
      <div class="ws-ins-comp"><b>Liberation</b><div data-live-section="liberation-distribution">${summaryRowsHtml(details.liberationDistribution, 'no stored material')}</div></div>`;
  } else if (node.nodeType === 'exhaustVent') {
    const details = exhaustVentInspection(wsState.blueprint, node);
    html += `<div class="ws-ins-row"><b>Current gas flow:</b> <span data-live="vent-flow">${(details.input?.totalFlowKgPerSecond ?? 0).toFixed(3)}</span> kg/s</div>
      <div class="ws-ins-row"><b>Cumulative emitted:</b> <span data-live="vent-total">${details.totalEmittedMassKg.toFixed(3)}</span> kg</div>
      <div class="ws-ins-row"><b>Emitted-gas temperature:</b> <span data-live="vent-temperature">${escHtml(formatTemperature(details.temperatureK))}</span></div>
      <div class="ws-ins-row"><b>Cumulative sensible energy:</b> <span data-live="vent-energy">${escHtml(formatEnergyMj(details.sensibleEnthalpyJ))}</span></div>
      <div class="ws-ins-note" data-live="vent-thermal-error"${details.thermalError ? '' : ' hidden'}>${escHtml(details.thermalError ?? '')}</div>
      <div class="ws-ins-comp"><b>Emitted gas composition</b><div data-live-section="vent-components">${compactCompositionSummaryHtml(details.composition, 'no emitted gas')}</div></div>`;
  } else if (isFeature) {
    const details = featureInspection(wsState.world, wsState.blueprint, node);
    html += `<div class="ws-ins-row"><b>Name:</b> ${escHtml(details.name)}</div>
      <div class="ws-ins-row"><b>Feature type:</b> ${escHtml(details.featureType)}</div>
      <div class="ws-ins-section-title">Resources</div>
      <div class="ws-ins-comp">${featureResourcesHtml(details)}</div>
      <div class="ws-ins-section-title">Access</div>
      <div class="ws-ins-row"><b>Resource access:</b> ${details.resourceAccessAvailable ? 'Available' : 'Unavailable'}</div>
      <div class="ws-ins-row"><b>Connected extraction apparatus:</b> ${details.connectedExtractors.length ? details.connectedExtractors.map(item => escHtml(item.id)).join(', ') : 'None'}</div>`;
  }

  html += `<div class="ws-ins-action"><button class="ws-btn-disconnect" data-node-id="${escHtml(node.id)}">Remove all connections</button></div>`;
  if (removal.removable) {
    html += removal.ok
      ? `<div class="ws-ins-action"><button class="ws-btn-delete-node" data-node-id="${escHtml(node.id)}">Delete Node</button></div>`
      : `<div class="ws-ins-note">${escHtml(removal.reason)}</div><div class="ws-ins-action"><button class="ws-btn-delete-node" data-node-id="${escHtml(node.id)}" disabled>Delete Node</button></div>`;
  }
  return html;
}

function formatConnectionInspector(connection) {
  const details = connectionInspection(wsState.blueprint, connection);
  if (connection.kind === 'resource-access') {
    return `<div class="ws-ins-type">RESOURCE ACCESS</div>
      <div class="ws-ins-row"><b>From:</b> ${escHtml(details.sourceNodeId)} / ${escHtml(details.sourcePortId)}</div>
      <div class="ws-ins-row"><b>To:</b> ${escHtml(details.targetNodeId)} / ${escHtml(details.targetPortId)}</div>
      <div class="ws-ins-note">This edge grants access to a physical source. Matter begins flowing only from the Extractor's material output.</div>
      <div class="ws-ins-action"><button class="ws-btn-disconnect" data-conn-id="${escHtml(connection.id)}">Disconnect</button></div>`;
  }
  const gas = details.physicalForm === 'gas';
  return `<div class="ws-ins-type">CONNECTION</div>
    <div class="ws-ins-row"><b>From:</b> ${escHtml(details.sourceNodeId)} / ${escHtml(details.sourcePortId)}</div>
    <div class="ws-ins-row"><b>To:</b> ${escHtml(details.targetNodeId)} / ${escHtml(details.targetPortId)}</div>
    <div class="ws-ins-row"><b>Total flow:</b> <span data-live="flow">${details.totalFlowKgPerSecond.toFixed(3)}</span> kg/s</div>
    <div class="ws-ins-row"><b>Physical form:</b> ${escHtml(details.physicalForm ?? 'unknown')}</div>
    <div class="ws-ins-row"><b>Temperature:</b> <span data-live="stream-temperature">${escHtml(formatTemperature(details.temperatureK))}</span></div>
    <div class="ws-ins-row"><b>Specific sensible enthalpy:</b> <span data-live="stream-enthalpy">${details.specificSensibleEnthalpyJPerKg.toFixed(0)}</span> J/kg</div>
    <div class="ws-ins-note" data-live="stream-thermal-error"${details.thermalError ? '' : ' hidden'}>${escHtml(details.thermalError ?? '')}</div>
    <div class="ws-ins-comp"><b>Composition</b><div data-live-section="stream-components">${compactCompositionSummaryHtml(details.composition, 'no flow', 'kg/s')}</div></div>
    ${gas ? '' : `<div class="ws-ins-comp"><b>Particle Size</b><div data-live-section="stream-size">${summaryRowsHtml(details.particleSizeDistribution, 'no flow', 'kg/s')}</div></div>
    <div class="ws-ins-comp"><b>Liberation</b><div data-live-section="stream-liberation">${summaryRowsHtml(details.liberationDistribution, 'no flow', 'kg/s')}</div></div>`}
    <div class="ws-ins-action"><button class="ws-btn-disconnect" data-conn-id="${escHtml(connection.id)}">Disconnect</button></div>`;
}

function updateInspector(force = false) {
  const body = el('ws-inspector-body');
  if (!body || !wsState.blueprint) return;
  const selectedNode = inspector.selectedNodeId ? wsState.blueprint.nodes[inspector.selectedNodeId] : null;
  const removal = selectedNode ? nodeRemovalEligibility(wsState.blueprint, selectedNode) : null;
  const key = `${inspector.selectedNodeId ?? ''}:${inspector.selectedConnId ?? ''}:${inspector.message}:${removal?.removable ?? ''}:${removal?.ownedMatterKg ?? ''}`;
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
      const temperature = body.querySelector('[data-live="hopper-temperature"]');
      const energy = body.querySelector('[data-live="hopper-energy"]');
      const thermalError = body.querySelector('[data-live="thermal-error"]');
      const components = body.querySelector('[data-live-section="components"]');
      const size = body.querySelector('[data-live-section="particle-size-distribution"]');
      const liberation = body.querySelector('[data-live-section="liberation-distribution"]');
      if (stored) stored.textContent = details.storedMassKg.toFixed(3);
      if (free) free.textContent = details.freeCapacityKg.toFixed(3);
      if (temperature) temperature.textContent = formatTemperature(details.temperatureK);
      if (energy) energy.textContent = formatEnergyMj(details.sensibleEnthalpyJ);
      if (thermalError) {
        thermalError.textContent = details.thermalError ?? '';
        thermalError.hidden = !details.thermalError;
      }
      replaceInspectorSectionHtml(components, compactCompositionSummaryHtml(details.composition, 'no stored material'));
      if (size) size.innerHTML = summaryRowsHtml(details.particleSizeDistribution, 'no stored material');
      if (liberation) liberation.innerHTML = summaryRowsHtml(details.liberationDistribution, 'no stored material');
    } else if (MACHINE_NODE_TYPES.has(node.nodeType)) {
      const details = machineInspection(wsState.blueprint, node);
      const feed = body.querySelector('[data-live="machine-feed"]');
      const product = body.querySelector('[data-live="machine-product"]');
      if (feed) feed.textContent = details.actualFeedKgPerSecond.toFixed(3);
      if (product) product.textContent = details.actualProductKgPerSecond.toFixed(3);
      for (const [name, stream] of [['feed', details.feed], ['concentrate', details.concentrate], ['tailings', details.tailings]]) {
        const span = body.querySelector(`[data-live="${name}-flow"]`);
        if (span) span.textContent = (stream?.totalFlowKgPerSecond ?? 0).toFixed(3);
      }
      if (node.nodeType === 'roastingFurnace') {
        const thermo = details.thermochemical;
        const values = {
          'furnace-charge': `${thermo.chargeMassKg.toFixed(3)}`,
          'furnace-pending': `${thermo.pendingFeedMassKg.toFixed(3)}`,
          'furnace-temperature': formatTemperature(thermo.chargeTemperatureK),
          'furnace-residence': thermo.meanResidenceTimeSeconds == null ? '—' : `${thermo.meanResidenceTimeSeconds.toFixed(2)} s`,
          'furnace-heater': thermo.actualHeaterPowerKw.toFixed(2),
          'furnace-loss': thermo.heatLossPowerKw.toFixed(2),
          'furnace-reaction-power': thermo.reactionPowerKw.toFixed(2),
          'furnace-conversion': thermo.goethiteConversionPercent.toFixed(2),
          'furnace-product': thermo.solidProductRateKgPerSecond.toFixed(3),
          'furnace-exhaust': thermo.exhaustRateKgPerSecond.toFixed(3),
        };
        for (const [name, value] of Object.entries(values)) {
          const span = body.querySelector(`[data-live="${name}"]`);
          if (span) span.textContent = value;
        }
        const zones = body.querySelector('[data-live-section="furnace-zones"]');
        if (zones) zones.innerHTML = furnaceZonesHtml(thermo.zones);
      }
      const error = body.querySelector('[data-live="error"]');
      if (error) {
        error.textContent = details.lastError ?? '';
        error.hidden = !details.lastError;
      }
    } else if (node.nodeType === 'exhaustVent') {
      const details = exhaustVentInspection(wsState.blueprint, node);
      const values = {
        'vent-flow': (details.input?.totalFlowKgPerSecond ?? 0).toFixed(3),
        'vent-total': details.totalEmittedMassKg.toFixed(3),
        'vent-temperature': formatTemperature(details.temperatureK),
        'vent-energy': formatEnergyMj(details.sensibleEnthalpyJ),
      };
      for (const [name, value] of Object.entries(values)) {
        const span = body.querySelector(`[data-live="${name}"]`);
        if (span) span.textContent = value;
      }
      const thermalError = body.querySelector('[data-live="vent-thermal-error"]');
      if (thermalError) {
        thermalError.textContent = details.thermalError ?? '';
        thermalError.hidden = !details.thermalError;
      }
      replaceInspectorSectionHtml(
        body.querySelector('[data-live-section="vent-components"]'),
        compactCompositionSummaryHtml(details.composition, 'no emitted gas'),
      );
    }
  }

  if (inspector.selectedConnId) {
    const connection = wsState.blueprint.connections[inspector.selectedConnId];
    if (connection?.kind === 'material') {
      const details = streamInspection(getStreamForConnection(wsState.blueprint, inspector.selectedConnId));
      const flow = body.querySelector('[data-live="flow"]');
      const temperature = body.querySelector('[data-live="stream-temperature"]');
      const enthalpy = body.querySelector('[data-live="stream-enthalpy"]');
      const thermalError = body.querySelector('[data-live="stream-thermal-error"]');
      const components = body.querySelector('[data-live-section="stream-components"]');
      const size = body.querySelector('[data-live-section="stream-size"]');
      const liberation = body.querySelector('[data-live-section="stream-liberation"]');
      if (flow) flow.textContent = details.totalFlowKgPerSecond.toFixed(3);
      if (temperature) temperature.textContent = formatTemperature(details.temperatureK);
      if (enthalpy) enthalpy.textContent = details.specificSensibleEnthalpyJPerKg.toFixed(0);
      if (thermalError) {
        thermalError.textContent = details.thermalError ?? '';
        thermalError.hidden = !details.thermalError;
      }
      replaceInspectorSectionHtml(components, compactCompositionSummaryHtml(details.composition, 'no flow', 'kg/s'));
      if (size) size.innerHTML = summaryRowsHtml(details.particleSizeDistribution, 'no flow', 'kg/s');
      if (liberation) liberation.innerHTML = summaryRowsHtml(details.liberationDistribution, 'no flow', 'kg/s');
    }
  }
}

function onInspectorParameterChange(event) {
  const input = event.target.closest('.ws-apparatus-parameter');
  if (!input) return;
  try {
    setApparatusParameter(
      wsState.blueprint,
      input.dataset.nodeId,
      input.dataset.parameterId,
      Number(input.value),
    );
    queueRuntimeReconfigure();
    inspector.message = '';
  } catch (error) {
    inspector.message = error.message;
  }
  inspector.renderKey = null;
  updateInspector(true);
}

function onInspectorClick(event) {
  const enable = event.target.closest('.ws-btn-enable');
  if (enable) {
    const node = wsState.blueprint.nodes[enable.dataset.nodeId];
    if (node) {
      setNodeEnabled(wsState.blueprint, node.id, !node.enabled);
      queueRuntimeReconfigure();
    }
    inspector.renderKey = null;
    updateInspector(true);
    return;
  }

  const deleteButton = event.target.closest('.ws-btn-delete-node');
  if (deleteButton) {
    attemptNodeRemoval(deleteButton.dataset.nodeId);
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
  queueRuntimeReconfigure();
  inspector.renderKey = null;
  renderSiteNodes();
}

function onToggleWorldSimulation() {
  if (wsState.world?.simulation?.running) stopSimulation();
  else startSimulation();
  updateWorldControls();
}

function startSimulation() {
  if (wsState.simRunning || !wsState.world || !wsState.realtimeRuntime || wsState.runtimeError) return;
  const epoch = wsState.runtimeEpoch;
  wsState.simRunning = true;
  wsState.world.simulation.running = true;
  wsState.simLastTime = performance.now();
  wsState.simAccumulatedS = 0;
  Promise.resolve(wsState.realtimeRuntime.resume()).then(() => {
    if (epoch !== wsState.runtimeEpoch) return;
    projectRuntimeSnapshot(wsState.realtimeRuntime.snapshot);
    updateWorldControls();
  }).catch(error => handleRuntimeFailure(error, epoch));
  wsState.simRafId = requestAnimationFrame(simLoop);
  updateWorldControls();
}

function stopSimulation({ pauseRuntime = true } = {}) {
  const epoch = wsState.runtimeEpoch;
  wsState.simRunning = false;
  if (wsState.world?.simulation) wsState.world.simulation.running = false;
  if (pauseRuntime && wsState.realtimeRuntime) {
    Promise.resolve(wsState.realtimeRuntime.pause())
      .then(() => projectRuntimeSnapshot(wsState.realtimeRuntime?.snapshot))
      .catch(error => handleRuntimeFailure(error, epoch));
  }
  if (wsState.simRafId != null) cancelAnimationFrame(wsState.simRafId);
  wsState.simRafId = null;
  updateWorldControls();
}

function renderRealtimePresentation() {
  updateWorldControls();
  if (wsState.currentLevel === 'site') {
    renderSiteNodes();
    return;
  }
  const definition = systemWorkspaceDefinition();
  renderSystemConnections(el('ws-system-svg'), definition);
  updateCompositeInspector();
}

function simLoop(now) {
  if (!wsState.simRunning) return;
  const elapsed = Math.min((now - wsState.simLastTime) / 1000, 0.25);
  wsState.simLastTime = now;
  wsState.simAccumulatedS += elapsed;

  // Never queue catch-up physics. The Worker owns the fixed scheduler state and
  // the browser permits at most one outstanding 0.1 s step; slow hardware makes
  // world time advance more slowly instead of creating an unbounded backlog.
  if (
    wsState.simAccumulatedS >= SIMULATION_STEP_S
    && !wsState.simStepInFlight
    && wsState.runtimeMutationPending === 0
    && wsState.realtimeRuntime
  ) {
    const epoch = wsState.runtimeEpoch;
    wsState.simAccumulatedS -= SIMULATION_STEP_S;
    wsState.simStepInFlight = true;
    Promise.resolve(wsState.realtimeRuntime.stepFixed(SIMULATION_STEP_S)).then(result => {
      if (epoch !== wsState.runtimeEpoch) return;
      projectRuntimeSnapshot(result?.snapshot ?? wsState.realtimeRuntime.snapshot);
      if (result?.advanced) renderRealtimePresentation();
    }).catch(error => handleRuntimeFailure(error, epoch)).finally(() => {
      if (epoch === wsState.runtimeEpoch) wsState.simStepInFlight = false;
    });
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
  const siteId = wsState.selectedSiteId;
  if (!siteId) return;
  clearCatalogPointerGesture();
  const session = createSiteSession(wsState.selectedOccurrenceId, siteId);
  wsState.siteSessions[siteId] = session;
  registerSimulationSession(wsState.world, siteId, session.blueprint, session.boundaryNode?.childWorkspaceId);
  invalidateNavigationIndex();
  queueRuntimeReconfigure({ resetNodeIds: Object.keys(session.blueprint.nodes ?? {}) });
  wsState.blueprint = session.blueprint;
  wsState.blueprintLayout = session.blueprintLayout;
  inspector.selectedNodeId = null;
  inspector.selectedConnId = null;
  inspector.renderKey = null;
  renderSiteWorkspace(el('ws-main'));
  renderNavigationDrawer();
  renderNodeCatalogDrawer();
}

export function renderWorkspace() {
  const container = el('ws-main');
  if (!container) return;
  renderBreadcrumbs();
  if (wsState.currentLevel === 'region') renderRegionWorkspace(container);
  else if (wsState.currentLevel === 'site') renderSiteWorkspace(container);
  else renderPlanetWorkspace(container);
  renderNavigationDrawer();
  renderNodeCatalogDrawer();
}

export function initWorkspace(world, knowledge) {
  if (wsState.world) stopSimulation({ pauseRuntime: false });
  wsState.realtimeRuntime?.dispose();
  if (wsState.world) clearRustWorkerRuntimePresentation(wsState.world);
  wsState.runtimeEpoch += 1;
  wsState.realtimeRuntime = null;
  wsState.runtimeReady = false;
  wsState.runtimeError = null;
  wsState.runtimeMutationPending = 0;
  wsState.runtimeMutationChain = null;
  wsState.simStepInFlight = false;
  wsState.dragTrackingCleanup?.();
  wsState.dragTrackingCleanup = null;
  wsState.navigationEventController?.abort();
  wsState.navigationEventController = null;
  wsState.navigationEventsInstalled = false;
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
  wsState.navigationOpen = false;
  wsState.navigationQuery = '';
  wsState.navigationHiddenCategories = new Set();
  wsState.navigationManualExpandedKeys = new Set([`planet:${world.planetId}`]);
  wsState.navigationIndexCache = null;
  wsState.nodeCatalogOpen = false;
  wsState.nodeCatalogQuery = '';
  wsState.nodeCatalogHiddenCategories = new Set();
  wsState.nodeCatalogCollapsedCategories = new Set();
  clearCatalogPointerGesture();
  wsState.suppressCatalogClick = false;
  inspector.selectedNodeId = null;
  inspector.selectedConnId = null;
  inspector.selectedSystemId = null;
  inspector.selectedTransferId = null;
  inspector.message = '';
  inspector.renderKey = null;
  installNavigationEvents();
  const navigationSearch = el('ws-navigation-search');
  if (navigationSearch) navigationSearch.value = '';
  renderWorkspace();

  const epoch = wsState.runtimeEpoch;
  try {
    wsState.realtimeRuntime = createRealtimeRuntime(world);
  } catch (error) {
    handleRuntimeFailure(error, epoch);
    return;
  }
  wsState.realtimeRuntime.ready.then(payload => {
    if (epoch !== wsState.runtimeEpoch) return;
    wsState.runtimeReady = true;
    projectRuntimeSnapshot(payload?.snapshot ?? wsState.realtimeRuntime.snapshot);
    renderRealtimePresentation();
    startSimulation();
  }).catch(error => handleRuntimeFailure(error, epoch));
}

export function updateWorkspaceKnowledge(knowledge) {
  wsState.knowledge = knowledge;
  if (wsState.currentLevel !== 'site') renderWorkspace();
  else renderNavigationDrawer();
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', renderWorkspace);
