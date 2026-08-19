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
    const nextCharacter = css[candidateIndex + selector.length];
    if (nextCharacter == null || /[\s{,]/.test(nextCharacter)) {
      selectorIndex = candidateIndex;
      break;
    }
    searchFrom = candidateIndex + selector.length;
  }
  if (selectorIndex < 0) return '';
  const openIndex = css.indexOf('{', selectorIndex);
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
  assert.match(playerViewRule, /^\s*width:\s*calc\(100%\s*-\s*16px\)\s*;/m);
  assert.match(playerViewRule, /^\s*height:\s*calc\(100(?!d)vh\s*-\s*16px\)\s*;/m);
  assert.match(playerViewRule, /^\s*height:\s*calc\(100dvh\s*-\s*16px\)\s*;/m);
  assert.match(playerViewRule, /^\s*margin:\s*8px\s*;/m);
});
