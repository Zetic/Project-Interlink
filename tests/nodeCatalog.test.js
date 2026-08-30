import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBlueprint } from '../src/simulation/simulationEngine.js';
import {
  NODE_DEFINITIONS,
  nodeCatalogCategoryVocabulary,
  nodeCatalogVisibleCategories,
  projectNodeCatalog,
} from '../src/workspace/catalog/nodeCatalog.js';

const byId = id => NODE_DEFINITIONS.find(definition => definition.id === id);

test('NODE catalog exposes the current primitive definitions and existing categories', () => {
  assert.deepEqual(
    NODE_DEFINITIONS.map(definition => definition.label),
    [
      'Extractor',
      'Jaw Crusher',
      'Cone Crusher',
      'Ball Mill',
      'Screen',
      'Splitter',
      'Material Merger',
      'Feeder',
      'Dry Drum Magnetic Separator',
      'Electric Roasting Furnace',
      'Exhaust Vent',
      'Hopper',
    ],
  );
  assert.deepEqual(
    NODE_DEFINITIONS.map(definition => definition.category),
    ['apparatus', 'apparatus', 'apparatus', 'apparatus', 'apparatus', 'apparatus', 'apparatus', 'apparatus', 'apparatus', 'apparatus', 'container', 'container'],
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
  byId('cone-crusher').create(blueprint);
  const projected = projectNodeCatalog();

  assert.equal(empty.matchCount, NODE_DEFINITIONS.length);
  assert.equal(projected.matchCount, NODE_DEFINITIONS.length);
  assert.equal(projected.rows.flatMap(row => row.definitions).length, NODE_DEFINITIONS.length);
  assert.equal(Object.keys(blueprint.nodes).length, 1);
});

test('catalog search is case-insensitive and matches deliberate function synonyms', () => {
  assert.deepEqual(
    projectNodeCatalog({ query: 'CRUSHER' }).rows[0].definitions.map(item => item.id),
    ['jaw-crusher', 'cone-crusher'],
  );
  assert.deepEqual(projectNodeCatalog({ query: 'primary crusher' }).rows[0].definitions.map(item => item.id), ['jaw-crusher']);
  assert.deepEqual(projectNodeCatalog({ query: 'grinding' }).rows[0].definitions.map(item => item.id), ['ball-mill', 'magnetic-separator']);
  assert.deepEqual(projectNodeCatalog({ query: 'sieve' }).rows[0].definitions.map(item => item.id), ['screen']);
  assert.deepEqual(projectNodeCatalog({ query: 'branch' }).rows[0].definitions.map(item => item.id), ['splitter']);
  assert.deepEqual(projectNodeCatalog({ query: 'junction' }).rows[0].definitions.map(item => item.id), ['material-merger']);
  assert.deepEqual(projectNodeCatalog({ query: 'meter' }).rows[0].definitions.map(item => item.id), ['feeder']);
  assert.deepEqual(projectNodeCatalog({ query: 'separation' }).rows[0].definitions.map(item => item.id), ['screen', 'magnetic-separator']);
  assert.deepEqual(projectNodeCatalog({ query: 'storage' }).rows[0].definitions.map(item => item.id), ['hopper']);
});

test('category filters affect projection without changing the catalog definitions', () => {
  const categories = nodeCatalogCategoryVocabulary();
  const visible = nodeCatalogVisibleCategories(categories, new Set(['apparatus']));
  const projection = projectNodeCatalog({ visibleCategories: visible });

  assert.deepEqual(categories, ['apparatus', 'container']);
  assert.deepEqual(projection.rows.flatMap(row => row.definitions).map(item => item.id), ['exhaust-vent', 'hopper']);
  assert.equal(NODE_DEFINITIONS.length, 12);
});

test('definitions create the expected authoritative blueprint node types', () => {
  const blueprint = createBlueprint();
  const nodes = [
    byId('extractor').create(blueprint, { occurrenceId: 'occurrence-1' }),
    byId('jaw-crusher').create(blueprint),
    byId('cone-crusher').create(blueprint),
    byId('ball-mill').create(blueprint),
    byId('screen').create(blueprint),
    byId('splitter').create(blueprint),
    byId('material-merger').create(blueprint),
    byId('feeder').create(blueprint),
    byId('magnetic-separator').create(blueprint),
    byId('electric-roasting-furnace').create(blueprint),
    byId('exhaust-vent').create(blueprint),
    byId('hopper').create(blueprint),
  ];

  assert.deepEqual(
    nodes.map(node => node.nodeType),
    ['extractor', 'jawCrusher', 'coneCrusher', 'ballMill', 'screen', 'splitter', 'merger', 'feeder', 'magSep', 'roastingFurnace', 'exhaustVent', 'hopper'],
  );
  assert.equal(Object.keys(blueprint.nodes).length, 12);
});
