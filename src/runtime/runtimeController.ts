import type { AppState, AppStore } from '../state/appState.js';
import { compileFlatRuntimePlan } from './compileRuntimePlan.js';
import type { RuntimeEntityDetail, RuntimePresentationState } from './presentation.js';
import {
  REALTIME_RUNTIME_PROTOCOL_VERSION,
  SIMULATION_STEP_SECONDS,
  runtimeCommand,
  type RuntimeCommandType,
  type RuntimeEvent,
} from './runtimeProtocol.js';
import {
  compileFlatWorkerSetup,
  flatWorkerParameterKey,
  flatWorkerStructureKey,
  type FlatWorkerSetup,
} from './workerSetup.js';

interface PendingRequest {
  resolve: (event: RuntimeEvent) => void;
  reject: (error: Error) => void;
  startedAtMs: number;
}

export interface RuntimeController {
  pause(): Promise<void>;
  resume(): Promise<void>;
  advanceFixedSteps(steps: number): Promise<void>;
  setProfiling(enabled: boolean, reset?: boolean): Promise<void>;
  queryHopperDetail(nodeId: string): Promise<void>;
  dispose(): void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

export function installRuntimeController(store: AppStore): RuntimeController {
  let worker: Worker | null = null;
  let nextRequestId = 1;
  const pending = new Map<number, PendingRequest>();
  let observedWorld: Readonly<AppState>['world'] = null;
  let observedGraph: Readonly<AppState>['graph'] = store.getState().graph;
  let structureKey = '';
  let parameterKey = '';
  let setup: FlatWorkerSetup | null = null;
  let syncChain = Promise.resolve();
  let disposed = false;
  let frameId: number | null = null;
  let lastFrameAtMs: number | null = null;
  let accumulatorSeconds = 0;
  let automaticAdvancePromise: Promise<void> | null = null;
  let manualStepInFlight = false;
  let realtimeWindowWallSeconds = 0;
  let realtimeWindowSimulationSeconds = 0;
  let realtimeFactor = 0;
  let lastTelemetryPublishMs = 0;

  function runtimePatch(patch: Partial<RuntimePresentationState>): void {
    store.updateRuntime(patch);
  }

  function rejectPending(message: string): void {
    for (const request of pending.values()) request.reject(new Error(message));
    pending.clear();
  }

  function stopWorker(): void {
    if (worker) worker.terminate();
    worker = null;
    rejectPending('Rust/WASM Worker runtime was restarted.');
  }

  function handleEvent(event: MessageEvent<RuntimeEvent>): void {
    const message = event.data;
    if (!message || message.protocolVersion !== REALTIME_RUNTIME_PROTOCOL_VERSION) return;
    const requestId = message.requestId;
    if (requestId == null) return;
    const request = pending.get(requestId);
    if (!request) return;
    pending.delete(requestId);
    if (message.type === 'error') {
      request.reject(new Error(message.payload.message ?? 'Rust/WASM Worker runtime error.'));
      return;
    }
    const roundTrip = Math.max(0, nowMs() - request.startedAtMs);
    const telemetry = store.getState().runtime.telemetry;
    runtimePatch({ telemetry: { ...telemetry, workerRoundTripMs: roundTrip } });
    request.resolve(message);
  }

  function createWorker(): Worker {
    const nextWorker = new Worker(new URL('./flatRuntimeWorker.js', import.meta.url), { type: 'module' });
    nextWorker.addEventListener('message', handleEvent);
    nextWorker.addEventListener('error', event => {
      const message = event.message || 'Rust/WASM Worker failed.';
      runtimePatch({ status: 'error', running: false, error: message });
      rejectPending(message);
    });
    return nextWorker;
  }

  function send(type: RuntimeCommandType, payload: Record<string, unknown>): Promise<RuntimeEvent> {
    if (!worker) return Promise.reject(new Error('Rust/WASM Worker is not connected.'));
    const requestId = nextRequestId++;
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject, startedAtMs: nowMs() });
      worker!.postMessage(runtimeCommand(type, payload, requestId));
    });
  }

  function applyEvent(message: RuntimeEvent): void {
    const started = nowMs();
    const patch: Partial<RuntimePresentationState> = {};
    if (typeof message.payload.running === 'boolean') patch.running = message.payload.running;
    if (message.payload.snapshot) patch.snapshot = message.payload.snapshot;
    if (message.payload.profile) patch.profile = message.payload.profile;
    if (message.type === 'ready' || message.type === 'reconfigured') {
      patch.status = 'ready';
      patch.error = null;
    }
    runtimePatch(patch);
    const presentationUpdateMs = Math.max(0, nowMs() - started);
    const telemetry = store.getState().runtime.telemetry;
    runtimePatch({ telemetry: { ...telemetry, presentationUpdateMs } });
  }

  async function initialize(nextSetup: FlatWorkerSetup, nextStructureKey: string, nextParameterKey: string): Promise<void> {
    stopWorker();
    worker = createWorker();
    runtimePatch({ status: 'connecting', running: false, error: null, snapshot: null, profile: null, details: {} });
    try {
      const message = await send('init', { setup: nextSetup });
      setup = nextSetup;
      structureKey = nextStructureKey;
      parameterKey = nextParameterKey;
      accumulatorSeconds = 0;
      applyEvent(message);
    } catch (error) {
      runtimePatch({ status: 'error', running: false, error: errorMessage(error) });
    }
  }

  async function reconfigure(nextSetup: FlatWorkerSetup, nextParameterKey: string): Promise<void> {
    try {
      const message = await send('reconfigure', { setup: nextSetup });
      setup = nextSetup;
      parameterKey = nextParameterKey;
      applyEvent(message);
    } catch (error) {
      runtimePatch({ status: 'ready', error: errorMessage(error) });
    }
  }

  async function synchronizeLatest(): Promise<void> {
    if (disposed) return;
    const state = store.getState();
    const planet = state.world?.planet;
    if (!planet) {
      stopWorker();
      setup = null;
      structureKey = '';
      parameterKey = '';
      runtimePatch({ status: 'disconnected', running: false, error: null, snapshot: null, profile: null, details: {} });
      return;
    }
    const plan = compileFlatRuntimePlan(planet, state.graph);
    const nextSetup = compileFlatWorkerSetup(plan);
    const nextStructureKey = flatWorkerStructureKey(nextSetup);
    const nextParameterKey = flatWorkerParameterKey(nextSetup);
    if (!worker || !setup || nextStructureKey !== structureKey) {
      await initialize(nextSetup, nextStructureKey, nextParameterKey);
      return;
    }
    if (nextParameterKey !== parameterKey) await reconfigure(nextSetup, nextParameterKey);
  }

  function scheduleSynchronization(): void {
    syncChain = syncChain.then(synchronizeLatest, synchronizeLatest);
  }

  store.subscribe(state => {
    if (state.world === observedWorld && state.graph === observedGraph) return;
    observedWorld = state.world;
    observedGraph = state.graph;
    scheduleSynchronization();
  });

  function updateSchedulerTelemetry(timestamp: number, force = false): void {
    if (!force && timestamp - lastTelemetryPublishMs < 200) return;
    lastTelemetryPublishMs = timestamp;
    const telemetry = store.getState().runtime.telemetry;
    runtimePatch({ telemetry: {
      ...telemetry,
      accumulatorSeconds,
      schedulerDebtSeconds: Math.max(0, accumulatorSeconds - SIMULATION_STEP_SECONDS),
      realtimeFactor,
    } });
  }

  async function automaticAdvance(steps: number): Promise<void> {
    try {
      const message = await send('advance-fixed', { steps });
      realtimeWindowSimulationSeconds += steps * SIMULATION_STEP_SECONDS;
      applyEvent(message);
    } catch (error) {
      if (store.getState().runtime.status === 'ready') runtimePatch({ status: 'error', running: false, error: errorMessage(error) });
    }
  }

  function sampleFrame(timestamp: number): void {
    if (disposed) return;
    const runtimeState = store.getState().runtime;
    if (lastFrameAtMs != null) {
      const deltaSeconds = Math.min(0.25, Math.max(0, (timestamp - lastFrameAtMs) / 1000));
      realtimeWindowWallSeconds += deltaSeconds;
      if (runtimeState.status === 'ready' && runtimeState.running) accumulatorSeconds += deltaSeconds;
      if (realtimeWindowWallSeconds >= 5) {
        realtimeFactor = realtimeWindowWallSeconds > 0
          ? realtimeWindowSimulationSeconds / realtimeWindowWallSeconds
          : 0;
        realtimeWindowWallSeconds = 0;
        realtimeWindowSimulationSeconds = 0;
      }
    }
    lastFrameAtMs = timestamp;

    if (runtimeState.status === 'ready' && runtimeState.running && !automaticAdvancePromise && !manualStepInFlight) {
      const availableSteps = Math.floor(accumulatorSeconds / SIMULATION_STEP_SECONDS);
      if (availableSteps > 0) {
        const steps = Math.min(availableSteps, 100);
        accumulatorSeconds -= steps * SIMULATION_STEP_SECONDS;
        const promise = automaticAdvance(steps);
        automaticAdvancePromise = promise;
        void promise.finally(() => {
          if (automaticAdvancePromise === promise) automaticAdvancePromise = null;
        });
      }
    }
    updateSchedulerTelemetry(timestamp);
    frameId = requestAnimationFrame(sampleFrame);
  }
  frameId = requestAnimationFrame(sampleFrame);

  async function pause(): Promise<void> {
    const message = await send('pause', {});
    applyEvent(message);
  }

  async function resume(): Promise<void> {
    const message = await send('resume', {});
    accumulatorSeconds = 0;
    applyEvent(message);
  }

  async function advanceFixedSteps(steps: number): Promise<void> {
    if (steps <= 0) return;
    manualStepInFlight = true;
    try {
      const inFlight = automaticAdvancePromise;
      if (inFlight) await inFlight;
      const wasRunning = store.getState().runtime.running;
      if (!wasRunning) await resume();
      const message = await send('advance-fixed', { steps });
      applyEvent(message);
      if (!wasRunning) await pause();
      updateSchedulerTelemetry(nowMs(), true);
    } finally {
      manualStepInFlight = false;
    }
  }

  async function setProfiling(enabled: boolean, reset = false): Promise<void> {
    const message = await send('set-profiling', { enabled, reset });
    runtimePatch({ profilingEnabled: enabled });
    applyEvent(message);
  }

  async function queryHopperDetail(nodeId: string): Promise<void> {
    const message = await send('query-detail', { entityType: 'hopper', id: nodeId });
    if (message.type !== 'detail' || message.payload.ok !== true || !message.payload.detail) return;
    const detail = message.payload.detail as RuntimeEntityDetail;
    const details = store.getState().runtime.details;
    runtimePatch({ details: { ...details, [`hopper:${nodeId}`]: detail } });
  }

  function dispose(): void {
    disposed = true;
    if (frameId != null) cancelAnimationFrame(frameId);
    frameId = null;
    stopWorker();
  }

  return { pause, resume, advanceFixedSteps, setProfiling, queryHopperDetail, dispose };
}
