import { APPARATUS_DEFINITIONS } from '../apparatus/definitions.js';
import { MECHANICAL_PLACEMENT_MIN_ZOOM } from '../map/camera/mapCamera.js';
import type { AppStore } from '../state/appState.js';

const categories = ['apparatus', 'container'] as const;

function searchable(definition: (typeof APPARATUS_DEFINITIONS)[number]): string {
  return [definition.label, definition.category, definition.description, ...definition.searchTerms].join(' ').toLowerCase();
}

export function installNodeCatalogPanel(root: HTMLElement, store: AppStore): void {
  const search = root.querySelector<HTMLInputElement>('#ws-node-catalog-search');
  const filters = root.querySelector<HTMLElement>('#ws-node-catalog-filters .ws-navigation-filters');
  const tree = root.querySelector<HTMLElement>('#ws-node-catalog-tree');
  const count = root.querySelector<HTMLElement>('#ws-node-catalog-match-count');
  const status = root.querySelector<HTMLElement>('#ws-node-catalog-status');
  if (!search || !filters || !tree || !count || !status) return;
  const visible = new Set<string>(categories);

  for (const category of categories) {
    const label = document.createElement('label'); const input = document.createElement('input'); input.type = 'checkbox'; input.checked = true; input.value = category;
    input.addEventListener('change', () => { if (input.checked) visible.add(category); else visible.delete(category); render(); });
    label.append(input, document.createTextNode(` ${category}`)); filters.appendChild(label);
  }

  const render = (): void => {
    const query = search.value.trim().toLowerCase();
    const matches = APPARATUS_DEFINITIONS.filter(definition => visible.has(definition.category) && (!query || query.split(/\s+/).every(token => searchable(definition).includes(token))));
    count.textContent = `${matches.length} constructible node${matches.length === 1 ? '' : 's'}`; tree.replaceChildren();
    for (const category of categories) {
      const definitions = matches.filter(definition => definition.category === category); if (!definitions.length) continue;
      const heading = document.createElement('div'); heading.className = 'ws-node-catalog-category'; heading.textContent = category.toUpperCase(); tree.appendChild(heading);
      for (const definition of definitions) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'ws-node-catalog-item'; button.dataset.nodeDefinitionId = definition.id;
        const name = document.createElement('strong'); name.textContent = definition.label; const description = document.createElement('span'); description.textContent = definition.description;
        button.append(name, description); button.addEventListener('click', () => { store.setPlacement(definition.id); store.setInteractionNotice(`Place ${definition.label} on the map.`); }); tree.appendChild(button);
      }
    }
  };

  search.addEventListener('input', render);
  store.subscribe(state => {
    const placement = state.interaction.placementDefinitionId;
    const pending = state.interaction.pendingConnection;
    if (placement) {
      status.textContent = state.camera.zoom < MECHANICAL_PLACEMENT_MIN_ZOOM
        ? `Placement armed: zoom to at least ${MECHANICAL_PLACEMENT_MIN_ZOOM.toLocaleString()}×.`
        : `Placement armed: click the map to place ${placement}. Esc cancels.`;
    } else if (pending) status.textContent = `Connection started at ${pending.nodeId}:${pending.portId}. Select a compatible target port.`;
    else status.textContent = state.interaction.notice ?? 'Select a node definition to begin placement.';
  });
  render();
}
