import { createWorldgenClient } from '../worldgenClient.js';
import { WORLDGEN_BOUNDARY_CONVERGENT, WORLDGEN_BOUNDARY_DIVERGENT, WORLDGEN_BOUNDARY_TRANSFORM } from '../protocol.js';
function element(id) { const target = document.getElementById(id); if (!target)
    throw new Error(`Worldgen Lab is missing #${id}.`); return target; }
function metric(container, label, value) { const item = document.createElement('div'); const key = document.createElement('strong'); key.textContent = label; const detail = document.createElement('span'); detail.textContent = value; item.append(key, detail); container.appendChild(item); }
function rotate(position, yaw, pitch) { const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch); const x1 = cy * position[0] - sy * position[1]; const y1 = sy * position[0] + cy * position[1]; return [cp * x1 + sp * position[2], y1, -sp * x1 + cp * position[2]]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function add(a, b, factor = 1) { return [a[0] + b[0] * factor, a[1] + b[1] * factor, a[2] + b[2] * factor]; }
function normalize(value) { const magnitude = Math.hypot(value[0], value[1], value[2]); return magnitude > 0 ? [value[0] / magnitude, value[1] / magnitude, value[2] / magnitude] : [0, 0, 0]; }
function samplePosition(result, sample) { const offset = sample * 3; return [result.positions[offset], result.positions[offset + 1], result.positions[offset + 2]]; }
function plateVector(values, plate) { const offset = plate * 3; return [values[offset], values[offset + 1], values[offset + 2]]; }
function plateColor(plate) { return `hsl(${(plate * 137.507764 + 18) % 360} 60% 55%)`; }
function boundaryColor(kind) { if (kind === WORLDGEN_BOUNDARY_CONVERGENT)
    return '#ff7272'; if (kind === WORLDGEN_BOUNDARY_DIVERGENT)
    return '#64d7ff'; if (kind === WORLDGEN_BOUNDARY_TRANSFORM)
    return '#ffd36a'; return '#d7e2ef'; }
