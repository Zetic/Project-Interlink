import type { ComminutionProperties, MineralTextureProfile, SolidMaterialBody } from '../materials/types.js';
import type { SystemNode, SystemPort } from '../systems/types.js';

export type IdMap<T> = Record<string, T>;

export interface ResourceOccurrence {
  id: string;
  sourceType: string;
  sourceId: string;
  resourceId?: string | null;
  composition?: Record<string, number>;
  mineralTexture?: MineralTextureProfile | null;
  comminutionProperties?: ComminutionProperties | null;
  [key: string]: unknown;
}

export interface Feature {
  id: string;
  name?: string;
  siteId: string;
  regionId: string;
  resourceOccurrences: string[];
  [key: string]: unknown;
}

export interface Site {
  id: string;
  name: string;
  siteKind: string;
  nodeType: 'site' | string;
  systemType: 'site' | string;
  regionId: string;
  featureIds: string[];
  childWorkspaceId: string | null;
  boundaryPorts: SystemPort[];
  [key: string]: unknown;
}

export interface Region {
  id: string;
  siteIds: string[];
  boundaryPorts: SystemPort[];
  [key: string]: unknown;
}

export interface Planet {
  id: string;
  regions: string[];
  [key: string]: unknown;
}

export interface MaterialBatchProvenance {
  sourceOccurrenceIds: string[];
  sourceBatchIds: string[];
  createdByProcessRunId: string | null;
}

export interface MaterialBatch {
  id: string;
  sourceOccurrenceId?: string | null;
  provenance: MaterialBatchProvenance;
  materialBody: SolidMaterialBody;
  componentsKg: Record<string, number>;
  totalMassKg: number;
  [key: string]: unknown;
}

export interface ProcessBinding {
  inputId: string;
  batchId: string;
}

export interface ProcessOutputBinding {
  outputId: string;
  batchId: string;
}

export interface ProcessResult {
  processId: string;
  inputBindings: ProcessBinding[];
  outputBatches: ProcessOutputBinding[];
  [key: string]: unknown;
}

export interface WorldSimulationState {
  running: boolean;
  elapsedSeconds: number;
  sessions: Record<string, unknown>;
}

export interface World {
  schemaVersion: number;
  generatorVersion: number;
  seed: string;
  planetId: string;
  planets: IdMap<Planet>;
  regions: IdMap<Region>;
  sites: IdMap<Site>;
  features: IdMap<Feature>;
  resourceOccurrences: IdMap<ResourceOccurrence>;
  materialBatches: IdMap<MaterialBatch>;
  processResults: IdMap<ProcessResult>;
  nextMaterialBatchOrdinal: number;
  nextProcessRunOrdinal: number;
  simulation: WorldSimulationState;
  systemNodes: IdMap<SystemNode>;
}

export interface WorldCollections {
  planets: IdMap<Planet>;
  regions: IdMap<Region>;
  sites: IdMap<Site>;
  features: IdMap<Feature>;
  resourceOccurrences: IdMap<ResourceOccurrence>;
  materialBatches: IdMap<MaterialBatch>;
  processResults: IdMap<ProcessResult>;
}
