from pathlib import Path

ROOT = Path('.')

def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding='utf-8')

write('src/debug/runtimeCapabilities.ts', r'''const WASM_SIMD_PROBE = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
  0x03, 0x02, 0x01, 0x00,
  0x0a, 0x16, 0x01, 0x14, 0x00, 0xfd, 0x0c,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x0b,
]);

export interface RuntimeCapabilities {
  worker: boolean;
  hardwareConcurrency: number;
  webAssembly: boolean;
  wasmSimd: boolean;
  sharedArrayBuffer: boolean;
  crossOriginIsolated: boolean;
  wasmThreads: boolean;
  webGpu: boolean;
  offscreenCanvas: boolean;
}

function wasmSimdAvailable(webAssemblyLike: typeof WebAssembly | undefined): boolean {
  try {
    return typeof webAssemblyLike === 'object'
      && typeof webAssemblyLike.validate === 'function'
      && webAssemblyLike.validate(WASM_SIMD_PROBE);
  } catch {
    return false;
  }
}

export function browserRuntimeCapabilities(scope: typeof globalThis = globalThis): RuntimeCapabilities {
  const navigatorLike = scope.navigator;
  const webAssemblyLike = scope.WebAssembly;
  const sharedArrayBufferAvailable = typeof scope.SharedArrayBuffer === 'function';
  const isolated = scope.crossOriginIsolated === true;
  return {
    worker: typeof scope.Worker === 'function',
    hardwareConcurrency: Number.isFinite(navigatorLike?.hardwareConcurrency)
      ? Math.max(1, Math.floor(navigatorLike.hardwareConcurrency))
      : 1,
    webAssembly: typeof webAssemblyLike === 'object',
    wasmSimd: wasmSimdAvailable(webAssemblyLike),
    sharedArrayBuffer: sharedArrayBufferAvailable,
    crossOriginIsolated: isolated,
    wasmThreads: sharedArrayBufferAvailable && isolated && typeof scope.Atomics === 'object',
    webGpu: Boolean((navigatorLike as Navigator & { gpu?: unknown } | undefined)?.gpu),
    offscreenCanvas: typeof scope.OffscreenCanvas === 'function',
  };
}
''')

write('src/debug/debugTelemetry.ts', r'''import type { AppState } from '../state/appState.js';

export interface SimulationDebugStats {
  sessions: number;
  nodes: number;
  activeMachines: number;
  connections: number;
  furnaces: number;
  activeFurnaceZones: number;
  solverEvaluations: number;
}

export function mean(values: readonly number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function percentile(values: readonly number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

export function collectSimulationDebugStats(state: Readonly<AppState>): SimulationDebugStats {
  const resourceCount = state.world?.planet.resourceNodes.length ?? 0;
  const mechanicalNodes = state.graph.nodes;
  return {
    // Recursive Site sessions were intentionally retired by the flat-map rewrite.
    sessions: 0,
    nodes: resourceCount + mechanicalNodes.length,
    activeMachines: mechanicalNodes.filter(node => node.enabled).length,
    connections: state.graph.connections.length,
    furnaces: mechanicalNodes.filter(node => node.nodeType === 'roastingFurnace').length,
    // These remain zero until the original Rust/WASM thermochemical runtime is reconnected.
    activeFurnaceZones: 0,
    solverEvaluations: 0,
  };
}
''')

write('src/ui/debugPanel.ts', r'''import { browserRuntimeCapabilities } from '../debug/runtimeCapabilities.js';
import { collectSimulationDebugStats, mean, percentile } from '../debug/debugTelemetry.js';
import type { AppState, AppStore } from '../state/appState.js';

const FRAME_SAMPLE_LIMIT = 300;
const DEBUG_REFRESH_MS = 250;

function setText(root: HTMLElement, name: string, value: string): void {
  const element = root.querySelector<HTMLElement>(`[data-debug-stat="${name}"]`);
  if (element) element.textContent = value;
}

function formatMs(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(2)} ms` : '—';
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

function disableRuntimeOnlyControls(root: HTMLElement): void {
  const unavailableTitle = 'Available again when the original Rust/WASM runtime is reconnected.';
  const deepProfiling = root.querySelector<HTMLInputElement>('#ws-debug-deep-profiling');
  if (deepProfiling) {
    deepProfiling.disabled = true;
    deepProfiling.checked = false;
    deepProfiling.title = unavailableTitle;
  }
  for (const action of ['toggle-pause', 'step-0.1', 'step-1', 'step-10', 'place-factories', 'remove-factories']) {
    const button = root.querySelector<HTMLButtonElement>(`[data-debug-action="${action}"]`);
    if (button) {
      button.disabled = true;
      button.title = unavailableTitle;
    }
  }
  const count = root.querySelector<HTMLSelectElement>('#ws-debug-factory-count');
  if (count) count.disabled = true;
  const status = root.querySelector<HTMLElement>('#ws-debug-status');
  if (status) status.textContent = 'Runtime-dependent debug tools are unavailable until Rust/WASM is reconnected.';
}

function heapUsedText(): string {
  const performanceWithMemory = globalThis.performance as Performance & {
    memory?: { usedJSHeapSize?: number };
  };
  const bytes = performanceWithMemory?.memory?.usedJSHeapSize;
  return bytes ? `${(bytes / 1048576).toFixed(1)} MB` : 'Unavailable';
}

export function installDebugPanel(root: HTMLElement, store: AppStore): void {
  const drawer = root.querySelector<HTMLElement>('#ws-debug-drawer');
  if (!drawer) return;

  let latestState: Readonly<AppState> = store.getState();
  let frameSamplesMs: number[] = [];
  let frameRafId: number | null = null;
  let lastFrameAtMs: number | null = null;
  let refreshTimerId: number | null = null;

  installRuntimeCapabilityStats(drawer);
  disableRuntimeOnlyControls(drawer);

  const render = (): void => {
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
    if (drawer.hidden) return;
    render();
    frameRafId = requestAnimationFrame(sampleFrame);
    refreshTimerId = window.setInterval(render, DEBUG_REFRESH_MS);
  };

  root.querySelector<HTMLButtonElement>('[data-debug-action="reset-stats"]')?.addEventListener('click', () => {
    frameSamplesMs = [];
    lastFrameAtMs = null;
    render();
  });

  store.subscribe(state => {
    latestState = state;
    if (!drawer.hidden) render();
  });

  const observer = new MutationObserver(syncOpenState);
  observer.observe(drawer, { attributes: true, attributeFilter: ['hidden'] });
  syncOpenState();
}
''')

