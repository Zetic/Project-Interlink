import type { ComminutionProperties, MineralTextureProfile, SolidMaterialBody } from '../materials/types.js';
import type { SystemNode, SystemPort } from '../systems/types.js';
import type { Blueprint, BlueprintNode } from '../../simulation/types.js';

export type IdMap<T> = Record<string, T>;

export interface ResourceOccurrence {
  id: string;
  name?: string;
  sourceType: string;
  sourceId: string;
  resourceId?: string | null;
  descriptor?: string | null;
  accessScope?: string | null;
  composition?: Record<string, number>;
  mineralTexture?: MineralTextureProfile | null;
  comminutionProperties?: ComminutionProperties | null;
  [key: string]: unknown;
}

export interface GeneratedFeature extends Record<string, unknown> {
  id: string;
  name?: string;
  type?: string;
  regionalAccess?: boolean;
  resourceOccurrences?: ResourceOccurrence[];
}

export interface GeneratedSite extends Record<string, unknown> {
  id: string;
  name?: string;
  siteKind?: string;
  features?: GeneratedFeature[];
}

export interface GeneratedRegion extends Record<string, unknown> {
  id: string;
  name?: string;
  surfaceCover?: string;
  sites?: GeneratedSite[];
}

export interface GeneratedPlanet extends Record<string, unknown> {
  id: string;
  name?: string;
  regions: GeneratedRegion[];
}

export interface Feature {
  id: string;
  name?: string;
  type?: string;
  regionalAccess?: boolean;
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
  name?: string;
  surfaceCover?: string;
  siteIds: string[];
  childWorkspaceId?: string | null;
  boundaryPorts: SystemPort[];
  [key: string]: unknown;
}

export interface Planet {
  id: string;
  name?: string;
  regions: string[];
  childWorkspaceId?: string | null;
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

export interface BoundaryTransfer {
  id: string;
  sourceCompositeId: string;
  sourcePortId: string;
  targetCompositeId: string;
  targetPortId: string;
  capacityKgPerSecond: number;
  priority: number;
  scopeId: string | null;
  lastMovedKg: number;
  lastRateKgPerSecond: number;
}

export interface SimulationWorkspace {
  id?: string;
  nodes: Record<string, BlueprintNode>;
}

export interface WorldSimulationState {
  running: boolean;
  elapsedSeconds: number;
  sessions: Record<string, Blueprint>;
  workspaces?: Record<string, SimulationWorkspace>;
  transfers?: Record<string, BoundaryTransfer>;
  nextTransferOrdinal?: number;
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
