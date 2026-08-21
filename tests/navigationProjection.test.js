import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createWorld } from '../src/core/world/worldState.js';
import { buildSiteSession } from '../src/workspace/siteSession.js';
import { createWorldSimulation } from '../src/simulation/worldSimulation.js';
import {
  buildNavigationIndex,
  expandNavigationPath,
  getNavigationRows,
  navigationExpandableKeys,
  navigationCategoryVocabulary,
  navigationVisibleCategories,
} from '../src/workspace/navigationProjection.js';
import { NODE_CATEGORIES } from '../src/workspace/nodePresentation.js';
import { NODE_DEFINITIONS } from '../src/workspace/nodeCatalog.js';
import { commitNodePlacement } from '../src/workspace/nodePlacement.js';

function findWorldWithIron() {
  for (let index = 0; index < 200; index++) {
    const world = createWorld(`navigation-iron-${index}`);
    const occurrence = Object.values(world.resourceOccurrences).find(item =>
      item.resourceId === 'iron-ore' && item.composition
    );
    if (!occurrence) continue;
    const feature = world.features[occurrence.sourceId];
    const site = world.sites[feature.siteId];
    const region = world.regions[site.regionId];
    return { world, occurrence, feature, site, region };
  }
  throw new Error('Could not find an iron occurrence in test seed range');
}

test('navigation projection follows authoritative Planet → Region → Site → Feature ownership', () => {
  const { world, feature, site, region } = findWorldWithIron();
  const index = buildNavigationIndex(world);

  assert.equal(index.byKey.get(`region:${region.id}`).parentKey, `planet:${world.planetId}`);
  assert.equal(index.byKey.get(`site:${site.id}`).parentKey, `region:${region.id}`);
  assert.equal(index.byKey.get(`feature:${feature.id}`).parentKey, `site:${site.id}`);
  assert.equal(index.byKey.get(`feature:${feature.id}`).targetId, feature.id);
});

test('indexing existing graph nodes is stable and does not create unopened Site sessions', () => {
  const { world, site, occurrence } = findWorldWithIron();
  const before = JSON.stringify(world);
  const index = buildNavigationIndex(world);
  const ids = index.entries.map(entry => entry.targetId);

  assert.equal(new Set(ids).size, ids.length);
  assert.equal(Object.keys(world.simulation.sessions).length, 0);
  assert.equal(index.entries.some(entry => entry.category === 'apparatus'), false);
  assert.equal(JSON.stringify(world), before);

  const session = buildSiteSession(world, site.id);
  const extractorDefinition = NODE_DEFINITIONS.find(definition => definition.id === 'extractor');
  const extractor = commitNodePlacement(
    session.blueprint,
    session.blueprintLayout,
    extractorDefinition,
    { occurrenceId: occurrence.id },
    { x: 240, y: 120 },
  );
  const withSession = buildNavigationIndex(world, {
    siteSessions: { [site.id]: session },
  });
  assert.ok(extractor);
  assert.equal(withSession.entries.filter(entry => entry.targetId === extractor.id).length, 1);
  assert.equal(withSession.byKey.get(`node:${extractor.id}`).parentKey, `site:${site.id}`);
});

test('filter vocabulary remains canonical when categories are not populated', () => {
  assert.deepEqual(
    navigationCategoryVocabulary(),
    Object.values(NODE_CATEGORIES).map(category => category.key),
  );
  const world = createWorld('navigation-filter-vocabulary');
  const index = buildNavigationIndex(world);
  assert.equal(index.categories.includes('apparatus'), false);
  assert.equal(navigationCategoryVocabulary().includes('apparatus'), true);
  assert.equal(navigationCategoryVocabulary().includes('container'), true);
  assert.equal(navigationCategoryVocabulary().includes('sensor'), true);
});

