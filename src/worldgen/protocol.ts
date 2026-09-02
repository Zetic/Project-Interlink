export const WORLDGEN_PROTOCOL_VERSION = 3;
export const WORLDGEN_SYNTHETIC_MAX_SAMPLES = 4_194_304;
export const WORLDGEN_TOPOLOGY_MAX_LEVEL = 7;
export const WORLDGEN_TECTONICS_MAX_LEVEL = 6;
export const WORLDGEN_TECTONICS_MIN_PLATES = 4;
export const WORLDGEN_TECTONICS_MAX_PLATES = 48;

export interface WorldgenSyntheticRequest { seed: string; width: number; height: number; }
export interface WorldgenTopologyRequest { level: number; }
export interface WorldgenTectonicsRequest { seed: string; level: number; plateCount: number; }

export interface WorldgenFieldStatistics { sampleCount: number; minimum: number; maximum: number; mean: number; fieldHash: string; }
export interface WorldgenStageMetadata { id: string; version: number; stageSeed: string; durationMs: number; }
export interface WorldgenSyntheticResult { engineVersion: number; width: number; height: number; values: Uint16Array; statistics: WorldgenFieldStatistics; stage: WorldgenStageMetadata; }

export interface WorldgenTopologyMetrics { sampleCount: number; edgeCount: number; faceCount: number; fiveNeighborCount: number; sixNeighborCount: number; totalAreaSteradians: number; minimumAreaSteradians: number; maximumAreaSteradians: number; meanAreaSteradians: number; areaCoefficientOfVariation: number; minimumEdgeArcRadians: number; maximumEdgeArcRadians: number; meanEdgeArcRadians: number; edgeCoefficientOfVariation: number; minimumInterfaceArcRadians: number; maximumInterfaceArcRadians: number; meanInterfaceArcRadians: number; interfaceCoefficientOfVariation: number; topologyHash: string; }
export interface WorldgenTopologyResult { engineVersion: number; level: number; metrics: WorldgenTopologyMetrics; durationMs: number; positions: Float64Array; faces: Uint32Array; neighborOffsets: Uint32Array; neighbors: Uint32Array; neighborArcLengthsRad: Float64Array; neighborInterfaceArcLengthsRad: Float64Array; areaSteradians: Float64Array; birthLevels: Uint8Array; parentEdges: Uint32Array; }

export const WORLDGEN_BOUNDARY_CONVERGENT = 1;
export const WORLDGEN_BOUNDARY_DIVERGENT = 2;
export const WORLDGEN_BOUNDARY_TRANSFORM = 3;
export interface WorldgenTectonicMetrics { sampleCount: number; plateCount: number; boundaryEdgeCount: number; convergentEdgeCount: number; divergentEdgeCount: number; transformEdgeCount: number; minimumPlateAreaFraction: number; maximumPlateAreaFraction: number; meanPlateAreaFraction: number; minimumSeedSeparationRad: number; meanReferenceSpeedMmPerYear: number; tectonicHash: string; }
export interface WorldgenTectonicsResult {
  engineVersion: number;
  level: number;
  topologyHash: string;
  metrics: WorldgenTectonicMetrics;
  stage: WorldgenStageMetadata;
  positions: Float64Array;
  faces: Uint32Array;
  neighborOffsets: Uint32Array;
  neighbors: Uint32Array;
  plateIds: Uint16Array;
  plateSeedSamples: Uint32Array;
  plateEulerPoles: Float64Array;
  plateAngularVelocitiesRadPerMyr: Float64Array;
  plateAreaSteradians: Float64Array;
  boundarySamples: Uint32Array;
  boundaryPlateIds: Uint16Array;
  boundaryKinds: Uint8Array;
  boundaryNormalRatesMPerYear: Float64Array;
  boundaryShearRatesMPerYear: Float64Array;
}