write('src/ui/workspaceShell.ts', r'''export interface WorkspaceShellOptions {
  title?: string;
  subtitle?: string;
}

interface DrawerBinding {
  toggleId: string;
  drawerId: string;
  closeId: string;
}

const DRAWERS: DrawerBinding[] = [
  { toggleId: 'ws-navigation-toggle', drawerId: 'ws-navigation-drawer', closeId: 'ws-navigation-close' },
  { toggleId: 'ws-node-catalog-toggle', drawerId: 'ws-node-catalog-drawer', closeId: 'ws-node-catalog-close' },
  { toggleId: 'ws-debug-toggle', drawerId: 'ws-debug-drawer', closeId: 'ws-debug-close' },
];

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function debugDrawerMarkup(): string {
  return `<aside id="ws-debug-drawer" class="ws-debug-drawer" aria-label="Debug and performance tools" aria-hidden="true" hidden>
    <div class="ws-navigation-header ws-debug-header"><strong>DEBUG</strong><div class="ws-navigation-actions"><button id="ws-debug-close" class="ws-navigation-close" type="button" aria-label="Close debug tools" title="Close">×</button></div></div>
    <div class="ws-debug-scroll">
      <section class="ws-debug-section"><div class="ws-debug-section-title">Performance</div>
        <div class="ws-debug-metric"><span>FPS</span><span data-debug-stat="fps">—</span></div>
        <div class="ws-debug-metric"><span>Frame average</span><span data-debug-stat="frame-average">—</span></div>
        <div class="ws-debug-metric"><span>Frame p95</span><span data-debug-stat="frame-p95">—</span></div>
        <div class="ws-debug-metric"><span>Fixed-step accumulator</span><span data-debug-stat="step-accumulator">—</span></div>
        <div class="ws-debug-metric"><span>Scheduler debt</span><span data-debug-stat="scheduler-debt">—</span></div>
        <div class="ws-debug-metric"><span>Realtime factor (5 s)</span><span data-debug-stat="realtime-factor">—</span></div>
        <div class="ws-debug-metric"><span>Physics engine</span><span data-debug-stat="apparatus-cpu-tick">Rust/WASM</span></div>
        <div class="ws-debug-metric"><span>Rust tick average</span><span data-debug-stat="profile-tick-average">—</span></div>
        <div class="ws-debug-metric"><span>Apparatus average</span><span data-debug-stat="profile-apparatus-average">—</span></div>
        <div class="ws-debug-metric"><span>Other runtime average</span><span data-debug-stat="profile-other-average">—</span></div>
        <div class="ws-debug-metric"><span>Worker step round-trip</span><span data-debug-stat="profile-worker-roundtrip">—</span></div>
        <div class="ws-debug-metric"><span>Presentation update</span><span data-debug-stat="profile-presentation-update">—</span></div>
        <label class="ws-debug-check"><input id="ws-debug-deep-profiling" type="checkbox">Deep Rust apparatus profiling</label>
        <div class="ws-debug-note">Timing percentages use the authoritative 100 ms fixed-step realtime budget. Worker round-trip includes dispatch, Rust/WASM execution, snapshot creation, and return transport; presentation update measures main-thread projection/rendering. The accumulator is normal fixed-step phase; only scheduler debt represents time beyond one step window. Profiling is debug-only and turns off when this drawer closes.</div>
        <div id="ws-debug-profile-breakdown" class="ws-debug-profile-breakdown">Enable deep profiling to measure Rust apparatus hotspots.</div>
        <button class="ws-debug-button" data-debug-action="reset-stats" type="button">Reset Statistics</button>
      </section>
      <section class="ws-debug-section"><div class="ws-debug-section-title">Runtime</div>
        <div class="ws-debug-metric"><span>Production backend</span><span data-debug-stat="runtime-backend">Rust/WASM Worker</span></div>
        <div class="ws-debug-metric"><span>Logical CPU threads</span><span data-debug-stat="logical-cpus">—</span></div>
        <div class="ws-debug-metric"><span>Web Worker</span><span data-debug-stat="worker-capability">—</span></div>
        <div class="ws-debug-metric"><span>WebAssembly / SIMD</span><span data-debug-stat="wasm-capability">—</span></div>
        <div class="ws-debug-metric"><span>Shared-memory threads</span><span data-debug-stat="thread-capability">—</span></div>
        <div class="ws-debug-metric"><span>WebGPU</span><span data-debug-stat="webgpu-capability">—</span></div>
        <div class="ws-debug-metric"><span>OffscreenCanvas</span><span data-debug-stat="offscreen-capability">—</span></div>
      </section>
      <section class="ws-debug-section"><div class="ws-debug-section-title">Simulation</div>
        <div class="ws-debug-metric"><span>Active Site sessions</span><span data-debug-stat="sessions">0</span></div>
        <div class="ws-debug-metric"><span>Nodes</span><span data-debug-stat="nodes">0</span></div>
        <div class="ws-debug-metric"><span>Active machines</span><span data-debug-stat="active-machines">0</span></div>
        <div class="ws-debug-metric"><span>Connections</span><span data-debug-stat="connections">0</span></div>
        <div class="ws-debug-metric"><span>JS heap used</span><span data-debug-stat="heap-used">Unavailable</span></div>
      </section>
      <section class="ws-debug-section"><div class="ws-debug-section-title">Thermochemical</div>
        <div class="ws-debug-metric"><span>Furnaces</span><span data-debug-stat="furnaces">0</span></div>
        <div class="ws-debug-metric"><span>Occupied furnace zones</span><span data-debug-stat="furnace-zones">0</span></div>
        <div class="ws-debug-metric"><span>Solver evaluations (last state)</span><span data-debug-stat="solver-evaluations">0</span></div>
      </section>
      <section class="ws-debug-section"><div class="ws-debug-section-title">Simulation tools</div>
        <div class="ws-debug-button-row"><button data-debug-action="toggle-pause" type="button">Pause World</button><button data-debug-action="step-0.1" type="button">+0.1 s</button><button data-debug-action="step-1" type="button">+1 s</button><button data-debug-action="step-10" type="button">+10 s</button></div>
      </section>
      <section class="ws-debug-section"><div class="ws-debug-section-title">Test factory</div>
        <div class="ws-debug-field"><label for="ws-debug-factory-template">Template</label><select id="ws-debug-factory-template" disabled><option>Iron Processing Line v2</option></select></div>
        <div class="ws-debug-field"><label for="ws-debug-factory-count">Factory count</label><select id="ws-debug-factory-count"><option value="1">1</option><option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></div>
        <div class="ws-debug-note">Visible placement uses the selected goethite-bearing iron Feature when possible, otherwise the first compatible Feature in the Site. Test factories run through the live Rust/WASM Worker.</div>
        <div class="ws-debug-button-row"><button data-debug-action="place-factories" type="button">Place Factory</button></div>
        <button class="ws-debug-button ws-debug-button--danger" data-debug-action="remove-factories" type="button">Remove Test Factories</button>
        <div id="ws-debug-status" class="ws-debug-status" aria-live="polite"></div>
      </section>
    </div>
  </aside>`;
}

export function workspaceShellMarkup(options: WorkspaceShellOptions = {}): string {
  const title = escapeHtml(options.title ?? '');
  const subtitle = options.subtitle ? `<div class="ws-workspace-subtitle">${escapeHtml(options.subtitle)}</div>` : '';

  return `<div class="ws-workspace">
    <div class="ws-workspace-header"><div class="ws-workspace-title">${title}</div>${subtitle}</div>
    <div class="ws-toolbar">
      <div class="ws-context-controls"></div>
      <div class="ws-viewport-controls">
        <button data-viewport="out" type="button">Zoom Out</button>
        <span data-zoom-label>100%</span>
        <button data-viewport="in" type="button">Zoom In</button>
        <button data-viewport="fit" type="button">Fit</button>
        <button data-viewport="center" type="button">Center</button>
      </div>
    </div>
    <div class="ws-layout">
      <div class="ws-panel-rail">
        <button id="ws-navigation-toggle" class="ws-navigation-tab" type="button" aria-controls="ws-navigation-drawer" aria-expanded="false"><span aria-hidden="true">N<br>A<br>V</span><span class="ws-visually-hidden">Open hierarchy navigation</span></button>
        <button id="ws-node-catalog-toggle" class="ws-navigation-tab ws-node-catalog-tab" type="button" aria-controls="ws-node-catalog-drawer" aria-expanded="false"><span aria-hidden="true">N<br>O<br>D<br>E</span><span class="ws-visually-hidden">Open node catalog</span></button>
        <button id="ws-debug-toggle" class="ws-navigation-tab ws-debug-tab" type="button" aria-controls="ws-debug-drawer" aria-expanded="false"><span aria-hidden="true">D<br>E<br>B<br>U<br>G</span><span class="ws-visually-hidden">Open debug and performance tools</span></button>
      </div>
      <aside id="ws-navigation-drawer" class="ws-navigation-drawer" aria-label="Hierarchy navigation" aria-hidden="true" hidden>
        <div class="ws-navigation-header"><strong>NAVIGATION</strong><div class="ws-navigation-actions"><button id="ws-navigation-collapse-all" class="ws-navigation-action" type="button" aria-label="Collapse all hierarchy entries" title="Collapse all">−</button><button id="ws-navigation-expand-all" class="ws-navigation-action" type="button" aria-label="Expand all hierarchy entries" title="Expand all">+</button><button id="ws-navigation-close" class="ws-navigation-close" type="button" aria-label="Close hierarchy navigation" title="Close">×</button></div></div>
        <label class="ws-navigation-search-label" for="ws-navigation-search">Search hierarchy</label>
        <input id="ws-navigation-search" class="ws-navigation-search" type="search" placeholder="Search hierarchy…" autocomplete="off">
        <details id="ws-navigation-filters" class="ws-navigation-filters-panel"><summary>Show filters</summary><div class="ws-navigation-filters"></div></details>
        <div id="ws-navigation-match-count" class="ws-navigation-match-count" aria-live="polite"></div>
        <div id="ws-navigation-tree" class="ws-navigation-tree" role="tree" aria-label="World hierarchy"></div>
      </aside>
      <aside id="ws-node-catalog-drawer" class="ws-node-catalog-drawer" aria-label="Node catalog" aria-hidden="true" hidden>
        <div class="ws-navigation-header"><strong>NODE</strong><div class="ws-navigation-actions"><button id="ws-node-catalog-close" class="ws-navigation-close" type="button" aria-label="Close node catalog" title="Close">×</button></div></div>
        <label class="ws-navigation-search-label" for="ws-node-catalog-search">Search nodes</label>
        <input id="ws-node-catalog-search" class="ws-navigation-search" type="search" placeholder="Search nodes…" autocomplete="off">
        <details id="ws-node-catalog-filters" class="ws-navigation-filters-panel"><summary>Show filters</summary><div class="ws-navigation-filters"></div></details>
        <div id="ws-node-catalog-match-count" class="ws-navigation-match-count" aria-live="polite"></div>
        <div id="ws-node-catalog-tree" class="ws-navigation-tree" role="tree" aria-label="Placeable nodes"></div>
        <div id="ws-node-catalog-status" class="ws-node-catalog-status" aria-live="polite"></div>
      </aside>
      ${debugDrawerMarkup()}
      <div class="ws-viewport" data-viewport-surface>
        <svg id="ws-map-svg" class="ws-graph-svg" aria-label="Planet map"></svg>
        <div id="ws-map-canvas" class="ws-graph-canvas"></div>
      </div>
      <div class="ws-inspector"><div class="ws-inspector-title">Inspector</div><div id="ws-map-inspector-body" class="ws-inspector-body">Select a map object to inspect it.</div></div>
    </div>
  </div>`;
}

function setDrawerState(root: HTMLElement, binding: DrawerBinding, open: boolean): void {
  const toggle = root.querySelector<HTMLButtonElement>(`#${binding.toggleId}`);
  const drawer = root.querySelector<HTMLElement>(`#${binding.drawerId}`);
  if (!toggle || !drawer) return;
  drawer.hidden = !open;
  drawer.setAttribute('aria-hidden', String(!open));
  toggle.setAttribute('aria-expanded', String(open));
}

function closeOtherDrawers(root: HTMLElement, active: DrawerBinding): void {
  for (const binding of DRAWERS) {
    if (binding.drawerId !== active.drawerId) setDrawerState(root, binding, false);
  }
}

function installDrawerBindings(root: HTMLElement): void {
  for (const binding of DRAWERS) {
    const toggle = root.querySelector<HTMLButtonElement>(`#${binding.toggleId}`);
    const drawer = root.querySelector<HTMLElement>(`#${binding.drawerId}`);
    const close = root.querySelector<HTMLButtonElement>(`#${binding.closeId}`);
    if (!toggle || !drawer || !close) continue;
    toggle.addEventListener('click', () => {
      const willOpen = drawer.hidden;
      if (willOpen) closeOtherDrawers(root, binding);
      setDrawerState(root, binding, willOpen);
    });
    close.addEventListener('click', () => setDrawerState(root, binding, false));
  }
}

export function renderWorkspaceShell(container: HTMLElement, options: WorkspaceShellOptions = {}): HTMLElement {
  container.innerHTML = workspaceShellMarkup(options);
  const root = container.querySelector<HTMLElement>('.ws-workspace');
  if (!root) throw new Error('Workspace shell failed to render.');
  installDrawerBindings(root);
  return root;
}
''')

