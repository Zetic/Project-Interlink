import { placeDebugProcessingFactories, removeDebugProcessingFactories, } from '../debug/factoryFixture.js';
import { browserRuntimeCapabilities } from '../debug/runtimeCapabilities.js';
import { collectSimulationDebugStats, mean, percentile } from '../debug/debugTelemetry.js';
const FRAME_SAMPLE_LIMIT = 300;
const DEBUG_REFRESH_MS = 250;
function setText(root, name, value) {
    const element = root.querySelector(`[data-debug-stat="${name}"]`);
    if (element)
        element.textContent = value;
}
function formatMs(value) {
    return value != null && Number.isFinite(value) ? `${value.toFixed(2)} ms` : '—';
}
function yesNo(value) {
    return value ? 'Available' : 'Unavailable';
}
function installRuntimeCapabilityStats(root) {
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
function installRuntimeControls(root, store, runtime) {
    const pause = root.querySelector('[data-debug-action="toggle-pause"]');
    const step01 = root.querySelector('[data-debug-action="step-0.1"]');
    const step1 = root.querySelector('[data-debug-action="step-1"]');
    const step10 = root.querySelector('[data-debug-action="step-10"]');
    const profiling = root.querySelector('#ws-debug-deep-profiling');
    const status = root.querySelector('#ws-debug-status');
    const sync = () => {
        const runtimeState = store.getState().runtime;
        const available = runtimeState.status === 'ready';
        if (pause) {
            pause.disabled = !available;
            pause.textContent = runtimeState.running ? 'Pause World' : 'Resume World';
        }
        if (step01)
            step01.disabled = !available;
        if (step1)
            step1.disabled = !available;
        if (step10)
            step10.disabled = !available;
        if (profiling) {
            profiling.disabled = !available;
            profiling.checked = runtimeState.profilingEnabled;
        }
        if (status && !status.dataset.factoryMessage)
            status.textContent = runtimeState.status === 'error'
                ? `Runtime error: ${runtimeState.error ?? 'unknown error'}`
                : runtimeState.error
                    ? `Runtime warning: ${runtimeState.error}`
                    : available ? 'Rust/WASM full apparatus runtime connected.' : 'Rust/WASM full apparatus runtime is connecting.';
    };
    pause?.addEventListener('click', () => { const action = store.getState().runtime.running ? runtime.pause() : runtime.resume(); void action.catch(() => undefined); });
    step01?.addEventListener('click', () => { void runtime.advanceFixedSteps(1).catch(() => undefined); });
    step1?.addEventListener('click', () => { void runtime.advanceFixedSteps(10).catch(() => undefined); });
    step10?.addEventListener('click', () => { void runtime.advanceFixedSteps(100).catch(() => undefined); });
    profiling?.addEventListener('change', () => { void runtime.setProfiling(profiling.checked, true).catch(() => undefined); });
    store.subscribeDomains(['runtime'], sync);
}
function selectedFactoryCount(root) {
    const value = Number(root.querySelector('#ws-debug-factory-count')?.value ?? 1);
    return Number.isInteger(value) && value >= 1 && value <= 100 ? value : 1;
}
function setFactoryStatus(root, message, error = false) {
    const status = root.querySelector('#ws-debug-status');
    if (!status)
        return;
    status.dataset.factoryMessage = 'true';
    status.textContent = message;
    status.classList.toggle('ws-debug-status--error', error);
}
function installFactoryControls(root, store) {
    const create = root.querySelector('[data-debug-action="place-factories"]');
    const remove = root.querySelector('[data-debug-action="remove-factories"]');
    const count = root.querySelector('#ws-debug-factory-count');
    let manifests = [];
    if (create)
        create.textContent = 'Create Factory';
    const sync = () => {
        const state = store.getState();
        const resourceSelected = state.selection.type === 'resource';
        if (create) {
            create.disabled = !resourceSelected;
            create.title = resourceSelected ? 'Create the processing factory beside the selected resource.' : 'Select a resource node first.';
        }
        if (count)
            count.disabled = !resourceSelected;
        if (remove)
            remove.disabled = manifests.length === 0;
    };
    create?.addEventListener('click', () => {
        const state = store.getState();
        if (state.selection.type !== 'resource' || !state.world?.planet) {
            setFactoryStatus(root, 'Select a resource node before creating a factory.', true);
            sync();
            return;
        }
        const resourceNodeId = state.selection.resourceNodeId;
        const resource = state.world.planet.resourceNodes.find(candidate => candidate.id === resourceNodeId);
        if (!resource) {
            setFactoryStatus(root, 'The selected resource node is no longer available.', true);
            sync();
            return;
        }
        try {
            const placed = placeDebugProcessingFactories(state.graph, resource, selectedFactoryCount(root));
            manifests = [...manifests, ...placed.manifests];
            store.setGraph(placed.graph);
            setFactoryStatus(root, `Created ${placed.manifests.length} factory line${placed.manifests.length === 1 ? '' : 's'} linked to ${resource.name}.`);
        }
        catch (error) {
            setFactoryStatus(root, error instanceof Error ? error.message : String(error), true);
        }
        sync();
    });
    remove?.addEventListener('click', () => {
        if (!manifests.length)
            return;
        const countRemoved = manifests.length;
        store.setGraph(removeDebugProcessingFactories(store.getState().graph, manifests));
        manifests = [];
        setFactoryStatus(root, `Removed ${countRemoved} debug factory line${countRemoved === 1 ? '' : 's'}.`);
        sync();
    });
    store.subscribeDomains(['selection', 'graph'], sync);
    sync();
}
function heapUsedText() {
    const performanceWithMemory = globalThis.performance;
    const bytes = performanceWithMemory?.memory?.usedJSHeapSize;
    return bytes ? `${(bytes / 1048576).toFixed(1)} MB` : 'Unavailable';
}
export function installDebugPanel(root, store, runtime) {
    const drawer = root.querySelector('#ws-debug-drawer');
    if (!drawer)
        return;
    let latestState = store.getState();
    let frameSamplesMs = [];
    let frameRafId = null;
    let lastFrameAtMs = null;
    let refreshTimerId = null;
    installRuntimeCapabilityStats(drawer);
    installRuntimeControls(drawer, store, runtime);
    installFactoryControls(drawer, store);
    const render = () => {
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
    const sampleFrame = (timestamp) => {
        if (drawer.hidden) {
            frameRafId = null;
            lastFrameAtMs = null;
            return;
        }
        if (lastFrameAtMs != null) {
            const duration = timestamp - lastFrameAtMs;
            if (Number.isFinite(duration) && duration > 0 && duration < 1000) {
                frameSamplesMs.push(duration);
                if (frameSamplesMs.length > FRAME_SAMPLE_LIMIT)
                    frameSamplesMs.shift();
            }
        }
        lastFrameAtMs = timestamp;
        frameRafId = requestAnimationFrame(sampleFrame);
    };
    const stopSampling = () => {
        if (frameRafId != null)
            cancelAnimationFrame(frameRafId);
        frameRafId = null;
        lastFrameAtMs = null;
        if (refreshTimerId != null)
            window.clearInterval(refreshTimerId);
        refreshTimerId = null;
    };
    const syncOpenState = () => {
        stopSampling();
        if (drawer.hidden) {
            if (store.getState().runtime.profilingEnabled)
                void runtime.setProfiling(false).catch(() => undefined);
            return;
        }
        render();
        frameRafId = requestAnimationFrame(sampleFrame);
        refreshTimerId = window.setInterval(render, DEBUG_REFRESH_MS);
    };
    root.querySelector('[data-debug-action="reset-stats"]')?.addEventListener('click', () => {
        frameSamplesMs = [];
        lastFrameAtMs = null;
        if (store.getState().runtime.profilingEnabled)
            void runtime.setProfiling(true, true).catch(() => undefined);
        render();
    });
    store.subscribeDomains(['world', 'graph', 'runtime', 'telemetry'], state => {
        latestState = state;
    });
    const observer = new MutationObserver(syncOpenState);
    observer.observe(drawer, { attributes: true, attributeFilter: ['hidden'] });
    syncOpenState();
}
