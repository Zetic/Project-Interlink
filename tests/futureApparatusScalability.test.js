import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { APPARATUS_DEFINITIONS } from '../src/content/apparatus/definitions.js';
import { NODE_DEFINITIONS } from '../src/workspace/catalog/nodeCatalog.js';
import {
  genericApparatusInspectorMarkup,
  installGenericApparatusInspectorUI,
} from '../src/workspace/inspector/genericApparatusInspectorUI.js';
import { machineInspection } from '../src/workspace/inspector/inspectionViewModel.js';
import { nodeRemovalEligibility } from '../src/workspace/graph/nodeRemoval.js';
import { wsState, inspector } from '../src/workspace/workspaceState.js';
import {
  blueprintAddApparatus,
  createBlueprint,
  getNodePortDefinitions,
} from '../src/simulation/simulationEngine.js';
import { createMaterialStream } from '../src/simulation/materialStream.js';

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

test('generic Inspector fallback observes controller innerHTML mutation targets', () => {
  const blueprint = createBlueprint();
  const crusher = blueprintAddApparatus(blueprint, 'crusher');
  const previousBlueprint = wsState.blueprint;
  const previousSelectedNodeId = inspector.selectedNodeId;
  wsState.blueprint = blueprint;
  inspector.selectedNodeId = crusher.id;

  let observerCallback = null;
  let insertedMarkup = '';
  const documentRoot = {
    nodeType: 1,
    matches: () => false,
    closest: () => null,
    querySelectorAll: () => [],
  };
  const inspectorBody = {
    nodeType: 1,
    matches: selector => selector === '#ws-inspector-body',
    closest: selector => selector === '#ws-inspector-body' ? inspectorBody : null,
    querySelectorAll: () => [],
    querySelector: () => null,
    insertAdjacentHTML: (_position, markup) => { insertedMarkup += markup; },
  };
  class FakeMutationObserver {
    constructor(callback) { observerCallback = callback; }
    observe() {}
    disconnect() {}
  }

  const stop = installGenericApparatusInspectorUI({
    body: documentRoot,
    defaultView: { MutationObserver: FakeMutationObserver },
  });
  observerCallback([{ target: inspectorBody, addedNodes: [] }]);

  assert.match(insertedMarkup, /data-generic-apparatus-inspector=/);
  assert.match(insertedMarkup, /generic-machine-product/);
  stop();
  wsState.blueprint = previousBlueprint;
  inspector.selectedNodeId = previousSelectedNodeId;
});

test('machine inspection sums arbitrary material input and output ports without machine-type math', () => {
  const screen = { id: 'screen-1', nodeType: 'screen', enabled: true, operatingState: 'running' };
  const connections = {
    feed: { id: 'feed', kind: 'material', sourceNodeId: 'hopper-in', sourcePortId: 'output', targetNodeId: screen.id, targetPortId: 'feed' },
    undersize: { id: 'undersize', kind: 'material', sourceNodeId: screen.id, sourcePortId: 'undersize', targetNodeId: 'hopper-u', targetPortId: 'input' },
    oversize: { id: 'oversize', kind: 'material', sourceNodeId: screen.id, sourcePortId: 'oversize', targetNodeId: 'hopper-o', targetPortId: 'input' },
  };
  const stream = (id, connection, rate) => createMaterialStream({
    id,
    connectionId: connection.id,
    sourceNodeId: connection.sourceNodeId,
    sourcePortId: connection.sourcePortId,
    targetNodeId: connection.targetNodeId,
    targetPortId: connection.targetPortId,
    componentMassFlowKgPerSecond: { quartz: rate },
    particleSizeMm: 5,
  });
  const blueprint = {
    connections,
    streams: {
      feed: stream('stream-feed', connections.feed, 4),
      undersize: stream('stream-under', connections.undersize, 3),
      oversize: stream('stream-over', connections.oversize, 1),
    },
  };

  const details = machineInspection(blueprint, screen);
  assert.equal(details.actualFeedKgPerSecond, 4);
  assert.equal(details.actualProductKgPerSecond, 4);
  assert.equal(details.outputStreams.length, 2);
  assert.deepEqual(details.outputStreams.map(output => output.portId).sort(), ['oversize', 'undersize']);
});

test('player removal policy derives eligibility from canonical apparatus definitions', () => {
  const blueprint = createBlueprint();
  for (const nodeType of Object.keys(APPARATUS_DEFINITIONS)) {
    const node = blueprintAddApparatus(blueprint, nodeType);
    assert.equal(nodeRemovalEligibility(blueprint, node).removable, true, `${nodeType} should inherit player-placeable removal policy`);
  }
  const source = readFileSync(new URL('../src/workspace/graph/nodeRemoval.js', import.meta.url), 'utf8');
  assert.match(source, /getApparatusDefinition/);
  assert.doesNotMatch(source, /REMOVABLE_NODE_TYPES/);
});

test('workspace implementation is owned directly by the canonical controller', () => {
  const compatibilityFacade = new URL('../src/workspace/workspaceUI.js', import.meta.url);
  const controller = readFileSync(new URL('../src/workspace/workspaceController.js', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

  assert.equal(existsSync(compatibilityFacade), false, 'obsolete workspaceUI compatibility facade should stay removed');
  assert.ok(controller.includes('export function initWorkspace'));
  assert.match(app, /from '\.\/workspace\/workspaceController\.js'/);
});

test('application composes world generation directly instead of routing through core world state', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /import \{ generateWorld \} from '\.\/generator\/generateWorld\.js'/);
  assert.doesNotMatch(app, /core\/world\/worldState\.js/);
});
