import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createBlueprint,
  blueprintAddCrusher,
  blueprintAddHopper,
} from '../src/simulation/simulationEngine.js';
import { NODE_CATEGORIES, nodeCategory } from '../src/workspace/nodePresentation.js';
import { projectBlueprintGraph } from '../src/workspace/workspaceGraph.js';

test('hierarchy and natural-world nodes keep stable recognition categories', () => {
  assert.equal(nodeCategory({ nodeType: 'planet' }), NODE_CATEGORIES.PLANET);
  assert.equal(nodeCategory({ nodeType: 'region' }), NODE_CATEGORIES.REGION);
  assert.equal(nodeCategory({ nodeType: 'site' }), NODE_CATEGORIES.SITE);
  assert.equal(nodeCategory({ nodeType: 'feature' }), NODE_CATEGORIES.FEATURE);
});

test('engineered physical nodes distinguish apparatus, containers, and boundaries', () => {
  assert.equal(nodeCategory({ nodeType: 'hopper' }), NODE_CATEGORIES.CONTAINER);
  assert.equal(nodeCategory({ nodeType: 'hopper', boundaryRole: 'import' }), NODE_CATEGORIES.BOUNDARY);
  assert.equal(nodeCategory({ nodeType: 'crusher', kind: 'primitive' }), NODE_CATEGORIES.APPARATUS);
  assert.equal(nodeCategory({ nodeType: 'extractor', kind: 'primitive' }), NODE_CATEGORIES.APPARATUS);
});

test('future information and abstract node families have explicit categories', () => {
  assert.equal(nodeCategory({ nodeType: 'process' }), NODE_CATEGORIES.PROCESS);
  assert.equal(nodeCategory({ nodeType: 'sensor' }), NODE_CATEGORIES.SENSOR);
  assert.equal(nodeCategory({ nodeType: 'controller' }), NODE_CATEGORIES.CONTROLLER);
  assert.equal(nodeCategory({ nodeType: 'logistics' }), NODE_CATEGORIES.LOGISTICS);
  assert.equal(nodeCategory({ nodeType: 'future-unknown' }), NODE_CATEGORIES.SYSTEM);
});

test('graph projection carries recognition category independently from subtype', () => {
  const blueprint = createBlueprint();
  const hopper = blueprintAddHopper(blueprint);
  const crusher = blueprintAddCrusher(blueprint);
  const graph = projectBlueprintGraph(blueprint);

  assert.deepEqual(graph.nodes.find(node => node.id === hopper.id).category, NODE_CATEGORIES.CONTAINER);
  assert.deepEqual(graph.nodes.find(node => node.id === crusher.id).category, NODE_CATEGORIES.APPARATUS);
  assert.equal(graph.nodes.find(node => node.id === crusher.id).type, 'crusher');
});
