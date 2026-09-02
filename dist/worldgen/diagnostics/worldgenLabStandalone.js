import { createWorldgenClient } from '../worldgenClient.js';
function element(id) { const target = document.getElementById(id); if (!target)
    throw new Error(`Worldgen Lab is missing #${id}.`); return target; }
function metric(container, label, value) { const item = document.createElement('div'); const key = document.createElement('strong'); key.textContent = label; const detail = document.createElement('span'); detail.textContent = value; item.append(key, detail); container.appendChild(item); }
function rotate(position, yaw, pitch) { const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch); const x1 = cy * position[0] - sy * position[1]; const y1 = sy * position[0] + cy * position[1]; return [cp * x1 + sp * position[2], y1, -sp * x1 + cp * position[2]]; }
function samplePosition(result, sample) { const offset = sample * 3; return [result.positions[offset], result.positions[offset + 1], result.positions[offset + 2]]; }
function colorForSample(result, sample, mode) { if (mode === 'valence')
    return result.neighborOffsets[sample + 1] - result.neighborOffsets[sample] === 5 ? '#ff6b6b' : '#8fb7d9'; if (mode === 'birth') {
    const t = result.birthLevels[sample] / Math.max(1, result.level);
    return `hsl(${220 - 170 * t} 70% ${55 + 12 * t}%)`;
} if (mode === 'area') {
    const mean = result.metrics.meanAreaSteradians;
    const relative = Math.max(0, Math.min(2, result.areaSteradians[sample] / mean));
    return `hsl(${220 - 110 * relative} 65% 58%)`;
} return '#8fb7d9'; }
function renderTopology(canvas, result, projection, mode, yaw, pitch) { const width = 1100, height = projection === 'map' ? 550 : 760; canvas.width = width; canvas.height = height; const context = canvas.getContext('2d'); if (!context)
    throw new Error('Worldgen Lab could not acquire a 2D canvas context.'); context.fillStyle = '#08101a'; context.fillRect(0, 0, width, height); context.lineWidth = 0.7; context.strokeStyle = '#35536d'; function project(sample) { const raw = samplePosition(result, sample); if (projection === 'map') {
    const lon = Math.atan2(raw[1], raw[0]);
    const lat = Math.asin(Math.max(-1, Math.min(1, raw[2])));
    return [(lon + Math.PI) / (2 * Math.PI) * width, (Math.PI / 2 - lat) / Math.PI * height, true];
} const p = rotate(raw, yaw, pitch); const radius = Math.min(width, height) * 0.44; return [width / 2 + p[1] * radius, height / 2 - p[2] * radius, p[0] >= 0]; } if (projection === 'globe') {
    context.beginPath();
    context.arc(width / 2, height / 2, Math.min(width, height) * 0.44, 0, Math.PI * 2);
    context.strokeStyle = '#59758c';
    context.stroke();
    context.strokeStyle = '#35536d';
} if (mode === 'mesh') {
    context.beginPath();
    for (let sample = 0; sample < result.metrics.sampleCount; sample += 1) {
        const [ax, ay, av] = project(sample);
        if (!av)
            continue;
        const start = result.neighborOffsets[sample], end = result.neighborOffsets[sample + 1];
        for (let cursor = start; cursor < end; cursor += 1) {
            const neighbor = result.neighbors[cursor];
            if (neighbor <= sample)
                continue;
            const [bx, by, bv] = project(neighbor);
            if (!bv)
                continue;
            if (projection === 'map' && Math.abs(ax - bx) > width / 2)
                continue;
            context.moveTo(ax, ay);
            context.lineTo(bx, by);
        }
    }
    context.stroke();
}
else {
    const radius = result.metrics.sampleCount > 50_000 ? 0.7 : result.metrics.sampleCount > 5_000 ? 1.0 : 1.8;
    for (let sample = 0; sample < result.metrics.sampleCount; sample += 1) {
        const [x, y, visible] = project(sample);
        if (!visible)
            continue;
        context.fillStyle = colorForSample(result, sample, mode);
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
    }
} }
function renderMetrics(container, result) { container.replaceChildren(); metric(container, 'Engine', `v${result.engineVersion}`); metric(container, 'Topology', `icosphere L${result.level}`); metric(container, 'Samples', result.metrics.sampleCount.toLocaleString()); metric(container, 'Edges / faces', `${result.metrics.edgeCount.toLocaleString()} / ${result.metrics.faceCount.toLocaleString()}`); metric(container, '5 / 6 neighbors', `${result.metrics.fiveNeighborCount} / ${result.metrics.sixNeighborCount.toLocaleString()}`); metric(container, 'Area sum', `${result.metrics.totalAreaSteradians.toFixed(12)} sr`); metric(container, 'Area CV', `${(result.metrics.areaCoefficientOfVariation * 100).toFixed(3)}%`); metric(container, 'Edge CV', `${(result.metrics.edgeCoefficientOfVariation * 100).toFixed(3)}%`); metric(container, 'Topology hash', result.metrics.topologyHash); metric(container, 'Worker + WASM', `${result.durationMs.toFixed(2)} ms`); }
function install() { const level = element('worldgen-level'), projection = element('worldgen-projection'), visualization = element('worldgen-visualization'), generate = element('worldgen-generate'), status = element('worldgen-status'), metrics = element('worldgen-metrics'), canvas = element('worldgen-field'); const client = createWorldgenClient(); let current = null; let yaw = 0.0, pitch = 0.15, dragging = false, lastX = 0, lastY = 0; function redraw() { if (current)
    renderTopology(canvas, current, projection.value, visualization.value, yaw, pitch); } async function run() { generate.disabled = true; status.className = 'worldgen-lab-status'; status.textContent = 'Building canonical WG-1 geodesic topology in the Rust/WASM Worker…'; try {
    current = await client.generateTopology({ level: Number(level.value) });
    renderMetrics(metrics, current);
    redraw();
    status.className = 'worldgen-lab-status worldgen-lab-status--ok';
    status.textContent = 'Canonical spherical topology active. Drag the globe to rotate; switch projection or diagnostic coloring without regeneration.';
}
catch (error) {
    status.className = 'worldgen-lab-status worldgen-lab-status--error';
    status.textContent = error instanceof Error ? error.message : String(error);
}
finally {
    generate.disabled = false;
} } generate.addEventListener('click', () => void run()); level.addEventListener('keydown', event => { if (event.key === 'Enter')
    void run(); }); projection.addEventListener('change', redraw); visualization.addEventListener('change', redraw); canvas.addEventListener('pointerdown', event => { if (projection.value !== 'globe')
    return; dragging = true; lastX = event.clientX; lastY = event.clientY; canvas.setPointerCapture(event.pointerId); }); canvas.addEventListener('pointermove', event => { if (!dragging || projection.value !== 'globe')
    return; yaw += (event.clientX - lastX) * 0.01; pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch + (event.clientY - lastY) * 0.01)); lastX = event.clientX; lastY = event.clientY; redraw(); }); canvas.addEventListener('pointerup', () => { dragging = false; }); canvas.addEventListener('pointercancel', () => { dragging = false; }); window.addEventListener('beforeunload', () => client.dispose(), { once: true }); void run(); }
document.addEventListener('DOMContentLoaded', install);
