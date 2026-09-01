import { NO_RUNTIME_ID, compileFlatWorkerSetup as compileExtractionWorkerSetup, } from './workerSetup.js';
export const SOLID_TARGET_NONE = 0;
export const SOLID_TARGET_HOPPER = 1;
export const SOLID_TARGET_FURNACE = 2;
function numberParameter(machine, id, fallback) {
    const value = machine.parameters[id];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function inboundStream(streams, nodeId, portId) {
    return streams.find(stream => stream.targetRuntimeId === nodeId && stream.targetPortId === portId) ?? null;
}
function outboundStream(streams, nodeId, portId) {
    return streams.find(stream => stream.sourceRuntimeId === nodeId && stream.sourcePortId === portId) ?? null;
}
function hopperEndpoint(stream, side, machineByRuntimeId) {
    if (!stream)
        return NO_RUNTIME_ID;
    const id = side === 'source' ? stream.sourceRuntimeId : stream.targetRuntimeId;
    return machineByRuntimeId.get(id)?.nodeType === 'hopper' ? id : NO_RUNTIME_ID;
}
function solidTarget(stream, machineByRuntimeId) {
    if (!stream)
        return { kind: SOLID_TARGET_NONE, id: NO_RUNTIME_ID };
    const target = machineByRuntimeId.get(stream.targetRuntimeId);
    if (target?.nodeType === 'hopper')
        return { kind: SOLID_TARGET_HOPPER, id: stream.targetRuntimeId };
    if (target?.nodeType === 'roastingFurnace')
        return { kind: SOLID_TARGET_FURNACE, id: stream.targetRuntimeId };
    return { kind: SOLID_TARGET_NONE, id: NO_RUNTIME_ID };
}
function exhaustVentTarget(stream, machineByRuntimeId) {
    if (!stream)
        return NO_RUNTIME_ID;
    return machineByRuntimeId.get(stream.targetRuntimeId)?.nodeType === 'exhaustVent' ? stream.targetRuntimeId : NO_RUNTIME_ID;
}
function targetSizeId(setup, targetMm) {
    if (targetMm === 1)
        return setup.sizeBinIds.indexOf('lt-1mm');
    const exact = setup.materialTables.sizeBins.find(row => row.canonical && Math.abs(row.maxMm - targetMm) <= 1e-12);
    if (exact)
        return exact.runtimeId;
    const fallback = setup.materialTables.sizeBins
        .filter(row => row.canonical && row.maxMm >= targetMm)
        .sort((a, b) => a.maxMm - b.maxMm)[0];
    return fallback?.runtimeId ?? NO_RUNTIME_ID;
}
function machineOrdinal(plan, runtimeId) {
    return Math.max(0, plan.machines.findIndex(machine => machine.runtimeId === runtimeId));
}
function outputPortIndex(nodeType, portId) {
    if (nodeType === 'screen')
        return portId === 'undersize' ? 0 : portId === 'oversize' ? 1 : null;
    if (nodeType === 'splitter')
        return portId === 'output-a' ? 0 : portId === 'output-b' ? 1 : null;
    if (nodeType === 'magSep')
        return portId === 'concentrate' ? 0 : portId === 'tailings' ? 1 : null;
    if (nodeType === 'roastingFurnace')
        return portId === 'solid-product' ? 0 : portId === 'gas-exhaust' ? 1 : null;
    if (nodeType === 'extractor' && portId === 'output')
        return 0;
    if ((nodeType === 'jawCrusher' || nodeType === 'coneCrusher' || nodeType === 'ballMill' || nodeType === 'merger' || nodeType === 'feeder') && portId === 'product')
        return 0;
    return null;
}
function inputPortIndex(nodeType, portId) {
    if (nodeType === 'merger')
        return portId === 'input-a' ? 0 : portId === 'input-b' ? 1 : null;
    if (nodeType === 'exhaustVent' && portId === 'gas-in')
        return 0;
    if (nodeType === 'roastingFurnace' && portId === 'feed')
        return 0;
    if ((nodeType === 'jawCrusher' || nodeType === 'coneCrusher' || nodeType === 'ballMill' || nodeType === 'screen' || nodeType === 'splitter' || nodeType === 'feeder' || nodeType === 'magSep') && portId === 'feed')
        return 0;
    if (nodeType === 'hopper' && portId === 'input')
        return 0;
    return null;
}
function supportedStream(stream, machineByRuntimeId) {
    const source = machineByRuntimeId.get(stream.sourceRuntimeId);
    const target = machineByRuntimeId.get(stream.targetRuntimeId);
    const sourceIndex = source ? outputPortIndex(source.nodeType, stream.sourcePortId) : null;
    const targetIndex = target ? inputPortIndex(target.nodeType, stream.targetPortId) : null;
    const sourceOutputSupported = sourceIndex != null && source?.nodeType !== 'hopper' && source?.nodeType !== 'exhaustVent';
    const targetInputSupported = targetIndex != null && target?.nodeType !== 'hopper' && target?.nodeType !== 'exhaustVent';
    const runtimeSupported = sourceOutputSupported || targetInputSupported || (source?.nodeType === 'roastingFurnace' && target?.nodeType === 'exhaustVent' && sourceIndex === 1);
    return {
        streamId: stream.streamId,
        sourceRuntimeId: stream.sourceRuntimeId,
        sourceNodeId: stream.sourceNodeId,
        targetRuntimeId: stream.targetRuntimeId,
        targetNodeId: stream.targetNodeId,
        sourcePortId: stream.sourcePortId,
        targetPortId: stream.targetPortId,
        physicalForm: stream.physicalForm,
        runtimeSupported,
        measurementNodeId: sourceOutputSupported ? stream.sourceRuntimeId : stream.targetRuntimeId,
        measurementDirection: sourceOutputSupported ? 'output' : 'input',
        measurementPortIndex: sourceOutputSupported ? sourceIndex : (targetIndex ?? 0),
    };
}
export function compileFlatWorkerSetup(plan) {
    const base = compileExtractionWorkerSetup(plan);
    const machineByRuntimeId = new Map(plan.machines.map(machine => [machine.runtimeId, machine]));
    const comminution = plan.machines
        .filter(machine => machine.nodeType === 'jawCrusher' || machine.nodeType === 'coneCrusher' || machine.nodeType === 'ballMill')
        .map(machine => {
        const targetField = machine.nodeType === 'jawCrusher' ? 'jawProductSizeMm' : machine.nodeType === 'coneCrusher' ? 'coneProductSizeMm' : 'millProductSizeMm';
        const fallback = machine.nodeType === 'jawCrusher' ? 120 : machine.nodeType === 'coneCrusher' ? 25 : 0.25;
        const targetParticleSizeMm = numberParameter(machine, targetField, fallback);
        return {
            nodeId: machine.runtimeId,
            canonicalNodeId: machine.nodeId,
            ordinal: machineOrdinal(plan, machine.runtimeId),
            equipmentKind: machine.nodeType === 'jawCrusher' ? 1 : machine.nodeType === 'coneCrusher' ? 2 : 3,
            targetSizeId: targetSizeId(base, targetParticleSizeMm),
            targetParticleSizeMm,
            throughputKgPerSecond: numberParameter(machine, 'throughputKgPerSecond', machine.nodeType === 'jawCrusher' ? 8 : machine.nodeType === 'coneCrusher' ? 5 : 2),
            ratedPowerKw: numberParameter(machine, 'ratedPowerKw', machine.nodeType === 'ballMill' ? 75 : machine.nodeType === 'coneCrusher' ? 10 : 8),
            enabled: machine.enabled,
            inputHopperId: hopperEndpoint(inboundStream(plan.materialStreams, machine.runtimeId, 'feed'), 'source', machineByRuntimeId),
            outputHopperId: hopperEndpoint(outboundStream(plan.materialStreams, machine.runtimeId, 'product'), 'target', machineByRuntimeId),
        };
    });
    const screens = plan.machines.filter(machine => machine.nodeType === 'screen').map(machine => ({
        nodeId: machine.runtimeId,
        canonicalNodeId: machine.nodeId,
        ordinal: machineOrdinal(plan, machine.runtimeId),
        apertureSizeMm: numberParameter(machine, 'apertureSizeMm', 25),
        throughputKgPerSecond: numberParameter(machine, 'throughputKgPerSecond', 4),
        enabled: machine.enabled,
        inputHopperId: hopperEndpoint(inboundStream(plan.materialStreams, machine.runtimeId, 'feed'), 'source', machineByRuntimeId),
        undersizeHopperId: hopperEndpoint(outboundStream(plan.materialStreams, machine.runtimeId, 'undersize'), 'target', machineByRuntimeId),
        oversizeHopperId: hopperEndpoint(outboundStream(plan.materialStreams, machine.runtimeId, 'oversize'), 'target', machineByRuntimeId),
    }));
    const splitters = plan.machines.filter(machine => machine.nodeType === 'splitter').map(machine => ({
        nodeId: machine.runtimeId,
        canonicalNodeId: machine.nodeId,
        ordinal: machineOrdinal(plan, machine.runtimeId),
        splitFractionToA: numberParameter(machine, 'splitFractionToA', 0.5),
        throughputKgPerSecond: numberParameter(machine, 'throughputKgPerSecond', 10),
        enabled: machine.enabled,
        inputHopperId: hopperEndpoint(inboundStream(plan.materialStreams, machine.runtimeId, 'feed'), 'source', machineByRuntimeId),
        outputAHopperId: hopperEndpoint(outboundStream(plan.materialStreams, machine.runtimeId, 'output-a'), 'target', machineByRuntimeId),
        outputBHopperId: hopperEndpoint(outboundStream(plan.materialStreams, machine.runtimeId, 'output-b'), 'target', machineByRuntimeId),
    }));
    const mergers = plan.machines.filter(machine => machine.nodeType === 'merger').map(machine => ({
        nodeId: machine.runtimeId,
        canonicalNodeId: machine.nodeId,
        ordinal: machineOrdinal(plan, machine.runtimeId),
        throughputKgPerSecond: numberParameter(machine, 'throughputKgPerSecond', 10),
        enabled: machine.enabled,
        inputAHopperId: hopperEndpoint(inboundStream(plan.materialStreams, machine.runtimeId, 'input-a'), 'source', machineByRuntimeId),
        inputBHopperId: hopperEndpoint(inboundStream(plan.materialStreams, machine.runtimeId, 'input-b'), 'source', machineByRuntimeId),
        outputHopperId: hopperEndpoint(outboundStream(plan.materialStreams, machine.runtimeId, 'product'), 'target', machineByRuntimeId),
    }));
    const feeders = plan.machines.filter(machine => machine.nodeType === 'feeder').map(machine => {
        const output = solidTarget(outboundStream(plan.materialStreams, machine.runtimeId, 'product'), machineByRuntimeId);
        return {
            nodeId: machine.runtimeId,
            canonicalNodeId: machine.nodeId,
            ordinal: machineOrdinal(plan, machine.runtimeId),
            flowRateKgPerSecond: numberParameter(machine, 'flowRateKgPerSecond', 4),
            throughputKgPerSecond: numberParameter(machine, 'throughputKgPerSecond', 10),
            enabled: machine.enabled,
            inputHopperId: hopperEndpoint(inboundStream(plan.materialStreams, machine.runtimeId, 'feed'), 'source', machineByRuntimeId),
            outputTargetKind: output.kind,
            outputTargetId: output.id,
        };
    });
    const magneticSeparators = plan.machines.filter(machine => machine.nodeType === 'magSep').map(machine => ({
        nodeId: machine.runtimeId,
        canonicalNodeId: machine.nodeId,
        ordinal: machineOrdinal(plan, machine.runtimeId),
        fieldStrength: numberParameter(machine, 'fieldStrength', 0.6),
        maxFeedParticleSizeMm: numberParameter(machine, 'maxFeedParticleSizeMm', 25),
        throughputKgPerSecond: numberParameter(machine, 'throughputKgPerSecond', 4),
        enabled: machine.enabled,
        inputHopperId: hopperEndpoint(inboundStream(plan.materialStreams, machine.runtimeId, 'feed'), 'source', machineByRuntimeId),
        concentrateHopperId: hopperEndpoint(outboundStream(plan.materialStreams, machine.runtimeId, 'concentrate'), 'target', machineByRuntimeId),
        tailingsHopperId: hopperEndpoint(outboundStream(plan.materialStreams, machine.runtimeId, 'tailings'), 'target', machineByRuntimeId),
    }));
    const roastingFurnaces = plan.machines.filter(machine => machine.nodeType === 'roastingFurnace').map(machine => {
        const product = solidTarget(outboundStream(plan.materialStreams, machine.runtimeId, 'solid-product'), machineByRuntimeId);
        return {
            nodeId: machine.runtimeId,
            canonicalNodeId: machine.nodeId,
            ordinal: machineOrdinal(plan, machine.runtimeId),
            temperatureSetpointK: numberParameter(machine, 'temperatureSetpointK', 900),
            ratedHeaterPowerKw: numberParameter(machine, 'ratedHeaterPowerKw', 60),
            maximumOperatingTemperatureK: numberParameter(machine, 'maximumOperatingTemperatureK', 1200),
            maximumSolidThroughputKgPerSecond: numberParameter(machine, 'maximumSolidThroughputKgPerSecond', 4),
            effectiveChamberHoldUpKg: numberParameter(machine, 'effectiveChamberHoldUpKg', 20),
            heatLossCoefficientWPerK: numberParameter(machine, 'heatLossCoefficientWPerK', 25),
            internalZoneCount: numberParameter(machine, 'internalZoneCount', 4),
            enabled: machine.enabled,
            productTargetKind: product.kind,
            productTargetId: product.id,
            gasVentId: exhaustVentTarget(outboundStream(plan.materialStreams, machine.runtimeId, 'gas-exhaust'), machineByRuntimeId),
        };
    });
    const exhaustVents = plan.machines.filter(machine => machine.nodeType === 'exhaustVent').map(machine => ({
        nodeId: machine.runtimeId,
        canonicalNodeId: machine.nodeId,
    }));
    const streams = plan.materialStreams.map(stream => supportedStream(stream, machineByRuntimeId));
    return { ...base, comminution, screens, splitters, mergers, feeders, magneticSeparators, roastingFurnaces, exhaustVents, streams };
}
function structureMachine(machine, endpoints) {
    return { nodeId: machine.nodeId, canonicalNodeId: machine.canonicalNodeId, ordinal: machine.ordinal, ...endpoints };
}
export function flatWorkerStructureKey(setup) {
    return JSON.stringify({
        siteId: setup.siteId,
        speciesIds: setup.speciesIds,
        sizeBinIds: setup.sizeBinIds,
        liberationClassIds: setup.liberationClassIds,
        textureProfileIds: setup.textureProfileIds,
        materialTables: setup.materialTables,
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
        exhaustVents: setup.exhaustVents,
        extractors: setup.extractors.map(machine => structureMachine(machine, { occurrenceId: machine.occurrenceId, outputHopperId: machine.outputHopperId })),
        comminution: setup.comminution.map(machine => structureMachine(machine, { inputHopperId: machine.inputHopperId, outputHopperId: machine.outputHopperId })),
        screens: setup.screens.map(machine => structureMachine(machine, { inputHopperId: machine.inputHopperId, undersizeHopperId: machine.undersizeHopperId, oversizeHopperId: machine.oversizeHopperId })),
        splitters: setup.splitters.map(machine => structureMachine(machine, { inputHopperId: machine.inputHopperId, outputAHopperId: machine.outputAHopperId, outputBHopperId: machine.outputBHopperId })),
        mergers: setup.mergers.map(machine => structureMachine(machine, { inputAHopperId: machine.inputAHopperId, inputBHopperId: machine.inputBHopperId, outputHopperId: machine.outputHopperId })),
        feeders: setup.feeders.map(machine => structureMachine(machine, { inputHopperId: machine.inputHopperId, outputTargetKind: machine.outputTargetKind, outputTargetId: machine.outputTargetId })),
        magneticSeparators: setup.magneticSeparators.map(machine => structureMachine(machine, { inputHopperId: machine.inputHopperId, concentrateHopperId: machine.concentrateHopperId, tailingsHopperId: machine.tailingsHopperId })),
        roastingFurnaces: setup.roastingFurnaces.map(machine => structureMachine(machine, { productTargetKind: machine.productTargetKind, productTargetId: machine.productTargetId, gasVentId: machine.gasVentId })),
        streams: setup.streams.map(stream => ({
            streamId: stream.streamId,
            sourceRuntimeId: stream.sourceRuntimeId,
            targetRuntimeId: stream.targetRuntimeId,
            sourcePortId: stream.sourcePortId,
            targetPortId: stream.targetPortId,
            physicalForm: stream.physicalForm,
            runtimeSupported: stream.runtimeSupported,
            measurementNodeId: stream.measurementNodeId,
            measurementDirection: stream.measurementDirection,
            measurementPortIndex: stream.measurementPortIndex,
        })),
    });
}
export function flatWorkerParameterKey(setup) {
    return JSON.stringify({
        hoppers: setup.hoppers.map(hopper => ({ nodeId: hopper.nodeId, capacityKg: hopper.capacityKg })),
        extractors: setup.extractors.map(machine => ({ nodeId: machine.nodeId, enabled: machine.enabled, rateKgPerSecond: machine.rateKgPerSecond })),
        comminution: setup.comminution.map(machine => ({ nodeId: machine.nodeId, enabled: machine.enabled, targetSizeId: machine.targetSizeId, targetParticleSizeMm: machine.targetParticleSizeMm, throughputKgPerSecond: machine.throughputKgPerSecond, ratedPowerKw: machine.ratedPowerKw })),
        screens: setup.screens.map(machine => ({ nodeId: machine.nodeId, enabled: machine.enabled, apertureSizeMm: machine.apertureSizeMm, throughputKgPerSecond: machine.throughputKgPerSecond })),
        splitters: setup.splitters.map(machine => ({ nodeId: machine.nodeId, enabled: machine.enabled, splitFractionToA: machine.splitFractionToA, throughputKgPerSecond: machine.throughputKgPerSecond })),
        mergers: setup.mergers.map(machine => ({ nodeId: machine.nodeId, enabled: machine.enabled, throughputKgPerSecond: machine.throughputKgPerSecond })),
        feeders: setup.feeders.map(machine => ({ nodeId: machine.nodeId, enabled: machine.enabled, flowRateKgPerSecond: machine.flowRateKgPerSecond, throughputKgPerSecond: machine.throughputKgPerSecond })),
        magneticSeparators: setup.magneticSeparators.map(machine => ({ nodeId: machine.nodeId, enabled: machine.enabled, fieldStrength: machine.fieldStrength, maxFeedParticleSizeMm: machine.maxFeedParticleSizeMm, throughputKgPerSecond: machine.throughputKgPerSecond })),
        roastingFurnaces: setup.roastingFurnaces.map(machine => ({ nodeId: machine.nodeId, enabled: machine.enabled, temperatureSetpointK: machine.temperatureSetpointK, ratedHeaterPowerKw: machine.ratedHeaterPowerKw, maximumOperatingTemperatureK: machine.maximumOperatingTemperatureK, maximumSolidThroughputKgPerSecond: machine.maximumSolidThroughputKgPerSecond, effectiveChamberHoldUpKg: machine.effectiveChamberHoldUpKg, heatLossCoefficientWPerK: machine.heatLossCoefficientWPerK, internalZoneCount: machine.internalZoneCount })),
    });
}
