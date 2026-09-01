import { APPARATUS_DEFINITIONS, apparatusDefinitionById } from '../apparatus/definitions.js';
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
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox'; input.checked = true; input.value = category;
    input.addEventListener('change', () => { if (input.checked) visible.add(category); else visible.delete(category); render(); });
    label.append(input, document.createTextNode(` ${category[0].toUpperCase()}${category.slice(1)}`));
    filters.appendChild(label);
  }

  const render = (): void => {
    const query = search.value.trim().toLowerCase();
    const matches = APPARATUS_DEFINITIONS.filter(definition => visible.has(definition.category)
      && (!query || query.split(/\s+/).every(token => searchable(definition).includes(token))));
    count.textContent = query ? `${matches.length} match${matches.length === 1 ? '' : 'es'}` : '';
    tree.replaceChildren();
    for (const category of categories) {
      const definitions = matches.filter(definition => definition.category === category);
      if (!definitions.length) continue;
      const group = document.createElement('div');
      group.className = 'ws-node-catalog-group';
      const heading = document.createElement('div');
      heading.className = 'ws-node-catalog-category';
      const headingDot = document.createElement('span');
      headingDot.className = `ws-navigation-category ws-navigation-category--${category}`;
      heading.append(headingDot, document.createTextNode(category.toUpperCase()));
      group.appendChild(heading);
      for (const definition of definitions) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'ws-node-catalog-entry'; button.dataset.nodeDefinitionId = definition.id;
        const dot = document.createElement('span'); dot.className = `ws-navigation-category ws-navigation-category--${category}`;
        const text = document.createElement('span');
        const name = document.createElement('strong'); name.textContent = definition.label;
        const description = document.createElement('small'); description.textContent = definition.description;
        text.append(name, description); button.append(dot, text);
        button.addEventListener('click', () => { store.setPlacement(definition.id); store.setInteractionNotice(`Place ${definition.label}.`); });
        group.appendChild(button);
      }
      tree.appendChild(group);
    }
  };

  search.addEventListener('input', render);
  let lastStatusKey = '';
  store.subscribeDomains(['interaction', 'camera'], state => {
    const placement = state.interaction.placementDefinitionId;
    const pending = state.interaction.pendingConnection;
    const scaleState = placement ? (state.camera.zoom < MECHANICAL_PLACEMENT_MIN_ZOOM ? 'far' : 'ready') : '';
    const statusKey = `${placement ?? ''}|${pending?.nodeId ?? ''}:${pending?.portId ?? ''}|${state.interaction.notice ?? ''}|${scaleState}`;
    if (statusKey === lastStatusKey) return;
    lastStatusKey = statusKey;
    if (placement) {
      const definition = apparatusDefinitionById(placement);
      const label = definition?.label ?? placement;
      status.textContent = state.camera.zoom < MECHANICAL_PLACEMENT_MIN_ZOOM
        ? `Zoom in to engineering scale to place ${label}.`
        : `Click the map to place ${label}. Esc cancels.`;
    } else if (pending) status.textContent = 'Select a compatible target port. Esc cancels.';
    else status.textContent = state.interaction.notice ?? 'Select a node to place.';
  });
  render();
}