write('src/ui/navigationPanel.ts', r'''import type { AppStore } from '../state/appState.js';
import type { MapSelection, Planet, Region, ResourceNode } from '../world/types.js';

type NavigationCategory = 'planet' | 'region' | 'feature';

interface NavigationRow {
  key: string;
  label: string;
  depth: number;
  category: NavigationCategory;
  expandable: boolean;
  parentKey: string | null;
  selection: MapSelection;
}

const CATEGORY_LABELS: Record<NavigationCategory, string> = {
  planet: 'Planet',
  region: 'Region',
  feature: 'Feature',
};

function selectionKey(selection: MapSelection): string {
  if (selection.type === 'planet') return 'planet';
  if (selection.type === 'region') return `region:${selection.regionId}`;
  if (selection.type === 'resource') return `resource:${selection.resourceNodeId}`;
  return `mechanical:${selection.mechanicalNodeId}`;
}

function resourceNodesForRegion(planet: Planet, region: Region): ResourceNode[] {
  const ids = new Set(region.resourceNodeIds);
  return planet.resourceNodes.filter(node => ids.has(node.id));
}

function buildRows(planet: Planet): NavigationRow[] {
  const rows: NavigationRow[] = [{
    key: 'planet', label: planet.name, depth: 0, category: 'planet', expandable: true,
    parentKey: null, selection: { type: 'planet' },
  }];
  for (const region of planet.regions) {
    const regionKey = `region:${region.id}`;
    rows.push({
      key: regionKey, label: region.name, depth: 1, category: 'region',
      expandable: region.resourceNodeIds.length > 0, parentKey: 'planet',
      selection: { type: 'region', regionId: region.id },
    });
    for (const resource of resourceNodesForRegion(planet, region)) {
      rows.push({
        key: `resource:${resource.id}`, label: resource.name, depth: 2, category: 'feature',
        expandable: false, parentKey: regionKey,
        selection: { type: 'resource', resourceNodeId: resource.id },
      });
    }
  }
  return rows;
}

function rowIsVisible(row: NavigationRow, expandedKeys: Set<string>): boolean {
  if (!row.parentKey) return true;
  if (!expandedKeys.has(row.parentKey)) return false;
  if (row.depth < 2) return true;
  return expandedKeys.has('planet');
}

function createNavigationRow(
  row: NavigationRow,
  selectedKey: string,
  expandedKeys: Set<string>,
  matchKeys: Set<string>,
  contextKeys: Set<string>,
  onExpand: (key: string) => void,
  onSelect: (selection: MapSelection) => void,
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'ws-navigation-row-wrap';
  const element = document.createElement('div');
  element.className = 'ws-navigation-row';
  if (row.key === selectedKey) element.classList.add('ws-navigation-row--active');
  if (matchKeys.has(row.key)) element.classList.add('ws-navigation-row--match');
  else if (contextKeys.has(row.key)) element.classList.add('ws-navigation-row--context');
  element.style.setProperty('--ws-navigation-depth', String(row.depth));

  if (row.expandable) {
    const expand = document.createElement('button');
    expand.className = 'ws-navigation-expand';
    expand.type = 'button';
    expand.textContent = expandedKeys.has(row.key) ? '▾' : '▸';
    expand.setAttribute('aria-label', `${expandedKeys.has(row.key) ? 'Collapse' : 'Expand'} ${row.label}`);
    expand.addEventListener('click', event => { event.stopPropagation(); onExpand(row.key); });
    element.appendChild(expand);
  } else {
    const spacer = document.createElement('span');
    spacer.className = 'ws-navigation-expand-spacer';
    element.appendChild(spacer);
  }

  const entry = document.createElement('button');
  entry.className = 'ws-navigation-entry';
  entry.type = 'button';
  const category = document.createElement('span');
  category.className = `ws-navigation-category ws-navigation-category--${row.category}`;
  const label = document.createElement('span');
  label.className = 'ws-navigation-label';
  label.textContent = row.label;
  entry.append(category, label);
  if (matchKeys.has(row.key) || contextKeys.has(row.key)) {
    const state = document.createElement('span');
    state.className = 'ws-navigation-state';
    state.textContent = matchKeys.has(row.key) ? 'MATCH' : 'CONTEXT';
    entry.appendChild(state);
  }
  entry.addEventListener('click', () => onSelect(row.selection));
  element.appendChild(entry);
  wrapper.appendChild(element);
  return wrapper;
}

export function installNavigationPanel(root: HTMLElement, store: AppStore): void {
  const tree = root.querySelector<HTMLElement>('#ws-navigation-tree');
  const search = root.querySelector<HTMLInputElement>('#ws-navigation-search');
  const count = root.querySelector<HTMLElement>('#ws-navigation-match-count');
  const filters = root.querySelector<HTMLElement>('#ws-navigation-filters .ws-navigation-filters');
  const expandAll = root.querySelector<HTMLButtonElement>('#ws-navigation-expand-all');
  const collapseAll = root.querySelector<HTMLButtonElement>('#ws-navigation-collapse-all');
  if (!tree || !search || !count || !filters || !expandAll || !collapseAll) return;

  const expandedKeys = new Set<string>(['planet']);
  const visibleCategories = new Set<NavigationCategory>(['planet', 'region', 'feature']);

  for (const category of ['planet', 'region', 'feature'] as const) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox'; input.checked = true; input.value = category;
    input.addEventListener('change', () => {
      if (input.checked) visibleCategories.add(category); else visibleCategories.delete(category);
      render();
    });
    label.append(input, document.createTextNode(` ${CATEGORY_LABELS[category]}`));
    filters.appendChild(label);
  }

  const render = (): void => {
    const state = store.getState();
    if (!state.world) { tree.textContent = 'No world generated.'; count.textContent = ''; return; }
    const planet = state.world.planet;
    const query = search.value.trim().toLowerCase();
    const rows = buildRows(planet);
    const directMatches = query
      ? rows.filter(row => visibleCategories.has(row.category) && row.label.toLowerCase().includes(query))
      : [];
    const matchKeys = new Set(directMatches.map(row => row.key));
    const contextKeys = new Set<string>();
    if (query) {
      for (const match of directMatches) {
        if (match.parentKey) contextKeys.add(match.parentKey);
        if (match.depth >= 2) contextKeys.add('planet');
      }
    }
    const selectedKey = selectionKey(state.selection);
    const effectiveExpanded = query
      ? new Set(['planet', ...planet.regions.map(region => `region:${region.id}`)])
      : expandedKeys;
    const visibleRows = rows.filter(row => {
      if (query) return matchKeys.has(row.key) || contextKeys.has(row.key);
      return visibleCategories.has(row.category) && rowIsVisible(row, effectiveExpanded);
    });
    tree.replaceChildren(...visibleRows.map(row => createNavigationRow(
      row, selectedKey, effectiveExpanded, matchKeys, contextKeys,
      key => { if (expandedKeys.has(key)) expandedKeys.delete(key); else expandedKeys.add(key); render(); },
      selection => store.focusSelection(selection),
    )));
    count.textContent = query ? `${directMatches.length} match${directMatches.length === 1 ? '' : 'es'}` : '';
  };

  search.addEventListener('input', render);
  expandAll.addEventListener('click', () => {
    const planet = store.getState().world?.planet; if (!planet) return;
    expandedKeys.add('planet');
    for (const region of planet.regions) expandedKeys.add(`region:${region.id}`);
    render();
  });
  collapseAll.addEventListener('click', () => { expandedKeys.clear(); render(); });
  store.subscribe(render);
}
''')

