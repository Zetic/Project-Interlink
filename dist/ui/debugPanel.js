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
    return Number.isFinite(value) ? `${value.toFixed(2)} ms` : '—';
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
function disableRuntimeOnlyControls(root) {
    const unavailableTitle = 'Available again when the original Rust/WASM runtime is reconnected.';
    const deepProfiling = root.querySelector('#ws-debug-deep-profiling');
    if (deepProfiling) {
        deepProfiling.disabled = true;
        deepProfiling.checked = false;
        deepProfiling.title = unavailableTitle;
    }
    for (const action of ['toggle-pause', 'step-0.1', 'step-1', 'step-10', 'place-factories', 'remove-factories']) {
        const button = root.querySelector(`[data-debug-action="${action}"]`);
        if (button) {
            button.disabled = true;
            button.title = unavailableTitle;
        }
    }
    const count = root.querySelector('#ws-debug-factory-count');
    if (count)
        count.disabled = true;
    const status = root.querySelector('#ws-debug-status');
    if (status)
        status.textContent = 'Runtime-dependent debug tools are unavailable until Rust/WASM is reconnected.';
}
function heapUsedText() {
    const performanceWithMemory = globalThis.performance;
    const bytes = performanceWithMemory?.memory?.usedJSHeapSize;
    return bytes ? `${(bytes / 1048576).toFixed(1)} MB` : 'Unavailable';
}
export function installDebugPanel(root, store) {
    const drawer = root.querySelector('#ws-debug-drawer');
    if (!drawer)
        return;
    let latestState = store.getState();
    let frameSamplesMs = [];
    let frameRafId = null;
    let lastFrameAtMs = null;
    let refreshTimerId = null;
    installRuntimeCapabilityStats(drawer);
    disableRuntimeOnlyControls(drawer);
    const render = () => {
        const frameAverage = mean(frameSamplesMs);
        const frameP95 = percentile(frameSamplesMs, 0.95);
        const fps = frameAverage > 0 ? 1000 / frameAverage : 0;
        const simulation = collectSimulationDebugStats(latestState);
        setText(drawer, 'fps', frameSamplesMs.length ? fps.toFixed(1) : '—');
        setText(drawer, 'frame-average', frameSamplesMs.length ? formatMs(frameAverage) : '—');
        setText(drawer, 'frame-p95', frameSamplesMs.length ? formatMs(frameP95) : '—');
        setText(drawer, 'step-accumulator', '—');
        setText(drawer, 'scheduler-debt', '—');
        setText(drawer, 'realtime-factor', '—');
        setText(drawer, 'apparatus-cpu-tick', 'Rust/WASM');
        setText(drawer, 'profile-tick-average', '—');
        setText(drawer, 'profile-apparatus-average', '—');
        setText(drawer, 'profile-other-average', '—');
        setText(drawer, 'profile-worker-roundtrip', '—');
        setText(drawer, 'profile-presentation-update', '—');
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
        if (drawer.hidden)
            return;
        render();
        frameRafId = requestAnimationFrame(sampleFrame);
        refreshTimerId = window.setInterval(render, DEBUG_REFRESH_MS);
    };
    root.querySelector('[data-debug-action="reset-stats"]')?.addEventListener('click', () => {
        frameSamplesMs = [];
        lastFrameAtMs = null;
        render();
    });
    store.subscribe(state => {
        latestState = state;
    });
    const observer = new MutationObserver(syncOpenState);
    observer.observe(drawer, { attributes: true, attributeFilter: ['hidden'] });
    syncOpenState();
}
