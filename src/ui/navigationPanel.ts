import type { AppStore } from '../state/appState.js';
import type { MapSelection, Planet, Region, ResourceNode } from '../world/types.js';

type NavigationCategory = 'planet' | 'region' | 'feature';

interface NavigationRow {
  key: string;
  label: string;
  depth: number;
  category: NavigationCategory;
  expandable: boolean;
  parentKey: string | null;
  selection: MapSelection;
}

const CATEGORY_LABELS: Record<NavigationCategory, string> = {
  planet: 'Planet',
  region: 'Region',
  feature: 'Feature',
};

function selectionKey(selection: MapSelection): string {
  if (selection.type === 'planet') return 'planet';
  if (selection.type === 'region') return `region:${selection.regionId}`;
  if (selection.type === 'resource') return `resource:${selection.resourceNodeId}`;
  return `mechanical:${selection.mechanicalNodeId}`;
}

function resourceNodesForRegion(planet: Planet, region: Region): ResourceNode[] {
  const ids = new Set(region.resourceNodeIds);
  return planet.resourceNodes.filter(node => ids.has(node.id));
}

function buildRows(planet: Planet): NavigationRow[] {
  const rows: NavigationRow[] = [{
    key: 'planet', label: planet.name, depth: 0, category: 'planet', expandable: true,
    parentKey: null, selection: { type: 'planet' },
  }];
  for (const region of planet.regions) {
    const regionKey = `region:${region.id}`;
    rows.push({
      key: regionKey, label: region.name, depth: 1, category: 'region',
      expandable: region.resourceNodeIds.length > 0, parentKey: 'planet',
      selection: { type: 'region', regionId: region.id },
    });
    for (const resource of resourceNodesForRegion(planet, region)) {
      rows.push({
        key: `resource:${resource.id}`, label: resource.name, depth: 2, category: 'feature',
        expandable: false, parentKey: regionKey,
        selection: { type: 'resource', resourceNodeId: resource.id },
      });
    }
  }
  return rows;
}

function rowIsVisible(row: NavigationRow, expandedKeys: Set<string>): boolean {
  if (!row.parentKey) return true;
  if (!expandedKeys.has(row.parentKey)) return false;
  if (row.depth < 2) return true;
  return expandedKeys.has('planet');
}

function createNavigationRow(
  row: NavigationRow,
  selectedKey: string,
  expandedKeys: Set<string>,
  matchKeys: Set<string>,
  contextKeys: Set<string>,
  onExpand: (key: string) => void,
  onSelect: (selection: MapSelection) => void,
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'ws-navigation-row-wrap';
  const element = document.createElement('div');
  element.className = 'ws-navigation-row';
  if (row.key === selectedKey) element.classList.add('ws-navigation-row--active');
  if (matchKeys.has(row.key)) element.classList.add('ws-navigation-row--match');
  else if (contextKeys.has(row.key)) element.classList.add('ws-navigation-row--context');
  element.style.setProperty('--ws-navigation-depth', String(row.depth));

  if (row.expandable) {
    const expand = document.createElement('button');
    expand.className = 'ws-navigation-expand';
    expand.type = 'button';
    expand.textContent = expandedKeys.has(row.key) ? '▾' : '▸';
    expand.setAttribute('aria-label', `${expandedKeys.has(row.key) ? 'Collapse' : 'Expand'} ${row.label}`);
    expand.addEventListener('click', event => { event.stopPropagation(); onExpand(row.key); });
    element.appendChild(expand);
  } else {
    const spacer = document.createElement('span');
    spacer.className = 'ws-navigation-expand-spacer';
    element.appendChild(spacer);
  }

  const entry = document.createElement('button');
  entry.className = 'ws-navigation-entry';
  entry.type = 'button';
  const category = document.createElement('span');
  category.className = `ws-navigation-category ws-navigation-category--${row.category}`;
  const label = document.createElement('span');
  label.className = 'ws-navigation-label';
  label.textContent = row.label;
  entry.append(category, label);
  if (matchKeys.has(row.key) || contextKeys.has(row.key)) {
    const state = document.createElement('span');
    state.className = 'ws-navigation-state';
    state.textContent = matchKeys.has(row.key) ? 'MATCH' : 'CONTEXT';
    entry.appendChild(state);
  }
  entry.addEventListener('click', () => onSelect(row.selection));
  element.appendChild(entry);
  wrapper.appendChild(element);
  return wrapper;
}

