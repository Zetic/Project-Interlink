/** Shared DOM shell for recursive workspace views. */

import { escHtml } from './utils.js';

function el(id) { return document.getElementById(id); }

export function workspaceShellMarkup({
  title = '',
  subtitle = '',
  contextControls = '',
  canvasId,
  svgId,
  inspectorBodyId,
  inspectorInitial = '',
} = {}) {
  return `<div class="ws-workspace"><div class="ws-workspace-header"><div class="ws-workspace-title">${escHtml(title)}</div>${subtitle ? `<div class="ws-workspace-subtitle">${escHtml(subtitle)}</div>` : ''}</div><div class="ws-toolbar"><div class="ws-context-controls">${contextControls}</div><div class="ws-viewport-controls"><button data-viewport="out">Zoom Out</button><span data-zoom-label>100%</span><button data-viewport="in">Zoom In</button><button data-viewport="fit">Fit</button><button data-viewport="center">Center</button></div></div><div class="ws-layout"><div class="ws-panel-rail"><button id="ws-navigation-toggle" class="ws-navigation-tab" type="button" aria-controls="ws-navigation-drawer" aria-expanded="false"><span aria-hidden="true">N<br>A<br>V</span><span class="ws-visually-hidden">Open hierarchy navigation</span></button><button id="ws-node-catalog-toggle" class="ws-navigation-tab ws-node-catalog-tab" type="button" aria-controls="ws-node-catalog-drawer" aria-expanded="false"><span aria-hidden="true">N<br>O<br>D<br>E</span><span class="ws-visually-hidden">Open node catalog</span></button></div><aside id="ws-navigation-drawer" class="ws-navigation-drawer" aria-label="Hierarchy navigation" aria-hidden="true" hidden><div class="ws-navigation-header"><strong>NAVIGATION</strong><div class="ws-navigation-actions"><button id="ws-navigation-collapse-all" class="ws-navigation-action" type="button" aria-label="Collapse all hierarchy entries" title="Collapse all">−</button><button id="ws-navigation-expand-all" class="ws-navigation-action" type="button" aria-label="Expand all hierarchy entries" title="Expand all">+</button><button id="ws-navigation-close" class="ws-navigation-close" type="button" aria-label="Close hierarchy navigation" title="Close">×</button></div></div><label class="ws-navigation-search-label" for="ws-navigation-search">Search hierarchy</label><input id="ws-navigation-search" class="ws-navigation-search" type="search" placeholder="Search hierarchy…" autocomplete="off"><details id="ws-navigation-filters" class="ws-navigation-filters-panel"><summary>Show filters</summary><div class="ws-navigation-filters"></div></details><div id="ws-navigation-match-count" class="ws-navigation-match-count" aria-live="polite"></div><div id="ws-navigation-tree" class="ws-navigation-tree" role="tree" aria-label="World hierarchy"></div></aside><aside id="ws-node-catalog-drawer" class="ws-node-catalog-drawer" aria-label="Node catalog" aria-hidden="true" hidden><div class="ws-navigation-header"><strong>NODE</strong><div class="ws-navigation-actions"><button id="ws-node-catalog-close" class="ws-navigation-close" type="button" aria-label="Close node catalog" title="Close">×</button></div></div><label class="ws-navigation-search-label" for="ws-node-catalog-search">Search nodes</label><input id="ws-node-catalog-search" class="ws-navigation-search" type="search" placeholder="Search nodes…" autocomplete="off"><details id="ws-node-catalog-filters" class="ws-navigation-filters-panel"><summary>Show filters</summary><div class="ws-navigation-filters"></div></details><div id="ws-node-catalog-match-count" class="ws-navigation-match-count" aria-live="polite"></div><div id="ws-node-catalog-tree" class="ws-navigation-tree" role="tree" aria-label="Placeable nodes"></div><div id="ws-node-catalog-status" class="ws-node-catalog-status" aria-live="polite"></div></aside><div class="ws-viewport" data-viewport-surface><svg id="${svgId}" class="ws-graph-svg"></svg><div id="${canvasId}" class="ws-graph-canvas"></div></div><div class="ws-inspector"><div class="ws-inspector-title">Inspector</div><div id="${inspectorBodyId}" class="ws-inspector-body">${inspectorInitial}</div></div></div></div>`;
}
export function renderWorkspaceShell(container, options = {}) {
  container.innerHTML = workspaceShellMarkup(options);
  const root = container.querySelector('.ws-workspace');
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
