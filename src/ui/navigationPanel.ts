import type { GraphState, MechanicalNode } from '../graph/types.js';
import type { AppStore } from '../state/appState.js';
import { createWorldSpatialIndex, type WorldSpatialIndex } from '../world/spatialIndex.js';
import type { MapCameraState, MapSelection, Planet, Region, ResourceNode } from '../world/types.js';

export type NavigationCategory = 'planet' | 'region' | 'feature' | 'engineering';

export interface NavigationResult {
  key: string;
  label: string;
  detail: string;
  category: NavigationCategory;
  selection: MapSelection;
}

export interface NavigationContext {
  currentRegion: Region | null;
  nearbyRegions: Region[];
  nearbyFeatures: ResourceNode[];
}

export interface NavigationSearchResults {
  results: NavigationResult[];
  totalMatches: number;
}

export const NAV_SEARCH_RESULT_LIMIT = 60;
export const NAV_NEARBY_REGION_LIMIT = 8;
export const NAV_NEARBY_FEATURE_LIMIT = 12;

const CATEGORY_LABELS: Record<NavigationCategory, string> = {
  planet: 'Planet', region: 'Regions', feature: 'Features', engineering: 'Engineering',
};

function selectionKey(selection: MapSelection): string {
  if (selection.type === 'planet') return 'planet';
  if (selection.type === 'region') return `region:${selection.regionId}`;
  if (selection.type === 'resource') return `resource:${selection.resourceNodeId}`;
  return `mechanical:${selection.mechanicalNodeId}`;
}

function resultForRegion(region: Region, planet: Planet): NavigationResult {
  const landmass = planet.landmasses.find(candidate => candidate.id === region.landmassId);
  return {
    key: `region:${region.id}`, label: region.name, detail: landmass?.name ?? 'Land region', category: 'region',
    selection: { type: 'region', regionId: region.id },
  };
}

function resultForFeature(feature: ResourceNode, planet: Planet): NavigationResult {
  const region = planet.regions.find(candidate => candidate.id === feature.regionId);
  return {
    key: `resource:${feature.id}`, label: feature.name, detail: region?.name ?? feature.regionId, category: 'feature',
    selection: { type: 'resource', resourceNodeId: feature.id },
  };
}

function resultForMechanical(node: MechanicalNode): NavigationResult {
  return {
    key: `mechanical:${node.id}`, label: node.label, detail: node.category === 'apparatus' ? 'Apparatus' : 'Storage', category: 'engineering',
    selection: { type: 'mechanical', mechanicalNodeId: node.id },
  };
}

export function navigationContext(planet: Planet, camera: MapCameraState, index = createWorldSpatialIndex(planet)): NavigationContext {
  const point = { x: camera.centerX, y: camera.centerY };
  const currentRegion = index.regionContaining(point);
  const nearbyRegions = index.nearbyRegions(point, NAV_NEARBY_REGION_LIMIT + 1)
    .filter(region => region.id !== currentRegion?.id)
    .slice(0, NAV_NEARBY_REGION_LIMIT);
  const currentFeatureIds = new Set(currentRegion?.resourceNodeIds ?? []);
  const regionalFeatures = currentRegion
    ? index.resourceNodesIntersecting(currentRegion.bounds)
      .filter(feature => currentFeatureIds.has(feature.id))
      .sort((left, right) => Math.hypot(left.position.x - point.x, left.position.y - point.y) - Math.hypot(right.position.x - point.x, right.position.y - point.y))
    : index.nearbyFeatures(point, NAV_NEARBY_FEATURE_LIMIT);
  return { currentRegion, nearbyRegions, nearbyFeatures: regionalFeatures.slice(0, NAV_NEARBY_FEATURE_LIMIT) };
}

export function searchWorldNavigation(
  planet: Planet,
  graph: GraphState,
  queryInput: string,
  categories: ReadonlySet<NavigationCategory>,
  limit = NAV_SEARCH_RESULT_LIMIT,
): NavigationSearchResults {
  const query = queryInput.trim().toLocaleLowerCase();
  if (!query) return { results: [], totalMatches: 0 };
  const all: NavigationResult[] = [];
  if (categories.has('planet') && planet.name.toLocaleLowerCase().includes(query)) {
    all.push({ key: 'planet', label: planet.name, detail: 'Planet', category: 'planet', selection: { type: 'planet' } });
  }
  if (categories.has('region')) {
    for (const region of planet.regions) if (region.name.toLocaleLowerCase().includes(query)) all.push(resultForRegion(region, planet));
  }
  if (categories.has('feature')) {
    for (const feature of planet.resourceNodes) if (feature.name.toLocaleLowerCase().includes(query)) all.push(resultForFeature(feature, planet));
  }
  if (categories.has('engineering')) {
    for (const node of graph.nodes) if (node.label.toLocaleLowerCase().includes(query)) all.push(resultForMechanical(node));
  }
  all.sort((left, right) => left.label.localeCompare(right.label) || left.key.localeCompare(right.key));
  return { results: all.slice(0, Math.max(0, limit)), totalMatches: all.length };
}

function createSection(label: string, detail?: string): HTMLElement {
  const section = document.createElement('div');
  section.className = 'ws-navigation-section-title';
  section.textContent = label;
  if (detail) {
    const value = document.createElement('span'); value.textContent = detail; section.appendChild(value);
  }
  return section;
}

