export function mean(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
export function percentile(values, fraction) {
    if (!values.length)
        return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
    return sorted[index];
}
export function collectSimulationDebugStats(state) {
    const resourceCount = state.world?.planet.resourceNodes.length ?? 0;
    const mechanicalNodes = state.graph.nodes;
    return {
        // Recursive Site sessions were intentionally retired by the flat-map rewrite.
        sessions: 0,
        nodes: resourceCount + mechanicalNodes.length,
        activeMachines: mechanicalNodes.filter(node => node.enabled).length,
        connections: state.graph.connections.length,
        furnaces: mechanicalNodes.filter(node => node.nodeType === 'roastingFurnace').length,
        // These remain zero until the original Rust/WASM thermochemical runtime is reconnected.
        activeFurnaceZones: 0,
        solverEvaluations: 0,
    };
}
