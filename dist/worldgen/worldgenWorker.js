import { WORLDGEN_PROTOCOL_VERSION, validateSyntheticRequest, validateTectonicsRequest, validateTopologyRequest } from './protocol.js';
const workerScope = self;
let wasmModulePromise = null;
function nowMs() { return globalThis.performance?.now?.() ?? Date.now(); }
async function loadWorldgenWasm() {
    if (wasmModulePromise)
        return wasmModulePromise;
    wasmModulePromise = (async () => {
        const moduleUrl = new URL('../../src/wasm-worldgen/interlink_worldgen_wasm.js', import.meta.url).href;
        let module;
        try {
            module = await import(moduleUrl);
        }
        catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            throw new Error(`Planet Engine WASM package is not available. ${detail}`);
        }
        await module.default();
        const actual = module.worldgen_protocol_version();
        if (actual !== WORLDGEN_PROTOCOL_VERSION)
            throw new Error(`Planet Engine WASM protocol ${actual} does not match browser protocol ${WORLDGEN_PROTOCOL_VERSION}.`);
        return module;
    })();
    return wasmModulePromise;
}
async function generateSynthetic(command) {
    validateSyntheticRequest(command.payload);
    const module = await loadWorldgenWasm();
    const startedAt = nowMs();
    const output = new module.WasmWorldgenDiagnostic(command.payload.seed, command.payload.width, command.payload.height);
    try {
        const values = output.values();
        return { engineVersion: output.generator_version(), width: output.width(), height: output.height(), values, statistics: { sampleCount: Number(output.sample_count()), minimum: output.minimum(), maximum: output.maximum(), mean: output.mean(), fieldHash: output.field_hash_hex() }, stage: { id: output.stage_id(), version: output.stage_version(), stageSeed: output.stage_seed_hex(), durationMs: Math.max(0, nowMs() - startedAt) } };
    }
    finally {
        output.free();
    }
}
async function generateTopology(command) {
    validateTopologyRequest(command.payload);
    const module = await loadWorldgenWasm();
    const startedAt = nowMs();
    const output = new module.WasmWorldgenTopology(command.payload.level);
    try {
        const positions = output.positions();
        const faces = output.faces();
        const neighborOffsets = output.neighbor_offsets();
        const neighbors = output.neighbors();
        const neighborArcLengthsRad = output.neighbor_arc_lengths_rad();
        const neighborInterfaceArcLengthsRad = output.neighbor_interface_arc_lengths_rad();
        const areaSteradians = output.area_steradians();
        const birthLevels = output.birth_levels();
        const parentEdges = output.parent_edges();
        return { engineVersion: output.generator_version(), level: output.level(), durationMs: Math.max(0, nowMs() - startedAt), metrics: { sampleCount: output.sample_count(), edgeCount: output.edge_count(), faceCount: output.face_count(), fiveNeighborCount: output.five_neighbor_count(), sixNeighborCount: output.six_neighbor_count(), totalAreaSteradians: output.total_area_steradians(), minimumAreaSteradians: output.minimum_area_steradians(), maximumAreaSteradians: output.maximum_area_steradians(), meanAreaSteradians: output.mean_area_steradians(), areaCoefficientOfVariation: output.area_coefficient_of_variation(), minimumEdgeArcRadians: output.minimum_edge_arc_radians(), maximumEdgeArcRadians: output.maximum_edge_arc_radians(), meanEdgeArcRadians: output.mean_edge_arc_radians(), edgeCoefficientOfVariation: output.edge_coefficient_of_variation(), minimumInterfaceArcRadians: output.minimum_interface_arc_radians(), maximumInterfaceArcRadians: output.maximum_interface_arc_radians(), meanInterfaceArcRadians: output.mean_interface_arc_radians(), interfaceCoefficientOfVariation: output.interface_coefficient_of_variation(), topologyHash: output.topology_hash_hex() }, positions, faces, neighborOffsets, neighbors, neighborArcLengthsRad, neighborInterfaceArcLengthsRad, areaSteradians, birthLevels, parentEdges };
    }
    finally {
        output.free();
    }
}
async function generateTectonics(command) {
    validateTectonicsRequest(command.payload);
    const module = await loadWorldgenWasm();
    const startedAt = nowMs();
    const output = new module.WasmWorldgenTectonics(command.payload.seed, command.payload.level, command.payload.plateCount);
    try {
        const positions = output.positions();
        const faces = output.faces();
        const neighborOffsets = output.neighbor_offsets();
        const neighbors = output.neighbors();
        const plateIds = output.plate_ids();
        const plateSeedSamples = output.plate_seed_samples();
        const plateEulerPoles = output.plate_euler_poles();
        const plateAngularVelocitiesRadPerMyr = output.plate_angular_velocities_rad_per_myr();
        const plateAreaSteradians = output.plate_area_steradians();
        const boundarySamples = output.boundary_samples();
        const boundaryPlateIds = output.boundary_plate_ids();
        const boundaryKinds = output.boundary_kinds();
        const boundaryNormalRatesMPerYear = output.boundary_normal_rates_m_per_year();
        const boundaryShearRatesMPerYear = output.boundary_shear_rates_m_per_year();
        return {
            engineVersion: output.generator_version(),
            level: output.level(),
            topologyHash: output.topology_hash_hex(),
            stage: { id: output.stage_id(), version: output.stage_version(), stageSeed: output.stage_seed_hex(), durationMs: Math.max(0, nowMs() - startedAt) },
            metrics: { sampleCount: output.sample_count(), plateCount: output.plate_count(), boundaryEdgeCount: output.boundary_edge_count(), convergentEdgeCount: output.convergent_edge_count(), divergentEdgeCount: output.divergent_edge_count(), transformEdgeCount: output.transform_edge_count(), minimumPlateAreaFraction: output.minimum_plate_area_fraction(), maximumPlateAreaFraction: output.maximum_plate_area_fraction(), meanPlateAreaFraction: output.mean_plate_area_fraction(), minimumSeedSeparationRad: output.minimum_seed_separation_rad(), meanReferenceSpeedMmPerYear: output.mean_reference_speed_mm_per_year(), tectonicHash: output.tectonic_hash_hex() },
            positions, faces, neighborOffsets, neighbors, plateIds, plateSeedSamples, plateEulerPoles, plateAngularVelocitiesRadPerMyr, plateAreaSteradians, boundarySamples, boundaryPlateIds, boundaryKinds, boundaryNormalRatesMPerYear, boundaryShearRatesMPerYear,
        };
    }
    finally {
        output.free();
    }
}
workerScope.addEventListener('message', async (messageEvent) => {
    const command = messageEvent.data;
    try {
        if (!command || command.protocolVersion !== WORLDGEN_PROTOCOL_VERSION)
            throw new Error(`Worldgen protocol must be ${WORLDGEN_PROTOCOL_VERSION}.`);
        if (command.type === 'generate-synthetic') {
            const result = await generateSynthetic(command);
            workerScope.postMessage({ protocolVersion: WORLDGEN_PROTOCOL_VERSION, requestId: command.requestId, type: 'generated-synthetic', payload: result }, [result.values.buffer]);
            return;
        }
        if (command.type === 'generate-topology') {
            const result = await generateTopology(command);
            workerScope.postMessage({ protocolVersion: WORLDGEN_PROTOCOL_VERSION, requestId: command.requestId, type: 'generated-topology', payload: result }, [result.positions.buffer, result.faces.buffer, result.neighborOffsets.buffer, result.neighbors.buffer, result.neighborArcLengthsRad.buffer, result.neighborInterfaceArcLengthsRad.buffer, result.areaSteradians.buffer, result.birthLevels.buffer, result.parentEdges.buffer]);
            return;
        }
        if (command.type === 'generate-tectonics') {
            const result = await generateTectonics(command);
            workerScope.postMessage({ protocolVersion: WORLDGEN_PROTOCOL_VERSION, requestId: command.requestId, type: 'generated-tectonics', payload: result }, [result.positions.buffer, result.faces.buffer, result.neighborOffsets.buffer, result.neighbors.buffer, result.plateIds.buffer, result.plateSeedSamples.buffer, result.plateEulerPoles.buffer, result.plateAngularVelocitiesRadPerMyr.buffer, result.plateAreaSteradians.buffer, result.boundarySamples.buffer, result.boundaryPlateIds.buffer, result.boundaryKinds.buffer, result.boundaryNormalRatesMPerYear.buffer, result.boundaryShearRatesMPerYear.buffer]);
            return;
        }
        throw new Error(`Unsupported worldgen command '${String(command.type)}'.`);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        workerScope.postMessage({ protocolVersion: WORLDGEN_PROTOCOL_VERSION, requestId: command?.requestId ?? -1, type: 'error', payload: { message } });
    }
});
