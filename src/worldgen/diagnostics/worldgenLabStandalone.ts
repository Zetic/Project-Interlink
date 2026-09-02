import { createWorldgenClient } from '../worldgenClient.js';
import {
  WORLDGEN_BOUNDARY_CONVERGENT,
  WORLDGEN_BOUNDARY_DIVERGENT,
  WORLDGEN_BOUNDARY_TRANSFORM,
  WORLDGEN_CRUST_CONTINENTAL,
  WORLDGEN_CRUST_OCEANIC,
  WORLDGEN_CRUST_TRANSITIONAL,
  WORLDGEN_GEOLOGY_CONTINENTAL_COLLISION,
  WORLDGEN_GEOLOGY_CONTINENTAL_RIFT,
  WORLDGEN_GEOLOGY_OCEANIC_RIDGE,
  WORLDGEN_GEOLOGY_OCEANIC_SUBDUCTION,
  WORLDGEN_GEOLOGY_OCEAN_CONTINENT_SUBDUCTION,
  WORLDGEN_GEOLOGY_TRANSFORM,
  WORLDGEN_GEOLOGY_TRANSITIONAL_DIVERGENCE,
  WORLDGEN_PLATE_INTERMEDIATE,
  WORLDGEN_PLATE_MAJOR,
  WORLDGEN_PLATE_MINOR,
  type WorldgenGeologyResult,
  type WorldgenTectonicsResult,
} from '../protocol.js';

type Vec3 = [number, number, number];
type ScalarFieldKey = 'crust-age' | 'crust-thickness' | 'crust-density' | 'buoyancy' | 'orogeny' | 'rift' | 'ridge' | 'subduction' | 'trench' | 'arc' | 'transform-history' | 'subsidence' | 'basin' | 'strain';

function element<T extends HTMLElement>(id: string): T { const target = document.getElementById(id); if (!target) throw new Error(`Worldgen Lab is missing #${id}.`); return target as T; }
function metric(container: HTMLElement, label: string, value: string): void { const item = document.createElement('div'); const key = document.createElement('strong'); key.textContent = label; const detail = document.createElement('span'); detail.textContent = value; item.append(key, detail); container.appendChild(item); }
function rotate(position: readonly number[], yaw: number, pitch: number): Vec3 { const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch); const x1 = cy * position[0]! - sy * position[1]!; const y1 = sy * position[0]! + cy * position[1]!; return [cp * x1 + sp * position[2]!, y1, -sp * x1 + cp * position[2]!]; }
function cross(a: readonly number[], b: readonly number[]): Vec3 { return [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!]; }
function add(a: readonly number[], b: readonly number[], factor = 1): Vec3 { return [a[0]! + b[0]! * factor, a[1]! + b[1]! * factor, a[2]! + b[2]! * factor]; }
function normalize(value: readonly number[]): Vec3 { const magnitude = Math.hypot(value[0]!, value[1]!, value[2]!); return magnitude > 0 ? [value[0]! / magnitude, value[1]! / magnitude, value[2]! / magnitude] : [0, 0, 0]; }
function samplePosition(result: Pick<WorldgenGeologyResult, 'positions'> | Pick<WorldgenTectonicsResult, 'positions'>, sample: number): Vec3 { const offset = sample * 3; return [result.positions[offset]!, result.positions[offset + 1]!, result.positions[offset + 2]!]; }
function plateVector(values: Float64Array, plate: number): Vec3 { const offset = plate * 3; return [values[offset]!, values[offset + 1]!, values[offset + 2]!]; }
function plateColor(plate: number): string { return `hsl(${(plate * 137.507764 + 18) % 360} 60% 55%)`; }
function tectonicBoundaryColor(kind: number): string { if (kind === WORLDGEN_BOUNDARY_CONVERGENT) return '#ff7272'; if (kind === WORLDGEN_BOUNDARY_DIVERGENT) return '#64d7ff'; if (kind === WORLDGEN_BOUNDARY_TRANSFORM) return '#ffd36a'; return '#d7e2ef'; }
function geologicalBoundaryColor(regime: number): string {
  if (regime === WORLDGEN_GEOLOGY_OCEANIC_SUBDUCTION) return '#5a8fff';
  if (regime === WORLDGEN_GEOLOGY_OCEAN_CONTINENT_SUBDUCTION) return '#8a70ff';
  if (regime === WORLDGEN_GEOLOGY_CONTINENTAL_COLLISION) return '#ff6969';
  if (regime === WORLDGEN_GEOLOGY_OCEANIC_RIDGE) return '#4ee8df';
  if (regime === WORLDGEN_GEOLOGY_CONTINENTAL_RIFT) return '#ffb65c';
  if (regime === WORLDGEN_GEOLOGY_TRANSITIONAL_DIVERGENCE) return '#e8cf66';
  if (regime === WORLDGEN_GEOLOGY_TRANSFORM) return '#d59cff';
  return '#d7e2ef';
}
function crustColor(kind: number): string { if (kind === WORLDGEN_CRUST_CONTINENTAL) return '#b79a72'; if (kind === WORLDGEN_CRUST_TRANSITIONAL) return '#9aab87'; if (kind === WORLDGEN_CRUST_OCEANIC) return '#477aa3'; return '#d7e2ef'; }
function scalarColor(value: number, minimum: number, maximum: number, lowHue: number, highHue: number): string {
  const span = Math.max(1e-12, maximum - minimum);
  const t = Math.max(0, Math.min(1, (value - minimum) / span));
  const hue = lowHue + (highHue - lowHue) * t;
  return `hsl(${hue} 68% ${38 + t * 22}%)`;
}
function scalarField(result: WorldgenGeologyResult, mode: ScalarFieldKey): { values: Float32Array; minimum: number; maximum: number; lowHue: number; highHue: number } {
  switch (mode) {
    case 'crust-age': return { values: result.crustAgeMyr, minimum: 0, maximum: 3500, lowHue: 205, highHue: 24 };
    case 'crust-thickness': return { values: result.crustThicknessKm, minimum: 5, maximum: 56, lowHue: 205, highHue: 350 };
    case 'crust-density': return { values: result.crustDensityKgPerM3, minimum: 2670, maximum: 3010, lowHue: 48, highHue: 258 };
    case 'buoyancy': return { values: result.buoyancyIndex, minimum: -1, maximum: 1, lowHue: 250, highHue: 42 };
    case 'orogeny': return { values: result.orogenicHistory, minimum: 0, maximum: 1, lowHue: 50, highHue: 350 };
    case 'rift': return { values: result.riftHistory, minimum: 0, maximum: 1, lowHue: 210, highHue: 26 };
    case 'ridge': return { values: result.ridgeHistory, minimum: 0, maximum: 1, lowHue: 225, highHue: 170 };
    case 'subduction': return { values: result.subductionHistory, minimum: 0, maximum: 1, lowHue: 210, highHue: 285 };
    case 'trench': return { values: result.trenchHistory, minimum: 0, maximum: 1, lowHue: 200, highHue: 260 };
    case 'arc': return { values: result.volcanicArcHistory, minimum: 0, maximum: 1, lowHue: 50, highHue: 8 };
    case 'transform-history': return { values: result.transformHistory, minimum: 0, maximum: 1, lowHue: 210, highHue: 300 };
    case 'subsidence': return { values: result.subsidenceHistory, minimum: 0, maximum: 1, lowHue: 45, highHue: 230 };
    case 'basin': return { values: result.basinPotential, minimum: 0, maximum: 1, lowHue: 220, highHue: 90 };
    case 'strain': return { values: result.crustalStrain, minimum: 0, maximum: 1, lowHue: 210, highHue: 0 };
  }
}

