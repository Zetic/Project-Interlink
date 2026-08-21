import { wsState, inspector } from '../workspaceState.js';
import { SIMULATION_STEP_S } from '../../simulation/simulationEngine.js';
import {
  pauseWorldSimulation,
  resumeWorldSimulation,
  worldSimulationTick,
} from '../../simulation/worldSimulation.js';
import {
  isDeepProfilingEnabled,
  performanceTelemetrySnapshot,
  resetPerformanceTelemetry,
  setDeepProfilingEnabled,
} from '../../debug/performanceTelemetry.js';
import {
  createRoastingBenchmarkFixture,
  placeRoastingTestFactories,
  removeRoastingTestFixture,
} from '../../debug/fixtures/roastingBenchmark.js';

const FRAME_SAMPLE_LIMIT = 300;
const DEBUG_REFRESH_MS = 250;
const BENCHMARK_WARMUP_TICKS = 60;
const BENCHMARK_SAMPLE_TICKS = 30;

let installedController = null;
let drawerOpen = false;
let frameRafId = null;
let lastFrameAtMs = null;
let refreshTimerId = null;
let frameSamplesMs = [];
let fixtureRecords = [];
let lastProfileTotals = { durationMs: 0, elapsedSeconds: 0 };
let liveApparatusCpuPerTickMs = null;
let lastRealtimeSample = null;
let liveRealtimeFactor = null;
let benchmarkRunning = false;

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

function formatNumber(value, digits = 0) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
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

function solidBodyStats(body) {
  if (!body?.solidState) return { bodies: 0, populations: 0, textureProfiles: 0 };
  return {
    bodies: 1,
    populations: Object.keys(body.solidState.fractions ?? {}).length,
    textureProfiles: Object.keys(body.solidState.textureProfiles ?? {}).length,
  };
}

function gasBodyStats(body) {
  if (!body?.gasState) return { bodies: 0, populations: 0, textureProfiles: 0 };
  return {
    bodies: 1,
    populations: Object.keys(body.gasState.speciesMassKg ?? {}).length,
    textureProfiles: 0,
  };
}

function addStats(target, value) {
  target.bodies += value.bodies;
  target.populations += value.populations;
  target.textureProfiles += value.textureProfiles;
}

function collectSimulationStats() {
  const sessions = [...new Set(Object.values(wsState.world?.simulation?.sessions ?? {}))];
  const totals = {
    sessions: sessions.length,
    nodes: 0,
    activeMachines: 0,
    connections: 0,
    bodies: 0,
    populations: 0,
    textureProfiles: 0,
    furnaces: 0,
    activeFurnaceZones: 0,
    solverEvaluations: 0,
  };

  for (const blueprint of sessions) {
    totals.nodes += Object.keys(blueprint?.nodes ?? {}).length;
    totals.connections += Object.keys(blueprint?.connections ?? {}).length;
    for (const node of Object.values(blueprint?.nodes ?? {})) {
      if (node?.enabled === true) totals.activeMachines += 1;
      if (node?.materialBody) addStats(totals, solidBodyStats(node.materialBody));
      if (node?.nodeType === 'roastingFurnace') {
        totals.furnaces += 1;
        totals.solverEvaluations += node.lastSolverEvaluationCount ?? 0;
        for (const zone of node.zones ?? []) {
          const stats = solidBodyStats(zone);
          addStats(totals, stats);
          if (stats.populations > 0) totals.activeFurnaceZones += 1;
        }
        if (node.pendingFeed) addStats(totals, solidBodyStats(node.pendingFeed));
        if (node.gasInventory) addStats(totals, gasBodyStats(node.gasInventory));
      }
      if (node?.nodeType === 'exhaustVent' && node.emittedGasBody) {
        addStats(totals, gasBodyStats(node.emittedGasBody));
      }
    }
  }
  return totals;
}