export interface WorldgenSyntheticCommand { protocolVersion: number; requestId: number; type: 'generate-synthetic'; payload: WorldgenSyntheticRequest; }
export interface WorldgenTopologyCommand { protocolVersion: number; requestId: number; type: 'generate-topology'; payload: WorldgenTopologyRequest; }
export interface WorldgenTectonicsCommand { protocolVersion: number; requestId: number; type: 'generate-tectonics'; payload: WorldgenTectonicsRequest; }
export type WorldgenCommand = WorldgenSyntheticCommand | WorldgenTopologyCommand | WorldgenTectonicsCommand;

export interface WorldgenGeneratedSyntheticEvent { protocolVersion: number; requestId: number; type: 'generated-synthetic'; payload: WorldgenSyntheticResult; }
export interface WorldgenGeneratedTopologyEvent { protocolVersion: number; requestId: number; type: 'generated-topology'; payload: WorldgenTopologyResult; }
export interface WorldgenGeneratedTectonicsEvent { protocolVersion: number; requestId: number; type: 'generated-tectonics'; payload: WorldgenTectonicsResult; }
export interface WorldgenErrorEvent { protocolVersion: number; requestId: number; type: 'error'; payload: { message: string }; }
export type WorldgenEvent = WorldgenGeneratedSyntheticEvent | WorldgenGeneratedTopologyEvent | WorldgenGeneratedTectonicsEvent | WorldgenErrorEvent;

export function validateSyntheticRequest(request: WorldgenSyntheticRequest): void {
  if (!request.seed.trim()) throw new Error('Worldgen seed must not be empty.');
  for (const [name, value] of [['width', request.width], ['height', request.height]] as const) if (!Number.isInteger(value) || value <= 0) throw new Error(`Worldgen ${name} must be a positive integer.`);
  const samples = request.width * request.height;
  if (!Number.isSafeInteger(samples) || samples > WORLDGEN_SYNTHETIC_MAX_SAMPLES) throw new Error(`WG-0 synthetic diagnostics are limited to ${WORLDGEN_SYNTHETIC_MAX_SAMPLES.toLocaleString()} samples.`);
}

export function validateTopologyRequest(request: WorldgenTopologyRequest): void {
  if (!Number.isInteger(request.level) || request.level < 0 || request.level > WORLDGEN_TOPOLOGY_MAX_LEVEL) throw new Error(`WG-1 browser topology level must be an integer from 0 through ${WORLDGEN_TOPOLOGY_MAX_LEVEL}.`);
}

export function validateTectonicsRequest(request: WorldgenTectonicsRequest): void {
  if (!request.seed.trim()) throw new Error('WG-2 tectonic seed must not be empty.');
  if (!Number.isInteger(request.level) || request.level < 0 || request.level > WORLDGEN_TECTONICS_MAX_LEVEL) throw new Error(`WG-2 browser tectonics level must be an integer from 0 through ${WORLDGEN_TECTONICS_MAX_LEVEL}.`);
  if (!Number.isInteger(request.plateCount) || request.plateCount < WORLDGEN_TECTONICS_MIN_PLATES || request.plateCount > WORLDGEN_TECTONICS_MAX_PLATES) throw new Error(`WG-2 plate count must be an integer from ${WORLDGEN_TECTONICS_MIN_PLATES} through ${WORLDGEN_TECTONICS_MAX_PLATES}.`);
  const samples = 10 * (4 ** request.level) + 2;
  if (request.plateCount > samples) throw new Error('WG-2 plate count cannot exceed topology sample count.');
}

export function worldgenSyntheticCommand(requestId: number, payload: WorldgenSyntheticRequest): WorldgenSyntheticCommand { validateSyntheticRequest(payload); return { protocolVersion: WORLDGEN_PROTOCOL_VERSION, requestId, type: 'generate-synthetic', payload }; }
export function worldgenTopologyCommand(requestId: number, payload: WorldgenTopologyRequest): WorldgenTopologyCommand { validateTopologyRequest(payload); return { protocolVersion: WORLDGEN_PROTOCOL_VERSION, requestId, type: 'generate-topology', payload }; }
export function worldgenTectonicsCommand(requestId: number, payload: WorldgenTectonicsRequest): WorldgenTectonicsCommand { validateTectonicsRequest(payload); return { protocolVersion: WORLDGEN_PROTOCOL_VERSION, requestId, type: 'generate-tectonics', payload }; }
