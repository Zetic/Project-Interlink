import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { workspaceShellMarkup } from '../src/workspace/workspaceUI.js';

const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

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
  const playerViewRule = styles.match(/#player-view\s*\{([^}]*)\}/)?.[1] ?? '';

  assert.match(playerViewRule, /width:\s*calc\(100%\s*-\s*16px\)/);
  assert.match(playerViewRule, /height:\s*calc\(100vh\s*-\s*16px\)/);
  assert.match(playerViewRule, /height:\s*calc\(100dvh\s*-\s*16px\)/);
  assert.match(playerViewRule, /margin:\s*8px/);
});
