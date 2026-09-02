import { WORLDGEN_PROTOCOL_VERSION, validateSyntheticRequest, } from './protocol.js';
const workerScope = self;
let wasmModulePromise = null;
function nowMs() {
    return globalThis.performance?.now?.() ?? Date.now();
}
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
            throw new Error(`Planet Engine WASM package is not available. Run 'npm run build:worldgen-wasm' before opening worldgen-lab.html. ${detail}`);
        }
        await module.default();
        const actual = module.worldgen_protocol_version();
        if (actual !== WORLDGEN_PROTOCOL_VERSION) {
            throw new Error(`Planet Engine WASM protocol ${actual} does not match browser protocol ${WORLDGEN_PROTOCOL_VERSION}.`);
        }
        return module;
    })();
    return wasmModulePromise;
}
function event(type, requestId, payload) {
    return { protocolVersion: WORLDGEN_PROTOCOL_VERSION, requestId, type, payload };
}
async function generate(command) {
    if (command.protocolVersion !== WORLDGEN_PROTOCOL_VERSION) {
        throw new Error(`Worldgen protocol must be ${WORLDGEN_PROTOCOL_VERSION}.`);
    }
    validateSyntheticRequest(command.payload);
    const module = await loadWorldgenWasm();
    const startedAt = nowMs();
    const output = new module.WasmWorldgenDiagnostic(command.payload.seed, command.payload.width, command.payload.height);
    try {
        const values = output.values();
        return {
            engineVersion: output.generator_version(),
            width: output.width(),
            height: output.height(),
            values,
            statistics: {
                sampleCount: Number(output.sample_count()),
                minimum: output.minimum(),
                maximum: output.maximum(),
                mean: output.mean(),
                fieldHash: output.field_hash_hex(),
            },
            stage: {
                id: output.stage_id(),
                version: output.stage_version(),
                stageSeed: output.stage_seed_hex(),
                durationMs: Math.max(0, nowMs() - startedAt),
            },
        };
    }
    finally {
        output.free();
    }
}
workerScope.addEventListener('message', async (messageEvent) => {
    const command = messageEvent.data;
    try {
        if (command.type !== 'generate-synthetic')
            throw new Error(`Unsupported worldgen command '${String(command.type)}'.`);
        const result = await generate(command);
        workerScope.postMessage(event('generated', command.requestId, result), [result.values.buffer]);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        workerScope.postMessage(event('error', command?.requestId ?? -1, { message }));
    }
});
