import type { MaterialComponentFraction, MaterialPhysicalForm } from '../material/types.js';

export type RuntimeParameterValue = number | boolean | string;

export interface RuntimeResourceSourcePlan {
  runtimeId: number;
  sourceNodeId: string;
  resourceId: string;
  physicalForm: 'solid-particulate';
  composition: MaterialComponentFraction[];
  initialReserveMassKg: number | null;
  fragmentationProfileId: 'run-of-mine-rock' | 'coarse-solid';
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
 * TypeScript owns only this stream identity/topology binding. Rust/WASM owns
 * mass flow, composition state, inventories, temperature, and all mutation.
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
  physicalForm: MaterialPhysicalForm;
}

export interface FlatRuntimePlan {
  resourceSources: RuntimeResourceSourcePlan[];
  machines: RuntimeMachinePlan[];
  resourceBindings: RuntimeResourceBinding[];
  materialStreams: RuntimeMaterialStreamBinding[];
}
