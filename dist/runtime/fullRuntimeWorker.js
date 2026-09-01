import initWasm, { WasmPackedWorldRuntime, runtime_protocol_version as runtimeProtocolVersion } from '../../src/wasm/interlink_wasm.js';
import { REALTIME_RUNTIME_PROTOCOL_VERSION, } from './runtimeProtocol.js';
let runtime = null;
let setup = null;
function runtimeEvent(type, payload, requestId) {
    return {
        protocolVersion: REALTIME_RUNTIME_PROTOCOL_VERSION,
        type,
        payload,
        ...(requestId == null ? {} : { requestId }),
    };
}
function requireRuntime() {
    if (!runtime || !setup)
        throw new Error('Rust/WASM full flat runtime has not been initialized.');
    return { runtime, setup };
}
function normalizeOperatingState(value) {
    if (value === 'off' || value === 'idle' || value === 'running' || value === 'blocked')
        return value;
    return 'blocked';
}
function normalizeOptionalNumber(value) {
    return Number.isFinite(value) ? value : null;
}
function populateMaterialTables(target, nextSetup) {
    const tables = nextSetup.materialTables;
    for (const species of tables.species) {
        target.set_species_magnetic_response(species.runtimeId, species.magneticResponse);
        if (species.specificHeatCapacityJPerKgK != null) {
            target.set_specific_heat_capacity_j_per_kg_k(species.runtimeId, species.specificHeatCapacityJPerKgK);
        }
    }
    for (const size of tables.sizeBins) {
        target.add_comminution_size_bin(size.runtimeId, size.orderIndex, size.maxMm, size.representativeMm, size.canonical);
        target.add_separation_size_bin(size.runtimeId, size.maxMm, size.magneticSuitability);
    }
    target.set_comminution_legacy_lt_one_mm_id(tables.legacyLtOneMmId);
    for (const liberation of tables.liberationClasses) {
        target.add_comminution_liberation_class(liberation.runtimeId, liberation.orderIndex);
        target.add_separation_liberation_class(liberation.runtimeId, liberation.recoveryFactor);
    }
    for (const texture of tables.textures) {
        target.set_comminution_species_texture(texture.textureProfileId, texture.speciesId, texture.d10Um, texture.d50Um, texture.d90Um, texture.free, texture.boundary, texture.intergrown, texture.included);
    }
    for (const properties of tables.comminutionProperties) {
        target.set_comminution_texture_properties(properties.textureProfileId, properties.bondCrushingWorkIndexKWhPerT, properties.bondBallMillWorkIndexKWhPerT, properties.bondAbrasionIndex);
    }
    const reaction = tables.goethiteReaction;
    target.begin_goethite_reaction(reaction.sourceSpeciesId, reaction.solidProductSpeciesId, reaction.gasProductSpeciesId, reaction.sourceMassPerExtentKg, reaction.solidProductMassPerExtentKg, reaction.gasProductMassPerExtentKg, reaction.reactionEnthalpyJPerMolExtent, reaction.activationEnergyJPerMol, reaction.preExponentialFactorPerSecond);
    for (const sizeFactor of reaction.sizeFactors)
        target.set_reaction_size_factor(sizeFactor.sizeBinId, sizeFactor.factor);
    for (const mapping of reaction.textureMappings) {
        target.set_reaction_product_texture_mapping(mapping.sourceTextureProfileId, mapping.productTextureProfileId);
    }
    target.commit_goethite_reaction();
}
function populateRuntime(target, nextSetup) {
    target.add_site(nextSetup.siteId);
    populateMaterialTables(target, nextSetup);
    for (const hopper of nextSetup.hoppers) {
        target.add_hopper_state(hopper.nodeId, hopper.capacityKg, new Uint16Array(), new Uint8Array(), new Uint8Array(), new Uint32Array(), new Float64Array(), 0);
    }
    for (const vent of nextSetup.exhaustVents) {
        target.add_exhaust_vent_state(vent.nodeId, new Uint16Array(), new Float64Array(), 0);
    }
    for (const source of nextSetup.occurrences) {
        target.add_occurrence_state(source.occurrenceId, source.speciesIds, source.sizeBinIds, source.liberationClassIds, source.textureProfileIds, source.quantitiesPerKg, source.reserveMassKg != null, source.reserveMassKg ?? 0);
    }
    for (const machine of nextSetup.extractors) {
        target.add_extractor(nextSetup.siteId, machine.nodeId, machine.ordinal, machine.rateKgPerSecond, machine.enabled, machine.occurrenceId, machine.outputHopperId);
    }
    for (const machine of nextSetup.comminution) {
        target.add_comminution(nextSetup.siteId, machine.nodeId, machine.ordinal, machine.equipmentKind, machine.targetSizeId, machine.targetParticleSizeMm, machine.throughputKgPerSecond, machine.ratedPowerKw, machine.enabled, machine.inputHopperId, machine.outputHopperId);
    }
    for (const machine of nextSetup.screens) {
        target.add_screen(nextSetup.siteId, machine.nodeId, machine.ordinal, machine.apertureSizeMm, machine.throughputKgPerSecond, machine.enabled, machine.inputHopperId, machine.undersizeHopperId, machine.oversizeHopperId);
    }
    for (const machine of nextSetup.splitters) {
        target.add_splitter(nextSetup.siteId, machine.nodeId, machine.ordinal, machine.splitFractionToA, machine.throughputKgPerSecond, machine.enabled, machine.inputHopperId, machine.outputAHopperId, machine.outputBHopperId);
    }
    for (const machine of nextSetup.mergers) {
        target.add_merger(nextSetup.siteId, machine.nodeId, machine.ordinal, machine.throughputKgPerSecond, machine.enabled, machine.inputAHopperId, machine.inputBHopperId, machine.outputHopperId);
    }
    for (const machine of nextSetup.feeders) {
        target.add_feeder(nextSetup.siteId, machine.nodeId, machine.ordinal, machine.flowRateKgPerSecond, machine.throughputKgPerSecond, machine.enabled, machine.inputHopperId, machine.outputTargetKind, machine.outputTargetId);
    }
    for (const machine of nextSetup.magneticSeparators) {
        target.add_magnetic_separator(nextSetup.siteId, machine.nodeId, machine.ordinal, machine.fieldStrength, machine.maxFeedParticleSizeMm, machine.throughputKgPerSecond, machine.enabled, machine.inputHopperId, machine.concentrateHopperId, machine.tailingsHopperId);
    }
    for (const machine of nextSetup.roastingFurnaces) {
        target.add_roasting_furnace(nextSetup.siteId, machine.nodeId, machine.ordinal, machine.temperatureSetpointK, machine.ratedHeaterPowerKw, machine.maximumOperatingTemperatureK, machine.maximumSolidThroughputKgPerSecond, machine.effectiveChamberHoldUpKg, machine.heatLossCoefficientWPerK, machine.internalZoneCount, machine.enabled, machine.productTargetKind, machine.productTargetId, machine.gasVentId);
    }
    target.seal();
}
function runtimeMachineRows(currentSetup) {
    return [
        ...currentSetup.extractors,
        ...currentSetup.comminution,
        ...currentSetup.screens,
        ...currentSetup.splitters,
        ...currentSetup.mergers,
        ...currentSetup.feeders,
        ...currentSetup.magneticSeparators,
        ...currentSetup.roastingFurnaces,
    ];
}
function snapshotWorld(target, currentSetup) {
    const nodes = {};
    for (const hopper of currentSetup.hoppers) {
        const storedMassKg = target.hopper_stored_mass_kg(hopper.nodeId);
        nodes[hopper.canonicalNodeId] = { storedMassKg, freeCapacityKg: Math.max(0, hopper.capacityKg - storedMassKg) };
    }
    for (const machine of runtimeMachineRows(currentSetup)) {
        const actualRateKgPerSecond = target.node_output_mass_flow_kg_per_second(machine.nodeId, 0);
        nodes[machine.canonicalNodeId] = {
            operatingState: normalizeOperatingState(target.node_operating_state(machine.nodeId)),
            actualRateKgPerSecond: Number.isFinite(actualRateKgPerSecond) ? actualRateKgPerSecond : 0,
            blockedReason: target.node_last_error(machine.nodeId) || null,
        };
    }
    for (const furnace of currentSetup.roastingFurnaces) {
        nodes[furnace.canonicalNodeId] = {
            ...nodes[furnace.canonicalNodeId],
            temperatureK: normalizeOptionalNumber(target.furnace_actual_charge_temperature_k(furnace.nodeId)),
            conversionFraction: Number(target.furnace_last_goethite_conversion_fraction(furnace.nodeId)) || 0,
        };
    }
    for (const vent of currentSetup.exhaustVents) {
        nodes[vent.canonicalNodeId] = {
            ventedGasMassKg: Number(target.vented_gas_mass_kg(vent.nodeId)) || 0,
            temperatureK: normalizeOptionalNumber(target.exhaust_vent_temperature_k(vent.nodeId)),
        };
    }
    const streams = {};
    for (const stream of currentSetup.streams) {
        let rate = 0;
        if (stream.runtimeSupported) {
            rate = stream.measurementDirection === 'output'
                ? target.node_output_mass_flow_kg_per_second(stream.measurementNodeId, stream.measurementPortIndex)
                : target.node_input_mass_flow_kg_per_second(stream.measurementNodeId, stream.measurementPortIndex);
        }
        streams[stream.streamId] = { massFlowKgPerSecond: Number.isFinite(rate) ? rate : 0 };
    }
    const sources = {};
    for (const source of currentSetup.occurrences) {
        sources[source.sourceNodeId] = {
            extractedMassKg: target.occurrence_extracted_mass_kg(source.occurrenceId),
            remainingMassKg: normalizeOptionalNumber(target.occurrence_remaining_mass_kg(source.occurrenceId)),
        };
    }
    return { elapsedSeconds: target.elapsed_seconds(), nodes, streams, sources };
}
function profileSnapshot(target) {
    const profiledTicks = Number(target.profile_tick_count()) || 0;
    const total = Number(target.profile_tick_total_duration_ms()) || 0;
    const apparatus = Number(target.profile_apparatus_total_duration_ms()) || 0;
    const tickAverageMs = profiledTicks ? total / profiledTicks : 0;
    const apparatusAverageMs = profiledTicks ? apparatus / profiledTicks : 0;
    return {
        profiledTicks,
        tickAverageMs,
        tickMaxMs: Number(target.profile_tick_max_duration_ms()) || 0,
        apparatusAverageMs,
        otherAverageMs: Math.max(0, tickAverageMs - apparatusAverageMs),
    };
}
function addQuantity(target, key, quantity) {
    target[key] = (target[key] ?? 0) + quantity;
}
function hopperDetail(target, currentSetup, id) {
    const hopper = currentSetup.hoppers.find(candidate => candidate.canonicalNodeId === id);
    if (!hopper)
        throw new Error(`Unknown runtime Hopper '${id}'.`);
    const species = Array.from(target.hopper_species_ids(hopper.nodeId));
    const sizes = Array.from(target.hopper_size_bin_ids(hopper.nodeId));
    const liberation = Array.from(target.hopper_liberation_class_ids(hopper.nodeId));
    const textures = Array.from(target.hopper_texture_profile_ids(hopper.nodeId));
    const quantities = Array.from(target.hopper_quantities(hopper.nodeId));
    const lengths = [species.length, sizes.length, liberation.length, textures.length, quantities.length];
    if (!lengths.every(length => length === quantities.length))
        throw new Error('Rust Hopper material columns are misaligned.');
    const compositionKg = {};
    const particleSizeKg = {};
    const liberationKg = {};
    const textureKg = {};
    let populationCount = 0;
    quantities.forEach((quantity, index) => {
        if (!Number.isFinite(quantity) || quantity <= 0)
            return;
        populationCount += 1;
        const speciesRuntimeId = species[index] ?? -1;
        const sizeRuntimeId = sizes[index] ?? -1;
        const liberationRuntimeId = liberation[index] ?? -1;
        const textureRuntimeId = textures[index] ?? -1;
        addQuantity(compositionKg, currentSetup.speciesIds[speciesRuntimeId] ?? `species:${speciesRuntimeId}`, quantity);
        addQuantity(particleSizeKg, currentSetup.sizeBinIds[sizeRuntimeId] ?? `size:${sizeRuntimeId}`, quantity);
        addQuantity(liberationKg, currentSetup.liberationClassIds[liberationRuntimeId] ?? `liberation:${liberationRuntimeId}`, quantity);
        addQuantity(textureKg, currentSetup.textureProfileIds[textureRuntimeId] ?? `texture:${textureRuntimeId}`, quantity);
    });
    const storedMassKg = target.hopper_stored_mass_kg(hopper.nodeId);
    return {
        kind: 'hopper', id, elapsedSeconds: target.elapsed_seconds(), storedMassKg,
        freeCapacityKg: Math.max(0, hopper.capacityKg - storedMassKg),
        compositionKg, particleSizeKg, liberationKg, textureKg,
        sensibleEnthalpyJ: target.hopper_sensible_enthalpy_j(hopper.nodeId),
        temperatureK: normalizeOptionalNumber(target.hopper_temperature_k(hopper.nodeId)),
        populationCount,
    };
}
function furnaceDetail(target, currentSetup, id) {
    const furnace = currentSetup.roastingFurnaces.find(candidate => candidate.canonicalNodeId === id);
    if (!furnace)
        throw new Error(`Unknown runtime Furnace '${id}'.`);
    const zoneCount = Number(target.furnace_zone_count(furnace.nodeId)) || 0;
    const zoneMassKg = [];
    const zoneTemperatureK = [];
    for (let zone = 0; zone < zoneCount; zone += 1) {
        zoneMassKg.push(Number(target.furnace_zone_mass_kg(furnace.nodeId, zone)) || 0);
        zoneTemperatureK.push(normalizeOptionalNumber(target.furnace_zone_temperature_k(furnace.nodeId, zone)));
    }
    return {
        kind: 'furnace',
        id,
        elapsedSeconds: target.elapsed_seconds(),
        chargeMassKg: Number(target.furnace_charge_mass_kg(furnace.nodeId)) || 0,
        pendingFeedMassKg: Number(target.furnace_pending_feed_mass_kg(furnace.nodeId)) || 0,
        chargeTemperatureK: normalizeOptionalNumber(target.furnace_actual_charge_temperature_k(furnace.nodeId)),
        feedRateKgPerSecond: Number(target.furnace_last_feed_rate_kg_per_second(furnace.nodeId)) || 0,
        productRateKgPerSecond: Number(target.furnace_last_product_rate_kg_per_second(furnace.nodeId)) || 0,
        goethiteConversionFraction: Number(target.furnace_last_goethite_conversion_fraction(furnace.nodeId)) || 0,
        heaterPowerKw: Number(target.furnace_last_heater_power_kw(furnace.nodeId)) || 0,
        heatLossPowerKw: Number(target.furnace_last_heat_loss_power_kw(furnace.nodeId)) || 0,
        reactionPowerKw: Number(target.furnace_last_reaction_power_kw(furnace.nodeId)) || 0,
        zoneCount,
        zoneMassKg,
        zoneTemperatureK,
        solverEvaluationCount: Number(target.furnace_last_solver_evaluation_count(furnace.nodeId)) || 0,
    };
}
function ventDetail(target, currentSetup, id) {
    const vent = currentSetup.exhaustVents.find(candidate => candidate.canonicalNodeId === id);
    if (!vent)
        throw new Error(`Unknown runtime Exhaust Vent '${id}'.`);
    const species = Array.from(target.exhaust_vent_species_ids(vent.nodeId));
    const quantities = Array.from(target.exhaust_vent_quantities(vent.nodeId));
    const compositionKg = {};
    quantities.forEach((quantity, index) => {
        if (!Number.isFinite(quantity) || quantity <= 0)
            return;
        const runtimeId = species[index] ?? -1;
        addQuantity(compositionKg, currentSetup.speciesIds[runtimeId] ?? `species:${runtimeId}`, quantity);
    });
    return {
        kind: 'exhaust-vent',
        id,
        elapsedSeconds: target.elapsed_seconds(),
        emittedMassKg: Number(target.vented_gas_mass_kg(vent.nodeId)) || 0,
        compositionKg,
        sensibleEnthalpyJ: Number(target.exhaust_vent_sensible_enthalpy_j(vent.nodeId)) || 0,
        temperatureK: normalizeOptionalNumber(target.exhaust_vent_temperature_k(vent.nodeId)),
    };
}
function detailFor(target, currentSetup, entityType, id) {
    if (typeof id !== 'string')
        throw new Error('Runtime detail query requires a canonical entity id.');
    if (entityType === 'hopper')
        return hopperDetail(target, currentSetup, id);
    if (entityType === 'furnace')
        return furnaceDetail(target, currentSetup, id);
    if (entityType === 'exhaustVent')
        return ventDetail(target, currentSetup, id);
    throw new Error(`Unsupported runtime detail entity '${String(entityType)}'.`);
}
function activeMachineIds(nextSetup) {
    return Uint32Array.from(runtimeMachineRows(nextSetup).map(machine => machine.nodeId));
}
function reconfigureRuntime(target, nextSetup) {
    const candidate = target.clone_for_live_reconfigure();
    try {
        candidate.begin_live_reconfigure();
        for (const hopper of nextSetup.hoppers) {
            candidate.replace_hopper_state_live(hopper.nodeId, hopper.capacityKg, candidate.hopper_species_ids(hopper.nodeId), candidate.hopper_size_bin_ids(hopper.nodeId), candidate.hopper_liberation_class_ids(hopper.nodeId), candidate.hopper_texture_profile_ids(hopper.nodeId), candidate.hopper_quantities(hopper.nodeId), candidate.hopper_sensible_enthalpy_j(hopper.nodeId));
        }
        for (const vent of nextSetup.exhaustVents) {
            candidate.replace_exhaust_vent_state_live(vent.nodeId, candidate.exhaust_vent_species_ids(vent.nodeId), candidate.exhaust_vent_quantities(vent.nodeId), candidate.exhaust_vent_sensible_enthalpy_j(vent.nodeId));
        }
        for (const machine of nextSetup.extractors) {
            candidate.upsert_extractor_live(nextSetup.siteId, machine.nodeId, machine.ordinal, machine.rateKgPerSecond, machine.enabled, machine.occurrenceId, machine.outputHopperId);
        }
        for (const machine of nextSetup.comminution) {
            candidate.upsert_comminution_live(nextSetup.siteId, machine.nodeId, machine.ordinal, machine.equipmentKind, machine.targetSizeId, machine.targetParticleSizeMm, machine.throughputKgPerSecond, machine.ratedPowerKw, machine.enabled, machine.inputHopperId, machine.outputHopperId);
        }
        for (const machine of nextSetup.screens) {
            candidate.upsert_screen_live(nextSetup.siteId, machine.nodeId, machine.ordinal, machine.apertureSizeMm, machine.throughputKgPerSecond, machine.enabled, machine.inputHopperId, machine.undersizeHopperId, machine.oversizeHopperId);
        }
        for (const machine of nextSetup.splitters) {
            candidate.upsert_splitter_live(nextSetup.siteId, machine.nodeId, machine.ordinal, machine.splitFractionToA, machine.throughputKgPerSecond, machine.enabled, machine.inputHopperId, machine.outputAHopperId, machine.outputBHopperId);
        }
        for (const machine of nextSetup.mergers) {
            candidate.upsert_merger_live(nextSetup.siteId, machine.nodeId, machine.ordinal, machine.throughputKgPerSecond, machine.enabled, machine.inputAHopperId, machine.inputBHopperId, machine.outputHopperId);
        }
        for (const machine of nextSetup.feeders) {
            candidate.upsert_feeder_live(nextSetup.siteId, machine.nodeId, machine.ordinal, machine.flowRateKgPerSecond, machine.throughputKgPerSecond, machine.enabled, machine.inputHopperId, machine.outputTargetKind, machine.outputTargetId);
        }
        for (const machine of nextSetup.magneticSeparators) {
            candidate.upsert_magnetic_separator_live(nextSetup.siteId, machine.nodeId, machine.ordinal, machine.fieldStrength, machine.maxFeedParticleSizeMm, machine.throughputKgPerSecond, machine.enabled, machine.inputHopperId, machine.concentrateHopperId, machine.tailingsHopperId);
        }
        for (const machine of nextSetup.roastingFurnaces) {
            candidate.upsert_roasting_furnace_live(nextSetup.siteId, machine.nodeId, machine.ordinal, machine.temperatureSetpointK, machine.ratedHeaterPowerKw, machine.maximumOperatingTemperatureK, machine.maximumSolidThroughputKgPerSecond, machine.effectiveChamberHoldUpKg, machine.heatLossCoefficientWPerK, machine.internalZoneCount, machine.enabled, machine.productTargetKind, machine.productTargetId, machine.gasVentId, true);
        }
        candidate.finish_live_reconfigure(activeMachineIds(nextSetup));
        candidate.seal();
        return candidate;
    }
    catch (error) {
        candidate.free();
        throw error;
    }
}
async function handle(command) {
    if (command.protocolVersion !== REALTIME_RUNTIME_PROTOCOL_VERSION) {
        throw new Error(`Runtime protocol must be ${REALTIME_RUNTIME_PROTOCOL_VERSION}.`);
    }
    const requestId = command.requestId;
    switch (command.type) {
        case 'init': {
            if (runtime)
                throw new Error('Rust/WASM full flat runtime is already initialized.');
            const nextSetup = command.payload.setup;
            const nextRuntime = new WasmPackedWorldRuntime();
            try {
                populateRuntime(nextRuntime, nextSetup);
                runtime = nextRuntime;
                setup = nextSetup;
                return runtimeEvent('ready', { running: nextRuntime.running(), elapsedSeconds: nextRuntime.elapsed_seconds(), snapshot: snapshotWorld(nextRuntime, nextSetup) }, requestId);
            }
            catch (error) {
                nextRuntime.free();
                throw error;
            }
        }
        case 'reconfigure': {
            const current = requireRuntime();
            const nextSetup = command.payload.setup;
            const candidate = reconfigureRuntime(current.runtime, nextSetup);
            current.runtime.free();
            runtime = candidate;
            setup = nextSetup;
            return runtimeEvent('reconfigured', { running: candidate.running(), elapsedSeconds: candidate.elapsed_seconds(), snapshot: snapshotWorld(candidate, nextSetup) }, requestId);
        }
        case 'pause': {
            const current = requireRuntime();
            current.runtime.pause();
            return runtimeEvent('run-state', { running: false, snapshot: snapshotWorld(current.runtime, current.setup) }, requestId);
        }
        case 'resume': {
            const current = requireRuntime();
            current.runtime.resume();
            return runtimeEvent('run-state', { running: true, snapshot: snapshotWorld(current.runtime, current.setup) }, requestId);
        }
        case 'step-fixed': {
            const current = requireRuntime();
            const advanced = current.runtime.tick_fixed();
            return runtimeEvent('stepped', {
                running: current.runtime.running(), elapsedSeconds: current.runtime.elapsed_seconds(), snapshot: snapshotWorld(current.runtime, current.setup),
                profile: current.runtime.profiling_enabled() ? profileSnapshot(current.runtime) : undefined, ok: advanced,
            }, requestId);
        }
        case 'advance-fixed': {
            const current = requireRuntime();
            const requested = Number(command.payload.steps ?? 0);
            if (!Number.isInteger(requested) || requested < 0 || requested > 10_000)
                throw new Error('advance-fixed steps must be an integer between 0 and 10000.');
            current.runtime.advance_fixed_steps(requested);
            return runtimeEvent('stepped', {
                running: current.runtime.running(), elapsedSeconds: current.runtime.elapsed_seconds(), snapshot: snapshotWorld(current.runtime, current.setup),
                profile: current.runtime.profiling_enabled() ? profileSnapshot(current.runtime) : undefined,
            }, requestId);
        }
        case 'query-detail': {
            const current = requireRuntime();
            return runtimeEvent('detail', { ok: true, detail: detailFor(current.runtime, current.setup, command.payload.entityType, command.payload.id) }, requestId);
        }
        case 'set-profiling': {
            const current = requireRuntime();
            const enabled = command.payload.enabled === true;
            current.runtime.set_profiling_enabled(enabled);
            if (command.payload.reset === true)
                current.runtime.reset_profiling_stats();
            return runtimeEvent('profile', { ok: true, profile: profileSnapshot(current.runtime) }, requestId);
        }
        case 'query-profile': {
            const current = requireRuntime();
            return runtimeEvent('profile', { ok: true, profile: profileSnapshot(current.runtime) }, requestId);
        }
        default:
            throw new Error(`Unsupported runtime command '${command.type}'.`);
    }
}
const workerScope = self;
const wasmReady = (async () => {
    await initWasm();
    const actual = runtimeProtocolVersion();
    if (actual !== REALTIME_RUNTIME_PROTOCOL_VERSION) {
        throw new Error(`WASM runtime protocol ${actual} does not match browser protocol ${REALTIME_RUNTIME_PROTOCOL_VERSION}.`);
    }
})();
workerScope.addEventListener('message', async (event) => {
    const command = event.data;
    try {
        await wasmReady;
        workerScope.postMessage(await handle(command));
    }
    catch (error) {
        workerScope.postMessage(runtimeEvent('error', { message: error instanceof Error ? error.message : String(error) }, command?.requestId));
    }
});
