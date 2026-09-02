import type { GraphState, MechanicalNode } from '../graph/types.js';
import type { AppStore } from '../state/appState.js';
import { worldSpatialIndexFor, type WorldSpatialIndex } from '../world/spatialIndex.js';
import type { Continent, GeographicParent, MapCameraState, MapSelection, Ocean, Planet, Region, ResourceNode } from '../world/types.js';

export type NavigationCategory = 'planet' | 'continent' | 'ocean' | 'region' | 'feature' | 'engineering';
export interface NavigationResult { key: string; label: string; detail: string; category: NavigationCategory; selection: MapSelection; }
export interface NavigationContext { currentParent: Continent | Ocean; currentRegion: Region; nearbyRegions: Region[]; nearbyFeatures: ResourceNode[]; }
export interface NavigationSearchResults { results: NavigationResult[]; totalMatches: number; }

export const NAV_SEARCH_RESULT_LIMIT = 60;
export const NAV_NEARBY_REGION_LIMIT = 8;
export const NAV_NEARBY_FEATURE_LIMIT = 12;
export const NAVIGATION_CONTEXT_CELL_SIZE = 16;

const CATEGORIES = ['planet', 'continent', 'ocean', 'region', 'feature', 'engineering'] as const;
const CATEGORY_LABELS: Record<NavigationCategory, string> = { planet: 'Planet', continent: 'Continents', ocean: 'Oceans', region: 'Regions', feature: 'Features', engineering: 'Engineering' };

function selectionKey(selection: MapSelection): string {
  if (selection.type === 'planet') return 'planet';
  if (selection.type === 'continent') return `continent:${selection.continentId}`;
  if (selection.type === 'ocean') return `ocean:${selection.oceanId}`;
  if (selection.type === 'region') return `region:${selection.regionId}`;
  if (selection.type === 'resource') return `resource:${selection.resourceNodeId}`;
  return `mechanical:${selection.mechanicalNodeId}`;
}

function parentById(planet: Planet, id: string): GeographicParent | null { return planet.continents.find(parent => parent.id === id) ?? planet.oceans.find(parent => parent.id === id) ?? null; }
function resultForParent(parent: Continent | Ocean): NavigationResult { return { key: `${parent.kind}:${parent.id}`, label: parent.name, detail: `${parent.regionIds.length.toLocaleString()} Regions`, category: parent.kind, selection: parent.kind === 'continent' ? { type: 'continent', continentId: parent.id } : { type: 'ocean', oceanId: parent.id } }; }
function resultForRegion(region: Region, planet: Planet): NavigationResult { const parent = parentById(planet, region.parentId); return { key: `region:${region.id}`, label: region.name, detail: parent?.name ?? region.parentId, category: 'region', selection: { type: 'region', regionId: region.id } }; }
function resultForFeature(feature: ResourceNode, regionNames: ReadonlyMap<string, string>): NavigationResult { return { key: `resource:${feature.id}`, label: feature.name, detail: regionNames.get(feature.regionId) ?? feature.regionId, category: 'feature', selection: { type: 'resource', resourceNodeId: feature.id } }; }
function resultForMechanical(node: MechanicalNode): NavigationResult { return { key: `mechanical:${node.id}`, label: node.label, detail: node.category === 'apparatus' ? 'Apparatus' : 'Storage', category: 'engineering', selection: { type: 'mechanical', mechanicalNodeId: node.id } }; }

export function navigationContext(planet: Planet, camera: MapCameraState, index = worldSpatialIndexFor(planet)): NavigationContext {
  const point = { x: camera.centerX, y: camera.centerY };
  const currentRegion = index.regionContaining(point);
  if (!currentRegion) throw new Error('Every canonical planet point must resolve to a Region.');
  const currentParent = currentRegion.parentKind === 'continent' ? index.continentById(currentRegion.parentId) : index.oceanById(currentRegion.parentId);
  if (!currentParent) throw new Error(`Region ${currentRegion.id} has no geographic parent.`);
  const nearbyRegions = index.nearbyRegions(point, NAV_NEARBY_REGION_LIMIT + 1).filter(region => region.id !== currentRegion.id).slice(0, NAV_NEARBY_REGION_LIMIT);
  const currentFeatureIds = new Set(currentRegion.resourceNodeIds);
  const nearbyFeatures = index.resourceNodesIntersecting(currentRegion.bounds).filter(feature => currentFeatureIds.has(feature.id))
    .sort((left, right) => Math.hypot(left.position.x - point.x, left.position.y - point.y) - Math.hypot(right.position.x - point.x, right.position.y - point.y)).slice(0, NAV_NEARBY_FEATURE_LIMIT);
  return { currentParent, currentRegion, nearbyRegions, nearbyFeatures };
}

