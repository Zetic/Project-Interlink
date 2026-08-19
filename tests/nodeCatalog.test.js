import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBlueprint } from '../src/simulation/simulationEngine.js';
import {
  NODE_DEFINITIONS,
  nodeCatalogCategoryVocabulary,
  nodeCatalogVisibleCategories,
  projectNodeCatalog,
} from '../src/workspace/nodeCatalog.js';

const byId = id => NODE_DEFINITIONS.find(definition => definition.id === id);

test('NODE catalog exposes the initial primitive definitions and existing categories', () => {
  assert.deepEqual(
    NODE_DEFINITIONS.map(definition => definition.label),
    ['Extractor', 'Crusher', 'Magnetic Separator', 'Hopper'],
  );
  assert.deepEqual(
    NODE_DEFINITIONS.map(definition => definition.category),
    ['apparatus', 'apparatus', 'apparatus', 'container'],
  );
  for (const definition of NODE_DEFINITIONS) {
    assert.equal(typeof definition.create, 'function');
    assert.ok(definition.description);
    assert.ok(definition.searchTerms.length);
  }
});

test('catalog projection is independent of currently instantiated blueprint nodes', () => {
  const empty = projectNodeCatalog();
  const blueprint = createBlueprint();
  byId('crusher').create(blueprint);
  const projected = projectNodeCatalog();

  assert.equal(empty.matchCount, 4);
  assert.equal(projected.matchCount, 4);
  assert.equal(projected.rows.flatMap(row => row.definitions).length, 4);
  assert.equal(Object.keys(blueprint.nodes).length, 1);
});

test('catalog search is case-insensitive and matches deliberate function synonyms', () => {
  assert.deepEqual(projectNodeCatalog({ query: 'CRUSHER' }).rows[0].definitions.map(item => item.id), ['crusher']);
  assert.deepEqual(projectNodeCatalog({ query: 'grinding' }).rows[0].definitions.map(item => item.id), ['crusher']);
  assert.deepEqual(projectNodeCatalog({ query: 'separation' }).rows[0].definitions.map(item => item.id), ['magnetic-separator']);
  assert.deepEqual(projectNodeCatalog({ query: 'storage' }).rows[0].definitions.map(item => item.id), ['hopper']);
});

test('category filters affect projection without changing the catalog definitions', () => {
  const categories = nodeCatalogCategoryVocabulary();
  const visible = nodeCatalogVisibleCategories(categories, new Set(['apparatus']));
  const projection = projectNodeCatalog({ visibleCategories: visible });

  assert.deepEqual(categories, ['apparatus', 'container']);
  assert.deepEqual(projection.rows.flatMap(row => row.definitions).map(item => item.id), ['hopper']);
  assert.equal(NODE_DEFINITIONS.length, 4);
});

test('definitions create the expected authoritative blueprint node types', () => {
  const blueprint = createBlueprint();
  const nodes = [
    byId('extractor').create(blueprint, { occurrenceId: 'occurrence-1' }),
    byId('crusher').create(blueprint),
    byId('magnetic-separator').create(blueprint),
    byId('hopper').create(blueprint),
  ];

  assert.deepEqual(nodes.map(node => node.nodeType), ['extractor', 'crusher', 'magSep', 'hopper']);
  assert.equal(Object.keys(blueprint.nodes).length, 4);
});
