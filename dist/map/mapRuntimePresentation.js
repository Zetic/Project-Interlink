import { updateMechanicalRuntimePresentation } from './rendering/mechanicalRenderer.js';
import { updateResourceRuntimePresentation } from './rendering/resourceRenderer.js';
/** Projects live runtime values into existing SVG text without rebuilding map geometry. */
export function installMapRuntimePresentation(root, store) {
    const svg = root.querySelector('#ws-map-svg');
    if (!svg)
        return;
    let lastWorld;
    let lastGraph;
    let lastSnapshot;
    const render = () => {
        const state = store.getState();
        if (state.world === lastWorld && state.graph === lastGraph && state.runtime.snapshot === lastSnapshot)
            return;
        lastWorld = state.world;
        lastGraph = state.graph;
        lastSnapshot = state.runtime.snapshot;
        const planet = state.world?.planet;
        if (!planet)
            return;
        updateMechanicalRuntimePresentation(svg, state.graph, state.runtime.snapshot);
        updateResourceRuntimePresentation(svg, planet, state.runtime.snapshot);
    };
    store.subscribeDomains(['world', 'graph', 'runtime'], render);
}