write('src/ui/nodeCatalogPanel.ts', r'''import { APPARATUS_DEFINITIONS, apparatusDefinitionById } from '../apparatus/definitions.js';
import { MECHANICAL_PLACEMENT_MIN_ZOOM } from '../map/camera/mapCamera.js';
import type { AppStore } from '../state/appState.js';

const categories = ['apparatus', 'container'] as const;

function searchable(definition: (typeof APPARATUS_DEFINITIONS)[number]): string {
  return [definition.label, definition.category, definition.description, ...definition.searchTerms].join(' ').toLowerCase();
}

export function installNodeCatalogPanel(root: HTMLElement, store: AppStore): void {
  const search = root.querySelector<HTMLInputElement>('#ws-node-catalog-search');
  const filters = root.querySelector<HTMLElement>('#ws-node-catalog-filters .ws-navigation-filters');
  const tree = root.querySelector<HTMLElement>('#ws-node-catalog-tree');
  const count = root.querySelector<HTMLElement>('#ws-node-catalog-match-count');
  const status = root.querySelector<HTMLElement>('#ws-node-catalog-status');
  if (!search || !filters || !tree || !count || !status) return;
  const visible = new Set<string>(categories);

  for (const category of categories) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox'; input.checked = true; input.value = category;
    input.addEventListener('change', () => { if (input.checked) visible.add(category); else visible.delete(category); render(); });
    label.append(input, document.createTextNode(` ${category[0].toUpperCase()}${category.slice(1)}`));
    filters.appendChild(label);
  }

  const render = (): void => {
    const query = search.value.trim().toLowerCase();
    const matches = APPARATUS_DEFINITIONS.filter(definition => visible.has(definition.category)
      && (!query || query.split(/\s+/).every(token => searchable(definition).includes(token))));
    count.textContent = query ? `${matches.length} match${matches.length === 1 ? '' : 'es'}` : '';
    tree.replaceChildren();
    for (const category of categories) {
      const definitions = matches.filter(definition => definition.category === category);
      if (!definitions.length) continue;
      const group = document.createElement('div');
      group.className = 'ws-node-catalog-group';
      const heading = document.createElement('div');
      heading.className = 'ws-node-catalog-category';
      const headingDot = document.createElement('span');
      headingDot.className = `ws-navigation-category ws-navigation-category--${category}`;
      heading.append(headingDot, document.createTextNode(category.toUpperCase()));
      group.appendChild(heading);
      for (const definition of definitions) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'ws-node-catalog-entry'; button.dataset.nodeDefinitionId = definition.id;
        const dot = document.createElement('span'); dot.className = `ws-navigation-category ws-navigation-category--${category}`;
        const text = document.createElement('span');
        const name = document.createElement('strong'); name.textContent = definition.label;
        const description = document.createElement('small'); description.textContent = definition.description;
        text.append(name, description); button.append(dot, text);
        button.addEventListener('click', () => { store.setPlacement(definition.id); store.setInteractionNotice(`Place ${definition.label}.`); });
        group.appendChild(button);
      }
      tree.appendChild(group);
    }
  };

  search.addEventListener('input', render);
  store.subscribe(state => {
    const placement = state.interaction.placementDefinitionId;
    const pending = state.interaction.pendingConnection;
    if (placement) {
      const definition = apparatusDefinitionById(placement);
      const label = definition?.label ?? placement;
      status.textContent = state.camera.zoom < MECHANICAL_PLACEMENT_MIN_ZOOM
        ? `Zoom in to engineering scale to place ${label}.`
        : `Click the map to place ${label}. Esc cancels.`;
    } else if (pending) status.textContent = 'Select a compatible target port. Esc cancels.';
    else status.textContent = state.interaction.notice ?? 'Select a node to place.';
  });
  render();
}
''')