function renderTectonics(canvas, result, projection, mode, yaw, pitch) {
    const width = 1100;
    const height = projection === 'map' ? 550 : 760;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context)
        throw new Error('Worldgen Lab could not acquire a 2D canvas context.');
    context.fillStyle = '#08101a';
    context.fillRect(0, 0, width, height);
    function projectVector(raw) {
        if (projection === 'map') {
            const lon = Math.atan2(raw[1], raw[0]);
            const lat = Math.asin(Math.max(-1, Math.min(1, raw[2])));
            return [(lon + Math.PI) / (2 * Math.PI) * width, (Math.PI / 2 - lat) / Math.PI * height, true];
        }
        const position = rotate(raw, yaw, pitch);
        const radius = Math.min(width, height) * 0.44;
        return [width / 2 + position[1] * radius, height / 2 - position[2] * radius, position[0] >= 0];
    }
    function projectSample(sample) { return projectVector(samplePosition(result, sample)); }
    if (projection === 'globe') {
        context.beginPath();
        context.arc(width / 2, height / 2, Math.min(width, height) * 0.44, 0, Math.PI * 2);
        context.strokeStyle = '#5d7890';
        context.lineWidth = 1;
        context.stroke();
    }
    if (mode === 'mesh') {
        context.beginPath();
        context.strokeStyle = '#35536d';
        context.lineWidth = 0.65;
        for (let sample = 0; sample < result.metrics.sampleCount; sample += 1) {
            const [ax, ay, av] = projectSample(sample);
            if (!av)
                continue;
            for (let cursor = result.neighborOffsets[sample]; cursor < result.neighborOffsets[sample + 1]; cursor += 1) {
                const neighbor = result.neighbors[cursor];
                if (neighbor <= sample)
                    continue;
                const [bx, by, bv] = projectSample(neighbor);
                if (!bv || (projection === 'map' && Math.abs(ax - bx) > width / 2))
                    continue;
                context.moveTo(ax, ay);
                context.lineTo(bx, by);
            }
        }
        context.stroke();
        return;
    }
    const pointRadius = result.metrics.sampleCount > 30_000 ? 1.15 : result.metrics.sampleCount > 5_000 ? 2.05 : 3.0;
    context.globalAlpha = mode === 'plates' ? 0.92 : 0.24;
    for (let sample = 0; sample < result.metrics.sampleCount; sample += 1) {
        const [x, y, visible] = projectSample(sample);
        if (!visible)
            continue;
        context.fillStyle = plateColor(result.plateIds[sample]);
        context.beginPath();
        context.arc(x, y, pointRadius, 0, Math.PI * 2);
        context.fill();
    }
    context.globalAlpha = 1;
    if (mode === 'boundaries' || mode === 'motion') {
        context.lineCap = 'round';
        for (let boundary = 0; boundary < result.metrics.boundaryEdgeCount; boundary += 1) {
            const sampleA = result.boundarySamples[boundary * 2];
            const sampleB = result.boundarySamples[boundary * 2 + 1];
            const [ax, ay, av] = projectSample(sampleA);
            const [bx, by, bv] = projectSample(sampleB);
            if (!av || !bv || (projection === 'map' && Math.abs(ax - bx) > width / 2))
                continue;
            const rate = Math.hypot(result.boundaryNormalRatesMPerYear[boundary], result.boundaryShearRatesMPerYear[boundary]);
            context.strokeStyle = boundaryColor(result.boundaryKinds[boundary]);
            context.lineWidth = Math.min(3.0, 1.1 + rate * 24);
            context.beginPath();
            context.moveTo(ax, ay);
            context.lineTo(bx, by);
            context.stroke();
        }
    }
    if (mode === 'plates' || mode === 'motion') {
        for (let plate = 0; plate < result.metrics.plateCount; plate += 1) {
            const seed = result.plateSeedSamples[plate];
            const [x, y, visible] = projectSample(seed);
            if (!visible)
                continue;
            context.strokeStyle = '#f4f7fb';
            context.lineWidth = 1.1;
            context.beginPath();
            context.arc(x, y, Math.max(3.2, pointRadius + 1.6), 0, Math.PI * 2);
            context.stroke();
        }
    }
    if (mode === 'motion') {
        context.lineWidth = 1.5;
        for (let plate = 0; plate < result.metrics.plateCount; plate += 1) {
            const seed = result.plateSeedSamples[plate];
            const start = samplePosition(result, seed);
            const omega = plateVector(result.plateAngularVelocitiesRadPerMyr, plate);
            const tangentVelocity = normalize(cross(omega, start));
            const end = normalize(add(start, tangentVelocity, 0.13));
            const [ax, ay, av] = projectVector(start);
            const [bx, by, bv] = projectVector(end);
            if (!av || !bv || (projection === 'map' && Math.abs(ax - bx) > width / 2))
                continue;
            context.strokeStyle = '#f4f7fb';
            context.fillStyle = '#f4f7fb';
            context.beginPath();
            context.moveTo(ax, ay);
            context.lineTo(bx, by);
            context.stroke();
            const angle = Math.atan2(by - ay, bx - ax);
            context.beginPath();
            context.moveTo(bx, by);
            context.lineTo(bx - 6 * Math.cos(angle - 0.55), by - 6 * Math.sin(angle - 0.55));
            context.lineTo(bx - 6 * Math.cos(angle + 0.55), by - 6 * Math.sin(angle + 0.55));
            context.closePath();
            context.fill();
        }
    }
}
function renderMetrics(container, result) {
    container.replaceChildren();
    metric(container, 'Engine / stage', `v${result.engineVersion} · ${result.stage.id}@${result.stage.version}`);
    metric(container, 'Topology', `icosphere L${result.level} · ${result.metrics.sampleCount.toLocaleString()} samples`);
    metric(container, 'Plates', result.metrics.plateCount.toLocaleString());
    metric(container, 'Boundaries', result.metrics.boundaryEdgeCount.toLocaleString());
    metric(container, 'Conv / div / shear', `${result.metrics.convergentEdgeCount.toLocaleString()} / ${result.metrics.divergentEdgeCount.toLocaleString()} / ${result.metrics.transformEdgeCount.toLocaleString()}`);
    metric(container, 'Plate area range', `${(result.metrics.minimumPlateAreaFraction * 100).toFixed(2)}–${(result.metrics.maximumPlateAreaFraction * 100).toFixed(2)}%`);
    metric(container, 'Seed separation', `${(result.metrics.minimumSeedSeparationRad * 180 / Math.PI).toFixed(2)}° min`);
    metric(container, 'Mean plate speed', `${result.metrics.meanReferenceSpeedMmPerYear.toFixed(2)} mm/yr`);
    metric(container, 'Topology hash', result.topologyHash);
    metric(container, 'Tectonic hash', result.metrics.tectonicHash);
    metric(container, 'Rust + WASM', `${result.stage.durationMs.toFixed(2)} ms`);
}
function install() {
    const seed = element('worldgen-seed');
    const level = element('worldgen-level');
    const plates = element('worldgen-plates');
    const projection = element('worldgen-projection');
    const visualization = element('worldgen-visualization');
    const generate = element('worldgen-generate');
    const status = element('worldgen-status');
    const metrics = element('worldgen-metrics');
    const canvas = element('worldgen-field');
    const client = createWorldgenClient();
    let current = null;
    let yaw = 0.0, pitch = 0.15, dragging = false, lastX = 0, lastY = 0;
    function redraw() { if (current)
        renderTectonics(canvas, current, projection.value, visualization.value, yaw, pitch); }
    async function run() {
        generate.disabled = true;
        status.className = 'worldgen-lab-status';
        status.textContent = 'Partitioning the canonical sphere and solving rigid plate kinematics in Rust/WASM…';
        try {
            current = await client.generateTectonics({ seed: seed.value, level: Number(level.value), plateCount: Number(plates.value) });
            renderMetrics(metrics, current);
            redraw();
            status.className = 'worldgen-lab-status worldgen-lab-status--ok';
            status.textContent = 'WG-2 tectonic truth active. Drag the globe to rotate; projection and diagnostic modes are presentation-only.';
        }
        catch (error) {
            status.className = 'worldgen-lab-status worldgen-lab-status--error';
            status.textContent = error instanceof Error ? error.message : String(error);
        }
        finally {
            generate.disabled = false;
        }
    }
    generate.addEventListener('click', () => void run());
    for (const input of [seed, level, plates])
        input.addEventListener('keydown', event => { if (event.key === 'Enter')
            void run(); });
    projection.addEventListener('change', redraw);
    visualization.addEventListener('change', redraw);
    canvas.addEventListener('pointerdown', event => { if (projection.value !== 'globe')
        return; dragging = true; lastX = event.clientX; lastY = event.clientY; canvas.setPointerCapture(event.pointerId); });
    canvas.addEventListener('pointermove', event => { if (!dragging || projection.value !== 'globe')
        return; yaw += (event.clientX - lastX) * 0.01; pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch + (event.clientY - lastY) * 0.01)); lastX = event.clientX; lastY = event.clientY; redraw(); });
    canvas.addEventListener('pointerup', () => { dragging = false; });
    canvas.addEventListener('pointercancel', () => { dragging = false; });
    window.addEventListener('beforeunload', () => client.dispose(), { once: true });
    void run();
}
document.addEventListener('DOMContentLoaded', install);
