import { browserRuntimeCapabilities } from '../debug/runtimeCapabilities.js';
import { collectSimulationDebugStats, mean, percentile } from '../debug/debugTelemetry.js';
import type { RuntimeController } from '../runtime/runtimeController.js';
import type { AppState, AppStore } from '../state/appState.js';

const FRAME_SAMPLE_LIMIT = 300;
const DEBUG_REFRESH_MS = 250;

function setText(root: HTMLElement, name: string, value: string): void {
  const element = root.querySelector<HTMLElement>(`[data-debug-stat="${name}"]`);
  if (element) element.textContent = value;
}

function formatMs(value: number | null | undefined): string {
  return value != null && Number.isFinite(value) ? `${value.toFixed(2)} ms` : '—';
}

function yesNo(value: boolean): string {
  return value ? 'Available' : 'Unavailable';
}

function installRuntimeCapabilityStats(root: HTMLElement): void {
  const capabilities = browserRuntimeCapabilities();
  setText(root, 'runtime-backend', 'Rust/WASM Worker');
  setText(root, 'logical-cpus', String(capabilities.hardwareConcurrency));
  setText(root, 'worker-capability', yesNo(capabilities.worker));
  setText(root, 'wasm-capability', capabilities.webAssembly
    ? `Available${capabilities.wasmSimd ? ' + SIMD' : ''}`
    : 'Unavailable');
  setText(root, 'thread-capability', capabilities.wasmThreads
    ? 'Available'
    : (capabilities.sharedArrayBuffer ? 'Needs isolation' : 'Unavailable'));
  setText(root, 'webgpu-capability', yesNo(capabilities.webGpu));
  setText(root, 'offscreen-capability', yesNo(capabilities.offscreenCanvas));
}

function installRuntimeControls(root: HTMLElement, store: AppStore, runtime: RuntimeController): void {
  const pause = root.querySelector<HTMLButtonElement>('[data-debug-action="toggle-pause"]');
  const step01 = root.querySelector<HTMLButtonElement>('[data-debug-action="step-0.1"]');
  const step1 = root.querySelector<HTMLButtonElement>('[data-debug-action="step-1"]');
  const step10 = root.querySelector<HTMLButtonElement>('[data-debug-action="step-10"]');
  const profiling = root.querySelector<HTMLInputElement>('#ws-debug-deep-profiling');
  const status = root.querySelector<HTMLElement>('#ws-debug-status');

  const sync = (): void => {
    const runtimeState = store.getState().runtime;
    const available = runtimeState.status === 'ready';
    if (pause) { pause.disabled = !available; pause.textContent = runtimeState.running ? 'Pause World' : 'Resume World'; }
    if (step01) step01.disabled = !available;
    if (step1) step1.disabled = !available;
    if (step10) step10.disabled = !available;
    if (profiling) { profiling.disabled = !available; profiling.checked = runtimeState.profilingEnabled; }
    if (status) status.textContent = runtimeState.status === 'error'
      ? `Runtime error: ${runtimeState.error ?? 'unknown error'}`
      : runtimeState.error
        ? `Runtime warning: ${runtimeState.error}`
        : available ? 'Rust/WASM extraction runtime connected.' : 'Rust/WASM extraction runtime is connecting.';
  };

  pause?.addEventListener('click', () => { const action = store.getState().runtime.running ? runtime.pause() : runtime.resume(); void action.catch(() => undefined); });
  step01?.addEventListener('click', () => { void runtime.advanceFixedSteps(1).catch(() => undefined); });
  step1?.addEventListener('click', () => { void runtime.advanceFixedSteps(10).catch(() => undefined); });
  step10?.addEventListener('click', () => { void runtime.advanceFixedSteps(100).catch(() => undefined); });
  profiling?.addEventListener('change', () => { void runtime.setProfiling(profiling.checked, true).catch(() => undefined); });
  store.subscribe(sync);

  for (const action of ['place-factories', 'remove-factories']) {
    const button = root.querySelector<HTMLButtonElement>(`[data-debug-action="${action}"]`);
    if (button) { button.disabled = true; button.title = 'Test factory automation is outside the Phase 6 extraction runtime slice.'; }
  }
  const count = root.querySelector<HTMLSelectElement>('#ws-debug-factory-count'); if (count) count.disabled = true;
}

function heapUsedText(): string {
  const performanceWithMemory = globalThis.performance as Performance & {
    memory?: { usedJSHeapSize?: number };
  };
  const bytes = performanceWithMemory?.memory?.usedJSHeapSize;
  return bytes ? `${(bytes / 1048576).toFixed(1)} MB` : 'Unavailable';
}