write('src/map/rendering/mechanicalRenderer.ts', r'''import type { ApparatusDefinition } from '../../apparatus/definitions.js';
import { apparatusDefinitionById } from '../../apparatus/definitions.js';
import { mechanicalNodeById, resourceNodeById } from '../../graph/graphQueries.js';
import type { GraphState, MechanicalNode, PortEndpoint } from '../../graph/types.js';
import { metersToWorldUnits } from '../../world/scale.js';
import type { Point, Planet } from '../../world/types.js';
import { MECHANICAL_PLACEMENT_MIN_ZOOM, smoothStep } from '../camera/mapCamera.js';
import {
  RESOURCE_NODE_PHYSICAL_HEIGHT_METERS,
  RESOURCE_NODE_PHYSICAL_WIDTH_METERS,
  RESOURCE_NODE_WORLD_HEIGHT,
  RESOURCE_NODE_WORLD_WIDTH,
  resourcePortWorldPosition,
} from './resourceRenderer.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const MECHANICAL_NODE_FADE_START_ZOOM = MECHANICAL_PLACEMENT_MIN_ZOOM;
export const MECHANICAL_NODE_FULL_OPACITY_ZOOM = 2 ** 18;
export const MECHANICAL_NODE_DETAIL_MIN_TEXT_PIXELS = 5.75;
export const ENGINEERING_NODE_CARD_PHYSICAL_WIDTH_METERS = RESOURCE_NODE_PHYSICAL_WIDTH_METERS;
export const ENGINEERING_NODE_CARD_PHYSICAL_HEIGHT_METERS = RESOURCE_NODE_PHYSICAL_HEIGHT_METERS;
const HEADER_HEIGHT = RESOURCE_NODE_WORLD_HEIGHT * 0.2;
const FONT_SIZE_METERS = 1.05;
const CATEGORY_FONT_SIZE_METERS = 0.9;
const PORT_RADIUS_METERS = 0.875;

function svgElement<K extends keyof SVGElementTagNameMap>(tagName: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tagName);
}

export function mechanicalPortWorldPosition(node: MechanicalNode, portId: string): Point | null {
  const port = node.ports.find(candidate => candidate.id === portId);
  if (!port) return null;
  const sameSide = node.ports.filter(candidate => candidate.direction === port.direction);
  const index = sameSide.findIndex(candidate => candidate.id === port.id);
  const y = node.position.y - RESOURCE_NODE_WORLD_HEIGHT / 2
    + RESOURCE_NODE_WORLD_HEIGHT * ((index + 1) / (sameSide.length + 1));
  return {
    x: node.position.x + (port.direction === 'input' ? -RESOURCE_NODE_WORLD_WIDTH / 2 : RESOURCE_NODE_WORLD_WIDTH / 2),
    y,
  };
}

export function endpointWorldPosition(planet: Planet, graph: GraphState, endpoint: PortEndpoint): Point | null {
  const mechanical = mechanicalNodeById(graph, endpoint.nodeId);
  if (mechanical) return mechanicalPortWorldPosition(mechanical, endpoint.portId);
  const resource = resourceNodeById(planet, endpoint.nodeId);
  if (resource && endpoint.portId === resource.resourceAccessPortId) return resourcePortWorldPosition(resource);
  return null;
}

function appendNodeCard(group: SVGGElement, node: MechanicalNode): void {
  const halfWidth = RESOURCE_NODE_WORLD_WIDTH / 2;
  const halfHeight = RESOURCE_NODE_WORLD_HEIGHT / 2;
  const body = svgElement('rect');
  body.setAttribute('x', String(-halfWidth)); body.setAttribute('y', String(-halfHeight));
  body.setAttribute('width', String(RESOURCE_NODE_WORLD_WIDTH)); body.setAttribute('height', String(RESOURCE_NODE_WORLD_HEIGHT));
  body.setAttribute('rx', String(metersToWorldUnits(0.25)));
  body.setAttribute('class', `ws-map-mechanical-card-body ws-map-mechanical-card-body--${node.nodeType}`);
  group.appendChild(body);

  const header = svgElement('rect');
  header.setAttribute('x', String(-halfWidth)); header.setAttribute('y', String(-halfHeight));
  header.setAttribute('width', String(RESOURCE_NODE_WORLD_WIDTH)); header.setAttribute('height', String(HEADER_HEIGHT));
  header.setAttribute('class', `ws-map-mechanical-card-header ws-map-mechanical-card-header--${node.category}`);
  group.appendChild(header);

  const details = svgElement('g'); details.setAttribute('class', 'ws-map-mechanical-details'); group.appendChild(details);
  const category = svgElement('text');
  category.setAttribute('x', String(-halfWidth + metersToWorldUnits(0.9)));
  category.setAttribute('y', String(-halfHeight + HEADER_HEIGHT * 0.7));
  category.setAttribute('font-size', String(metersToWorldUnits(CATEGORY_FONT_SIZE_METERS)));
  category.setAttribute('class', 'ws-map-mechanical-category');
  category.textContent = node.category.toUpperCase(); details.appendChild(category);

  const definition = apparatusDefinitionById(node.definitionId);
  const label = svgElement('text'); label.setAttribute('x', '0'); label.setAttribute('y', String(metersToWorldUnits(0.8)));
  label.setAttribute('font-size', String(metersToWorldUnits(FONT_SIZE_METERS)));
  label.setAttribute('class', 'ws-map-mechanical-label');
  label.textContent = `${definition?.label ?? node.label} [${node.enabled ? 'on' : 'off'}]`;
  details.appendChild(label);

  for (const port of node.ports) {
    const position = mechanicalPortWorldPosition({ ...node, position: { x: 0, y: 0 } }, port.id);
    if (!position) continue;
    const circle = svgElement('circle');
    circle.setAttribute('cx', String(position.x)); circle.setAttribute('cy', String(position.y));
    circle.setAttribute('r', String(metersToWorldUnits(PORT_RADIUS_METERS)));
    circle.setAttribute('class', `ws-map-mechanical-port ws-map-port ws-map-port--${port.direction} ws-map-port--${port.kind} ws-map-port--${port.medium}`);
    circle.setAttribute('data-node-id', node.id); circle.setAttribute('data-port-id', port.id);
    circle.setAttribute('data-port-kind', port.kind); circle.setAttribute('data-port-direction', port.direction); circle.setAttribute('data-port-medium', port.medium);
    const title = svgElement('title'); title.textContent = `${port.label} · ${port.direction} · ${port.medium}`; circle.appendChild(title);
    details.appendChild(circle);
  }
}

function connectionPath(start: Point, end: Point): string {
  const bend = Math.max(metersToWorldUnits(3), Math.abs(end.x - start.x) * 0.45);
  return `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${end.x - bend} ${end.y}, ${end.x} ${end.y}`;
}

export function renderMechanicalLayer(planet: Planet, graph: GraphState, onSelect: (nodeId: string) => void): SVGGElement {
  const layer = svgElement('g'); layer.setAttribute('class', 'ws-map-mechanical-layer');
  const connections = svgElement('g'); connections.setAttribute('class', 'ws-map-connection-layer');
  for (const connection of graph.connections) {
    const start = endpointWorldPosition(planet, graph, connection.from); const end = endpointWorldPosition(planet, graph, connection.to);
    if (!start || !end) continue;
    const path = svgElement('path'); path.setAttribute('d', connectionPath(start, end));
    path.setAttribute('class', `ws-map-connection ws-map-connection--${connection.kind} ws-map-connection--${connection.medium}`);
    path.setAttribute('data-connection-id', connection.id);
    const title = svgElement('title'); title.textContent = `${connection.from.nodeId}:${connection.from.portId} → ${connection.to.nodeId}:${connection.to.portId}`;
    path.appendChild(title); connections.appendChild(path);
  }
  layer.appendChild(connections);

  const nodes = svgElement('g'); nodes.setAttribute('class', 'ws-map-mechanical-node-layer');
  for (const node of graph.nodes) {
    const group = svgElement('g'); group.setAttribute('transform', `translate(${node.position.x} ${node.position.y})`);
    group.setAttribute('class', `ws-map-mechanical-node ws-map-mechanical-node--${node.category}`);
    group.setAttribute('data-map-kind', 'mechanical'); group.setAttribute('data-mechanical-id', node.id);
    group.addEventListener('click', event => { if ((event.target as Element).closest('[data-port-id]')) return; event.stopPropagation(); onSelect(node.id); });
    appendNodeCard(group, node); nodes.appendChild(group);
  }
  layer.appendChild(nodes);

  const preview = svgElement('g'); preview.setAttribute('id', 'ws-map-placement-preview');
  preview.setAttribute('class', 'ws-map-placement-preview'); preview.style.display = 'none'; layer.appendChild(preview);
  return layer;
}

export function updateMechanicalVisibility(svg: SVGSVGElement, zoom: number): void {
  const layer = svg.querySelector<SVGGElement>('.ws-map-mechanical-layer');
  if (layer) {
    const progress = (zoom - MECHANICAL_NODE_FADE_START_ZOOM) / (MECHANICAL_NODE_FULL_OPACITY_ZOOM - MECHANICAL_NODE_FADE_START_ZOOM);
    layer.style.opacity = smoothStep(progress).toFixed(3);
    layer.style.visibility = zoom <= MECHANICAL_NODE_FADE_START_ZOOM ? 'hidden' : 'visible';
    layer.style.pointerEvents = zoom >= MECHANICAL_PLACEMENT_MIN_ZOOM ? 'auto' : 'none';
  }
  const rect = svg.getBoundingClientRect(); const viewBox = svg.viewBox.baseVal;
  const unitsPerPixel = rect.width > 0 && viewBox.width > 0 ? viewBox.width / rect.width : 1;
  const detailVisible = unitsPerPixel > 0 && metersToWorldUnits(FONT_SIZE_METERS) / unitsPerPixel >= MECHANICAL_NODE_DETAIL_MIN_TEXT_PIXELS;
  for (const details of svg.querySelectorAll<SVGGElement>('.ws-map-mechanical-details')) {
    details.style.visibility = detailVisible ? 'visible' : 'hidden'; details.style.opacity = detailVisible ? '1' : '0';
  }
}

export function updatePlacementPreview(svg: SVGSVGElement, definition: ApparatusDefinition | null, position: Point | null): void {
  const preview = svg.querySelector<SVGGElement>('#ws-map-placement-preview');
  if (!preview) return;
  preview.replaceChildren();
  if (!definition || !position) { preview.style.display = 'none'; return; }
  preview.style.display = 'block'; preview.setAttribute('transform', `translate(${position.x} ${position.y})`);
  const rect = svgElement('rect');
  rect.setAttribute('x', String(-RESOURCE_NODE_WORLD_WIDTH / 2)); rect.setAttribute('y', String(-RESOURCE_NODE_WORLD_HEIGHT / 2));
  rect.setAttribute('width', String(RESOURCE_NODE_WORLD_WIDTH)); rect.setAttribute('height', String(RESOURCE_NODE_WORLD_HEIGHT));
  rect.setAttribute('class', 'ws-map-placement-preview-body'); preview.appendChild(rect);
  const text = svgElement('text'); text.setAttribute('x', '0'); text.setAttribute('y', '0');
  text.setAttribute('font-size', String(metersToWorldUnits(1))); text.setAttribute('class', 'ws-map-placement-preview-label');
  text.textContent = definition.label; preview.appendChild(text);
}
''')

