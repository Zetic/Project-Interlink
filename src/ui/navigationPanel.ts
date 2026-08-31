import type { AppStore } from '../state/appState.js';
import type { MapSelection, Planet, Region, ResourceNode } from '../world/types.js';

interface NavigationRow {
  key: string;
  label: string;
  depth: number;
  expandable: boolean;
  parentKey: string | null;
  selection: MapSelection;
}

function selectionKey(selection: MapSelection): string {
  if (selection.type === 'planet') return 'planet';
  if (selection.type === 'region') return `region:${selection.regionId}`;
  return `resource:${selection.resourceNodeId}`;
}

function resourceNodesForRegion(planet: Planet, region: Region): ResourceNode[] {
  const ids = new Set(region.resourceNodeIds);
  return planet.resourceNodes.filter(node => ids.has(node.id));
}

function buildRows(planet: Planet): NavigationRow[] {
  const rows: NavigationRow[] = [{
    key: 'planet',
    label: planet.name,
    depth: 0,
    expandable: true,
    parentKey: null,
    selection: { type: 'planet' },
  }];

  for (const region of planet.regions) {
    const regionKey = `region:${region.id}`;
    rows.push({
      key: regionKey,
      label: region.name,
      depth: 1,
      expandable: region.resourceNodeIds.length > 0,
      parentKey: 'planet',
      selection: { type: 'region', regionId: region.id },
    });
    for (const resource of resourceNodesForRegion(planet, region)) {
      rows.push({
        key: `resource:${resource.id}`,
        label: resource.name,
        depth: 2,
        expandable: false,
        parentKey: regionKey,
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
  onExpand: (key: string) => void,
  onSelect: (selection: MapSelection) => void,
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'ws-navigation-row-wrap';

  const element = document.createElement('div');
  element.className = `ws-navigation-row${row.key === selectedKey ? ' ws-navigation-row--selected' : ''}`;
  element.style.setProperty('--ws-navigation-depth', String(row.depth));

  if (row.expandable) {
    const expand = document.createElement('button');
    expand.className = 'ws-navigation-expand';
    expand.type = 'button';
    expand.textContent = expandedKeys.has(row.key) ? '▾' : '▸';
    expand.setAttribute('aria-label', `${expandedKeys.has(row.key) ? 'Collapse' : 'Expand'} ${row.label}`);
    expand.addEventListener('click', event => {
      event.stopPropagation();
      onExpand(row.key);
    });
    element.appendChild(expand);
  } else {
    const spacer = document.createElement('span');
    spacer.className = 'ws-navigation-expand-spacer';
    element.appendChild(spacer);
  }

  const label = document.createElement('button');
  label.className = 'ws-navigation-label';
  label.type = 'button';
  label.textContent = row.label;
  label.addEventListener('click', () => onSelect(row.selection));
  element.appendChild(label);
  wrapper.appendChild(element);
  return wrapper;
}

export function installNavigationPanel(root: HTMLElement, store: AppStore): void {
  const tree = root.querySelector<HTMLElement>('#ws-navigation-tree');
  const search = root.querySelector<HTMLInputElement>('#ws-navigation-search');
  const count = root.querySelector<HTMLElement>('#ws-navigation-match-count');
  const expandAll = root.querySelector<HTMLButtonElement>('#ws-navigation-expand-all');
  const collapseAll = root.querySelector<HTMLButtonElement>('#ws-navigation-collapse-all');
  if (!tree || !search || !count || !expandAll || !collapseAll) return;

  const expandedKeys = new Set<string>(['planet']);

  const render = (): void => {
    const state = store.getState();
    if (!state.world) {
      tree.textContent = 'No world generated.';
      count.textContent = '';
      return;
    }

    const planet = state.world.planet;
    const query = search.value.trim().toLowerCase();
    const rows = buildRows(planet);
    const matches = query ? rows.filter(row => row.label.toLowerCase().includes(query)) : rows;
    const included = query
      ? new Set(matches.flatMap(row => [row.key, ...(row.parentKey ? [row.parentKey] : []), 'planet']))
      : null;
    const selectedKey = selectionKey(state.selection);
    const visibleRows = rows.filter(row => {
      if (included) return included.has(row.key);
      return rowIsVisible(row, expandedKeys);
    });

    tree.replaceChildren(...visibleRows.map(row => createNavigationRow(
      row,
      selectedKey,
      query ? new Set(['planet', ...planet.regions.map(region => `region:${region.id}`)]) : expandedKeys,
      key => {
        if (expandedKeys.has(key)) expandedKeys.delete(key);
        else expandedKeys.add(key);
        render();
      },
      selection => store.setSelection(selection),
    )));
    count.textContent = query ? `${matches.length} match${matches.length === 1 ? '' : 'es'}` : `${rows.length} map objects`;
  };

  search.addEventListener('input', render);
  expandAll.addEventListener('click', () => {
    const planet = store.getState().world?.planet;
    if (!planet) return;
    expandedKeys.add('planet');
    for (const region of planet.regions) expandedKeys.add(`region:${region.id}`);
    render();
  });
  collapseAll.addEventListener('click', () => {
    expandedKeys.clear();
    render();
  });

  store.subscribe(render);
}