export function installNavigationPanel(root: HTMLElement, store: AppStore): void {
  const tree = root.querySelector<HTMLElement>('#ws-navigation-tree');
  const search = root.querySelector<HTMLInputElement>('#ws-navigation-search');
  const count = root.querySelector<HTMLElement>('#ws-navigation-match-count');
  const filters = root.querySelector<HTMLElement>('#ws-navigation-filters .ws-navigation-filters');
  const expandAll = root.querySelector<HTMLButtonElement>('#ws-navigation-expand-all');
  const collapseAll = root.querySelector<HTMLButtonElement>('#ws-navigation-collapse-all');
  if (!tree || !search || !count || !filters || !expandAll || !collapseAll) return;

  const expandedKeys = new Set<string>(['planet']);
  const visibleCategories = new Set<NavigationCategory>(['planet', 'region', 'feature']);

  for (const category of ['planet', 'region', 'feature'] as const) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox'; input.checked = true; input.value = category;
    input.addEventListener('change', () => {
      if (input.checked) visibleCategories.add(category); else visibleCategories.delete(category);
      render();
    });
    label.append(input, document.createTextNode(` ${CATEGORY_LABELS[category]}`));
    filters.appendChild(label);
  }

  const render = (): void => {
    const state = store.getState();
    if (!state.world) { tree.textContent = 'No world generated.'; count.textContent = ''; return; }
    const planet = state.world.planet;
    const query = search.value.trim().toLowerCase();
    const rows = buildRows(planet);
    const directMatches = query
      ? rows.filter(row => visibleCategories.has(row.category) && row.label.toLowerCase().includes(query))
      : [];
    const matchKeys = new Set(directMatches.map(row => row.key));
    const contextKeys = new Set<string>();
    if (query) {
      for (const match of directMatches) {
        if (match.parentKey) contextKeys.add(match.parentKey);
        if (match.depth >= 2) contextKeys.add('planet');
      }
    }
    const selectedKey = selectionKey(state.selection);
    const effectiveExpanded = query
      ? new Set(['planet', ...planet.regions.map(region => `region:${region.id}`)])
      : expandedKeys;
    const visibleRows = rows.filter(row => {
      if (query) return matchKeys.has(row.key) || contextKeys.has(row.key);
      return visibleCategories.has(row.category) && rowIsVisible(row, effectiveExpanded);
    });
    tree.replaceChildren(...visibleRows.map(row => createNavigationRow(
      row, selectedKey, effectiveExpanded, matchKeys, contextKeys,
      key => { if (expandedKeys.has(key)) expandedKeys.delete(key); else expandedKeys.add(key); render(); },
      selection => store.focusSelection(selection),
    )));
    count.textContent = query ? `${directMatches.length} match${directMatches.length === 1 ? '' : 'es'}` : '';
  };

  search.addEventListener('input', render);
  expandAll.addEventListener('click', () => {
    const planet = store.getState().world?.planet; if (!planet) return;
    expandedKeys.add('planet');
    for (const region of planet.regions) expandedKeys.add(`region:${region.id}`);
    render();
  });
  collapseAll.addEventListener('click', () => { expandedKeys.clear(); render(); });
  let lastWorld = store.getState().world;
  let lastSelection = selectionKey(store.getState().selection);
  store.subscribe(state => {
    const nextSelection = selectionKey(state.selection);
    if (state.world === lastWorld && nextSelection === lastSelection) return;
    lastWorld = state.world; lastSelection = nextSelection; render();
  });
  render();
}
