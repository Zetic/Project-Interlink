import { apparatusDefinitionById } from '../apparatus/definitions.js';
import { materializeSolidParticulateUnit } from '../material/particulate.js';
function materialFormForMedium(medium) {
    if (medium === 'solid')
        return 'solid-particulate';
    if (medium === 'gas')
        return 'gas';
    throw new Error('Resource-access edges do not compile into material streams.');
}
function cloneMineralTexture(profile) {
    if (!profile)
        return null;
    return {
        id: profile.id,
        speciesTextures: Object.fromEntries(Object.entries(profile.speciesTextures).map(([speciesId, texture]) => [
            speciesId,
            {
                grainSizeUm: { ...texture.grainSizeUm },
                occurrenceModes: { ...texture.occurrenceModes },
            },
        ])),
        ...(profile.comminutionProperties ? { comminutionProperties: { ...profile.comminutionProperties } } : {}),
    };
}
export function compileFlatRuntimePlan(planet, graph) {
    const resourceRuntimeIds = new Map();
    const machineRuntimeIds = new Map();
    const resourceSources = planet.resourceNodes.map((resource, index) => {
        const runtimeId = index + 1;
        resourceRuntimeIds.set(resource.id, runtimeId);
        return {
            runtimeId,
            sourceNodeId: resource.id,
            resourceId: resource.resourceId,
            physicalForm: resource.source.physicalForm,
            composition: resource.source.composition.map(component => ({ ...component })),
            fragmentationProfileId: resource.source.fragmentationProfileId,
            particulatePopulations: materializeSolidParticulateUnit(resource.source),
            mineralTexture: cloneMineralTexture(resource.source.mineralTexture),
            comminutionProperties: resource.source.comminutionProperties ? { ...resource.source.comminutionProperties } : null,
            initialReserveMassKg: resource.source.initialReserveMassKg,
        };
    });
    const machines = graph.nodes.map((node, index) => {
        const runtimeId = index + 1;
        machineRuntimeIds.set(node.id, runtimeId);
        const definition = apparatusDefinitionById(node.definitionId);
        return {
            runtimeId,
            nodeId: node.id,
            nodeType: node.nodeType,
            enabled: node.enabled,
            parameters: { ...(definition?.runtimeDefaults ?? {}), ...node.parameters },
        };
    });
    const resourceBindings = [];
    const materialStreams = [];
    for (const connection of graph.connections) {
        if (connection.kind === 'resource-access') {
            const sourceRuntimeId = resourceRuntimeIds.get(connection.from.nodeId);
            const extractorRuntimeId = machineRuntimeIds.get(connection.to.nodeId);
            const extractor = graph.nodes.find(node => node.id === connection.to.nodeId);
            if (sourceRuntimeId == null)
                throw new Error(`Resource binding '${connection.id}' must begin at a FEATURE source.`);
            if (extractorRuntimeId == null || extractor?.nodeType !== 'extractor') {
                throw new Error(`Resource binding '${connection.id}' must terminate at an Extractor.`);
            }
            resourceBindings.push({
                connectionId: connection.id,
                sourceRuntimeId,
                sourceNodeId: connection.from.nodeId,
                extractorRuntimeId,
                extractorNodeId: connection.to.nodeId,
            });
            continue;
        }
        const sourceRuntimeId = machineRuntimeIds.get(connection.from.nodeId);
        const targetRuntimeId = machineRuntimeIds.get(connection.to.nodeId);
        if (sourceRuntimeId == null || targetRuntimeId == null) {
            throw new Error(`Material connection '${connection.id}' must connect mechanical nodes.`);
        }
        materialStreams.push({
            streamId: `stream:${connection.id}`,
            connectionId: connection.id,
            sourceRuntimeId,
            sourceNodeId: connection.from.nodeId,
            sourcePortId: connection.from.portId,
            targetRuntimeId,
            targetNodeId: connection.to.nodeId,
            targetPortId: connection.to.portId,
            physicalForm: materialFormForMedium(connection.medium),
        });
    }
    return { resourceSources, machines, resourceBindings, materialStreams };
}
