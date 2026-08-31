import type { GasMaterialState, SolidMaterialState } from '../core/materials/types.js';
import type { SystemPort } from '../core/systems/types.js';

export interface RuntimePresentationState {
  operatingState?: string;
  [key: string]: unknown;
}

export interface BlueprintNode {
  id: string;
  nodeType: string;
  systemType?: string;
  kind?: string;
  processId?: string;
  ports?: SystemPort[];
  enabled?: boolean;
  operatingState?: string;
  runtimePresentation?: RuntimePresentationState;
  occurrenceId?: string | null;
  requestedOccurrenceId?: string | null;
  resourceOccurrenceIds?: string[];
  featureId?: string;
  displayName?: string;
  boundaryRole?: string;
  inputPortId?: string;
  outputPortId?: string;
  sourceInputPortId?: string;
  gasInputPortId?: string;
  gasOutputPortId?: string;
  [key: string]: unknown;
}

export interface BlueprintConnection {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  kind: string;
  occurrenceId?: string | null;
}

export interface MaterialStream {
  id: string;
  connectionId: string | null;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  physicalForm: string;
  nominalParticleSizeMm: number | null;
  solidState?: SolidMaterialState;
  gasState?: GasMaterialState;
  specificSensibleEnthalpyJPerKg: number;
  componentMassFlowKgPerSecond: Record<string, number>;
  particleSizeMm: number | null;
  _cachedTotalMassFlowKgPerSecond?: number;
  _runtimePresentationMassFlowKgPerSecond?: number;
}

export interface Blueprint {
  nodes: Record<string, BlueprintNode>;
  connections: Record<string, BlueprintConnection>;
  streams: Record<string, MaterialStream>;
  simulationStats: {
    elapsedSeconds: number;
    extractedKg: number;
  };
}

export interface BlueprintLayout {
  nodePositions: Record<string, { x: number; y: number }>;
}

export interface ConnectionCheckResult {
  ok: boolean;
  reason: string;
  occurrenceId?: string | null;
}