export function navigationContextKey(planet: Planet, camera: MapCameraState, index = worldSpatialIndexFor(planet)): string {
  const regionId = index.regionContaining({ x: camera.centerX, y: camera.centerY })?.id ?? 'none';
  return `${regionId}:${Math.floor(camera.centerX / NAVIGATION_CONTEXT_CELL_SIZE)}:${Math.floor(camera.centerY / NAVIGATION_CONTEXT_CELL_SIZE)}`;
}

export function searchWorldNavigation(planet: Planet, graph: GraphState, queryInput: string, categories: ReadonlySet<NavigationCategory>, limit = NAV_SEARCH_RESULT_LIMIT): NavigationSearchResults {
  const query = queryInput.trim().toLocaleLowerCase();
  if (!query) return { results: [], totalMatches: 0 };
  const all: NavigationResult[] = [];
  const regionNames = new Map(planet.regions.map(region => [region.id, region.name]));
  if (categories.has('planet') && planet.name.toLocaleLowerCase().includes(query)) all.push({ key: 'planet', label: planet.name, detail: 'Planet', category: 'planet', selection: { type: 'planet' } });
  if (categories.has('continent')) for (const parent of planet.continents) if (parent.name.toLocaleLowerCase().includes(query)) all.push(resultForParent(parent));
  if (categories.has('ocean')) for (const parent of planet.oceans) if (parent.name.toLocaleLowerCase().includes(query)) all.push(resultForParent(parent));
  if (categories.has('region')) for (const region of planet.regions) if (region.name.toLocaleLowerCase().includes(query)) all.push(resultForRegion(region, planet));
  if (categories.has('feature')) for (const feature of planet.resourceNodes) if (feature.name.toLocaleLowerCase().includes(query)) all.push(resultForFeature(feature, regionNames));
  if (categories.has('engineering')) for (const node of graph.nodes) if (node.label.toLocaleLowerCase().includes(query)) all.push(resultForMechanical(node));
  all.sort((left, right) => left.label.localeCompare(right.label) || left.key.localeCompare(right.key));
  return { results: all.slice(0, Math.max(0, limit)), totalMatches: all.length };
}

function createSection(label: string, detail?: string): HTMLElement { const section = document.createElement('div'); section.className = 'ws-navigation-section-title'; section.textContent = label; if (detail) { const value = document.createElement('span'); value.textContent = detail; section.appendChild(value); } return section; }
function createNavigationRow(row: NavigationResult, selectedKey: string, onSelect: (selection: MapSelection) => void): HTMLElement {
  const element = document.createElement('button'); element.className = 'ws-navigation-context-row'; element.type = 'button'; if (row.key === selectedKey) element.classList.add('ws-navigation-context-row--active');
  const category = document.createElement('span'); category.className = `ws-navigation-category ws-navigation-category--${row.category}`;
  const content = document.createElement('span'); content.className = 'ws-navigation-context-copy'; const label = document.createElement('span'); label.className = 'ws-navigation-label'; label.textContent = row.label;
  const detail = document.createElement('span'); detail.className = 'ws-navigation-context-detail'; detail.textContent = row.detail; content.append(label, detail); element.append(category, content); element.addEventListener('click', () => onSelect(row.selection)); return element;
}

function selectedResult(planet: Planet, graph: GraphState, selection: MapSelection): NavigationResult | null {
  if (selection.type === 'planet') return null;
  if (selection.type === 'continent') { const value = planet.continents.find(candidate => candidate.id === selection.continentId); return value ? resultForParent(value) : null; }
  if (selection.type === 'ocean') { const value = planet.oceans.find(candidate => candidate.id === selection.oceanId); return value ? resultForParent(value) : null; }
  if (selection.type === 'region') { const value = planet.regions.find(candidate => candidate.id === selection.regionId); return value ? resultForRegion(value, planet) : null; }
  if (selection.type === 'resource') { const value = planet.resourceNodes.find(candidate => candidate.id === selection.resourceNodeId); return value ? resultForFeature(value, new Map(planet.regions.map(region => [region.id, region.name]))) : null; }
  const node = graph.nodes.find(candidate => candidate.id === selection.mechanicalNodeId); return node ? resultForMechanical(node) : null;
}

