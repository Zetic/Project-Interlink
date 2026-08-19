import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { workspaceShellMarkup } from '../src/workspace/workspaceUI.js';

const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

function cssRule(css, selector) {
  let selectorIndex = -1;
  let searchFrom = 0;
  while (searchFrom < css.length) {
    const candidateIndex = css.indexOf(selector, searchFrom);
    if (candidateIndex < 0) break;
    const previousCharacter = css[candidateIndex - 1];
    const nextCharacter = css[candidateIndex + selector.length];
    const hasLeftBoundary = candidateIndex === 0 || /[\s,]/.test(previousCharacter);
    const hasRightBoundary = nextCharacter !== undefined && /[\s{,]/.test(nextCharacter);
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