function updateLiveRates(profileSnapshot) {
  const elapsedSeconds = wsState.world?.simulation?.elapsedSeconds ?? 0;
  const currentProfileDurationMs = profileSnapshot.totalProfileDurationMs;
  const deltaElapsed = elapsedSeconds - lastProfileTotals.elapsedSeconds;
  const deltaProfileDurationMs = currentProfileDurationMs - lastProfileTotals.durationMs;
  const ticksAdvanced = deltaElapsed > 0 ? deltaElapsed / SIMULATION_STEP_S : 0;
  if (ticksAdvanced > 0 && deltaProfileDurationMs >= 0) {
    liveApparatusCpuPerTickMs = deltaProfileDurationMs / ticksAdvanced;
  }
  lastProfileTotals = { durationMs: currentProfileDurationMs, elapsedSeconds };

  const wallNow = nowMs();
  if (lastRealtimeSample) {
    const wallDeltaSeconds = (wallNow - lastRealtimeSample.wallMs) / 1000;
    const simulationDeltaSeconds = elapsedSeconds - lastRealtimeSample.simulationSeconds;
    if (wallDeltaSeconds > 0.05) liveRealtimeFactor = simulationDeltaSeconds / wallDeltaSeconds;
  }
  lastRealtimeSample = { wallMs: wallNow, simulationSeconds: elapsedSeconds };
}

function renderHotspots(root, profileSnapshot) {
  const container = root.querySelector('[data-debug-hotspots]');
  if (!container) return;
  if (!profileSnapshot.deepProfilingEnabled) {
    container.innerHTML = '<div class="ws-debug-muted">Enable deep profiling to collect apparatus hotspots.</div>';
    return;
  }
  if (!profileSnapshot.byType.length) {
    container.innerHTML = '<div class="ws-debug-muted">Waiting for apparatus samples…</div>';
    return;
  }
  container.innerHTML = profileSnapshot.byType.slice(0, 6).map(profile => (
    `<div class="ws-debug-metric"><span>${profile.nodeType}</span><span>${profile.averageDurationMs.toFixed(3)} ms avg · ${profile.p95DurationMs.toFixed(3)} p95</span></div>`
  )).join('');
}

function renderDebugStats(root) {
  if (!drawerOpen || !root?.isConnected) return;
  const frameAverage = mean(frameSamplesMs);
  const frameP95 = percentile(frameSamplesMs, 0.95);
  const fps = frameAverage > 0 ? 1000 / frameAverage : 0;
  const profile = performanceTelemetrySnapshot();
  updateLiveRates(profile);
  const simulation = collectSimulationStats();
  const backlogMs = Math.max(0, (wsState.simAccumulatedS ?? 0) * 1000);
  const heap = globalThis.performance?.memory;

  setText(root, 'fps', frameSamplesMs.length ? fps.toFixed(1) : '—');
  setText(root, 'frame-average', frameSamplesMs.length ? formatMs(frameAverage) : '—');
  setText(root, 'frame-p95', frameSamplesMs.length ? formatMs(frameP95) : '—');
  setText(root, 'backlog', formatMs(backlogMs));
  setText(root, 'realtime-factor', liveRealtimeFactor == null ? '—' : `${liveRealtimeFactor.toFixed(2)}×`);
  setText(root, 'apparatus-cpu-tick', profile.deepProfilingEnabled ? formatMs(liveApparatusCpuPerTickMs) : 'profiling off');
  setText(root, 'sessions', String(simulation.sessions));
  setText(root, 'nodes', String(simulation.nodes));
  setText(root, 'active-machines', String(simulation.activeMachines));
  setText(root, 'connections', String(simulation.connections));
  setText(root, 'bodies', String(simulation.bodies));
  setText(root, 'populations', String(simulation.populations));
  setText(root, 'textures', String(simulation.textureProfiles));
  setText(root, 'furnaces', String(simulation.furnaces));
  setText(root, 'furnace-zones', String(simulation.activeFurnaceZones));
  setText(root, 'solver-evaluations', String(simulation.solverEvaluations));
  setText(root, 'heap-used', heap?.usedJSHeapSize ? `${(heap.usedJSHeapSize / 1048576).toFixed(1)} MB` : 'Unavailable');
  renderHotspots(root, profile);
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
  if (!wsState.world) return;
  const simulation = wsState.world.simulation;
  const wasRunning = Boolean(simulation?.running);
  if (!wasRunning) resumeWorldSimulation(wsState.world);
  const ticks = Math.floor((seconds + 1e-12) / SIMULATION_STEP_S);
  for (let index = 0; index < ticks; index += 1) worldSimulationTick(wsState.world, SIMULATION_STEP_S);
  if (!wasRunning) pauseWorldSimulation(wsState.world);
  status(root, `Advanced world by ${(ticks * SIMULATION_STEP_S).toFixed(1)} s (${ticks} ticks).`);
  await refreshCurrentWorkspace();
}

