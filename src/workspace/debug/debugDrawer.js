import { wsState, inspector } from '../workspaceState.js';
import { SIMULATION_STEP_S } from '../../simulation/simulationEngine.js';
import { applyRustWorkerRuntimeSnapshot } from '../../simulation/runtimePresentation.js';
import {
  placeRoastingTestFactories,
  removeRoastingTestFixture,
} from '../../debug/fixtures/roastingBenchmark.js';

const FRAME_SAMPLE_LIMIT = 300;
const DEBUG_REFRESH_MS = 250;

let installedController = null;
let drawerOpen = false;
let frameRafId = null;
let lastFrameAtMs = null;
let refreshTimerId = null;
let frameSamplesMs = [];
let fixtureRecords = [];
let lastRealtimeSample = null;
let liveRealtimeFactor = null;
let deepProfilingEnabled = false;
let profileQueryPending = false;
let lastProfile = null;

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function formatMs(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)} ms` : '—';
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatBudget(valueMs, percent) {
  if (!Number.isFinite(valueMs) || !Number.isFinite(percent)) return '—';
  return `${valueMs.toFixed(3)} ms · ${percent.toFixed(2)}%`;
}

function setText(root, name, value) {
  const element = root.querySelector(`[data-debug-stat="${name}"]`);
  if (element) element.textContent = value;
}

function startFrameSampler() {
  if (frameRafId != null || typeof requestAnimationFrame !== 'function') return;
  lastFrameAtMs = null;
  const sample = timestamp => {
    if (!drawerOpen) {
      frameRafId = null;
      lastFrameAtMs = null;
      return;
    }
    if (lastFrameAtMs != null) {
      const duration = timestamp - lastFrameAtMs;
      if (Number.isFinite(duration) && duration > 0 && duration < 1000) {
        frameSamplesMs.push(duration);
        if (frameSamplesMs.length > FRAME_SAMPLE_LIMIT) frameSamplesMs.shift();
      }
    }
    lastFrameAtMs = timestamp;
    frameRafId = requestAnimationFrame(sample);
  };
  frameRafId = requestAnimationFrame(sample);
}

function stopFrameSampler() {
  if (frameRafId != null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frameRafId);
  frameRafId = null;
  lastFrameAtMs = null;
}

function collectSimulationStats() {
  const sessions = [...new Set(Object.values(wsState.world?.simulation?.sessions ?? {}))];
  const totals = {
    sessions: sessions.length,
    nodes: 0,
    activeMachines: 0,
    connections: 0,
    furnaces: 0,
    activeFurnaceZones: 0,
    solverEvaluations: 0,
  };

  for (const blueprint of sessions) {
    totals.nodes += Object.keys(blueprint?.nodes ?? {}).length;
    totals.connections += Object.keys(blueprint?.connections ?? {}).length;
    for (const node of Object.values(blueprint?.nodes ?? {})) {
      if (node?.enabled === true) totals.activeMachines += 1;
      if (node?.nodeType === 'roastingFurnace') {
        totals.furnaces += 1;
        totals.solverEvaluations += node.lastSolverEvaluationCount ?? 0;
      }
    }
  }
  return totals;
}

function updateLiveRates() {
  const elapsedSeconds = wsState.world?.simulation?.elapsedSeconds ?? 0;
  const wallNow = nowMs();
  if (lastRealtimeSample) {
    const wallDeltaSeconds = (wallNow - lastRealtimeSample.wallMs) / 1000;
    const simulationDeltaSeconds = elapsedSeconds - lastRealtimeSample.simulationSeconds;
    if (wallDeltaSeconds > 0.05) liveRealtimeFactor = simulationDeltaSeconds / wallDeltaSeconds;
  }
  lastRealtimeSample = { wallMs: wallNow, simulationSeconds: elapsedSeconds };
}

function renderProfile(root, profile) {
  lastProfile = profile;
  if (!profile?.enabled || !profile.profiledTicks) {
    setText(root, 'profile-tick-average', profile?.enabled ? 'Collecting…' : '—');
    setText(root, 'profile-apparatus-average', '—');
    setText(root, 'profile-other-average', '—');
    const breakdown = root.querySelector('#ws-debug-profile-breakdown');
    if (breakdown) breakdown.textContent = profile?.enabled
      ? 'Collecting authoritative Rust timing samples…'
      : 'Enable deep profiling to measure Rust apparatus hotspots.';
    return;
  }

  setText(root, 'profile-tick-average', formatBudget(profile.tickAverageMs, profile.tickBudgetPercent));
  setText(root, 'profile-apparatus-average', formatBudget(profile.apparatusAverageMs, profile.apparatusBudgetPercent));
  setText(root, 'profile-other-average', formatBudget(profile.otherAverageMs, profile.otherBudgetPercent));

  const breakdown = root.querySelector('#ws-debug-profile-breakdown');
  if (!breakdown) return;
  const typeRows = (profile.byType ?? []).slice(0, 10).map(row =>
    `<div class="ws-debug-profile-row"><span>${escapeHtml(row.type)}</span><span>${escapeHtml(formatBudget(row.averageMsPerTick, row.budgetPercent))}</span></div>`
  ).join('');
  const nodeRows = (profile.nodes ?? []).slice(0, 5).map(row =>
    `<div class="ws-debug-profile-row"><span>${escapeHtml(row.nodeId)}</span><span>${escapeHtml(formatBudget(row.averageMsPerTick, row.budgetPercent))}</span></div>`
  ).join('');
  breakdown.innerHTML = `<div class="ws-debug-profile-group"><div class="ws-debug-profile-heading">By apparatus type · ${profile.profiledTicks} ticks</div>${typeRows || '<div>—</div>'}</div><div class="ws-debug-profile-group"><div class="ws-debug-profile-heading">Hottest nodes</div>${nodeRows || '<div>—</div>'}</div>`;
}

async function refreshDeepProfile(root) {
  if (!deepProfilingEnabled || profileQueryPending || !wsState.realtimeRuntime) return;
  profileQueryPending = true;
  try {
    renderProfile(root, await wsState.realtimeRuntime.queryProfile());
  } catch (error) {
    const breakdown = root.querySelector('#ws-debug-profile-breakdown');
    if (breakdown) breakdown.textContent = `Profiling unavailable: ${error.message}`;
  } finally {
    profileQueryPending = false;
  }
}

async function setDeepProfiling(root, enabled, { reset = false } = {}) {
  const runtime = wsState.realtimeRuntime;
  const checkbox = root.querySelector('#ws-debug-deep-profiling');
  deepProfilingEnabled = Boolean(enabled && runtime);
  if (checkbox) checkbox.checked = deepProfilingEnabled;
  lastProfile = null;
  renderProfile(root, { enabled: deepProfilingEnabled, profiledTicks: 0 });
  if (!runtime) return;
  try {
    const profile = await runtime.setDeepProfiling(deepProfilingEnabled, { reset });
    renderProfile(root, profile);
  } catch (error) {
    deepProfilingEnabled = false;
    if (checkbox) checkbox.checked = false;
    const breakdown = root.querySelector('#ws-debug-profile-breakdown');
    if (breakdown) breakdown.textContent = `Profiling unavailable: ${error.message}`;
  }
}

function renderDebugStats(root) {
  if (!drawerOpen || !root?.isConnected) return;
  const frameAverage = mean(frameSamplesMs);
  const frameP95 = percentile(frameSamplesMs, 0.95);
  const fps = frameAverage > 0 ? 1000 / frameAverage : 0;
  updateLiveRates();
  const simulation = collectSimulationStats();
  const backlogMs = Math.max(0, (wsState.simAccumulatedS ?? 0) * 1000);
  const heap = globalThis.performance?.memory;

  setText(root, 'fps', frameSamplesMs.length ? fps.toFixed(1) : '—');
  setText(root, 'frame-average', frameSamplesMs.length ? formatMs(frameAverage) : '—');
  setText(root, 'frame-p95', frameSamplesMs.length ? formatMs(frameP95) : '—');
  setText(root, 'backlog', formatMs(backlogMs));
  setText(root, 'realtime-factor', liveRealtimeFactor == null ? '—' : `${liveRealtimeFactor.toFixed(2)}×`);
  setText(root, 'apparatus-cpu-tick', 'Rust/WASM');
  setText(root, 'sessions', String(simulation.sessions));
  setText(root, 'nodes', String(simulation.nodes));
  setText(root, 'active-machines', String(simulation.activeMachines));
  setText(root, 'connections', String(simulation.connections));
  setText(root, 'furnaces', String(simulation.furnaces));
  setText(root, 'furnace-zones', String(simulation.activeFurnaceZones));
  setText(root, 'solver-evaluations', String(simulation.solverEvaluations));
  setText(root, 'heap-used', heap?.usedJSHeapSize ? `${(heap.usedJSHeapSize / 1048576).toFixed(1)} MB` : 'Unavailable');
  if (deepProfilingEnabled) void refreshDeepProfile(root);
}


function stopRefreshLoop() {
  if (refreshTimerId != null) clearInterval(refreshTimerId);
  refreshTimerId = null;
}

function startRefreshLoop(root) {
  stopRefreshLoop();
  renderDebugStats(root);
  refreshTimerId = setInterval(() => renderDebugStats(root), DEBUG_REFRESH_MS);
}

function closeOtherPanels(root) {
  wsState.navigationOpen = false;
  wsState.nodeCatalogOpen = false;
  for (const [drawerId, toggleId] of [
    ['ws-navigation-drawer', 'ws-navigation-toggle'],
    ['ws-node-catalog-drawer', 'ws-node-catalog-toggle'],
  ]) {
    const drawer = root.querySelector(`#${drawerId}`);
    const toggle = root.querySelector(`#${toggleId}`);
    if (drawer) {
      drawer.hidden = true;
      drawer.setAttribute('aria-hidden', 'true');
    }
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }
}