export function installDebugPanel(root: HTMLElement, store: AppStore, runtime: RuntimeController): void {
  const drawer = root.querySelector<HTMLElement>('#ws-debug-drawer');
  if (!drawer) return;

  let latestState: Readonly<AppState> = store.getState();
  let frameSamplesMs: number[] = [];
  let frameRafId: number | null = null;
  let lastFrameAtMs: number | null = null;
  let refreshTimerId: number | null = null;

  installRuntimeCapabilityStats(drawer);
  installRuntimeControls(drawer, store, runtime);

  const render = (): void => {
    const frameAverage = mean(frameSamplesMs);
    const frameP95 = percentile(frameSamplesMs, 0.95);
    const fps = frameAverage > 0 ? 1000 / frameAverage : 0;
    const simulation = collectSimulationDebugStats(latestState);
    const runtimeState = latestState.runtime;
    const telemetry = runtimeState.telemetry;
    const profile = runtimeState.profile;

    setText(drawer, 'fps', frameSamplesMs.length ? fps.toFixed(1) : '—');
    setText(drawer, 'frame-average', frameSamplesMs.length ? formatMs(frameAverage) : '—');
    setText(drawer, 'frame-p95', frameSamplesMs.length ? formatMs(frameP95) : '—');
    setText(drawer, 'step-accumulator', `${(telemetry.accumulatorSeconds * 1000).toFixed(1)} ms`);
    setText(drawer, 'scheduler-debt', `${(telemetry.schedulerDebtSeconds * 1000).toFixed(1)} ms`);
    setText(drawer, 'realtime-factor', telemetry.realtimeFactor > 0 ? `${telemetry.realtimeFactor.toFixed(2)}×` : '—');
    setText(drawer, 'apparatus-cpu-tick', runtimeState.status === 'ready' ? 'Rust/WASM' : 'Connecting');
    setText(drawer, 'profile-tick-average', profile ? formatMs(profile.tickAverageMs) : '—');
    setText(drawer, 'profile-apparatus-average', profile ? formatMs(profile.apparatusAverageMs) : '—');
    setText(drawer, 'profile-other-average', profile ? formatMs(profile.otherAverageMs) : '—');
    setText(drawer, 'profile-worker-roundtrip', formatMs(telemetry.workerRoundTripMs));
    setText(drawer, 'profile-presentation-update', formatMs(telemetry.presentationUpdateMs));
    setText(drawer, 'sessions', String(simulation.sessions));
    setText(drawer, 'nodes', String(simulation.nodes));
    setText(drawer, 'active-machines', String(simulation.activeMachines));
    setText(drawer, 'connections', String(simulation.connections));
    setText(drawer, 'heap-used', heapUsedText());
    setText(drawer, 'furnaces', String(simulation.furnaces));
    setText(drawer, 'furnace-zones', String(simulation.activeFurnaceZones));
    setText(drawer, 'solver-evaluations', String(simulation.solverEvaluations));
  };

  const sampleFrame = (timestamp: number): void => {
    if (drawer.hidden) {
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
    frameRafId = requestAnimationFrame(sampleFrame);
  };

  const stopSampling = (): void => {
    if (frameRafId != null) cancelAnimationFrame(frameRafId);
    frameRafId = null;
    lastFrameAtMs = null;
    if (refreshTimerId != null) window.clearInterval(refreshTimerId);
    refreshTimerId = null;
  };

  const syncOpenState = (): void => {
    stopSampling();
    if (drawer.hidden) {
      if (store.getState().runtime.profilingEnabled) void runtime.setProfiling(false).catch(() => undefined);
      return;
    }
    render();
    frameRafId = requestAnimationFrame(sampleFrame);
    refreshTimerId = window.setInterval(render, DEBUG_REFRESH_MS);
  };

  root.querySelector<HTMLButtonElement>('[data-debug-action="reset-stats"]')?.addEventListener('click', () => {
    frameSamplesMs = [];
    lastFrameAtMs = null;
    if (store.getState().runtime.profilingEnabled) void runtime.setProfiling(true, true).catch(() => undefined);
    render();
  });

  store.subscribe(state => {
    latestState = state;
  });

  const observer = new MutationObserver(syncOpenState);
  observer.observe(drawer, { attributes: true, attributeFilter: ['hidden'] });
  syncOpenState();
}
