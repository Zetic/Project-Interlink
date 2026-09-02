export const WORLDGEN_PROTOCOL_VERSION = 1;
export const WORLDGEN_SYNTHETIC_MAX_SAMPLES = 4_194_304;

export interface WorldgenSyntheticRequest {
  seed: string;
  width: number;
  height: number;
}

export interface WorldgenFieldStatistics {
  sampleCount: number;
  minimum: number;
  maximum: number;
  mean: number;
  fieldHash: string;
}

export interface WorldgenStageMetadata {
  id: string;
  version: number;
  stageSeed: string;
  durationMs: number;
}

export interface WorldgenSyntheticResult {
  engineVersion: number;
  width: number;
  height: number;
  values: Uint16Array;
  statistics: WorldgenFieldStatistics;
  stage: WorldgenStageMetadata;
}

export type WorldgenCommandType = 'generate-synthetic';
export type WorldgenEventType = 'generated' | 'error';

export interface WorldgenCommand {
  protocolVersion: number;
  requestId: number;
  type: WorldgenCommandType;
  payload: WorldgenSyntheticRequest;
}

export interface WorldgenGeneratedEvent {
  protocolVersion: number;
  requestId: number;
  type: 'generated';
  payload: WorldgenSyntheticResult;
}

export interface WorldgenErrorEvent {
  protocolVersion: number;
  requestId: number;
  type: 'error';
  payload: { message: string };
}

export type WorldgenEvent = WorldgenGeneratedEvent | WorldgenErrorEvent;

export function validateSyntheticRequest(request: WorldgenSyntheticRequest): void {
  if (!request.seed.trim()) throw new Error('Worldgen seed must not be empty.');
  for (const [name, value] of [['width', request.width], ['height', request.height]] as const) {
    if (!Number.isInteger(value) || value <= 0) throw new Error(`Worldgen ${name} must be a positive integer.`);
  }
  const samples = request.width * request.height;
  if (!Number.isSafeInteger(samples) || samples > WORLDGEN_SYNTHETIC_MAX_SAMPLES) {
    throw new Error(`WG-0 synthetic diagnostics are limited to ${WORLDGEN_SYNTHETIC_MAX_SAMPLES.toLocaleString()} samples.`);
  }
}

export function worldgenCommand(requestId: number, payload: WorldgenSyntheticRequest): WorldgenCommand {
  validateSyntheticRequest(payload);
  return { protocolVersion: WORLDGEN_PROTOCOL_VERSION, requestId, type: 'generate-synthetic', payload };
}
