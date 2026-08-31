import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspaceSource = readFileSync(new URL('../src/workspace/workspaceController.js', import.meta.url), 'utf8');

function functionSection(name, nextName) {
  const start = workspaceSource.indexOf(`function ${name}`);
  assert.ok(start >= 0, `expected ${name} in workspaceController.js`);
  const end = nextName ? workspaceSource.indexOf(`function ${nextName}`, start + 1) : workspaceSource.length;
  assert.ok(end > start, `expected ${nextName ?? 'end of file'} after ${name}`);
  return workspaceSource.slice(start, end);
}

test('Site Inspector parameter handler is module-scoped so Site initialization can complete', () => {
  const parameterHandlerIndex = workspaceSource.indexOf('function onInspectorParameterChange');
  const clickHandlerIndex = workspaceSource.indexOf('function onInspectorClick');
  assert.ok(parameterHandlerIndex >= 0);
  assert.ok(clickHandlerIndex >= 0);
  assert.ok(parameterHandlerIndex < clickHandlerIndex, 'parameter handler must not be nested inside onInspectorClick');

  const renderSite = functionSection('renderSiteWorkspace', 'startNodeDrag');
  const changeBindingIndex = renderSite.indexOf("addEventListener('change', onInspectorParameterChange)");
  const viewportIndex = renderSite.indexOf('installViewport(');
  assert.ok(changeBindingIndex >= 0, 'Site Inspector must bind parameter changes');
  assert.ok(viewportIndex > changeBindingIndex, 'viewport setup should remain reachable after Inspector event binding');
});

test('Site activation keeps and reuses the cached authoritative session', () => {
  const activateSite = functionSection('activateSiteSession', 'navigateTo');
  assert.match(activateSite, /let session = wsState\.siteSessions\[siteId\]/);
  assert.match(activateSite, /if \(!session\) \{/);
  assert.match(activateSite, /wsState\.siteSessions\[siteId\] = session/);
  assert.match(activateSite, /wsState\.blueprint = session\.blueprint/);
  assert.match(activateSite, /wsState\.blueprintLayout = session\.blueprintLayout/);
});

test('machine Inspector renders fixed ratings through the shared controls helper', () => {
  const controlsSection = functionSection('machineControlsHtml', 'formatNodeInspector');
  const inspectorSection = functionSection('formatNodeInspector', 'formatConnectionInspector');
  assert.match(controlsSection, /for \(const capability of details\.capabilities \?\? \[\]\)/);
  assert.match(controlsSection, /capability\.label/);
  assert.match(inspectorSection, /machineControlsHtml\(node, details\)/);
  assert.doesNotMatch(controlsSection, /Configured throughput/);
  assert.doesNotMatch(inspectorSection, /Configured throughput/);
});
