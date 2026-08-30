/** Shared DOM shell for recursive workspace views. */

import { installDebugDrawer } from '../debug/debugDrawer.js';
import { installRuntimeDebugStats } from '../debug/runtimeDebugStats.js';
import { escHtml } from './utils.js';

function el(id) { return document.getElementById(id); }

function debugDrawerMarkup() {
  return `<aside id="ws-debug-drawer" class="ws-debug-drawer" aria-label="Debug and performance tools" aria-hidden="true" hidden>
    <div class="ws-navigation-header ws-debug-header"><strong>DEBUG</strong><div class="ws-navigation-actions"><button id="ws-debug-close" class="ws-navigation-close" type="button" aria-label="Close debug tools" title="Close">×</button></div></div>
    <div class="ws-debug-scroll">
      <section class="ws-debug-section"><div class="ws-debug-section-title">Performance</div>
        <div class="ws-debug-metric"><span>FPS</span><span data-debug-stat="fps">—</span></div>
        <div class="ws-debug-metric"><span>Frame average</span><span data-debug-stat="frame-average">—</span></div>
        <div class="ws-debug-metric"><span>Frame p95</span><span data-debug-stat="frame-p95">—</span></div>
        <div class="ws-debug-metric"><span>Simulation backlog</span><span data-debug-stat="backlog">—</span></div>
        <div class="ws-debug-metric"><span>Realtime factor</span><span data-debug-stat="realtime-factor">—</span></div>
        <div class="ws-debug-metric"><span>Physics engine</span><span data-debug-stat="apparatus-cpu-tick">Rust/WASM</span></div>
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
        <div class="ws-debug-field"><label for="ws-debug-factory-template">Template</label><select id="ws-debug-factory-template" disabled><option>Iron Roasting Line v1</option></select></div>
        <div class="ws-debug-field"><label for="ws-debug-factory-count">Factory count</label><select id="ws-debug-factory-count"><option value="1">1</option><option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></div>
        <div class="ws-debug-note">Visible placement uses the selected goethite-bearing iron Feature when possible, otherwise the first compatible Feature in the Site. Test factories run through the live Rust/WASM Worker.</div>
        <div class="ws-debug-button-row"><button data-debug-action="place-factories" type="button">Place Factory</button></div>
        <button class="ws-debug-button ws-debug-button--danger" data-debug-action="remove-factories" type="button">Remove Test Factories</button>
        <div id="ws-debug-status" class="ws-debug-status" aria-live="polite"></div>
      </section>
    </div>
  </aside>`;
}

export function workspaceShellMarkup({
  title = '',
  subtitle = '',
  contextControls = '',
  canvasId,
  svgId,
  inspectorBodyId,
  inspectorInitial = '',
} = {}) {
  return `<div class="ws-workspace"><div class="ws-workspace-header"><div class="ws-workspace-title">${escHtml(title)}</div>${subtitle ? `<div class="ws-workspace-subtitle">${escHtml(subtitle)}</div>` : ''}</div><div class="ws-toolbar"><div class="ws-context-controls">${contextControls}</div><div class="ws-viewport-controls"><button data-viewport="out">Zoom Out</button><span data-zoom-label>100%</span><button data-viewport="in">Zoom In</button><button data-viewport="fit">Fit</button><button data-viewport="center">Center</button></div></div><div class="ws-layout"><div class="ws-panel-rail"><button id="ws-navigation-toggle" class="ws-navigation-tab" type="button" aria-controls="ws-navigation-drawer" aria-expanded="false"><span aria-hidden="true">N<br>A<br>V</span><span class="ws-visually-hidden">Open hierarchy navigation</span></button><button id="ws-node-catalog-toggle" class="ws-navigation-tab ws-node-catalog-tab" type="button" aria-controls="ws-node-catalog-drawer" aria-expanded="false"><span aria-hidden="true">N<br>O<br>D<br>E</span><span class="ws-visually-hidden">Open node catalog</span></button><button id="ws-debug-toggle" class="ws-navigation-tab ws-debug-tab" type="button" aria-controls="ws-debug-drawer" aria-expanded="false"><span aria-hidden="true">D<br>E<br>B<br>U<br>G</span><span class="ws-visually-hidden">Open debug and performance tools</span></button></div><aside id="ws-navigation-drawer" class="ws-navigation-drawer" aria-label="Hierarchy navigation" aria-hidden="true" hidden><div class="ws-navigation-header"><strong>NAVIGATION</strong><div class="ws-navigation-actions"><button id="ws-navigation-collapse-all" class="ws-navigation-action" type="button" aria-label="Collapse all hierarchy entries" title="Collapse all">−</button><button id="ws-navigation-expand-all" class="ws-navigation-action" type="button" aria-label="Expand all hierarchy entries" title="Expand all">+</button><button id="ws-navigation-close" class="ws-navigation-close" type="button" aria-label="Close hierarchy navigation" title="Close">×</button></div></div><label class="ws-navigation-search-label" for="ws-navigation-search">Search hierarchy</label><input id="ws-navigation-search" class="ws-navigation-search" type="search" placeholder="Search hierarchy…" autocomplete="off"><details id="ws-navigation-filters" class="ws-navigation-filters-panel"><summary>Show filters</summary><div class="ws-navigation-filters"></div></details><div id="ws-navigation-match-count" class="ws-navigation-match-count" aria-live="polite"></div><div id="ws-navigation-tree" class="ws-navigation-tree" role="tree" aria-label="World hierarchy"></div></aside><aside id="ws-node-catalog-drawer" class="ws-node-catalog-drawer" aria-label="Node catalog" aria-hidden="true" hidden><div class="ws-navigation-header"><strong>NODE</strong><div class="ws-navigation-actions"><button id="ws-node-catalog-close" class="ws-navigation-close" type="button" aria-label="Close node catalog" title="Close">×</button></div></div><label class="ws-navigation-search-label" for="ws-node-catalog-search">Search nodes</label><input id="ws-node-catalog-search" class="ws-navigation-search" type="search" placeholder="Search nodes…" autocomplete="off"><details id="ws-node-catalog-filters" class="ws-navigation-filters-panel"><summary>Show filters</summary><div class="ws-navigation-filters"></div></details><div id="ws-node-catalog-match-count" class="ws-navigation-match-count" aria-live="polite"></div><div id="ws-node-catalog-tree" class="ws-navigation-tree" role="tree" aria-label="Placeable nodes"></div><div id="ws-node-catalog-status" class="ws-node-catalog-status" aria-live="polite"></div></aside>${debugDrawerMarkup()}<div class="ws-viewport" data-viewport-surface><svg id="${svgId}" class="ws-graph-svg"></svg><div id="${canvasId}" class="ws-graph-canvas"></div></div><div class="ws-inspector"><div class="ws-inspector-title">Inspector</div><div id="${inspectorBodyId}" class="ws-inspector-body">${inspectorInitial}</div></div></div></div>`;
}
export function renderWorkspaceShell(container, options = {}) {
  container.innerHTML = workspaceShellMarkup(options);
  const root = container.querySelector('.ws-workspace');
  installDebugDrawer(root);
  installRuntimeDebugStats(root);
  return {
    root,
    toolbar: root.querySelector('.ws-toolbar'),
    viewportControls: root.querySelector('.ws-viewport-controls'),
    viewport: root.querySelector('.ws-viewport'),
    canvas: el(options.canvasId),
    svg: el(options.svgId),
    inspector: root.querySelector('.ws-inspector'),
    inspectorBody: root.querySelector(`#${options.inspectorBodyId}`),
  };
}