export function installNavigationPanel(root: HTMLElement, store: AppStore): void {
  const tree = root.querySelector<HTMLElement>('#ws-navigation-tree'); const search = root.querySelector<HTMLInputElement>('#ws-navigation-search'); const count = root.querySelector<HTMLElement>('#ws-navigation-match-count'); const filters = root.querySelector<HTMLElement>('#ws-navigation-filters .ws-navigation-filters');
  if (!tree || !search || !count || !filters) return;
  const visibleCategories = new Set<NavigationCategory>(CATEGORIES); let indexedPlanet: Planet | null = null; let spatialIndex: WorldSpatialIndex | null = null;
  for (const category of CATEGORIES) { const label = document.createElement('label'); const input = document.createElement('input'); input.type = 'checkbox'; input.checked = true; input.value = category; input.addEventListener('change', () => { if (input.checked) visibleCategories.add(category); else visibleCategories.delete(category); render(); }); label.append(input, document.createTextNode(` ${CATEGORY_LABELS[category]}`)); filters.appendChild(label); }
  const renderRows = (rows: readonly NavigationResult[], selectedKey: string): DocumentFragment => { const fragment = document.createDocumentFragment(); for (const row of rows) fragment.appendChild(createNavigationRow(row, selectedKey, selection => store.focusSelection(selection))); return fragment; };
  const render = (): void => {
    const state = store.getState(); if (!state.world) { tree.textContent = 'No world generated.'; count.textContent = ''; return; }
    const planet = state.world.planet; if (indexedPlanet !== planet || !spatialIndex) { indexedPlanet = planet; spatialIndex = worldSpatialIndexFor(planet); }
    const selectedKey = selectionKey(state.selection); const query = search.value.trim();
    if (query) { const matches = searchWorldNavigation(planet, state.graph, query, visibleCategories); tree.replaceChildren(createSection('Search results'), renderRows(matches.results, selectedKey)); count.textContent = matches.totalMatches > matches.results.length ? `Showing ${matches.results.length} of ${matches.totalMatches} matches` : `${matches.totalMatches} match${matches.totalMatches === 1 ? '' : 'es'}`; return; }
    const context = navigationContext(planet, state.camera, spatialIndex); const currentRows = [resultForParent(context.currentParent), resultForRegion(context.currentRegion, planet)]; const selected = selectedResult(planet, state.graph, state.selection);
    const children: Node[] = [createSection('Current location', planet.name), renderRows(currentRows, selectedKey)];
    if (selected && !currentRows.some(row => row.key === selected.key)) children.push(createSection('Selected'), renderRows([selected], selectedKey));
    if (visibleCategories.has('region')) children.push(createSection('Nearby regions'), renderRows(context.nearbyRegions.map(region => resultForRegion(region, planet)), selectedKey));
    if (visibleCategories.has('feature')) children.push(createSection('Features'), renderRows(context.nearbyFeatures.map(feature => resultForFeature(feature, new Map(planet.regions.map(region => [region.id, region.name])))), selectedKey));
    tree.replaceChildren(...children); count.textContent = `${planet.continents.length} continents · ${planet.oceans.length} oceans · ${planet.regions.length.toLocaleString()} regions`;
  };
  search.addEventListener('input', render); let lastWorld = store.getState().world; let lastGraph = store.getState().graph; let lastSelection = selectionKey(store.getState().selection); let lastContextKey = '';
  store.subscribeDomains(['world', 'graph', 'selection', 'camera'], state => { const planet = state.world?.planet; if (planet && (indexedPlanet !== planet || !spatialIndex)) { indexedPlanet = planet; spatialIndex = worldSpatialIndexFor(planet); } const nextContextKey = planet && spatialIndex ? navigationContextKey(planet, state.camera, spatialIndex) : ''; const nextSelection = selectionKey(state.selection); if (state.world === lastWorld && state.graph === lastGraph && nextSelection === lastSelection && nextContextKey === lastContextKey) return; lastWorld = state.world; lastGraph = state.graph; lastSelection = nextSelection; lastContextKey = nextContextKey; render(); });
  render();
}
