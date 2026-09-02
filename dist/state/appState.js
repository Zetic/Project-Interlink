import { createEmptyGraphState } from '../graph/graphCommands.js';
import { createDisconnectedRuntimeState } from '../runtime/presentation.js';
import { worldSpatialIndexFor } from '../world/spatialIndex.js';
const STRUCTURAL_APP_DOMAINS = ['world', 'graph', 'selection', 'camera', 'interaction'];
export const RESOURCE_FOCUS_ZOOM = 2 ** 19;
export const MECHANICAL_FOCUS_ZOOM = 2 ** 20;
export function geographicFocusZoom(world, bounds) {
    const widthZoom = world.planet.width / Math.max(1, bounds.width * 1.3);
    const heightZoom = world.planet.height / Math.max(1, bounds.height * 1.3);
    return Math.max(1, Math.min(2 ** 13, Math.min(widthZoom, heightZoom)));
}
const emptyInteraction = () => ({ placementDefinitionId: null, pendingConnection: null, notice: null });
export class AppStore {
    subscriptions = new Set();
    state = {
        world: null,
        graph: createEmptyGraphState(),
        selection: { type: 'planet' },
        camera: { centerX: 0, centerY: 0, zoom: 1 },
        interaction: emptyInteraction(),
        runtime: createDisconnectedRuntimeState(),
    };
    getState() {
        return this.state;
    }
    setWorld(world) {
        this.state = {
            world,
            graph: createEmptyGraphState(),
            selection: { type: 'planet' },
            camera: { centerX: world.planet.width / 2, centerY: world.planet.height / 2, zoom: 1 },
            interaction: emptyInteraction(),
            runtime: createDisconnectedRuntimeState(),
        };
        this.emit('world', 'graph', 'selection', 'camera', 'interaction', 'runtime', 'telemetry');
    }
    setSelection(selection) {
        this.state = { ...this.state, selection };
        this.emit('selection');
    }
    setCamera(camera) {
        this.state = { ...this.state, camera };
        this.emit('camera');
    }
    setGraph(graph) {
        this.state = { ...this.state, graph };
        this.emit('graph');
    }
    updateRuntime(patch) {
        this.state = {
            ...this.state,
            runtime: {
                ...this.state.runtime,
                ...patch,
                telemetry: patch.telemetry
                    ? { ...this.state.runtime.telemetry, ...patch.telemetry }
                    : this.state.runtime.telemetry,
                details: patch.details ?? this.state.runtime.details,
            },
        };
        const presentationChanged = Object.keys(patch).some(key => key !== 'telemetry');
        if (presentationChanged && patch.telemetry)
            this.emit('runtime', 'telemetry');
        else if (presentationChanged)
            this.emit('runtime');
        else if (patch.telemetry)
            this.emit('telemetry');
    }
    setPlacement(placementDefinitionId) {
        this.state = {
            ...this.state,
            interaction: { placementDefinitionId, pendingConnection: null, notice: null },
        };
        this.emit('interaction');
    }
    setPendingConnection(pendingConnection) {
        this.state = {
            ...this.state,
            interaction: { ...this.state.interaction, placementDefinitionId: null, pendingConnection },
        };
        this.emit('interaction');
    }
    setInteractionNotice(notice) {
        this.state = { ...this.state, interaction: { ...this.state.interaction, notice } };
        this.emit('interaction');
    }
    clearInteraction() {
        this.state = { ...this.state, interaction: emptyInteraction() };
        this.emit('interaction');
    }
    focusSelection(selection) {
        const world = this.state.world;
        if (!world) {
            this.setSelection(selection);
            return;
        }
        let camera = this.state.camera;
        const index = worldSpatialIndexFor(world.planet);
        if (selection.type === 'planet') {
            camera = { centerX: world.planet.width / 2, centerY: world.planet.height / 2, zoom: 1 };
        }
        else if (selection.type === 'continent') {
            const continent = index.continentById(selection.continentId);
            if (continent)
                camera = { centerX: continent.center.x, centerY: continent.center.y, zoom: geographicFocusZoom(world, continent.focusBounds) };
        }
        else if (selection.type === 'ocean') {
            const ocean = index.oceanById(selection.oceanId);
            if (ocean)
                camera = { centerX: ocean.center.x, centerY: ocean.center.y, zoom: geographicFocusZoom(world, ocean.focusBounds) };
        }
        else if (selection.type === 'region') {
            const region = index.regionById(selection.regionId);
            if (region) {
                camera = {
                    centerX: region.center.x,
                    centerY: region.center.y,
                    zoom: geographicFocusZoom(world, region.bounds),
                };
            }
        }
        else if (selection.type === 'resource') {
            const resource = index.featureById(selection.resourceNodeId);
            if (resource)
                camera = { centerX: resource.position.x, centerY: resource.position.y, zoom: RESOURCE_FOCUS_ZOOM };
        }
        else if (selection.type === 'mechanical') {
            const node = this.state.graph.nodes.find(candidate => candidate.id === selection.mechanicalNodeId);
            if (node)
                camera = { centerX: node.position.x, centerY: node.position.y, zoom: MECHANICAL_FOCUS_ZOOM };
        }
        this.state = { ...this.state, selection, camera };
        this.emit('selection', 'camera');
    }
    /** Structural UI subscription. Runtime presentation consumers use subscribeDomains. */
    subscribe(listener) {
        return this.subscribeDomains(STRUCTURAL_APP_DOMAINS, listener);
    }
    subscribeDomains(domains, listener) {
        const subscription = {
            listener,
            domains: domains ? new Set(domains) : null,
        };
        this.subscriptions.add(subscription);
        listener(this.state);
        return () => this.subscriptions.delete(subscription);
    }
    emit(...changedDomains) {
        const changed = new Set(changedDomains);
        for (const subscription of this.subscriptions) {
            if (subscription.domains && ![...subscription.domains].some(domain => changed.has(domain)))
                continue;
            subscription.listener(this.state);
        }
    }
}