function renderGeology(canvas: HTMLCanvasElement, result: WorldgenGeologyResult, tectonics: WorldgenTectonicsResult | null, projection: string, mode: string, yaw: number, pitch: number): void {
  const width = 1100;
  const height = projection === 'map' ? 550 : 760;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Worldgen Lab could not acquire a 2D canvas context.');
  context.fillStyle = '#08101a';
  context.fillRect(0, 0, width, height);

  function projectVector(raw: readonly number[]): [number, number, boolean] {
    if (projection === 'map') {
      const lon = Math.atan2(raw[1]!, raw[0]!);
      const lat = Math.asin(Math.max(-1, Math.min(1, raw[2]!)));
      return [(lon + Math.PI) / (2 * Math.PI) * width, (Math.PI / 2 - lat) / Math.PI * height, true];
    }
    const position = rotate(raw, yaw, pitch);
    const radius = Math.min(width, height) * 0.44;
    return [width / 2 + position[1] * radius, height / 2 - position[2] * radius, position[0] >= 0];
  }
  function projectSample(sample: number): [number, number, boolean] { return projectVector(samplePosition(result, sample)); }

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
      if (!av) continue;
      for (let cursor = result.neighborOffsets[sample]!; cursor < result.neighborOffsets[sample + 1]!; cursor += 1) {
        const neighbor = result.neighbors[cursor]!;
        if (neighbor <= sample) continue;
        const [bx, by, bv] = projectSample(neighbor);
        if (!bv || (projection === 'map' && Math.abs(ax - bx) > width / 2)) continue;
        context.moveTo(ax, ay); context.lineTo(bx, by);
      }
    }
    context.stroke();
    return;
  }

  const pointRadius = result.metrics.sampleCount > 30_000 ? 1.15 : result.metrics.sampleCount > 5_000 ? 2.05 : 3.0;
  const categoricalBoundaryMode = mode === 'tectonic-boundaries' || mode === 'geological-boundaries';
  const scalar = !['plates', 'crust-type', 'tectonic-boundaries', 'geological-boundaries', 'motion'].includes(mode) ? scalarField(result, mode as ScalarFieldKey) : null;
  context.globalAlpha = categoricalBoundaryMode || mode === 'motion' ? 0.30 : 0.94;
  for (let sample = 0; sample < result.metrics.sampleCount; sample += 1) {
    const [x, y, visible] = projectSample(sample);
    if (!visible) continue;
    if (mode === 'plates' || mode === 'motion' || mode === 'tectonic-boundaries') context.fillStyle = plateColor(result.plateIds[sample]!);
    else if (mode === 'crust-type' || mode === 'geological-boundaries') context.fillStyle = crustColor(result.crustKind[sample]!);
    else if (scalar) context.fillStyle = scalarColor(scalar.values[sample]!, scalar.minimum, scalar.maximum, scalar.lowHue, scalar.highHue);
    else context.fillStyle = '#8297aa';
    context.beginPath(); context.arc(x, y, pointRadius, 0, Math.PI * 2); context.fill();
  }
  context.globalAlpha = 1;

  if (mode === 'tectonic-boundaries' || mode === 'geological-boundaries') {
    context.lineCap = 'round';
    for (let boundary = 0; boundary < result.boundaryEdgeCount; boundary += 1) {
      const sampleA = result.boundarySamples[boundary * 2]!;
      const sampleB = result.boundarySamples[boundary * 2 + 1]!;
      const [ax, ay, av] = projectSample(sampleA);
      const [bx, by, bv] = projectSample(sampleB);
      if (!av || !bv || (projection === 'map' && Math.abs(ax - bx) > width / 2)) continue;
      context.strokeStyle = mode === 'tectonic-boundaries' ? tectonicBoundaryColor(result.boundaryKinds[boundary]!) : geologicalBoundaryColor(result.geologicalBoundaryRegimes[boundary]!);
      context.lineWidth = 1.8;
      context.beginPath(); context.moveTo(ax, ay); context.lineTo(bx, by); context.stroke();
    }
  }

  if (mode === 'motion' && tectonics) {
    context.lineWidth = 1.5;
    for (let plate = 0; plate < tectonics.metrics.plateCount; plate += 1) {
      const seed = tectonics.plateSeedSamples[plate]!;
      const start = samplePosition(tectonics, seed);
      const omega = plateVector(tectonics.plateAngularVelocitiesRadPerMyr, plate);
      const tangentVelocity = normalize(cross(omega, start));
      const end = normalize(add(start, tangentVelocity, 0.13));
      const [ax, ay, av] = projectVector(start);
      const [bx, by, bv] = projectVector(end);
      if (!av || !bv || (projection === 'map' && Math.abs(ax - bx) > width / 2)) continue;
      context.strokeStyle = '#f4f7fb';
      context.fillStyle = '#f4f7fb';
      context.beginPath(); context.moveTo(ax, ay); context.lineTo(bx, by); context.stroke();
      const angle = Math.atan2(by - ay, bx - ax);
      context.beginPath(); context.moveTo(bx, by); context.lineTo(bx - 6 * Math.cos(angle - 0.55), by - 6 * Math.sin(angle - 0.55)); context.lineTo(bx - 6 * Math.cos(angle + 0.55), by - 6 * Math.sin(angle + 0.55)); context.closePath(); context.fill();
    }
  }
}

