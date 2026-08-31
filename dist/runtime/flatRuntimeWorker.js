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
        throw new Error('Rust/WASM flat runtime has not been initialized.');
    return { runtime, setup };
}
function normalizeOperatingState(value) {
    if (value === 'off' || value === 'idle' || value === 'running' || value === 'blocked')
        return value;
    return 'blocked';
}
function normalizeOptionalMass(value) {
    return Number.isFinite(value) ? value : null;
}
function populateRuntime(target, nextSetup) {
    target.add_site(nextSetup.siteId);
    for (const hopper of nextSetup.hoppers) {
        target.add_hopper_state(hopper.nodeId, hopper.capacityKg, new Uint16Array(), new Uint8Array(), new Uint8Array(), new Uint32Array(), new Float64Array(), 0);
    }
    for (const source of nextSetup.occurrences) {
        target.add_occurrence_state(source.occurrenceId, source.speciesIds, source.sizeBinIds, source.liberationClassIds, source.textureProfileIds, source.quantitiesPerKg, source.reserveMassKg != null, source.reserveMassKg ?? 0);
    }
    for (const extractor of nextSetup.extractors) {
        target.add_extractor(nextSetup.siteId, extractor.nodeId, extractor.ordinal, extractor.rateKgPerSecond, extractor.enabled, extractor.occurrenceId, extractor.outputHopperId);
    }
    target.seal();
}
function snapshotWorld(target, currentSetup) {
    const nodes = {};
    for (const hopper of currentSetup.hoppers) {
        const storedMassKg = target.hopper_stored_mass_kg(hopper.nodeId);
        nodes[hopper.canonicalNodeId] = {
            storedMassKg,
            freeCapacityKg: Math.max(0, hopper.capacityKg - storedMassKg),
        };
    }
    for (const extractor of currentSetup.extractors) {
        const actualRateKgPerSecond = target.node_output_mass_flow_kg_per_second(extractor.nodeId, 0);
        const blockedReason = target.node_last_error(extractor.nodeId) || null;
        nodes[extractor.canonicalNodeId] = {
            operatingState: normalizeOperatingState(target.node_operating_state(extractor.nodeId)),
            actualRateKgPerSecond: Number.isFinite(actualRateKgPerSecond) ? actualRateKgPerSecond : 0,
            blockedReason,
        };
    }
    const streams = {};
    for (const stream of currentSetup.streams) {
        const sourceExtractor = currentSetup.extractors.find(extractor => extractor.nodeId === stream.sourceRuntimeId);
        const rate = stream.runtimeSupported && sourceExtractor
            ? target.node_output_mass_flow_kg_per_second(sourceExtractor.nodeId, 0)
            : 0;
        streams[stream.streamId] = { massFlowKgPerSecond: Number.isFinite(rate) ? rate : 0 };
    }
    const sources = {};
    for (const source of currentSetup.occurrences) {
        sources[source.sourceNodeId] = {
            extractedMassKg: target.occurrence_extracted_mass_kg(source.occurrenceId),
            remainingMassKg: normalizeOptionalMass(target.occurrence_remaining_mass_kg(source.occurrenceId)),
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
function hopperDetail(target, currentSetup, id) {
    const hopper = currentSetup.hoppers.find(candidate => candidate.canonicalNodeId === id);
    if (!hopper)
        throw new Error(`Unknown runtime Hopper '${id}'.`);
    const species = Array.from(target.hopper_species_ids(hopper.nodeId));
    const quantities = Array.from(target.hopper_quantities(hopper.nodeId));
    if (species.length !== quantities.length)
        throw new Error('Rust Hopper material columns are misaligned.');
    const compositionKg = {};
    quantities.forEach((quantity, index) => {
        if (!Number.isFinite(quantity) || quantity <= 0)
            return;
        const speciesId = currentSetup.speciesIds[species[index] ?? -1] ?? `species:${species[index]}`;
        compositionKg[speciesId] = (compositionKg[speciesId] ?? 0) + quantity;
    });
    const storedMassKg = target.hopper_stored_mass_kg(hopper.nodeId);
    return {
        kind: 'hopper',
        id,
        elapsedSeconds: target.elapsed_seconds(),
        storedMassKg,
        freeCapacityKg: Math.max(0, hopper.capacityKg - storedMassKg),
        compositionKg,
    };
}
function reconfigureRuntime(target, nextSetup) {
    const candidate = target.clone_for_live_reconfigure();
    try {
        candidate.begin_live_reconfigure();
        for (const hopper of nextSetup.hoppers) {
            candidate.replace_hopper_state_live(hopper.nodeId, hopper.capacityKg, candidate.hopper_species_ids(hopper.nodeId), candidate.hopper_size_bin_ids(hopper.nodeId), candidate.hopper_liberation_class_ids(hopper.nodeId), candidate.hopper_texture_profile_ids(hopper.nodeId), candidate.hopper_quantities(hopper.nodeId), candidate.hopper_sensible_enthalpy_j(hopper.nodeId));
        }
        for (const extractor of nextSetup.extractors) {
            candidate.upsert_extractor_live(nextSetup.siteId, extractor.nodeId, extractor.ordinal, extractor.rateKgPerSecond, extractor.enabled, extractor.occurrenceId, extractor.outputHopperId);
        }
        candidate.finish_live_reconfigure(Uint32Array.from(nextSetup.extractors.map(extractor => extractor.nodeId)));
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
                throw new Error('Rust/WASM flat runtime is already initialized.');
            const nextSetup = command.payload.setup;
            const nextRuntime = new WasmPackedWorldRuntime();
            try {
                populateRuntime(nextRuntime, nextSetup);
                runtime = nextRuntime;
                setup = nextSetup;
                return runtimeEvent('ready', {
                    running: nextRuntime.running(),
                    elapsedSeconds: nextRuntime.elapsed_seconds(),
                    snapshot: snapshotWorld(nextRuntime, nextSetup),
                }, requestId);
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
            return runtimeEvent('reconfigured', {
                running: candidate.running(),
                elapsedSeconds: candidate.elapsed_seconds(),
                snapshot: snapshotWorld(candidate, nextSetup),
            }, requestId);
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
                running: current.runtime.running(),
                elapsedSeconds: current.runtime.elapsed_seconds(),
                snapshot: snapshotWorld(current.runtime, current.setup),
                profile: current.runtime.profiling_enabled() ? profileSnapshot(current.runtime) : undefined,
                ok: advanced,
            }, requestId);
        }
        case 'advance-fixed': {
            const current = requireRuntime();
            const requested = Number(command.payload.steps ?? 0);
            if (!Number.isInteger(requested) || requested < 0 || requested > 10_000) {
                throw new Error('advance-fixed steps must be an integer between 0 and 10000.');
            }
            current.runtime.advance_fixed_steps(requested);
            return runtimeEvent('stepped', {
                running: current.runtime.running(),
                elapsedSeconds: current.runtime.elapsed_seconds(),
                snapshot: snapshotWorld(current.runtime, current.setup),
                profile: current.runtime.profiling_enabled() ? profileSnapshot(current.runtime) : undefined,
            }, requestId);
        }
        case 'query-detail': {
            const current = requireRuntime();
            if (command.payload.entityType !== 'hopper' || typeof command.payload.id !== 'string') {
                throw new Error('Phase 6 detail queries currently support Hopper entities only.');
            }
            return runtimeEvent('detail', {
                ok: true,
                detail: hopperDetail(current.runtime, current.setup, command.payload.id),
            }, requestId);
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
        workerScope.postMessage(runtimeEvent('error', {
            message: error instanceof Error ? error.message : String(error),
        }, command?.requestId));
    }
});
