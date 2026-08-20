import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  compactCompositionSummaryHtml,
  navigationFilterState,
  nodeCatalogFilterState,
  navigationVisibilityState,
  workspaceShellMarkup,
} from '../src/workspace/workspaceUI.js';

const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const workspaceOverrides = readFileSync(new URL('../workspace-overrides.css', import.meta.url), 'utf8');

function cssRule(css, selector) {
  let selectorIndex = -1;
  let searchFrom = 0;
  while (searchFrom < css.length) {
    const candidateIndex = css.indexOf(selector, searchFrom);
    if (candidateIndex < 0) break;
    const nextCharacter = css[candidateIndex + selector.length];
    const hasLeftBoundary = candidateIndex === 0 || /[\s,>+~]/.test(css[candidateIndex - 1]);
    const hasRightBoundary = nextCharacter !== undefined && !/[A-Za-z0-9_-]/.test(nextCharacter);
    if (hasLeftBoundary && hasRightBoundary) {
      selectorIndex = candidateIndex;
      break;
    }
    searchFrom = candidateIndex + selector.length;
  }
  if (selectorIndex < 0) return '';
  const openIndex = css.indexOf('{', selectorIndex + selector.length);
  if (openIndex < 0) return '';

  let depth = 0;
  for (let index = openIndex; index < css.length; index++) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}' && --depth === 0) return css.slice(openIndex + 1, index);
  }
  return '';
}

