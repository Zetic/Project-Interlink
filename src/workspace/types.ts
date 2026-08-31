import type { World } from '../core/world/types.js';
import type { Blueprint, BlueprintLayout } from '../simulation/types.js';

export interface RuntimeDetailRequestState {
  key: string;
  elapsedSeconds: number;
}

export interface RealtimeRuntimeLike {
  backend: string;
  snapshot?: { elapsedSeconds?: number; [key: string]: unknown } | null;
  queryDetail?: (entityType: string, id: string) => Promise<Record<string, unknown>> | Record<string, unknown>;
  [key: string]: unknown;
}

export interface WorkspaceViewportState {
  [key: string]: unknown;
}

export interface SiteSessionLike {
  blueprint?: Blueprint;
  blueprintLayout?: BlueprintLayout;
  [key: string]: unknown;
}

export interface WorkspaceState {
  currentLevel: string;
  selectedRegionId: string | null;
  selectedSiteId: string | null;
  selectedOccurrenceId: string | null;
  world: World | null;
  knowledge: Record<string, unknown> | null;
  blueprint: Blueprint | null;
  blueprintLayout: BlueprintLayout | null;
  siteSessions: Record<string, SiteSessionLike>;
  workspaceLayouts: Record<string, BlueprintLayout>;
  systemNodeElements: Map<string, HTMLElement>;
  systemConnectionElements: Map<string, Element>;
  realtimeRuntime: RealtimeRuntimeLike | null;
  runtimeReady: boolean;
  runtimeError: Error | null;
  runtimeEpoch: number;
  runtimeMutationPending: number;
  runtimeMutationChain: Promise<unknown> | null;
  runtimeDetailInFlight: string | null;
  runtimeDetailRefreshPending: boolean;
  runtimeDetailLastRequest: RuntimeDetailRequestState | null;
  simRunning: boolean;
  simStepInFlight: boolean;
  simLastTime: number | null;
  simAccumulatedS: number;
  simRafId: number | null;
  nodeElements: Map<string, HTMLElement>;
  connectionElements: Map<string, Element>;
  connectionPreview: Element | null;
  viewports: Record<string, WorkspaceViewportState>;
  dragTrackingCleanup: (() => void) | null;
  navigationOpen: boolean;
  navigationQuery: string;
  navigationHiddenCategories: Set<string>;
  navigationManualExpandedKeys: Set<string>;
  navigationEventsInstalled: boolean;
  navigationEventController: AbortController | null;
  navigationIndexCache: unknown;
  nodeCatalogOpen: boolean;
  nodeCatalogQuery: string;
  nodeCatalogHiddenCategories: Set<string>;
  nodeCatalogCollapsedCategories: Set<string>;
  placement: Record<string, unknown>;
  catalogPointer: { x: number; y: number } | null;
  suppressCatalogClick: boolean;
}

export interface PendingGraphConnectionState {
  active: boolean;
  source: { nodeId?: string; portId?: string; [key: string]: unknown } | null;
  x: number;
  y: number;
  scopeId: string | null;
  adapter: Record<string, unknown> | null;
}

export interface InspectorState {
  selectedNodeId: string | null;
  selectedConnId: string | null;
  selectedSystemId: string | null;
  selectedTransferId: string | null;
  message: string;
  renderKey: string | null;
}