# Keep the resource card's existing Earth-scale footprint, but restore the old 20%-height category bar.
resource_path = ROOT / 'src/map/rendering/resourceRenderer.ts'
resource_text = resource_path.read_text(encoding='utf-8')
resource_text = resource_text.replace("const HEADER_HEIGHT = metersToWorldUnits(2.8);", "const HEADER_HEIGHT = RESOURCE_NODE_WORLD_HEIGHT * 0.2;")
resource_text = resource_text.replace("const CORNER_RADIUS = metersToWorldUnits(0.45);", "const CORNER_RADIUS = metersToWorldUnits(0.25);")
write('src/map/rendering/resourceRenderer.ts', resource_text)

workspace_css_path = ROOT / 'workspace-overrides.css'
workspace_css = workspace_css_path.read_text(encoding='utf-8')
marker = '/* Phase 4 typed NODE catalog and observer-only DEBUG presentation. */'
if marker in workspace_css:
    workspace_css = workspace_css.split(marker, 1)[0].rstrip()
workspace_css += r'''

/* Original navigation/category visual grammar reused by the flat TypeScript map. */
.ws-navigation-category--planet { background: #4d456f; }
.ws-navigation-category--region { background: #294d73; }
.ws-navigation-category--feature { background: #315a34; }
.ws-navigation-category--apparatus { background: #6c4d24; }
.ws-navigation-category--container { background: #324a66; }

/* Flat-map Inspector additions only; NAV/NODE/DEBUG presentation above remains the original contract. */
.ws-ins-connection-row { display: flex; align-items: center; gap: 5px; margin: 4px 0; font-size: 9px; }
.ws-ins-connection-row span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.ws-ins-connection-row button, .ws-ins-actions button { padding: 2px 5px; font-size: 9px; }
.ws-ins-actions { margin-top: 12px; padding-top: 8px; border-top: 1px solid #243443; }
'''
write('workspace-overrides.css', workspace_css)

