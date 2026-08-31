export function createDisconnectedRuntimeState() {
    return {
        status: 'disconnected',
        running: false,
        error: null,
        snapshot: null,
        profile: null,
        profilingEnabled: false,
        details: {},
        telemetry: {
            accumulatorSeconds: 0,
            schedulerDebtSeconds: 0,
            realtimeFactor: 0,
            workerRoundTripMs: null,
            presentationUpdateMs: null,
        },
    };
}
