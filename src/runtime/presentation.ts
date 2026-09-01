export type RuntimeConnectionStatus = 'disconnected' | 'connecting' | 'ready' | 'error';
export type RuntimeOperatingState = 'off' | 'idle' | 'running' | 'blocked';

export interface RuntimeNodeSnapshot {
  operatingState?: RuntimeOperatingState;
  actualRateKgPerSecond?: number;
  blockedReason?: string | null;
  storedMassKg?: number;
  freeCapacityKg?: number;
}

export interface RuntimeStreamSnapshot {
  massFlowKgPerSecond: number;
}

export interface RuntimeSourceSnapshot {
  extractedMassKg: number;
  remainingMassKg: number | null;
}

export interface RuntimeSnapshot {
  elapsedSeconds: number;
  nodes: Record<string, RuntimeNodeSnapshot>;
  streams: Record<string, RuntimeStreamSnapshot>;
  sources: Record<string, RuntimeSourceSnapshot>;
}

export interface RuntimeSourceDetail {
  kind: 'source';
  id: string;
  elapsedSeconds: number;
  extractedMassKg: number;
  remainingMassKg: number | null;
}

export interface RuntimeNodeDetail {
  kind: 'node';
  id: string;
  nodeType: string;
  elapsedSeconds: number;
  operatingState: RuntimeOperatingState | null;
  actualRateKgPerSecond: number | null;
  blockedReason: string | null;
  storedMassKg: number | null;
  freeCapacityKg: number | null;
}

export interface RuntimeHopperDetail {
  kind: 'hopper';
  id: string;
  elapsedSeconds: number;
  storedMassKg: number;
  freeCapacityKg: number;
  compositionKg: Record<string, number>;
  particleSizeKg: Record<string, number>;
  liberationKg: Record<string, number>;
  textureKg: Record<string, number>;
  sensibleEnthalpyJ: number;
  temperatureK: number | null;
  populationCount: number;
}

export type RuntimeEntityDetail = RuntimeSourceDetail | RuntimeNodeDetail | RuntimeHopperDetail;

export interface RuntimeProfileSnapshot {
  profiledTicks: number;
  tickAverageMs: number;
  tickMaxMs: number;
  apparatusAverageMs: number;
  otherAverageMs: number;
}

export interface RuntimeTelemetry {
  accumulatorSeconds: number;
  schedulerDebtSeconds: number;
  realtimeFactor: number;
  workerRoundTripMs: number | null;
  presentationUpdateMs: number | null;
}

export interface RuntimePresentationState {
  status: RuntimeConnectionStatus;
  running: boolean;
  error: string | null;
  snapshot: RuntimeSnapshot | null;
  profile: RuntimeProfileSnapshot | null;
  profilingEnabled: boolean;
  details: Record<string, RuntimeEntityDetail>;
  telemetry: RuntimeTelemetry;
}

export function createDisconnectedRuntimeState(): RuntimePresentationState {
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
