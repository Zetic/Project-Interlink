import { installMapRenderer } from './map/mapRenderer.js';
import { installMapOverlayRenderer } from './map/mapOverlayRenderer.js';
import { installMapRuntimePresentation } from './map/mapRuntimePresentation.js';
import { installRuntimeController } from './runtime/runtimeController.js';
import { AppStore, type AppState } from './state/appState.js';
import { generateWorld } from './world/generateWorld.js';
import { installDebugPanel } from './ui/debugPanel.js';
import { installInspectorPanel } from './ui/inspectorPanel.js';
import { installNavigationPanel } from './ui/navigationPanel.js';
import { installNodeCatalogPanel } from './ui/nodeCatalogPanel.js';
import { renderWorkspaceShell } from './ui/workspaceShell.js';

const store = new AppStore();
function elementById<T extends HTMLElement>(id: string): T | null { return document.getElementById(id) as T | null; }
function resolveSeed(): string { const input = elementById<HTMLInputElement>('seed-input'); const requested = input?.value.trim(); return requested || String(Math.floor(Math.random() * 1_000_000_000)); }

function renderBreadcrumbs(state: Readonly<AppState>): void {
  const breadcrumbs = elementById<HTMLElement>('ws-breadcrumbs'); const planet = state.world?.planet; if (!breadcrumbs || !planet) return; const labels = [planet.name]; const selection = state.selection;
  const appendRegion = (region: (typeof planet.regions)[number] | undefined): void => { if (!region) return; const parent = region.parentKind === 'continent' ? planet.continents.find(candidate => candidate.id === region.parentId) : planet.oceans.find(candidate => candidate.id === region.parentId); if (parent) labels.push(parent.name); labels.push(region.name); };
  if (selection.type === 'continent') labels.push(planet.continents.find(continent => continent.id === selection.continentId)?.name ?? selection.continentId);
  else if (selection.type === 'ocean') labels.push(planet.oceans.find(ocean => ocean.id === selection.oceanId)?.name ?? selection.oceanId);
  else if (selection.type === 'region') appendRegion(planet.regions.find(region => region.id === selection.regionId));
  else if (selection.type === 'resource') { const resource = planet.resourceNodes.find(node => node.id === selection.resourceNodeId); appendRegion(resource ? planet.regions.find(candidate => candidate.id === resource.regionId) : undefined); labels.push(resource?.name ?? selection.resourceNodeId); }
  else if (selection.type === 'mechanical') labels.push(state.graph.nodes.find(node => node.id === selection.mechanicalNodeId)?.label ?? selection.mechanicalNodeId);
  breadcrumbs.replaceChildren(); labels.forEach((label, index) => { if (index > 0) { const separator = document.createElement('span'); separator.className = 'ws-breadcrumb-sep'; separator.textContent = '›'; breadcrumbs.appendChild(separator); } const item = document.createElement('span'); item.className = index === labels.length - 1 ? 'ws-breadcrumb--active' : 'ws-breadcrumb'; item.textContent = label; breadcrumbs.appendChild(item); });
}

function enterPlayerWorkspace(): void {
  const seed = resolveSeed(); const world = generateWorld(seed); const landing = elementById<HTMLElement>('landing-screen'); const playerView = elementById<HTMLElement>('player-view'); const main = elementById<HTMLElement>('ws-main'); if (!playerView || !main) return;
  landing?.remove(); playerView.style.removeProperty('display'); const root = renderWorkspaceShell(main, { title: `${world.planet.name} · Planet Map`, subtitle: `Seed ${world.planet.seed} · Generator v${world.planet.generatorVersion} · ${world.planet.regions.length.toLocaleString()} regions · ${world.planet.resourceNodes.length.toLocaleString()} natural Features` });
  const runtime = installRuntimeController(store);
  installNavigationPanel(root, store); installNodeCatalogPanel(root, store); installInspectorPanel(root, store); installDebugPanel(root, store, runtime); installMapRenderer(root, store); installMapOverlayRenderer(root, store); installMapRuntimePresentation(root, store); store.subscribeDomains(['world', 'graph', 'selection'], renderBreadcrumbs); store.setWorld(world);
}
function installLandingScreen(): void { elementById<HTMLButtonElement>('generate-btn')?.addEventListener('click', enterPlayerWorkspace); elementById<HTMLInputElement>('seed-input')?.addEventListener('keydown', event => { if (event.key === 'Enter') enterPlayerWorkspace(); }); }
document.addEventListener('DOMContentLoaded', installLandingScreen);