test('authoritative boundary graph nodes are indexed under their owning workspace', () => {
  const world = createWorld('navigation-boundaries');
  createWorldSimulation(world);
  const index = buildNavigationIndex(world);
  const region = Object.values(world.regions)[0];
  const regionBoundary = index.entries.find(entry =>
    entry.category === 'boundary' && entry.workspaceLevel === 'region'
  );
  const siteBoundary = index.entries.find(entry =>
    entry.category === 'boundary' && entry.workspaceLevel === 'site'
  );

  assert.ok(regionBoundary);
  assert.equal(regionBoundary.parentKey, `region:${region.id}`);
  assert.ok(siteBoundary);
  assert.equal(siteBoundary.parentKey, `site:${siteBoundary.workspaceId}`);
  assert.ok(world.sites[siteBoundary.workspaceId]);
});

test('Iron search is case-insensitive and matches Feature resource/composition metadata', () => {
  const { world, feature, site } = findWorldWithIron();
  const index = buildNavigationIndex(world);
  const projection = getNavigationRows(index, {
    query: 'iRoN',
    activeKey: `site:${site.id}`,
  });
  const match = projection.rows.find(row => row.key === `feature:${feature.id}`);

  assert.ok(match);
  assert.equal(match.isMatch, true);
  assert.equal(match.isContext, false);
  assert.ok(projection.rows.some(row => row.key === `planet:${world.planetId}` && row.isContext));
  assert.ok(projection.rows.some(row => row.key === `region:${site.regionId}` && row.isContext));
  assert.ok(projection.matchCount >= 1);
});

test('search retains only required ancestor paths and distinguishes context', () => {
  const world = createWorld('navigation-search-routes');
  const index = buildNavigationIndex(world);
  const [region] = Object.values(world.regions);
  const [siteA, siteB] = region.siteIds.map(id => world.sites[id]);
  const featureA = world.features[siteA.featureIds[0]];
  const featureB = world.features[siteB.featureIds[0]];
  featureA.name = 'Unique Search Target';
  featureB.name = 'Unrelated Branch';
  const refreshedIndex = buildNavigationIndex(world);

  const projection = getNavigationRows(refreshedIndex, {
    query: 'unique search',
    activeKey: `site:${siteA.id}`,
  });
  const keys = new Set(projection.rows.map(row => row.key));

  assert.ok(keys.has(`feature:${featureA.id}`));
  assert.ok(keys.has(`site:${siteA.id}`));
  assert.ok(keys.has(`region:${region.id}`));
  assert.ok(keys.has(`planet:${world.planetId}`));
  assert.equal(keys.has(`feature:${featureB.id}`), false);
  assert.equal(projection.rows.find(row => row.key === `site:${siteA.id}`).isContext, true);
  assert.equal(projection.rows.find(row => row.key === `feature:${featureA.id}`).isMatch, true);
});

test('filters hide normal rows but search reveals filtered ancestors without changing the index', () => {
  const { world, feature, site } = findWorldWithIron();
  const index = buildNavigationIndex(world);
  const filtered = getNavigationRows(index, {
    visibleCategories: new Set(['planet', 'feature']),
    activeKey: `site:${site.id}`,
    manualExpandedKeys: [`planet:${world.planetId}`, `region:${site.regionId}`, `site:${site.id}`],
  });
  const filteredKeys = new Set(filtered.rows.map(row => row.key));
  assert.equal(filteredKeys.has(`region:${site.regionId}`), false);
  assert.equal(filteredKeys.has(`feature:${feature.id}`), true);
  assert.ok(index.byKey.has(`region:${site.regionId}`));

  const search = getNavigationRows(index, {
    query: 'iron',
    visibleCategories: new Set(['planet', 'feature']),
  });
  const contextRegion = search.rows.find(row => row.key === `region:${site.regionId}`);
  assert.ok(contextRegion);
  assert.equal(contextRegion.isContext, true);
  assert.equal(contextRegion.isFiltered, true);
});

test('search-derived expansion does not mutate manual expansion state', () => {
  const { world, site } = findWorldWithIron();
  const index = buildNavigationIndex(world);
  const manual = new Set([`planet:${world.planetId}`]);
  const before = new Set(manual);
  const search = getNavigationRows(index, {
    query: 'iron',
    manualExpandedKeys: manual,
    activeKey: `site:${site.id}`,
  });

  assert.deepEqual(manual, before);
  assert.ok(search.searchRevealedKeys.has(`region:${site.regionId}`));
  assert.ok(search.requiredExpandedKeys.has(`region:${site.regionId}`));
});

