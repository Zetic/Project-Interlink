import { compileFlatRuntimePlan } from './compileRuntimePlan.js';
import { REALTIME_RUNTIME_PROTOCOL_VERSION, SIMULATION_STEP_SECONDS, runtimeCommand, } from './runtimeProtocol.js';
import { compileFlatWorkerSetup, flatWorkerParameterKey, flatWorkerStructureKey, } from './workerSetup.js';
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function nowMs() {
    return globalThis.performance?.now?.() ?? Date.now();
}
function selectedRichDetailTarget(state) {
    const selection = state.selection;
    if (selection.type !== 'mechanical')
        return null;
    const selectedNodeId = selection.mechanicalNodeId;
    const node = state.graph.nodes.find(candidate => candidate.id === selectedNodeId);
    if (!node || node.nodeType !== 'hopper')
        return null;
    return { key: `hopper:${node.id}`, entityType: 'hopper', id: node.id };
}
export function installRuntimeController(store) {
    let worker = null;
    let nextRequestId = 1;
    const pending = new Map();
    let structureKey = '';
    let parameterKey = '';
    let setup = null;
    let syncChain = Promise.resolve();
    let disposed = false;
    let frameId = null;
    let lastFrameAtMs = null;
    let accumulatorSeconds = 0;
    let automaticAdvancePromise = null;
    let manualStepInFlight = false;
    let realtimeWindowWallSeconds = 0;
    let realtimeWindowSimulationSeconds = 0;
    let realtimeFactor = 0;
    let lastTelemetryPublishMs = 0;
    let lastWorkerRoundTripMs = null;
    let detailRequestInFlight = null;
    let detailRefreshPending = false;
    function runtimePatch(patch) {
        store.updateRuntime(patch);
    }
    function rejectPending(message) {
        for (const request of pending.values())
            request.reject(new Error(message));
        pending.clear();
    }
    function stopWorker() {
        if (worker)
            worker.terminate();
        worker = null;
        detailRequestInFlight = null;
        detailRefreshPending = false;
        rejectPending('Rust/WASM Worker runtime was restarted.');
    }
    function handleEvent(event) {
        const message = event.data;
        if (!message || message.protocolVersion !== REALTIME_RUNTIME_PROTOCOL_VERSION)
            return;
        const requestId = message.requestId;
        if (requestId == null)
            return;
        const request = pending.get(requestId);
        if (!request)
            return;
        pending.delete(requestId);
        if (message.type === 'error') {
            request.reject(new Error(message.payload.message ?? 'Rust/WASM Worker runtime error.'));
            return;
        }
        lastWorkerRoundTripMs = Math.max(0, nowMs() - request.startedAtMs);
        request.resolve(message);
    }
    function createWorker() {
        const nextWorker = new Worker(new URL('./flatRuntimeWorker.js', import.meta.url), { type: 'module' });
        nextWorker.addEventListener('message', handleEvent);
        nextWorker.addEventListener('error', event => {
            const message = event.message || 'Rust/WASM Worker failed.';
            runtimePatch({ status: 'error', running: false, error: message });
            rejectPending(message);
        });
        return nextWorker;
    }
    function send(type, payload) {
        if (!worker)
            return Promise.reject(new Error('Rust/WASM Worker is not connected.'));
        const requestId = nextRequestId++;
        return new Promise((resolve, reject) => {
            pending.set(requestId, { resolve, reject, startedAtMs: nowMs() });
            worker.postMessage(runtimeCommand(type, payload, requestId));
        });
    }
    function queueSelectedDetailRefresh() {
        if (disposed || !worker || store.getState().runtime.status !== 'ready')
            return;
        const target = selectedRichDetailTarget(store.getState());
        if (!target)
            return;
        if (detailRequestInFlight) {
            detailRefreshPending = true;
            return;
        }
        detailRequestInFlight = target.key;
        void send('query-detail', { entityType: target.entityType, id: target.id }).then(message => {
            if (message.type !== 'detail' || message.payload.ok !== true || !message.payload.detail)
                return;
            const currentTarget = selectedRichDetailTarget(store.getState());
            if (!currentTarget || currentTarget.key !== target.key)
                return;
            const detail = message.payload.detail;
            const details = store.getState().runtime.details;
            runtimePatch({ details: { ...details, [target.key]: detail } });
        }).catch(error => {
            if (store.getState().runtime.status === 'ready')
                runtimePatch({ error: errorMessage(error) });
        }).finally(() => {
            detailRequestInFlight = null;
            if (detailRefreshPending) {
                detailRefreshPending = false;
                queueSelectedDetailRefresh();
            }
        });
    }
    function applyEvent(message) {
        const started = nowMs();
        const patch = {};
        if (typeof message.payload.running === 'boolean')
            patch.running = message.payload.running;
        if (message.payload.snapshot)
            patch.snapshot = message.payload.snapshot;
        if (message.payload.profile)
            patch.profile = message.payload.profile;
        if (message.type === 'ready' || message.type === 'reconfigured') {
            patch.status = 'ready';
            patch.error = null;
        }
        patch.telemetry = {
            ...store.getState().runtime.telemetry,
            workerRoundTripMs: lastWorkerRoundTripMs,
            presentationUpdateMs: Math.max(0, nowMs() - started),
        };
        runtimePatch(patch);
        queueSelectedDetailRefresh();
    }
    async function initialize(nextSetup, nextStructureKey, nextParameterKey) {
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
        }
        catch (error) {
            runtimePatch({ status: 'error', running: false, error: errorMessage(error) });
        }
    }
    async function reconfigure(nextSetup, nextParameterKey) {
        try {
            const message = await send('reconfigure', { setup: nextSetup });
            setup = nextSetup;
            parameterKey = nextParameterKey;
            applyEvent(message);
        }
        catch (error) {
            runtimePatch({ status: 'ready', error: errorMessage(error) });
        }
    }
    async function synchronizeLatest() {
        if (disposed)
            return;
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
        if (nextParameterKey !== parameterKey)
            await reconfigure(nextSetup, nextParameterKey);
    }
    function scheduleSynchronization() {
        syncChain = syncChain.then(synchronizeLatest, synchronizeLatest);
    }
    store.subscribeDomains(['world', 'graph'], scheduleSynchronization);
    store.subscribeDomains(['selection'], queueSelectedDetailRefresh);
    function updateSchedulerTelemetry(timestamp, force = false) {
        if (!force && timestamp - lastTelemetryPublishMs < 200)
            return;
        lastTelemetryPublishMs = timestamp;
        const telemetry = store.getState().runtime.telemetry;
        runtimePatch({ telemetry: {
                ...telemetry,
                accumulatorSeconds,
                schedulerDebtSeconds: Math.max(0, accumulatorSeconds - SIMULATION_STEP_SECONDS),
                realtimeFactor,
            } });
    }
    async function automaticAdvance(steps) {
        try {
            const message = await send('advance-fixed', { steps });
            realtimeWindowSimulationSeconds += steps * SIMULATION_STEP_SECONDS;
            applyEvent(message);
        }
        catch (error) {
            if (store.getState().runtime.status === 'ready')
                runtimePatch({ status: 'error', running: false, error: errorMessage(error) });
        }
    }
    function sampleFrame(timestamp) {
        if (disposed)
            return;
        const runtimeState = store.getState().runtime;
        if (lastFrameAtMs != null) {
            const deltaSeconds = Math.min(0.25, Math.max(0, (timestamp - lastFrameAtMs) / 1000));
            realtimeWindowWallSeconds += deltaSeconds;
            if (runtimeState.status === 'ready' && runtimeState.running)
                accumulatorSeconds += deltaSeconds;
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
                    if (automaticAdvancePromise === promise)
                        automaticAdvancePromise = null;
                });
            }
        }
        updateSchedulerTelemetry(timestamp);
        frameId = requestAnimationFrame(sampleFrame);
    }
    frameId = requestAnimationFrame(sampleFrame);
    async function pause() {
        const message = await send('pause', {});
        applyEvent(message);
    }
    async function resume() {
        const message = await send('resume', {});
        accumulatorSeconds = 0;
        applyEvent(message);
    }
    async function advanceFixedSteps(steps) {
        if (steps <= 0)
            return;
        manualStepInFlight = true;
        try {
            const inFlight = automaticAdvancePromise;
            if (inFlight)
                await inFlight;
            const wasRunning = store.getState().runtime.running;
            if (!wasRunning)
                await resume();
            const message = await send('advance-fixed', { steps });
            applyEvent(message);
            if (!wasRunning)
                await pause();
            updateSchedulerTelemetry(nowMs(), true);
        }
        finally {
            manualStepInFlight = false;
        }
    }
    async function setProfiling(enabled, reset = false) {
        const message = await send('set-profiling', { enabled, reset });
        runtimePatch({ profilingEnabled: enabled });
        applyEvent(message);
    }
    function dispose() {
        disposed = true;
        if (frameId != null)
            cancelAnimationFrame(frameId);
        frameId = null;
        stopWorker();
    }
    return { pause, resume, advanceFixedSteps, setProfiling, dispose };
}