function renderMetrics(container: HTMLElement, result: WorldgenGeologyResult): void {
  container.replaceChildren();
  const major = result.plateScaleClasses.reduce((count, value) => count + (value === WORLDGEN_PLATE_MAJOR ? 1 : 0), 0);
  const intermediate = result.plateScaleClasses.reduce((count, value) => count + (value === WORLDGEN_PLATE_INTERMEDIATE ? 1 : 0), 0);
  const minor = result.plateScaleClasses.reduce((count, value) => count + (value === WORLDGEN_PLATE_MINOR ? 1 : 0), 0);
  metric(container, 'Engine / stage', `v${result.engineVersion} · ${result.stage.id}@${result.stage.version}`);
  metric(container, 'Topology', `icosphere L${result.level} · ${result.metrics.sampleCount.toLocaleString()} samples`);
  metric(container, 'Crust area', `${(result.metrics.continentalAreaFraction * 100).toFixed(1)}% continental · ${(result.metrics.transitionalAreaFraction * 100).toFixed(1)}% transitional · ${(result.metrics.oceanicAreaFraction * 100).toFixed(1)}% oceanic`);
  metric(container, 'Mean crust age', `${result.metrics.meanContinentalAgeMyr.toFixed(0)} Myr continental · ${result.metrics.meanOceanicAgeMyr.toFixed(1)} Myr oceanic`);
  metric(container, 'Mean thickness', `${result.metrics.meanContinentalThicknessKm.toFixed(1)} km continental · ${result.metrics.meanOceanicThicknessKm.toFixed(1)} km oceanic`);
  metric(container, 'Plate scale classes', `${major} major · ${intermediate} intermediate · ${minor} minor`);
  metric(container, 'Subduction / collision', `${result.metrics.oceanicSubductionEdges.toLocaleString()} oceanic · ${result.metrics.oceanContinentSubductionEdges.toLocaleString()} ocean-continent · ${result.metrics.continentalCollisionEdges.toLocaleString()} collision`);
  metric(container, 'Ridge / rift / transition', `${result.metrics.oceanicRidgeEdges.toLocaleString()} / ${result.metrics.continentalRiftEdges.toLocaleString()} / ${result.metrics.transitionalDivergenceEdges.toLocaleString()}`);
  metric(container, 'Transform edges', result.metrics.transformEdges.toLocaleString());
  metric(container, 'Topology hash', result.topologyHash);
  metric(container, 'Tectonic hash', result.metrics.tectonicHash);
  metric(container, 'Geology hash', result.metrics.geologyHash);
  metric(container, 'Rust + WASM', `${result.stage.durationMs.toFixed(2)} ms`);
}