test('active paths can be manually collapsed after navigation reveals them', () => {
  const { world, site } = findWorldWithIron();
  const index = buildNavigationIndex(world);
  const activeKey = `site:${site.id}`;
  const revealed = expandNavigationPath(index, activeKey, []);
  const expanded = getNavigationRows(index, {
    activeKey,
    manualExpandedKeys: revealed,
  });
  const collapsed = getNavigationRows(index, {
    activeKey,
    manualExpandedKeys: [`planet:${world.planetId}`],
  });

  assert.ok(expanded.rows.some(row => row.key === activeKey && row.isActive));
  assert.equal(collapsed.requiredExpandedKeys.has(`region:${site.regionId}`), false);
  assert.equal(collapsed.rows.find(row => row.key === `region:${site.regionId}`).isExpanded, false);
  assert.equal(collapsed.rows.some(row => row.key === activeKey), false);
});

test('Collapse All and Expand All operate on manual expansion state', () => {
  const { world } = findWorldWithIron();
  const index = buildNavigationIndex(world);
  const expandedKeys = navigationExpandableKeys(index);
  const collapsed = getNavigationRows(index, {
    manualExpandedKeys: [],
  });
  const expanded = getNavigationRows(index, {
    manualExpandedKeys: expandedKeys,
  });

  assert.equal(collapsed.rows.length, 1);
  assert.equal(expanded.rows.length, index.entries.length);
  assert.equal(expandNavigationPath(index, `planet:${world.planetId}`, []).size, 0);
});

test('hidden category state persists across visible-category projections', () => {
  const { world } = findWorldWithIron();
  const index = buildNavigationIndex(world);
  const hidden = new Set(['region']);
  const categories = navigationCategoryVocabulary();
  const first = navigationVisibleCategories(categories, hidden);
  const rerender = navigationVisibleCategories(categories, hidden);
  const restored = navigationVisibleCategories(categories, new Set());

  assert.equal(first.has('region'), false);
  assert.deepEqual(rerender, first);
  assert.equal(restored.has('region'), true);
});

test('hidden categories stay hidden when a later index adds matching nodes', () => {
  const { world, site } = findWorldWithIron();
  const hidden = new Set(['apparatus']);
  const initial = buildNavigationIndex(world);
  assert.equal(initial.entries.some(entry => entry.category === 'apparatus'), false);

  const session = buildSiteSession(world, site.id);
  commitNodePlacement(
    session.blueprint,
    session.blueprintLayout,
    NODE_DEFINITIONS.find(definition => definition.id === 'cone-crusher'),
    {},
    { x: 240, y: 120 },
  );
  const refreshed = buildNavigationIndex(world, { siteSessions: { [site.id]: session } });
  const visibleCategories = navigationVisibleCategories(navigationCategoryVocabulary(), hidden);
  const projection = getNavigationRows(refreshed, {
    visibleCategories,
    manualExpandedKeys: navigationExpandableKeys(refreshed),
  });

  assert.equal(refreshed.entries.some(entry => entry.category === 'apparatus'), true);
  assert.equal(visibleCategories.has('apparatus'), false);
  assert.equal(projection.rows.some(row => row.category === 'apparatus'), false);
});

test('active workspace path remains visible while searching another branch', () => {
  const world = createWorld('navigation-active-search');
  const index = buildNavigationIndex(world);
  const regions = Object.values(world.regions);
  const currentSite = world.sites[regions[0].siteIds[0]];
  const otherFeature = world.features[world.sites[regions[1].siteIds[0]].featureIds[0]];
  otherFeature.name = 'Search-only branch';
  const refreshedIndex = buildNavigationIndex(world);
  const projection = getNavigationRows(refreshedIndex, {
    query: 'search-only',
    activeKey: `site:${currentSite.id}`,
  });

  assert.ok(projection.rows.some(row => row.key === `site:${currentSite.id}` && row.isActive));
  assert.ok(projection.rows.some(row => row.key === `feature:${otherFeature.id}` && row.isMatch));
});
