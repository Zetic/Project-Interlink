import { installMapRenderer } from './map/mapRenderer.js';
import { installMapRuntimePresentation } from './map/mapRuntimePresentation.js';
import { installRuntimeController } from './runtime/runtimeController.js';
import { AppStore } from './state/appState.js';
import { generateWorld } from './world/generateWorld.js';
import { installDebugPanel } from './ui/debugPanel.js';
import { installInspectorPanel } from './ui/inspectorPanel.js';
import { installNavigationPanel } from './ui/navigationPanel.js';
import { installNodeCatalogPanel } from './ui/nodeCatalogPanel.js';
import { renderWorkspaceShell } from './ui/workspaceShell.js';
const store = new AppStore();
function elementById(id) { return document.getElementById(id); }
function resolveSeed() { const input = elementById('seed-input'); const requested = input?.value.trim(); return requested || String(Math.floor(Math.random() * 1_000_000_000)); }
function renderBreadcrumbs(state) {
    const breadcrumbs = elementById('ws-breadcrumbs');
    const planet = state.world?.planet;
    if (!breadcrumbs || !planet)
        return;
    const labels = [planet.name];
    const selection = state.selection;
    if (selection.type === 'region')
        labels.push(planet.regions.find(region => region.id === selection.regionId)?.name ?? selection.regionId);
    else if (selection.type === 'resource') {
        const resource = planet.resourceNodes.find(node => node.id === selection.resourceNodeId);
        const region = resource ? planet.regions.find(candidate => candidate.id === resource.regionId) : null;
        if (region)
            labels.push(region.name);
        labels.push(resource?.name ?? selection.resourceNodeId);
    }
    else if (selection.type === 'mechanical')
        labels.push(state.graph.nodes.find(node => node.id === selection.mechanicalNodeId)?.label ?? selection.mechanicalNodeId);
    breadcrumbs.replaceChildren();
    labels.forEach((label, index) => { if (index > 0) {
        const separator = document.createElement('span');
        separator.className = 'ws-breadcrumb-sep';
        separator.textContent = '›';
        breadcrumbs.appendChild(separator);
    } const item = document.createElement('span'); item.className = index === labels.length - 1 ? 'ws-breadcrumb--active' : 'ws-breadcrumb'; item.textContent = label; breadcrumbs.appendChild(item); });
}
function enterPlayerWorkspace() {
    const seed = resolveSeed();
    const world = generateWorld(seed);
    const landing = elementById('landing-screen');
    const playerView = elementById('player-view');
    const main = elementById('ws-main');
    if (!playerView || !main)
        return;
    landing?.remove();
    playerView.style.removeProperty('display');
    const root = renderWorkspaceShell(main, { title: `${world.planet.name} · Planet Map`, subtitle: `Seed ${world.planet.seed} · Generator v${world.planet.generatorVersion} · ${world.planet.regions.length.toLocaleString()} regions · ${world.planet.resourceNodes.length.toLocaleString()} natural Features` });
    const runtime = installRuntimeController(store);
    installNavigationPanel(root, store);
    installNodeCatalogPanel(root, store);
    installInspectorPanel(root, store);
    installDebugPanel(root, store, runtime);
    installMapRenderer(root, store);
    installMapRuntimePresentation(root, store);
    store.subscribeDomains(['world', 'graph', 'selection'], renderBreadcrumbs);
    store.setWorld(world);
}
function installLandingScreen() { elementById('generate-btn')?.addEventListener('click', enterPlayerWorkspace); elementById('seed-input')?.addEventListener('keydown', event => { if (event.key === 'Enter')
    enterPlayerWorkspace(); }); }
document.addEventListener('DOMContentLoaded', installLandingScreen);