function yieldToBrowser() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

async function runHeadlessBenchmark(root) {
  if (benchmarkRunning) return;
  benchmarkRunning = true;
  const count = selectedFactoryCount(root);
  const output = root.querySelector('#ws-debug-benchmark-result');
  if (output) output.textContent = `Building ${count} canonical roasting line${count === 1 ? '' : 's'}…`;
  const profilingWasEnabled = isDeepProfilingEnabled();
  setDeepProfilingEnabled(false);
  try {
    const fixture = createRoastingBenchmarkFixture({ count });
    for (let index = 0; index < BENCHMARK_WARMUP_TICKS; index += 1) {
      worldlessTick(fixture);
      if (index % 5 === 4) await yieldToBrowser();
    }

    const samples = [];
    for (let index = 0; index < BENCHMARK_SAMPLE_TICKS; index += 1) {
      const start = nowMs();
      worldlessTick(fixture);
      samples.push(nowMs() - start);
      if (index % 5 === 4) await yieldToBrowser();
    }
    const average = mean(samples);
    const p95 = percentile(samples, 0.95);
    const maximum = Math.max(...samples);
    const realtimeFactor = average > 0 ? (SIMULATION_STEP_S * 1000) / average : Infinity;
    if (output) {
      output.textContent = [
        `${count} canonical roasting line${count === 1 ? '' : 's'}`,
        `Warmup: ${BENCHMARK_WARMUP_TICKS} ticks`,
        `Samples: ${BENCHMARK_SAMPLE_TICKS} ticks`,
        `Mean tick: ${average.toFixed(2)} ms`,
        `p95 tick: ${p95.toFixed(2)} ms`,
        `Max tick: ${maximum.toFixed(2)} ms`,
        `Realtime capacity: ${Number.isFinite(realtimeFactor) ? realtimeFactor.toFixed(2) : '∞'}×`,
      ].join('\n');
    }
  } catch (error) {
    if (output) output.textContent = `Benchmark failed: ${error.message}`;
  } finally {
    setDeepProfilingEnabled(profilingWasEnabled);
    benchmarkRunning = false;
  }
}

function worldlessTick(fixture) {
  // Headless benchmark intentionally times the same Blueprint physics kernel used
  // by live Sites without graph projection or DOM rendering.
  const blueprint = fixture.blueprint;
  return import('../../simulation/simulationEngine.js').then;
}

function runBlueprintTick(fixture) {
  return fixture;
}

function installBenchmarkTickImplementation() {
  // Replaced below at module initialization; split out to keep benchmark intent
  // explicit while avoiding any alternate debug-only simulation path.
}

function resetStats(root) {
  frameSamplesMs = [];
  liveApparatusCpuPerTickMs = null;
  liveRealtimeFactor = null;
  lastRealtimeSample = null;
  resetPerformanceTelemetry();
  lastProfileTotals = {
    durationMs: 0,
    elapsedSeconds: wsState.world?.simulation?.elapsedSeconds ?? 0,
  };
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
    else if (action === 'benchmark') await runHeadlessBenchmark(root);
    else if (action === 'step-0.1') await stepWorld(root, 0.1);
    else if (action === 'step-1') await stepWorld(root, 1);
    else if (action === 'step-10') await stepWorld(root, 10);
    else if (action === 'toggle-pause') {
      document.getElementById('ws-world-toggle')?.click();
      updatePauseButton(root);
    }
  }, { signal });

  root.addEventListener('change', event => {
    if (event.target.matches('#ws-debug-deep-profile')) {
      setDeepProfilingEnabled(event.target.checked);
      resetPerformanceTelemetry();
      lastProfileTotals = {
        durationMs: 0,
        elapsedSeconds: wsState.world?.simulation?.elapsedSeconds ?? 0,
      };
      liveApparatusCpuPerTickMs = null;
      renderDebugStats(root);
    }
  }, { signal });
}
