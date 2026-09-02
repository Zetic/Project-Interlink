export const WORLDGEN_PROTOCOL_VERSION = 1;
export const WORLDGEN_SYNTHETIC_MAX_SAMPLES = 4_194_304;
export function validateSyntheticRequest(request) {
    if (!request.seed.trim())
        throw new Error('Worldgen seed must not be empty.');
    for (const [name, value] of [['width', request.width], ['height', request.height]]) {
        if (!Number.isInteger(value) || value <= 0)
            throw new Error(`Worldgen ${name} must be a positive integer.`);
    }
    const samples = request.width * request.height;
    if (!Number.isSafeInteger(samples) || samples > WORLDGEN_SYNTHETIC_MAX_SAMPLES) {
        throw new Error(`WG-0 synthetic diagnostics are limited to ${WORLDGEN_SYNTHETIC_MAX_SAMPLES.toLocaleString()} samples.`);
    }
}
export function worldgenCommand(requestId, payload) {
    validateSyntheticRequest(payload);
    return { protocolVersion: WORLDGEN_PROTOCOL_VERSION, requestId, type: 'generate-synthetic', payload };
}
