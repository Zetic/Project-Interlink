export const REALTIME_RUNTIME_PROTOCOL_VERSION = 6;
export const SIMULATION_STEP_SECONDS = 0.1;
export function runtimeCommand(type, payload, requestId) {
    return { protocolVersion: REALTIME_RUNTIME_PROTOCOL_VERSION, type, payload, requestId };
}
