import { SIMULATION_STEP_S } from '../simulation/simulationEngine.js';
import { createPlacementState } from './graph/nodePlacement.js';
import type {
  InspectorState,
  PendingGraphConnectionState,
  WorkspaceState,
} from './types.js';

export function createWorkspaceState(): WorkspaceState {
  let simAccumulatedS = 0;
  return {
    currentLevel: 'planet',
    selectedRegionId: null,
    selectedSiteId: null,
    selectedOccurrenceId: null,
    world: null,
    knowledge: null,
    blueprint: null,
    blueprintLayout: null,
    siteSessions: {},
    workspaceLayouts: {},
    systemNodeElements: new Map(),
    systemConnectionElements: new Map(),
    realtimeRuntime: null,
    runtimeReady: false,
    runtimeError: null,
    runtimeEpoch: 0,
    runtimeMutationPending: 0,
    runtimeMutationChain: null,
    runtimeDetailInFlight: null,
    runtimeDetailRefreshPending: false,
    runtimeDetailLastRequest: null,
    simRunning: false,
    simStepInFlight: false,
    simLastTime: null,
    /**
     * Wall-clock debt is presentation/scheduling state, not physical truth.
     * Keep at most one authoritative 0.1 s physics step queued so slow hardware
     * reduces realtime factor instead of building unbounded catch-up work.
     */
    get simAccumulatedS() { return simAccumulatedS; },
    set simAccumulatedS(value: number) {
      simAccumulatedS = Number.isFinite(value)
        ? Math.max(0, Math.min(SIMULATION_STEP_S, value))
        : 0;
    },
    simRafId: null,
    nodeElements: new Map(),
    connectionElements: new Map(),
    connectionPreview: null,
    viewports: {},
    dragTrackingCleanup: null,
    navigationOpen: false,
    navigationQuery: '',
    navigationHiddenCategories: new Set(),
    navigationManualExpandedKeys: new Set(),
    navigationEventsInstalled: false,
    navigationEventController: null,
    navigationIndexCache: null,
    nodeCatalogOpen: false,
    nodeCatalogQuery: '',
    nodeCatalogHiddenCategories: new Set(),
    nodeCatalogCollapsedCategories: new Set(),
    placement: createPlacementState(),
    catalogPointer: null,
    suppressCatalogClick: false,
  };
}

export const wsState = createWorkspaceState();

export const pendingGraphConnection: PendingGraphConnectionState = {
  active: false,
  source: null,
  x: 0,
  y: 0,
  scopeId: null,
  adapter: null,
};

export const inspector: InspectorState = {
  selectedNodeId: null,
  selectedConnId: null,
  selectedSystemId: null,
  selectedTransferId: null,
  message: '',
  renderKey: null,
};