test('workspace shell owns shared controls and reserves semantic content slots', () => {
  const markup = workspaceShellMarkup({
    title: 'Region <A>',
    subtitle: 'Sites and Features',
    contextControls: '<span data-context-control>Region action</span>',
    canvasId: 'canvas',
    svgId: 'svg',
    inspectorBodyId: 'inspector-body',
    inspectorInitial: 'Select a node.',
  });

  assert.match(markup, /class="ws-workspace-header"><div class="ws-workspace-title">Region &lt;A&gt;<\/div>/);
  assert.match(markup, /class="ws-context-controls"><span data-context-control>Region action<\/span>/);
  assert.match(markup, /class="ws-viewport-controls"><button data-viewport="out">Zoom Out<\/button>/);
  assert.equal((markup.match(/data-viewport="/g) ?? []).length, 4);
  assert.equal((markup.match(/data-zoom-label/g) ?? []).length, 1);
  assert.ok(markup.indexOf('ws-context-controls') < markup.indexOf('data-viewport="out"'));
  assert.match(markup, /class="ws-inspector".*class="ws-inspector-body"/s);
});

test('player shell reserves a viewport-safe outer inset', () => {
  const playerViewRule = cssRule(styles, '#player-view');
  assert.ok(playerViewRule.trim(), 'expected a #player-view style rule');

  const declarations = playerViewRule
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(';')
    .map(declaration => declaration.trim().replace(/\s+/g, ' '))
    .filter(Boolean);

  assert.ok(declarations.some(declaration => /^width: calc\(100%\s*-\s*16px\)$/.test(declaration)), 'expected viewport-safe width');
  assert.ok(declarations.some(declaration => /^height: calc\(100vh\s*-\s*16px\)$/.test(declaration)), 'expected viewport height fallback');
  assert.ok(declarations.some(declaration => /^height: calc\(100dvh\s*-\s*16px\)$/.test(declaration)), 'expected dynamic viewport height');
  assert.ok(declarations.some(declaration => /^margin: 8px$/.test(declaration)), 'expected 8px outer shell inset');
});

test('hierarchy navigator has a permanent rail and body-relative overlay', () => {
  const markup = workspaceShellMarkup({
    title: 'Planet',
    canvasId: 'canvas',
    svgId: 'svg',
    inspectorBodyId: 'inspector-body',
  });
  assert.match(markup, /class="ws-panel-rail".*id="ws-navigation-toggle"/s);
  assert.match(markup, /class="ws-panel-rail".*id="ws-node-catalog-toggle"/s);
  assert.match(markup, /id="ws-navigation-drawer"[^>]*aria-hidden="true"[^>]*hidden/);
  assert.match(markup, /id="ws-node-catalog-drawer"[^>]*aria-hidden="true"[^>]*hidden/);
  assert.match(markup, /id="ws-navigation-collapse-all"/);
  assert.match(markup, /id="ws-navigation-expand-all"/);
  assert.match(markup, /id="ws-navigation-search"/);
  assert.match(markup, /id="ws-navigation-tree"/);
  assert.ok(markup.indexOf('ws-workspace-header') < markup.indexOf('ws-panel-rail'));
  assert.ok(markup.indexOf('ws-panel-rail') < markup.indexOf('class="ws-viewport"'));

  const drawerRule = cssRule(workspaceOverrides, '.ws-navigation-drawer');
  assert.match(drawerRule, /position:\s*absolute/);
  assert.match(drawerRule, /inset:\s*0 auto 0 34px/);
  assert.match(drawerRule, /border-right:\s*1px solid/);
  assert.match(cssRule(workspaceOverrides, '.ws-navigation-drawer[hidden]'), /display:\s*none !important/);

  const layoutRule = cssRule(workspaceOverrides, '.ws-layout');
  assert.match(layoutRule, /grid-template-columns:\s*34px minmax\(0, 1fr\) clamp\(180px, 24vw, 280px\)/);
  assert.match(cssRule(workspaceOverrides, '.ws-navigation-filters'), /max-height:\s*112px/);
  assert.match(cssRule(workspaceOverrides, '.ws-navigation-filters'), /overflow-y:\s*auto/);
});

test('NODE catalog shares the body-relative overlay geometry and category filters', () => {
  const markup = workspaceShellMarkup({
    title: 'Site',
    canvasId: 'canvas',
    svgId: 'svg',
    inspectorBodyId: 'inspector-body',
  });
  assert.match(markup, /id="ws-node-catalog-search"/);
  assert.match(markup, /id="ws-node-catalog-filters"/);
  assert.match(markup, /id="ws-node-catalog-tree"/);
  assert.match(cssRule(workspaceOverrides, '.ws-node-catalog-drawer'), /position:\s*absolute/);
  assert.match(cssRule(workspaceOverrides, '.ws-node-catalog-drawer'), /inset:\s*0 auto 0 34px/);
  assert.deepEqual(nodeCatalogFilterState().categories, ['apparatus', 'container']);
});

test('navigation visibility state keeps drawer and toggle attributes synchronized', () => {
  const closed = navigationVisibilityState(false);
  const open = navigationVisibilityState(true);
  const toggledClosed = navigationVisibilityState(false);

  assert.deepEqual(closed, {
    visible: false,
    hidden: true,
    ariaHidden: 'true',
    ariaExpanded: 'false',
  });
  assert.deepEqual(open, {
    visible: true,
    hidden: false,
    ariaHidden: 'false',
    ariaExpanded: 'true',
  });
  assert.deepEqual(toggledClosed, closed);
});

test('navigation filter UI retains the canonical vocabulary while honoring hidden state', () => {
  const state = navigationFilterState(new Set(['apparatus']));

  assert.deepEqual(state.categories, [
    'planet',
    'region',
    'site',
    'facility',
    'feature',
    'apparatus',
    'container',
    'boundary',
    'process',
    'sensor',
    'controller',
    'logistics',
    'system',
  ]);
  assert.equal(state.visibleCategories.has('apparatus'), false);
  assert.equal(state.visibleCategories.has('container'), true);
});

test('compact composition summaries group overflow species behind an explicit reveal control', () => {
  const html = compactCompositionSummaryHtml([
    { label: 'Magnetite', quantity: 4, percentage: 40 },
    { label: 'Hematite', quantity: 2.5, percentage: 25 },
    { label: 'Quartz', quantity: 1.5, percentage: 15 },
    { label: 'Goethite', quantity: 1, percentage: 10 },
    { label: 'Pyrite', quantity: 0.7, percentage: 7 },
    { label: 'Galena', quantity: 0.3, percentage: 3 },
  ], 'no stored material');

  assert.match(html, /Other/);
  assert.match(html, /Show 2 more species/);
  assert.equal((html.match(/ws-ins-comp-details/g) ?? []).length, 1);
});
