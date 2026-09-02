import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { createEmptyGraphState } from '../dist/graph/graphCommands.js';
import { generateWorld } from '../dist/world/generateWorld.js';
import { createWorldSpatialIndex } from '../dist/world/spatialIndex.js';
import {
  NAV_NEARBY_FEATURE_LIMIT,
  NAV_NEARBY_REGION_LIMIT,
  NAV_SEARCH_RESULT_LIMIT,
  navigationContext,
  searchWorldNavigation,
} from '../dist/ui/navigationPanel.js';

test('normal NAV context remains bounded and follows camera location independently of selection', () => {
  const planet = generateWorld('navigation-context').planet;
  const index = createWorldSpatialIndex(planet);
  const feature = planet.resourceNodes[Math.floor(planet.resourceNodes.length / 3)];
  const context = navigationContext(planet, { centerX: feature.position.x, centerY: feature.position.y, zoom: 20 }, index);
  assert.equal(context.currentRegion?.id, feature.regionId);
  assert.ok(context.nearbyRegions.length <= NAV_NEARBY_REGION_LIMIT);
  assert.ok(context.nearbyFeatures.length <= NAV_NEARBY_FEATURE_LIMIT);
  assert.ok(context.nearbyRegions.length < planet.regions.length / 100);
});

test('global NAV search finds world entities while enforcing its DOM result budget', () => {
  const planet = generateWorld('navigation-search').planet;
  const graph = createEmptyGraphState();
  const target = planet.regions[Math.floor(planet.regions.length / 2)];
  const exact = searchWorldNavigation(planet, graph, target.name, new Set(['region']));
  assert.ok(exact.results.some(result => result.selection.type === 'region' && result.selection.regionId === target.id));
  const continent = planet.continents[0]; const ocean = planet.oceans[0];
  assert.ok(searchWorldNavigation(planet, graph, continent.name, new Set(['continent'])).results.some(result => result.selection.type === 'continent' && result.selection.continentId === continent.id));
  assert.ok(searchWorldNavigation(planet, graph, ocean.name, new Set(['ocean'])).results.some(result => result.selection.type === 'ocean' && result.selection.oceanId === ocean.id));
  const broad = searchWorldNavigation(planet, graph, 'a', new Set(['region', 'feature']));
  assert.ok(broad.totalMatches >= broad.results.length);
  assert.ok(broad.results.length <= NAV_SEARCH_RESULT_LIMIT);
  assert.ok(broad.totalMatches > NAV_SEARCH_RESULT_LIMIT, `expected a bounded subset of ${broad.totalMatches} matches`);
});

test('map and NAV source architecture query subsets instead of building the full world DOM', () => {
  const renderer = fs.readFileSync('src/map/mapRenderer.ts', 'utf8');
  const navigation = fs.readFileSync('src/ui/navigationPanel.ts', 'utf8');
  const shell = fs.readFileSync('src/ui/workspaceShell.ts', 'utf8');
  assert.match(renderer, /regionsIntersecting\(bounds\)/);
  assert.match(renderer, /resourceNodesIntersecting/);
  assert.match(renderer, /regionLabelBudgetForZoom/);
  assert.doesNotMatch(renderer, /planet\.regions\.forEach/);
  assert.match(navigation, /NAV_SEARCH_RESULT_LIMIT = 60/);
  assert.match(navigation, /subscribeDomains\(\['world', 'graph', 'selection', 'camera'\]/);
  assert.doesNotMatch(navigation, /buildRows|expandedKeys|Expand All/);
  assert.doesNotMatch(shell, /ws-navigation-expand-all|ws-navigation-collapse-all|Search hierarchy/);
});
