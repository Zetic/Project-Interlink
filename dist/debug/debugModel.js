import { formatPhysicalDistance } from '../world/scale.js';
import { MECHANICAL_PLACEMENT_MIN_ZOOM } from '../map/camera/mapCamera.js';
import { RESOURCE_NODE_FADE_START_ZOOM } from '../map/rendering/resourceRenderer.js';
function lodForZoom(zoom) {
    if (zoom < 8)
        return 'Planet / Region';
    if (zoom < 2 ** 14)
        return 'Geographic';
    if (zoom < RESOURCE_NODE_FADE_START_ZOOM)
        return 'Local approach';
    if (zoom < MECHANICAL_PLACEMENT_MIN_ZOOM)
        return 'Resource discovery';
    return 'Engineering';
}
export function createDebugSnapshot(state) {
    const planet = state.world?.planet;
    const selected = state.selection.type === 'planet' ? 'planet'
        : state.selection.type === 'region' ? `region:${state.selection.regionId}`
            : state.selection.type === 'resource' ? `resource:${state.selection.resourceNodeId}`
                : `mechanical:${state.selection.mechanicalNodeId}`;
    return {
        world: {
            Seed: planet?.seed ?? '—',
            'Logical size': planet ? `${planet.width} × ${planet.height}` : '—',
            'Physical size': planet ? `${formatPhysicalDistance(planet.physicalWidthMeters)} × ${formatPhysicalDistance(planet.physicalHeightMeters)}` : '—',
            Regions: String(planet?.regions.length ?? 0),
            Resources: String(planet?.resourceNodes.length ?? 0),
        },
        camera: {
            Zoom: `${state.camera.zoom.toLocaleString(undefined, { maximumFractionDigits: 0 })}×`,
            Center: `${state.camera.centerX.toFixed(6)}, ${state.camera.centerY.toFixed(6)}`,
            'Approx. visible width': planet ? formatPhysicalDistance(planet.physicalWidthMeters / Math.max(1, state.camera.zoom)) : '—',
            LOD: lodForZoom(state.camera.zoom),
        },
        graph: {
            'Mechanical nodes': String(state.graph.nodes.length),
            Connections: String(state.graph.connections.length),
            Placement: state.interaction.placementDefinitionId ?? 'none',
            'Pending connection': state.interaction.pendingConnection ? `${state.interaction.pendingConnection.nodeId}:${state.interaction.pendingConnection.portId}` : 'none',
        },
        selection: { Selected: selected },
        runtime: {
            Status: 'Disconnected',
            Authority: 'Phase 6 will reconnect Rust/WASM Worker runtime',
        },
    };
}
