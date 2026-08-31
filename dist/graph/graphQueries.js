export function mechanicalNodeById(graph, nodeId) {
    return graph.nodes.find(node => node.id === nodeId) ?? null;
}
export function resourceNodeById(planet, nodeId) {
    return planet.resourceNodes.find(node => node.id === nodeId) ?? null;
}
export function portForEndpoint(planet, graph, endpoint) {
    const mechanical = mechanicalNodeById(graph, endpoint.nodeId);
    if (mechanical)
        return mechanical.ports.find(port => port.id === endpoint.portId) ?? null;
    const resource = resourceNodeById(planet, endpoint.nodeId);
    if (resource)
        return resource.ports.find(port => port.id === endpoint.portId) ?? null;
    return null;
}
export function connectionsForNode(graph, nodeId) {
    return graph.connections.filter(connection => connection.from.nodeId === nodeId || connection.to.nodeId === nodeId);
}
