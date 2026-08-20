import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { APPARATUS_DEFINITIONS } from '../src/content/apparatus/definitions.js';
import { NODE_DEFINITIONS } from '../src/workspace/catalog/nodeCatalog.js';
import { genericApparatusInspectorMarkup } from '../src/workspace/inspector/genericApparatusInspectorUI.js';
import { blueprintAddApparatus, createBlueprint, getNodePortDefinitions } from '../src/simulation/simulationEngine.js';

test('NODE catalog is projected from canonical apparatus definitions in definition order', () => {
  const expected = Object.values(APPARATUS_DEFINITIONS)
    .filter(definition => definition.catalog?.placeable !== false)
    .sort((a, b) => (a.catalog?.order ?? 0) - (b.catalog?.order ?? 0))
    .map(definition => definition.catalog.id);
  assert.deepEqual(NODE_DEFINITIONS.map(definition => definition.id), expected);
  const source = readFileSync(new URL('../src/workspace/catalog/nodeCatalog.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /PLACEABLE_APPARATUS_ORDER/);
});

test('registry-created apparatus receive canonical definition ports', () => {
  const blueprint = createBlueprint();
  for (const nodeType of Object.keys(APPARATUS_DEFINITIONS)) {
    const node = blueprintAddApparatus(blueprint, nodeType);
    assert.deepEqual(node.ports, getNodePortDefinitions(node));
  }
});

test('future active apparatus can receive definition-driven Inspector controls without controller branches', () => {
  const fakeNode = {
    id: 'screen-1',
    nodeType: 'screen',
    enabled: true,
    operatingState: 'running',
    throughputKgPerSecond: 7,
    apertureMm: 25,
    lastError: null,
  };
  const fakeDefinition = {
    capabilities: [{ id: 'throughputKgPerSecond', label: 'Rated throughput', unit: 'kg/s' }],
    parameters: [{
      id: 'apertureMm',
      label: 'Aperture',
      unit: 'mm',
      min: 1,
      max: 120,
      controlType: 'number',
      playerConfigurable: true,
    }],
  };
  const markup = genericApparatusInspectorMarkup(fakeNode, fakeDefinition);
  assert.match(markup, /data-node-id="screen-1"/);
  assert.match(markup, /data-parameter-id="apertureMm"/);
  assert.match(markup, /ws-btn-enable/);
  assert.match(markup, /Rated throughput/);
});

test('workspace implementation has a controller owner and a small compatibility UI surface', () => {
  const facade = readFileSync(new URL('../src/workspace/workspaceUI.js', import.meta.url), 'utf8');
  const controller = readFileSync(new URL('../src/workspace/workspaceController.js', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(facade, /export \* from '\.\/workspaceController\.js'/);
  assert.ok(controller.includes('export function initWorkspace'));
  assert.match(app, /from '\.\/workspace\/workspaceController\.js'/);
  assert.ok(facade.length < 1000, 'workspaceUI compatibility facade should stay small');
});

test('application composes world generation directly instead of routing through core world state', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /import \{ generateWorld \} from '\.\/generator\/generateWorld\.js'/);
  assert.doesNotMatch(app, /core\/world\/worldState\.js/);
});