map_css_path = ROOT / 'map.css'
map_css = map_css_path.read_text(encoding='utf-8')
mechanical_marker = '/* Phase 4 mechanical graph: world-space machinery and connections. */'
if mechanical_marker in map_css:
    map_css = map_css.split(mechanical_marker, 1)[0].rstrip()
map_css += r'''

/* Flat-map mechanical graph using the original fixed node-card visual grammar. */
.ws-map-mechanical-layer { transition: opacity 90ms linear; }
.ws-map-mechanical-node { cursor: move; }
.ws-map-mechanical-card-body { fill: #111922; stroke: #52677a; stroke-width: 0.0000184; }
.ws-map-mechanical-card-body--extractor { fill: #1e3a2f; }
.ws-map-mechanical-card-body--hopper { fill: #1e2a3a; }
.ws-map-mechanical-card-body--crusher,
.ws-map-mechanical-card-body--jawCrusher,
.ws-map-mechanical-card-body--coneCrusher { fill: #3a2a1e; }
.ws-map-mechanical-card-body--magSep { fill: #2a1e3a; }
.ws-map-mechanical-card-header--apparatus { fill: #6c4d24; }
.ws-map-mechanical-card-header--container { fill: #324a66; }
.ws-map-mechanical-category,
.ws-map-mechanical-label,
.ws-map-placement-preview-label {
  font-family: 'Courier New', Courier, monospace;
  user-select: none;
  pointer-events: none;
}
.ws-map-mechanical-category { fill: #e7edf3; font-weight: 700; letter-spacing: 0.12em; text-anchor: start; }
.ws-map-mechanical-label { fill: #d6e4ed; text-anchor: middle; }
.ws-map-mechanical-port { fill: #172431; stroke: #8aa1b3; stroke-width: 0.0000225; cursor: crosshair; }
.ws-map-port--resource-access { fill: #1f3823; stroke: #7aa879; }
.ws-map-port--gas { fill: #29324a; stroke: #8c9bd0; }
.ws-map-port--pending { stroke: #ffcc44 !important; stroke-width: 0.00004 !important; }
.ws-map-mechanical-node.ws-map-selected .ws-map-mechanical-card-body { stroke: #ffcc44; }
.ws-map-connection { fill: none; stroke: #5599cc; stroke-width: 0.000025; pointer-events: stroke; }
.ws-map-connection--resource-access { stroke: #7aa879; stroke-dasharray: 0.00008 0.00005; }
.ws-map-connection--gas { stroke: #8c9bd0; }
.ws-map-placement-preview { pointer-events: none; opacity: 0.72; }
.ws-map-placement-preview-body { fill: #6c4d2433; stroke: #ffcc44; stroke-width: 0.000025; stroke-dasharray: 0.00006 0.00004; }
.ws-map-placement-preview-label { fill: #ffdf80; text-anchor: middle; }
'''
write('map.css', map_css)

