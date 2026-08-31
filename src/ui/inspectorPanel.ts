import type { AppStore } from '../state/appState.js';
import { resourceDefinitionById } from '../world/resources.js';
import type { Planet, Region, ResourceNode } from '../world/types.js';

function addRow(container: HTMLElement, label: string, value: string): void {
  const row = document.createElement('div');
  row.className = 'ws-ins-row';
  const strong = document.createElement('b');
  strong.textContent = `${label}: `;
  row.append(strong, document.createTextNode(value));
  container.appendChild(row);
}

function renderPlanet(container: HTMLElement, planet: Planet): void {
  const type = document.createElement('div');
  type.className = 'ws-ins-type';
  type.textContent = 'PLANET';
  container.appendChild(type);
  addRow(container, 'Name', planet.name);
  addRow(container, 'Seed', planet.seed);
  addRow(container, 'Map', `${planet.width} × ${planet.height}`);
  addRow(container, 'Regions', String(planet.regions.length));
  addRow(container, 'Resource nodes', String(planet.resourceNodes.length));
}

function renderRegion(container: HTMLElement, planet: Planet, region: Region): void {
  const type = document.createElement('div');
  type.className = 'ws-ins-type';
  type.textContent = 'REGION';
  container.appendChild(type);
  addRow(container, 'Name', region.name);
  addRow(container, 'ID', region.id);
  addRow(container, 'Bounds', `${region.bounds.x.toFixed(0)}, ${region.bounds.y.toFixed(0)} · ${region.bounds.width.toFixed(0)} × ${region.bounds.height.toFixed(0)}`);
  addRow(container, 'Resource nodes', String(region.resourceNodeIds.length));
  addRow(container, 'Planet', planet.name);
}

function renderResource(container: HTMLElement, planet: Planet, resource: ResourceNode): void {
  const definition = resourceDefinitionById(resource.resourceId);
  const region = planet.regions.find(candidate => candidate.id === resource.regionId);
  const type = document.createElement('div');
  type.className = 'ws-ins-type';
  type.textContent = 'RESOURCE';
  container.appendChild(type);
  addRow(container, 'Name', resource.name);
  addRow(container, 'Resource', definition?.name ?? resource.resourceId);
  addRow(container, 'Category', definition?.category ?? 'unknown');
  addRow(container, 'Region', region?.name ?? resource.regionId);
  addRow(container, 'Coordinates', `${resource.position.x.toFixed(2)}, ${resource.position.y.toFixed(2)}`);
}

export function installInspectorPanel(root: HTMLElement, store: AppStore): void {
  const container = root.querySelector<HTMLElement>('#ws-map-inspector-body');
  if (!container) return;

  store.subscribe(state => {
    container.replaceChildren();
    const planet = state.world?.planet;
    if (!planet) {
      container.textContent = 'Generate a world to inspect it.';
      return;
    }

    const selection = state.selection;
    if (selection.type === 'planet') {
      renderPlanet(container, planet);
      return;
    }

    if (selection.type === 'region') {
      const region = planet.regions.find(candidate => candidate.id === selection.regionId);
      if (region) renderRegion(container, planet, region);
      else container.textContent = 'Selected region is unavailable.';
      return;
    }

    const resource = planet.resourceNodes.find(candidate => candidate.id === selection.resourceNodeId);
    if (resource) renderResource(container, planet, resource);
    else container.textContent = 'Selected resource is unavailable.';
  });
}
