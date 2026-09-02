export const WORLDGEN_PROTOCOL_VERSION = 2;
export const WORLDGEN_SYNTHETIC_MAX_SAMPLES = 4_194_304;
export const WORLDGEN_TOPOLOGY_MAX_LEVEL = 7;
export function validateSyntheticRequest(request) { if (!request.seed.trim())
    throw new Error('Worldgen seed must not be empty.'); for (const [name, value] of [['width', request.width], ['height', request.height]])
    if (!Number.isInteger(value) || value <= 0)
        throw new Error(`Worldgen ${name} must be a positive integer.`); const samples = request.width * request.height; if (!Number.isSafeInteger(samples) || samples > WORLDGEN_SYNTHETIC_MAX_SAMPLES)
    throw new Error(`WG-0 synthetic diagnostics are limited to ${WORLDGEN_SYNTHETIC_MAX_SAMPLES.toLocaleString()} samples.`); }
export function validateTopologyRequest(request) { if (!Number.isInteger(request.level) || request.level < 0 || request.level > WORLDGEN_TOPOLOGY_MAX_LEVEL)
    throw new Error(`WG-1 browser topology level must be an integer from 0 through ${WORLDGEN_TOPOLOGY_MAX_LEVEL}.`); }
export function worldgenSyntheticCommand(requestId, payload) { validateSyntheticRequest(payload); return { protocolVersion: WORLDGEN_PROTOCOL_VERSION, requestId, type: 'generate-synthetic', payload }; }
export function worldgenTopologyCommand(requestId, payload) { validateTopologyRequest(payload); return { protocolVersion: WORLDGEN_PROTOCOL_VERSION, requestId, type: 'generate-topology', payload }; }