function install(): void {
  const seed = element<HTMLInputElement>('worldgen-seed');
  const level = element<HTMLInputElement>('worldgen-level');
  const plates = element<HTMLInputElement>('worldgen-plates');
  const projection = element<HTMLSelectElement>('worldgen-projection');
  const visualization = element<HTMLSelectElement>('worldgen-visualization');
  const generate = element<HTMLButtonElement>('worldgen-generate');
  const status = element<HTMLElement>('worldgen-status');
  const metrics = element<HTMLElement>('worldgen-metrics');
  const canvas = element<HTMLCanvasElement>('worldgen-field');
  const client = createWorldgenClient();
  let current: WorldgenGeologyResult | null = null;
  let currentTectonics: WorldgenTectonicsResult | null = null;
  let currentIdentity = '';
  let yaw = 0.0, pitch = 0.15, dragging = false, lastX = 0, lastY = 0;

  function identity(): string { return `${seed.value}\u0000${level.value}\u0000${plates.value}`; }
  function redraw(): void { if (current) renderGeology(canvas, current, currentTectonics, projection.value, visualization.value, yaw, pitch); }
  async function ensureMotionData(): Promise<void> {
    if (!current || visualization.value !== 'motion') return;
    if (currentTectonics && currentIdentity === identity()) { redraw(); return; }
    const requestedIdentity = identity();
    currentTectonics = await client.generateTectonics({ seed: seed.value, level: Number(level.value), plateCount: Number(plates.value) });
    if (requestedIdentity === identity()) { currentIdentity = requestedIdentity; redraw(); }
  }
  async function run(): Promise<void> {
    generate.disabled = true;
    status.className = 'worldgen-lab-status';
    status.textContent = 'Building crustal provinces and inferred geological history in Rust/WASM…';
    try {
      current = await client.generateGeology({ seed: seed.value, level: Number(level.value), plateCount: Number(plates.value) });
      currentTectonics = null;
      currentIdentity = identity();
      renderMetrics(metrics, current);
      redraw();
      if (visualization.value === 'motion') await ensureMotionData();
      status.className = 'worldgen-lab-status worldgen-lab-status--ok';
      status.textContent = 'WG-3 physical crust and geological history active. Projection and diagnostic modes do not alter generated truth.';
    } catch (error) {
      status.className = 'worldgen-lab-status worldgen-lab-status--error';
      status.textContent = error instanceof Error ? error.message : String(error);
    } finally { generate.disabled = false; }
  }
  generate.addEventListener('click', () => void run());
  for (const input of [seed, level, plates]) input.addEventListener('keydown', event => { if (event.key === 'Enter') void run(); });
  projection.addEventListener('change', redraw);
  visualization.addEventListener('change', () => { redraw(); void ensureMotionData(); });
  canvas.addEventListener('pointerdown', event => { if (projection.value !== 'globe') return; dragging = true; lastX = event.clientX; lastY = event.clientY; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointermove', event => { if (!dragging || projection.value !== 'globe') return; yaw += (event.clientX - lastX) * 0.01; pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch + (event.clientY - lastY) * 0.01)); lastX = event.clientX; lastY = event.clientY; redraw(); });
  canvas.addEventListener('pointerup', () => { dragging = false; });
  canvas.addEventListener('pointercancel', () => { dragging = false; });
  window.addEventListener('beforeunload', () => client.dispose(), { once: true });
  void run();
}

document.addEventListener('DOMContentLoaded', install);