write('tests/phase4Graph.test.js', r'''import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { APPARATUS_DEFINITIONS, apparatusDefinitionById } from '../dist/apparatus/definitions.js';
import { collectSimulationDebugStats } from '../dist/debug/debugTelemetry.js';
import { browserRuntimeCapabilities } from '../dist/debug/runtimeCapabilities.js';
import { connectPorts, createEmptyGraphState, moveMechanicalNode, placeMechanicalNode, removeMechanicalNode } from '../dist/graph/graphCommands.js';
import { portForEndpoint } from '../dist/graph/graphQueries.js';
import {
  ENGINEERING_NODE_CARD_PHYSICAL_HEIGHT_METERS,
  ENGINEERING_NODE_CARD_PHYSICAL_WIDTH_METERS,
} from '../dist/map/rendering/mechanicalRenderer.js';
import {
  RESOURCE_NODE_PHYSICAL_HEIGHT_METERS,
  RESOURCE_NODE_PHYSICAL_WIDTH_METERS,
} from '../dist/map/rendering/resourceRenderer.js';
import { AppStore } from '../dist/state/appState.js';
import { generateWorld } from '../dist/world/generateWorld.js';

test('Phase 4 catalog is definition-driven and restores the engineering vocabulary', () => {
  const ids = APPARATUS_DEFINITIONS.map(definition => definition.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const required of ['extractor', 'jaw-crusher', 'cone-crusher', 'ball-mill', 'screen', 'splitter', 'material-merger', 'feeder', 'magnetic-separator', 'hopper']) assert.ok(ids.includes(required), required);
  assert.equal(apparatusDefinitionById('extractor').ports[0].kind, 'resource-access');
  assert.equal(apparatusDefinitionById('hopper').category, 'container');
});

test('graph commands place, move, and remove mechanical nodes without UI ownership', () => {
  let graph = createEmptyGraphState();
  const placed = placeMechanicalNode(graph, apparatusDefinitionById('hopper'), { x: 10, y: 20 }); graph = placed.graph;
  assert.equal(graph.nodes.length, 1); assert.equal(placed.node.position.x, 10); assert.equal(placed.node.ports.length, 2);
  graph = moveMechanicalNode(graph, placed.node.id, { x: 30, y: 40 }); assert.deepEqual(graph.nodes[0].position, { x: 30, y: 40 });
  graph = removeMechanicalNode(graph, placed.node.id); assert.equal(graph.nodes.length, 0);
});

test('resource-access connects FEATURE output only to compatible Extractor input', () => {
  const world = generateWorld('phase4-connect'); const planet = world.planet; const resource = planet.resourceNodes[0];
  let graph = createEmptyGraphState(); const extractor = placeMechanicalNode(graph, apparatusDefinitionById('extractor'), resource.position); graph = extractor.graph;
  const resourceEndpoint = { nodeId: resource.id, portId: resource.resourceAccessPortId }; const extractorEndpoint = { nodeId: extractor.node.id, portId: 'resource-source' };
  graph = connectPorts(graph, resourceEndpoint, portForEndpoint(planet, graph, resourceEndpoint), extractorEndpoint, portForEndpoint(planet, graph, extractorEndpoint));
  assert.equal(graph.connections.length, 1); assert.equal(graph.connections[0].kind, 'resource-access');
  const hopper = placeMechanicalNode(graph, apparatusDefinitionById('hopper'), { x: resource.position.x + 1, y: resource.position.y }); graph = hopper.graph;
  const hopperInput = { nodeId: hopper.node.id, portId: 'input' };
  assert.throws(() => connectPorts(graph, resourceEndpoint, portForEndpoint(planet, graph, resourceEndpoint), hopperInput, portForEndpoint(planet, graph, hopperInput)), /Port kinds are incompatible/);
});

test('removing a mechanical node also removes its attached connections', () => {
  const world = generateWorld('phase4-remove'); const planet = world.planet; let graph = createEmptyGraphState();
  const extractor = placeMechanicalNode(graph, apparatusDefinitionById('extractor'), { x: 2, y: 2 }); graph = extractor.graph; const hopper = placeMechanicalNode(graph, apparatusDefinitionById('hopper'), { x: 3, y: 2 }); graph = hopper.graph;
  const output = { nodeId: extractor.node.id, portId: 'output' }; const input = { nodeId: hopper.node.id, portId: 'input' };
  graph = connectPorts(graph, output, portForEndpoint(planet, graph, output), input, portForEndpoint(planet, graph, input)); assert.equal(graph.connections.length, 1);
  graph = removeMechanicalNode(graph, hopper.node.id); assert.equal(graph.connections.length, 0);
});

test('all engineering node cards share the original fixed visual footprint', () => {
  assert.equal(ENGINEERING_NODE_CARD_PHYSICAL_WIDTH_METERS, RESOURCE_NODE_PHYSICAL_WIDTH_METERS);
  assert.equal(ENGINEERING_NODE_CARD_PHYSICAL_HEIGHT_METERS, RESOURCE_NODE_PHYSICAL_HEIGHT_METERS);
});

test('original DEBUG simulation counters project onto the flat graph without new diagnostic sections', () => {
  const store = new AppStore(); store.setWorld(generateWorld('phase4-debug'));
  const stats = collectSimulationDebugStats(store.getState());
  assert.equal(stats.sessions, 0); assert.equal(stats.connections, 0); assert.equal(stats.furnaces, 0);
  assert.equal(stats.nodes, store.getState().world.planet.resourceNodes.length);
  const shell = fs.readFileSync('src/ui/workspaceShell.ts', 'utf8');
  for (const title of ['Performance', 'Runtime', 'Simulation', 'Thermochemical', 'Simulation tools', 'Test factory']) assert.match(shell, new RegExp(`>${title}<`));
  for (const removed of ['section(\'World\'', 'section(\'Camera\'', 'section(\'Graph\'', 'section(\'Selection\'']) assert.doesNotMatch(shell, new RegExp(removed.replace(/[()']/g, '\\$&')));
  assert.equal(fs.existsSync('src/debug/debugModel.ts'), false);
});

test('original runtime capability tracking is preserved', () => {
  const capabilities = browserRuntimeCapabilities();
  assert.ok(capabilities.hardwareConcurrency >= 1);
  assert.equal(typeof capabilities.webAssembly, 'boolean');
  assert.equal(typeof capabilities.wasmSimd, 'boolean');
});

test('Phase 4 TypeScript architecture keeps UI parity modules separated', () => {
  const renderer = fs.readFileSync('src/map/mapRenderer.ts', 'utf8');
  assert.match(renderer, /camera\/mapCamera/); assert.match(renderer, /rendering\/mechanicalRenderer/); assert.doesNotMatch(renderer, /APPARATUS_DEFINITIONS\s*=|workspaceController/);
  const navigation = fs.readFileSync('src/ui/navigationPanel.ts', 'utf8');
  assert.match(navigation, /ws-navigation-entry/); assert.match(navigation, /ws-navigation-state/);
  const catalog = fs.readFileSync('src/ui/nodeCatalogPanel.ts', 'utf8');
  assert.match(catalog, /ws-node-catalog-entry/); assert.doesNotMatch(catalog, /ws-node-catalog-item/);
  const app = fs.readFileSync('src/app.ts', 'utf8'); assert.match(app, /installNodeCatalogPanel/); assert.match(app, /installDebugPanel/); assert.doesNotMatch(app, /workspaceController\.js/);
});
''')

for obsolete in ['src/debug/debugModel.ts', 'dist/debug/debugModel.js']:
    path = ROOT / obsolete
    if path.exists(): path.unlink()
