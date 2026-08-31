export const FLAT_RUNTIME_SITE_ID = 1;
export const NO_RUNTIME_ID = 0xffff_ffff;
function numberParameter(machine, id, fallback) {
    const value = machine.parameters[id];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function fragmentationRuntimeId(profileId, table, values) {
    const existing = table.get(profileId);
    if (existing != null)
        return existing;
    const next = values.length;
    if (next > 0xff)
        throw new Error('Flat runtime fragmentation ID capacity exceeded.');
    table.set(profileId, next);
    values.push(profileId);
    return next;
}
function speciesRuntimeId(speciesId, table, values) {
    const existing = table.get(speciesId);
    if (existing != null)
        return existing;
    const next = values.length;
    if (next > 0xffff)
        throw new Error('Flat runtime species ID capacity exceeded.');
    table.set(speciesId, next);
    values.push(speciesId);
    return next;
}
function extractorOutputStream(streams, extractorRuntimeId) {
    return streams.find(stream => stream.sourceRuntimeId === extractorRuntimeId) ?? null;
}
/**
 * Phase 6 setup adapter. The flat TypeScript world is translated directly into
 * the existing packed Rust ownership model. The single Site ID below is only a
 * scheduler partition inside Rust; it is not a world/domain object and never
 * returns to NAV, the map, graph state, or Inspector.
 */
export function compileFlatWorkerSetup(plan) {
    const speciesTable = new Map();
    const speciesIds = [];
    const sizeBinTable = new Map();
    const sizeBinIds = [];
    const occurrences = plan.resourceSources.map(source => {
        const sizeBinId = fragmentationRuntimeId(source.fragmentationProfileId, sizeBinTable, sizeBinIds);
        const species = source.composition.map(component => speciesRuntimeId(component.speciesId, speciesTable, speciesIds));
        const quantities = source.composition.map(component => component.massFraction);
        const total = quantities.reduce((sum, value) => sum + value, 0);
        if (Math.abs(total - 1) > 1e-8) {
            throw new Error(`Resource source '${source.sourceNodeId}' composition must total 1 kg.`);
        }
        return {
            occurrenceId: source.runtimeId,
            sourceNodeId: source.sourceNodeId,
            resourceId: source.resourceId,
            speciesIds: Uint16Array.from(species),
            sizeBinIds: Uint8Array.from(species.map(() => sizeBinId)),
            liberationClassIds: Uint8Array.from(species.map(() => 0)),
            textureProfileIds: Uint32Array.from(species.map(() => 0)),
            quantitiesPerKg: Float64Array.from(quantities),
            reserveMassKg: source.initialReserveMassKg,
        };
    });
    const machineByRuntimeId = new Map(plan.machines.map(machine => [machine.runtimeId, machine]));
    const hoppers = plan.machines
        .filter(machine => machine.nodeType === 'hopper')
        .map(machine => ({
        nodeId: machine.runtimeId,
        canonicalNodeId: machine.nodeId,
        capacityKg: numberParameter(machine, 'capacityKg', 1000),
    }));
    const hopperIds = new Set(hoppers.map(hopper => hopper.nodeId));
    const bindingByExtractor = new Map(plan.resourceBindings.map(binding => [binding.extractorRuntimeId, binding]));
    const extractors = plan.machines
        .filter(machine => machine.nodeType === 'extractor')
        .map((machine, ordinal) => {
        const binding = bindingByExtractor.get(machine.runtimeId);
        const output = extractorOutputStream(plan.materialStreams, machine.runtimeId);
        const outputTarget = output ? machineByRuntimeId.get(output.targetRuntimeId) : null;
        return {
            nodeId: machine.runtimeId,
            canonicalNodeId: machine.nodeId,
            ordinal,
            rateKgPerSecond: numberParameter(machine, 'rateKgPerSecond', 5),
            enabled: machine.enabled,
            occurrenceId: binding?.sourceRuntimeId ?? NO_RUNTIME_ID,
            outputHopperId: output && outputTarget?.nodeType === 'hopper' && hopperIds.has(output.targetRuntimeId)
                ? output.targetRuntimeId
                : NO_RUNTIME_ID,
        };
    });
    const streams = plan.materialStreams.map(stream => {
        const source = machineByRuntimeId.get(stream.sourceRuntimeId);
        const target = machineByRuntimeId.get(stream.targetRuntimeId);
        return {
            streamId: stream.streamId,
            sourceRuntimeId: stream.sourceRuntimeId,
            sourceNodeId: stream.sourceNodeId,
            targetRuntimeId: stream.targetRuntimeId,
            targetNodeId: stream.targetNodeId,
            runtimeSupported: source?.nodeType === 'extractor' && target?.nodeType === 'hopper',
        };
    });
    return { siteId: FLAT_RUNTIME_SITE_ID, speciesIds, sizeBinIds, occurrences, hoppers, extractors, streams };
}
export function flatWorkerStructureKey(setup) {
    return JSON.stringify({
        siteId: setup.siteId,
        occurrences: setup.occurrences.map(source => ({
            occurrenceId: source.occurrenceId,
            sourceNodeId: source.sourceNodeId,
            resourceId: source.resourceId,
            speciesIds: Array.from(source.speciesIds),
            sizeBinIds: Array.from(source.sizeBinIds),
            liberationClassIds: Array.from(source.liberationClassIds),
            textureProfileIds: Array.from(source.textureProfileIds),
            quantitiesPerKg: Array.from(source.quantitiesPerKg),
            reserveMassKg: source.reserveMassKg,
        })),
        hoppers: setup.hoppers.map(hopper => ({ nodeId: hopper.nodeId, canonicalNodeId: hopper.canonicalNodeId })),
        extractors: setup.extractors.map(extractor => ({
            nodeId: extractor.nodeId,
            canonicalNodeId: extractor.canonicalNodeId,
            ordinal: extractor.ordinal,
            occurrenceId: extractor.occurrenceId,
            outputHopperId: extractor.outputHopperId,
        })),
        streams: setup.streams,
    });
}
export function flatWorkerParameterKey(setup) {
    return JSON.stringify({
        hoppers: setup.hoppers.map(hopper => ({ nodeId: hopper.nodeId, capacityKg: hopper.capacityKg })),
        extractors: setup.extractors.map(extractor => ({
            nodeId: extractor.nodeId,
            enabled: extractor.enabled,
            rateKgPerSecond: extractor.rateKgPerSecond,
        })),
    });
}
