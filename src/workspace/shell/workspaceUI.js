/** Shared DOM shell for recursive workspace views. */

import { installDebugDrawer } from '../debug/debugDrawer.js';
import { installEngineeringModeControls } from '../advancement/engineeringModeControls.js';
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
        <div class="ws-debug-metric"><span>Legacy simulation backlog</span><span data-debug-stat="backlog">—</span></div>
        <div class="ws-debug-metric"><span>Observed world/wall factor</span><span data-debug-stat="realtime-factor">—</span></div>
        <div class="ws-debug-metric"><span>Profiled apparatus CPU/tick</span><span data-debug-stat="apparatus-cpu-tick">profiling off</span></div>
        <label class="ws-debug-check"><input id="ws-debug-deep-profile" type="checkbox"> Deep apparatus profiling</label>
        <button class="ws-debug-button" data-debug-action="reset-stats" type="button">Reset Statistics</button>
      </section>
      <section class="ws-debug-section"><div class="ws-debug-section-title">Simulation</div>
        <div class="ws-debug-metric"><span>Active Site sessions</span><span data-debug-stat="sessions">0</span></div>
        <div class="ws-debug-metric"><span>Nodes</span><span data-debug-stat="nodes">0</span></div>
        <div class="ws-debug-metric"><span>Active machines</span><span data-debug-stat="active-machines">0</span></div>
        <div class="ws-debug-metric"><span>Connections</span><span data-debug-stat="connections">0</span></div>
        <div class="ws-debug-metric"><span>Material bodies</span><span data-debug-stat="bodies">0</span></div>
        <div class="ws-debug-metric"><span>Solid/gas populations</span><span data-debug-stat="populations">0</span></div>
        <div class="ws-debug-metric"><span>Texture profiles</span><span data-debug-stat="textures">0</span></div>
        <div class="ws-debug-metric"><span>JS heap used</span><span data-debug-stat="heap-used">Unavailable</span></div>
      </section>
      <section class="ws-debug-section"><div class="ws-debug-section-title">Thermochemical</div>
        <div class="ws-debug-metric"><span>Furnaces</span><span data-debug-stat="furnaces">0</span></div>
        <div class="ws-debug-metric"><span>Occupied furnace zones</span><span data-debug-stat="furnace-zones">0</span></div>
        <div class="ws-debug-metric"><span>Solver evaluations (last state)</span><span data-debug-stat="solver-evaluations">0</span></div>
      </section>
      <section class="ws-debug-section"><div class="ws-debug-section-title">Hotspots</div><div data-debug-hotspots><div class="ws-debug-muted">Enable deep profiling to collect apparatus hotspots.</div></div></section>
      <section class="ws-debug-section"><div class="ws-debug-section-title">Explicit advancement</div>
        <div class="ws-debug-metric"><span>Mode</span><span data-advance-stat="mode">Paused</span></div>
        <div class="ws-debug-metric"><span>Last requested</span><span data-advance-stat="requested">—</span></div>
        <div class="ws-debug-metric"><span>Calculation time</span><span data-advance-stat="compute">—</span></div>
        <div class="ws-debug-metric"><span>Simulation throughput</span><span data-advance-stat="throughput">—</span></div>
        <div class="ws-debug-metric"><span>Fixed-step equivalent</span><span data-advance-stat="fixed-equivalent">0</span></div>
        <div class="ws-debug-metric"><span>Scheduler operations</span><span data-advance-stat="operations">0</span></div>
        <div class="ws-debug-metric"><span>Schedule compression</span><span data-advance-stat="compression">—</span></div>
        <div class="ws-debug-metric"><span>Detailed 0.1 s steps</span><span data-advance-stat="detailed">0</span></div>
        <div class="ws-debug-metric"><span>Linear interval batches</span><span data-advance-stat="linear">0</span></div>
        <div class="ws-debug-metric"><span>Quiescent fast-forward</span><span data-advance-stat="quiescent">0</span></div>
        <div class="ws-debug-metric"><span>Cached operating segment</span><span data-advance-stat="segment">none</span></div>
        <div class="ws-debug-button-row"><button data-world-advance-seconds="0.1" type="button">+0.1 s</button><button data-world-advance-seconds="1" type="button">+1 s</button><button data-world-advance-seconds="10" type="button">+10 s</button><button data-world-advance-seconds="60" type="button">+1 min</button></div>
      </section>
      <section class="ws-debug-section"><div class="ws-debug-section-title">Test factory</div>
        <div class="ws-debug-field"><label for="ws-debug-factory-template">Template</label><select id="ws-debug-factory-template" disabled><option>Iron Roasting Line v1</option></select></div>
        <div class="ws-debug-field"><label for="ws-debug-factory-count">Factory count</label><select id="ws-debug-factory-count"><option value="1">1</option><option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></div>
        <div class="ws-debug-note">Visible placement uses the selected goethite-bearing iron Feature when possible, otherwise the first compatible Feature in the Site. The headless benchmark uses Canonical Iron Ore v1.</div>
        <div class="ws-debug-button-row"><button data-debug-action="place-factories" type="button">Place Factory</button><button data-debug-action="benchmark" type="button">Run Headless Benchmark</button></div>
        <button class="ws-debug-button ws-debug-button--danger" data-debug-action="remove-factories" type="button">Remove Test Factories</button>
        <div id="ws-debug-status" class="ws-debug-status" aria-live="polite"></div>
        <pre id="ws-debug-benchmark-result" class="ws-debug-benchmark-result">No benchmark run yet.</pre>
      </section>
    </div>
  </aside>`;
}

function advancementControlsMarkup() {
  return `<div class="ws-advance-controls" aria-label="Simulation time advancement">
    <span class="ws-advance-mode">PAUSED ENGINEERING</span>
    <span class="ws-advance-clock" data-world-time>0.0 s</span>
    <button type="button" data-world-advance-seconds="0.1">+0.1 s</button>
    <button type="button" data-world-advance-seconds="1">+1 s</button>
    <button type="button" data-world-advance-seconds="10">+10 s</button>
    <button type="button" data-world-advance-seconds="60">+1 min</button>
    <label class="ws-advance-custom-label">Custom <input class="ws-advance-custom" data-world-advance-custom type="number" min="0.1" step="0.1" value="60" aria-label="Custom simulation seconds"></label>
    <button type="button" data-world-advance-custom-submit>Advance</button>
    <span class="ws-advance-status" data-world-advance-status aria-live="polite">Simulation paused</span>
  </div>`;
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
  return `<div class="ws-workspace"><div class="ws-workspace-header"><div class="ws-workspace-title">${escHtml(title)}</div>${subtitle ? `<div class="ws-workspace-subtitle">${escHtml(subtitle)}</div>` : ''}</div><div class="ws-toolbar"><div class="ws-context-controls">${contextControls}</div>${advancementControlsMarkup()}<div class="ws-viewport-controls"><button data-viewport="out">Zoom Out</button><span data-zoom-label>100%</span><button data-viewport="in">Zoom In</button><button data-viewport="fit">Fit</button><button data-viewport="center">Center</button></div></div><div class="ws-layout"><div class="ws-panel-rail"><button id="ws-navigation-toggle" class="ws-navigation-tab" type="button" aria-controls="ws-navigation-drawer" aria-expanded="false"><span aria-hidden="true">N<br>A<br>V</span><span class="ws-visually-hidden">Open hierarchy navigation</span></button><button id="ws-node-catalog-toggle" class="ws-navigation-tab ws-node-catalog-tab" type="button" aria-controls="ws-node-catalog-drawer" aria-expanded="false"><span aria-hidden="true">N<br>O<br>D<br>E</span><span class="ws-visually-hidden">Open node catalog</span></button><button id="ws-debug-toggle" class="ws-navigation-tab ws-debug-tab" type="button" aria-controls="ws-debug-drawer" aria-expanded="false"><span aria-hidden="true">D<br>E<br>B<br>U<br>G</span><span class="ws-visually-hidden">Open debug and performance tools</span></button></div><aside id="ws-navigation-drawer" class="ws-navigation-drawer" aria-label="Hierarchy navigation" aria-hidden="true" hidden><div class="ws-navigation-header"><strong>NAVIGATION</strong><div class="ws-navigation-actions"><button id="ws-navigation-collapse-all" class="ws-navigation-action" type="button" aria-label="Collapse all hierarchy entries" title="Collapse all">−</button><button id="ws-navigation-expand-all" class="ws-navigation-action" type="button" aria-label="Expand all hierarchy entries" title="Expand all">+</button><button id="ws-navigation-close" class="ws-navigation-close" type="button" aria-label="Close hierarchy navigation" title="Close">×</button></div></div><label class="ws-navigation-search-label" for="ws-navigation-search">Search hierarchy</label><input id="ws-navigation-search" class="ws-navigation-search" type="search" placeholder="Search hierarchy…" autocomplete="off"><details id="ws-navigation-filters" class="ws-navigation-filters-panel"><summary>Show filters</summary><div class="ws-navigation-filters"></div></details><div id="ws-navigation-match-count" class="ws-navigation-match-count" aria-live="polite"></div><div id="ws-navigation-tree" class="ws-navigation-tree" role="tree" aria-label="World hierarchy"></div></aside><aside id="ws-node-catalog-drawer" class="ws-node-catalog-drawer" aria-label="Node catalog" aria-hidden="true" hidden><div class="ws-navigation-header"><strong>NODE</strong><div class="ws-navigation-actions"><button id="ws-node-catalog-close" class="ws-navigation-close" type="button" aria-label="Close node catalog" title="Close">×</button></div></div><label class="ws-navigation-search-label" for="ws-node-catalog-search">Search nodes</label><input id="ws-node-catalog-search" class="ws-navigation-search" type="search" placeholder="Search nodes…" autocomplete="off"><details id="ws-node-catalog-filters" class="ws-navigation-filters-panel"><summary>Show filters</summary><div class="ws-navigation-filters"></div></details><div id="ws-node-catalog-match-count" class="ws-navigation-match-count" aria-live="polite"></div><div id="ws-node-catalog-tree" class="ws-navigation-tree" role="tree" aria-label="Placeable nodes"></div><div id="ws-node-catalog-status" class="ws-node-catalog-status" aria-live="polite"></div></aside>${debugDrawerMarkup()}<div class="ws-viewport" data-viewport-surface><svg id="${svgId}" class="ws-graph-svg"></svg><div id="${canvasId}" class="ws-graph-canvas"></div></div><div class="ws-inspector"><div class="ws-inspector-title">Inspector</div><div id="${inspectorBodyId}" class="ws-inspector-body">${inspectorInitial}</div></div></div></div>`;
}
export function renderWorkspaceShell(container, options = {}) {
  container.innerHTML = workspaceShellMarkup(options);
  const root = container.querySelector('.ws-workspace');
  installDebugDrawer(root);
  installEngineeringModeControls(root);
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