function createNavigationRow(row: NavigationResult, selectedKey: string, onSelect: (selection: MapSelection) => void): HTMLElement {
  const element = document.createElement('button');
  element.className = 'ws-navigation-context-row';
  element.type = 'button';
  if (row.key === selectedKey) element.classList.add('ws-navigation-context-row--active');
  const category = document.createElement('span');
  category.className = `ws-navigation-category ws-navigation-category--${row.category}`;
  const content = document.createElement('span'); content.className = 'ws-navigation-context-copy';
  const label = document.createElement('span'); label.className = 'ws-navigation-label'; label.textContent = row.label;
  const detail = document.createElement('span'); detail.className = 'ws-navigation-context-detail'; detail.textContent = row.detail;
  content.append(label, detail); element.append(category, content);
  element.addEventListener('click', () => onSelect(row.selection));
  return element;
}

function selectedResult(planet: Planet, graph: GraphState, selection: MapSelection): NavigationResult | null {
  if (selection.type === 'planet') return null;
  if (selection.type === 'region') {
    const region = planet.regions.find(candidate => candidate.id === selection.regionId);
    return region ? resultForRegion(region, planet) : null;
  }
  if (selection.type === 'resource') {
    const feature = planet.resourceNodes.find(candidate => candidate.id === selection.resourceNodeId);
    return feature ? resultForFeature(feature, planet) : null;
  }
  const node = graph.nodes.find(candidate => candidate.id === selection.mechanicalNodeId);
  return node ? resultForMechanical(node) : null;
}

export function installNavigationPanel(root: HTMLElement, store: AppStore): void {
  const tree = root.querySelector<HTMLElement>('#ws-navigation-tree');
  const search = root.querySelector<HTMLInputElement>('#ws-navigation-search');
  const count = root.querySelector<HTMLElement>('#ws-navigation-match-count');
  const filters = root.querySelector<HTMLElement>('#ws-navigation-filters .ws-navigation-filters');
  if (!tree || !search || !count || !filters) return;

  const visibleCategories = new Set<NavigationCategory>(['planet', 'region', 'feature', 'engineering']);
  let indexedPlanet: Planet | null = null;
  let spatialIndex: WorldSpatialIndex | null = null;
  for (const category of ['planet', 'region', 'feature', 'engineering'] as const) {
    const label = document.createElement('label');
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = true; input.value = category;
    input.addEventListener('change', () => { if (input.checked) visibleCategories.add(category); else visibleCategories.delete(category); render(); });
    label.append(input, document.createTextNode(` ${CATEGORY_LABELS[category]}`)); filters.appendChild(label);
  }

  const renderRows = (rows: readonly NavigationResult[], selectedKey: string): DocumentFragment => {
    const fragment = document.createDocumentFragment();
    for (const row of rows) fragment.appendChild(createNavigationRow(row, selectedKey, selection => store.focusSelection(selection)));
    return fragment;
  };

  const render = (): void => {
    const state = store.getState();
    if (!state.world) { tree.textContent = 'No world generated.'; count.textContent = ''; return; }
    const planet = state.world.planet;
    if (indexedPlanet !== planet || !spatialIndex) { indexedPlanet = planet; spatialIndex = createWorldSpatialIndex(planet); }
    const selectedKey = selectionKey(state.selection);
    const query = search.value.trim();
    if (query) {
      const matches = searchWorldNavigation(planet, state.graph, query, visibleCategories);
      tree.replaceChildren(createSection('Search results'), renderRows(matches.results, selectedKey));
      count.textContent = matches.totalMatches > matches.results.length
        ? `Showing ${matches.results.length} of ${matches.totalMatches} matches`
        : `${matches.totalMatches} match${matches.totalMatches === 1 ? '' : 'es'}`;
      return;
    }

    const context = navigationContext(planet, state.camera, spatialIndex);
    const landmass = context.currentRegion ? planet.landmasses.find(candidate => candidate.id === context.currentRegion?.landmassId) : null;
    const currentRows: NavigationResult[] = context.currentRegion
      ? [resultForRegion(context.currentRegion, planet)]
      : [{ key: 'planet', label: planet.name, detail: 'Ocean / planetary view', category: 'planet', selection: { type: 'planet' } }];
    const selected = selectedResult(planet, state.graph, state.selection);
    const children: Node[] = [
      createSection('Current view', landmass?.name), renderRows(currentRows, selectedKey),
    ];
    if (selected && selected.key !== currentRows[0]?.key) children.push(createSection('Selected'), renderRows([selected], selectedKey));
    if (visibleCategories.has('region')) children.push(createSection('Nearby regions'), renderRows(context.nearbyRegions.map(region => resultForRegion(region, planet)), selectedKey));
    if (visibleCategories.has('feature')) children.push(createSection('Features'), renderRows(context.nearbyFeatures.map(feature => resultForFeature(feature, planet)), selectedKey));
    tree.replaceChildren(...children);
    count.textContent = `${planet.regions.length.toLocaleString()} regions · ${planet.resourceNodes.length.toLocaleString()} features`;
  };

  search.addEventListener('input', render);
  let lastWorld = store.getState().world;
  let lastGraph = store.getState().graph;
  let lastSelection = selectionKey(store.getState().selection);
  let lastContextRegionId: string | null = null;
  store.subscribeDomains(['world', 'graph', 'selection', 'camera'], state => {
    const planet = state.world?.planet;
    if (planet && (indexedPlanet !== planet || !spatialIndex)) { indexedPlanet = planet; spatialIndex = createWorldSpatialIndex(planet); }
    const contextRegionId = planet && spatialIndex ? spatialIndex.regionContaining({ x: state.camera.centerX, y: state.camera.centerY })?.id ?? null : null;
    const nextSelection = selectionKey(state.selection);
    if (state.world === lastWorld && state.graph === lastGraph && nextSelection === lastSelection && contextRegionId === lastContextRegionId) return;
    lastWorld = state.world; lastGraph = state.graph; lastSelection = nextSelection; lastContextRegionId = contextRegionId; render();
  });
  render();
}