function applyDrawerVisibility(root) {
  const drawer = root.querySelector('#ws-debug-drawer');
  const toggle = root.querySelector('#ws-debug-toggle');
  if (!drawer || !toggle) return;
  drawer.hidden = !drawerOpen;
  drawer.setAttribute('aria-hidden', String(!drawerOpen));
  toggle.setAttribute('aria-expanded', String(drawerOpen));
  if (drawerOpen) {
    closeOtherPanels(root);
    startFrameSampler();
    startRefreshLoop(root);
  } else {
    stopFrameSampler();
    stopRefreshLoop();
  }
}

function setDrawerOpen(root, open) {
  drawerOpen = Boolean(open);
  if (!drawerOpen && deepProfilingEnabled) void setDeepProfiling(root, false);
  applyDrawerVisibility(root);
}

async function refreshCurrentWorkspace() {
  if (wsState.currentLevel !== 'site' || !wsState.selectedSiteId) return;
  const { navigateTo } = await import('../workspaceController.js');
  navigateTo('site', {
    siteId: wsState.selectedSiteId,
    occurrenceId: wsState.selectedOccurrenceId,
  });
}

function selectedFactoryCount(root) {
  const value = Number(root.querySelector('#ws-debug-factory-count')?.value ?? 1);
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function status(root, message, error = false) {
  const element = root.querySelector('#ws-debug-status');
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('ws-debug-status--error', error);
}

async function placeFactories(root) {
  if (wsState.currentLevel !== 'site' || !wsState.blueprint || !wsState.blueprintLayout) {
    status(root, 'Open a Site before placing a test factory.', true);
    return;
  }
  try {
    const preferredFeatureNodeId = wsState.blueprint.nodes?.[inspector.selectedNodeId]?.nodeType === 'feature'
      ? inspector.selectedNodeId
      : null;
    const fixture = placeRoastingTestFactories({
      blueprint: wsState.blueprint,
      blueprintLayout: wsState.blueprintLayout,
      world: wsState.world,
      count: selectedFactoryCount(root),
      preferredFeatureNodeId,
    });
    fixtureRecords.push({ blueprint: wsState.blueprint, layout: wsState.blueprintLayout, fixture });
    status(root, `Placed ${fixture.manifests.length} roasting test line${fixture.manifests.length === 1 ? '' : 's'}.`);
    await refreshCurrentWorkspace();
  } catch (error) {
    status(root, error.message, true);
  }
}

async function removeFactories(root) {
  const currentBlueprint = wsState.blueprint;
  const records = fixtureRecords.filter(record => record.blueprint === currentBlueprint);
  for (const record of records) removeRoastingTestFixture(record.blueprint, record.layout, record.fixture);
  fixtureRecords = fixtureRecords.filter(record => record.blueprint !== currentBlueprint);
  status(root, records.length ? `Removed ${records.length} debug fixture${records.length === 1 ? '' : 's'}.` : 'No debug fixtures are present in this Site.');
  if (records.length) await refreshCurrentWorkspace();
}

async function stepWorld(root, seconds) {
  const runtime = wsState.realtimeRuntime;
  if (!runtime) return status(root, 'Rust/WASM runtime is not initialized.', true);
  const ticks = Math.floor((seconds + 1e-12) / SIMULATION_STEP_S);
  const wasRunning = runtime.running;
  try {
    if (!wasRunning) await runtime.resume();
    const result = await runtime.advanceFixedSteps(ticks);
    applyRustWorkerRuntimeSnapshot(wsState.world, runtime, result?.snapshot ?? runtime.snapshot);
    if (!wasRunning) await runtime.pause();
    if (!wasRunning && wsState.world?.simulation) wsState.world.simulation.running = false;
    status(root, `Advanced Rust/WASM world by ${(ticks * SIMULATION_STEP_S).toFixed(1)} s (${ticks} ticks).`);
    await refreshCurrentWorkspace();
  } catch (error) {
    status(root, error.message, true);
  }
}

function resetStats(root) {
  frameSamplesMs = [];
  liveRealtimeFactor = null;
  lastRealtimeSample = null;
  lastProfile = null;
  if (deepProfilingEnabled) void setDeepProfiling(root, true, { reset: true });
  status(root, 'Performance statistics reset.');
  renderDebugStats(root);
}

function updatePauseButton(root) {
  const button = root.querySelector('[data-debug-action="toggle-pause"]');
  if (button) button.textContent = wsState.world?.simulation?.running ? 'Pause World' : 'Resume World';
}

export function installDebugDrawer(root) {
  installedController?.abort();
  installedController = new AbortController();
  const signal = installedController.signal;
  if (!root) return;

  const toggle = root.querySelector('#ws-debug-toggle');
  if (!toggle) return;
  applyDrawerVisibility(root);
  updatePauseButton(root);
  deepProfilingEnabled = false;
  profileQueryPending = false;
  lastProfile = null;
  const profilingCheckbox = root.querySelector('#ws-debug-deep-profiling');
  if (profilingCheckbox) profilingCheckbox.checked = false;
  if (wsState.realtimeRuntime) void wsState.realtimeRuntime.setDeepProfiling(false).catch(() => {});

  root.addEventListener('change', event => {
    if (event.target?.id === 'ws-debug-deep-profiling') {
      void setDeepProfiling(root, event.target.checked, { reset: event.target.checked });
    }
  }, { signal });

  root.addEventListener('click', async event => {
    if (event.target.closest('#ws-navigation-toggle, #ws-node-catalog-toggle')) {
      if (drawerOpen) setDrawerOpen(root, false);
      return;
    }
    if (event.target.closest('#ws-debug-toggle')) {
      setDrawerOpen(root, !drawerOpen);
      return;
    }
    if (event.target.closest('#ws-debug-close')) {
      setDrawerOpen(root, false);
      return;
    }
    const action = event.target.closest('[data-debug-action]')?.dataset.debugAction;
    if (!action) return;
    if (action === 'reset-stats') resetStats(root);
    else if (action === 'place-factories') await placeFactories(root);
    else if (action === 'remove-factories') await removeFactories(root);
    else if (action === 'step-0.1') await stepWorld(root, 0.1);
    else if (action === 'step-1') await stepWorld(root, 1);
    else if (action === 'step-10') await stepWorld(root, 10);
    else if (action === 'toggle-pause') {
      document.getElementById('ws-world-toggle')?.click();
      updatePauseButton(root);
    }
  }, { signal });

}
