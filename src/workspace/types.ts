import type { SystemNode } from '../core/systems/types.js';
import type { World } from '../core/world/types.js';
import type { Blueprint, BlueprintLayout, BlueprintNode } from '../simulation/types.js';

export type WorkspaceLevel = 'planet' | 'region' | 'site';
export type GraphAdapterId = 'blueprint' | 'boundary-transfer';

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface ViewportState {
  panX: number;
  panY: number;
  zoom: number;
}

export interface PlacementState {
  definitionId: string | null;
  graphPosition: Point | null;
}

export interface CatalogPointerGesture {
  pointerId: number;
  definitionId: string;
  start: Point;
  dragging: boolean;
}

export interface RuntimeDetailRequestState {
  key: string;
  elapsedSeconds: number;
}

export interface RuntimeSnapshotLike {
  elapsedSeconds?: number;
  [key: string]: unknown;
}

export interface RuntimeReconfigureOptions {
  resetNodeIds?: readonly string[];
}

export interface RuntimeReconfigureResult {
  snapshot?: RuntimeSnapshotLike | null;
  [key: string]: unknown;
}

export interface RealtimeRuntimeLike {
  backend: string;
  snapshot?: RuntimeSnapshotLike | null;
  queryDetail?: (entityType: string, id: string) => Promise<Record<string, unknown>> | Record<string, unknown>;
  reconfigure: (
    world: World | null,
    options?: RuntimeReconfigureOptions,
  ) => Promise<RuntimeReconfigureResult | null> | RuntimeReconfigureResult | null;
  [key: string]: unknown;
}

export interface SiteSessionLike {
  id: string;
  siteId: string;
  blueprint: Blueprint;
  blueprintLayout: BlueprintLayout;
  boundaryNode: SystemNode | null;
  featureNodes: Map<string, BlueprintNode>;
}

export interface NavigationEntry {
  key: string;
  targetId: string;
  nodeId: string | null;
  parentKey: string | null;
  category: string;
  label: string;
  workspaceLevel: WorkspaceLevel | null;
  workspaceId: string | null;
  isComposite: boolean;
  searchTerms: string[];
  source: unknown;
}

export interface NavigationIndex {
  entries: NavigationEntry[];
  byKey: Map<string, NavigationEntry>;
  roots: NavigationEntry[];
  childrenByKey: Map<string, NavigationEntry[]>;
  categories: string[];
  categoryLabels: Record<string, string>;
}

export interface NavigationRow extends NavigationEntry {
  depth: number;
  isMatch: boolean;
  isContext: boolean;
  isFiltered: boolean;
  isActive: boolean;
  isSelected: boolean;
  isExpanded: boolean;
  hasChildren: boolean;
}

export interface NavigationProjection {
  rows: NavigationRow[];
  query: string;
  matchCount: number;
  searchRevealedKeys: Set<string>;
  requiredExpandedKeys: Set<string>;
  manualExpandedKeys: Set<string>;
  visibleCategories: Set<string>;
}

export interface GraphEndpoint {
  nodeId: string;
  portId: string;
}

export interface WorkspaceState {
  currentLevel: WorkspaceLevel;
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
  systemConnectionElements: Map<string, SVGPathElement>;
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
  connectionElements: Map<string, SVGPathElement>;
  connectionPreview: SVGLineElement | null;
  viewports: Record<string, ViewportState>;
  dragTrackingCleanup: (() => void) | null;
  navigationOpen: boolean;
  navigationQuery: string;
  navigationHiddenCategories: Set<string>;
  navigationManualExpandedKeys: Set<string>;
  navigationEventsInstalled: boolean;
  navigationEventController: AbortController | null;
  navigationIndexCache: NavigationIndex | null;
  nodeCatalogOpen: boolean;
  nodeCatalogQuery: string;
  nodeCatalogHiddenCategories: Set<string>;
  nodeCatalogCollapsedCategories: Set<string>;
  placement: PlacementState;
  catalogPointer: CatalogPointerGesture | null;
  suppressCatalogClick: boolean;
}

export interface PendingGraphConnectionState {
  active: boolean;
  source: GraphEndpoint | null;
  x: number;
  y: number;
  scopeId: string | null;
  adapter: GraphAdapterId | null;
}

export interface InspectorState {
  selectedNodeId: string | null;
  selectedConnId: string | null;
  selectedSystemId: string | null;
  selectedTransferId: string | null;
  message: string;
  renderKey: string | null;
}
