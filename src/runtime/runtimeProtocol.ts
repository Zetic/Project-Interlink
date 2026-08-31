import type { RuntimeProfileSnapshot, RuntimeSnapshot } from './presentation.js';
import type { FlatWorkerSetup } from './workerSetup.js';

export const REALTIME_RUNTIME_PROTOCOL_VERSION = 6;
export const SIMULATION_STEP_SECONDS = 0.1;

export type RuntimeCommandType =
  | 'init'
  | 'reconfigure'
  | 'pause'
  | 'resume'
  | 'step-fixed'
  | 'advance-fixed'
  | 'query-detail'
  | 'set-profiling'
  | 'query-profile';

export interface RuntimeCommand {
  protocolVersion: number;
  type: RuntimeCommandType;
  payload: Record<string, unknown>;
  requestId: number;
}

export type RuntimeEventType = 'ready' | 'reconfigured' | 'stepped' | 'run-state' | 'detail' | 'profile' | 'error';

export interface RuntimeEvent {
  protocolVersion: number;
  type: RuntimeEventType;
  payload: {
    running?: boolean;
    elapsedSeconds?: number;
    snapshot?: RuntimeSnapshot;
    profile?: RuntimeProfileSnapshot;
    detail?: unknown;
    ok?: boolean;
    error?: { message?: string };
    message?: string;
  };
  requestId?: number;
}

export interface RuntimeInitPayload { setup: FlatWorkerSetup; }
export interface RuntimeReconfigurePayload { setup: FlatWorkerSetup; }

export function runtimeCommand(type: RuntimeCommandType, payload: Record<string, unknown>, requestId: number): RuntimeCommand {
  return { protocolVersion: REALTIME_RUNTIME_PROTOCOL_VERSION, type, payload, requestId };
}
