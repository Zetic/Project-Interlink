import { apparatusDefinitionById } from '../apparatus/definitions.js';
import { disconnectConnection, removeMechanicalNode } from '../graph/graphCommands.js';
import { connectionsForNode, mechanicalNodeById } from '../graph/graphQueries.js';
import { resourceDefinitionById } from '../world/resources.js';
import { EARTH_SCALE_METERS_PER_WORLD_UNIT, formatPhysicalDistance, worldUnitsToMeters } from '../world/scale.js';
function addRow(container, label, value) {
    const row = document.createElement('div');
    row.className = 'ws-ins-row';
    const strong = document.createElement('b');
    strong.textContent = `${label}: `;
    row.append(strong, document.createTextNode(value));
    container.appendChild(row);
}
function typeLabel(container, value) { const type = document.createElement('div'); type.className = 'ws-ins-type'; type.textContent = value; container.appendChild(type); }
function renderPlanet(container, planet) {
    typeLabel(container, 'PLANET');
    addRow(container, 'Name', planet.name);
    addRow(container, 'Seed', planet.seed);
    addRow(container, 'Map', `${planet.width} × ${planet.height}`);
    addRow(container, 'Physical scale', `${formatPhysicalDistance(planet.physicalWidthMeters)} × ${formatPhysicalDistance(planet.physicalHeightMeters)}`);
    addRow(container, 'World unit', `≈ ${formatPhysicalDistance(EARTH_SCALE_METERS_PER_WORLD_UNIT)}`);
    addRow(container, 'Regions', String(planet.regions.length));
    addRow(container, 'Resource nodes', String(planet.resourceNodes.length));
}
function renderRegion(container, planet, region) {
    typeLabel(container, 'REGION');
    addRow(container, 'Name', region.name);
    addRow(container, 'ID', region.id);
    addRow(container, 'Bounds', `${region.bounds.x.toFixed(0)}, ${region.bounds.y.toFixed(0)} · ${region.bounds.width.toFixed(0)} × ${region.bounds.height.toFixed(0)}`);
    addRow(container, 'Approx. extent', `${formatPhysicalDistance(worldUnitsToMeters(region.bounds.width))} × ${formatPhysicalDistance(worldUnitsToMeters(region.bounds.height))}`);
    addRow(container, 'Resource nodes', String(region.resourceNodeIds.length));
    addRow(container, 'Planet', planet.name);
}
function renderResource(container, planet, resource) {
    const definition = resourceDefinitionById(resource.resourceId);
    const region = planet.regions.find(candidate => candidate.id === resource.regionId);
    typeLabel(container, 'FEATURE');
    addRow(container, 'Name', resource.name);
    addRow(container, 'Feature type', 'Mineral Deposit');
    addRow(container, 'Resource', definition?.name ?? resource.resourceId);
    addRow(container, 'Category', definition?.category ?? 'unknown');
    addRow(container, 'Region', region?.name ?? resource.regionId);
    addRow(container, 'Coordinates', `${resource.position.x.toFixed(6)}, ${resource.position.y.toFixed(6)}`);
    addRow(container, 'Map position', `${formatPhysicalDistance(worldUnitsToMeters(resource.position.x))}, ${formatPhysicalDistance(worldUnitsToMeters(resource.position.y))}`);
    const port = resource.ports.find(candidate => candidate.id === resource.resourceAccessPortId);
    if (port)
        addRow(container, 'Output', `${port.label} · ${port.kind}`);
}
function renderMechanical(container, node, store) {
    const definition = apparatusDefinitionById(node.definitionId);
    typeLabel(container, node.category.toUpperCase());
    addRow(container, 'Name', node.label);
    addRow(container, 'Definition', definition?.label ?? node.definitionId);
    addRow(container, 'Node type', node.nodeType);
    addRow(container, 'Coordinates', `${node.position.x.toFixed(6)}, ${node.position.y.toFixed(6)}`);
    addRow(container, 'Footprint', `${node.physicalWidthMeters} m × ${node.physicalHeightMeters} m`);
    addRow(container, 'Runtime', 'Disconnected until Phase 6');
    const portsTitle = document.createElement('div');
    portsTitle.className = 'ws-ins-section-title';
    portsTitle.textContent = 'Ports';
    container.appendChild(portsTitle);
    for (const port of node.ports)
        addRow(container, port.label, `${port.direction} · ${port.kind} · ${port.medium}`);
    const connections = connectionsForNode(store.getState().graph, node.id);
    const connTitle = document.createElement('div');
    connTitle.className = 'ws-ins-section-title';
    connTitle.textContent = `Connections (${connections.length})`;
    container.appendChild(connTitle);
    for (const connection of connections) {
        const row = document.createElement('div');
        row.className = 'ws-ins-connection-row';
        const text = document.createElement('span');
        text.textContent = `${connection.from.nodeId}:${connection.from.portId} → ${connection.to.nodeId}:${connection.to.portId}`;
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Disconnect';
        button.addEventListener('click', () => store.setGraph(disconnectConnection(store.getState().graph, connection.id)));
        row.append(text, button);
        container.appendChild(row);
    }
    const actions = document.createElement('div');
    actions.className = 'ws-ins-actions';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove Node';
    remove.addEventListener('click', () => { store.setGraph(removeMechanicalNode(store.getState().graph, node.id)); store.setSelection({ type: 'planet' }); });
    actions.appendChild(remove);
    container.appendChild(actions);
}
export function installInspectorPanel(root, store) {
    const container = root.querySelector('#ws-map-inspector-body');
    if (!container)
        return;
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
            region ? renderRegion(container, planet, region) : container.append('Selected region is unavailable.');
            return;
        }
        if (selection.type === 'resource') {
            const resource = planet.resourceNodes.find(candidate => candidate.id === selection.resourceNodeId);
            resource ? renderResource(container, planet, resource) : container.append('Selected resource is unavailable.');
            return;
        }
        const node = mechanicalNodeById(state.graph, selection.mechanicalNodeId);
        node ? renderMechanical(container, node, store) : container.append('Selected mechanical node is unavailable.');
    });
}
