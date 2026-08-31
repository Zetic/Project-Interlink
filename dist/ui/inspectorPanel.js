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
function renderPlanet(container, planet) {
    const type = document.createElement('div');
    type.className = 'ws-ins-type';
    type.textContent = 'PLANET';
    container.appendChild(type);
    addRow(container, 'Name', planet.name);
    addRow(container, 'Seed', planet.seed);
    addRow(container, 'Map', `${planet.width} × ${planet.height}`);
    addRow(container, 'Physical scale', `${formatPhysicalDistance(planet.physicalWidthMeters)} × ${formatPhysicalDistance(planet.physicalHeightMeters)}`);
    addRow(container, 'World unit', `≈ ${formatPhysicalDistance(EARTH_SCALE_METERS_PER_WORLD_UNIT)}`);
    addRow(container, 'Regions', String(planet.regions.length));
    addRow(container, 'Resource nodes', String(planet.resourceNodes.length));
}
function renderRegion(container, planet, region) {
    const type = document.createElement('div');
    type.className = 'ws-ins-type';
    type.textContent = 'REGION';
    container.appendChild(type);
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
    const type = document.createElement('div');
    type.className = 'ws-ins-type';
    type.textContent = 'FEATURE';
    container.appendChild(type);
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
            if (region)
                renderRegion(container, planet, region);
            else
                container.textContent = 'Selected region is unavailable.';
            return;
        }
        const resource = planet.resourceNodes.find(candidate => candidate.id === selection.resourceNodeId);
        if (resource)
            renderResource(container, planet, resource);
        else
            container.textContent = 'Selected resource is unavailable.';
    });
}
