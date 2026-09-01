import type {
  ComminutionProperties,
  FragmentationProfileId,
  MaterialComponentFraction,
  MineralTextureProfile,
  SolidParticulatePopulation,
} from '../material/types.js';

export type RuntimeParameterValue = number | boolean | string;

export interface RuntimeResourceSourcePlan {
  runtimeId: number;
  sourceNodeId: string;
  resourceId: string;
  physicalForm: 'solid-particulate';
  composition: MaterialComponentFraction[];
  fragmentationProfileId: FragmentationProfileId;
  particulatePopulations: SolidParticulatePopulation[];
  mineralTexture: MineralTextureProfile | null;
  comminutionProperties: ComminutionProperties | null;
  initialReserveMassKg: number | null;
}

export interface RuntimeMachinePlan {
  runtimeId: number;
  nodeId: string;
  nodeType: string;
  enabled: boolean;
  parameters: Record<string, RuntimeParameterValue>;
}

/** Resource-access is a source relationship, never matter in transit. */
export interface RuntimeResourceBinding {
  connectionId: string;
  sourceRuntimeId: number;
  sourceNodeId: string;
  extractorRuntimeId: number;
  extractorNodeId: string;
}

/**
 * The active flat graph currently authors solid-particulate and gas streams.
 * TypeScript owns only stream identity/topology; Rust/WASM owns flow and state.
 */
export interface RuntimeMaterialStreamBinding {
  streamId: string;
  connectionId: string;
  sourceRuntimeId: number;
  sourceNodeId: string;
  sourcePortId: string;
  targetRuntimeId: number;
  targetNodeId: string;
  targetPortId: string;
  physicalForm: 'solid-particulate' | 'gas';
}

export interface FlatRuntimePlan {
  resourceSources: RuntimeResourceSourcePlan[];
  machines: RuntimeMachinePlan[];
  resourceBindings: RuntimeResourceBinding[];
  materialStreams: RuntimeMaterialStreamBinding[];
}
