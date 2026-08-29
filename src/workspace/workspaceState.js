import { SIMULATION_STEP_S } from '../simulation/simulationEngine.js';
import { createPlacementState } from './nodePlacement.js';

export function createWorkspaceState() {
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
    runtimeReadyPromise: null,
    runtimeReconfigurePromise: Promise.resolve(),
    runtimeReconfigurePending: false,
    runtimeStepPromise: null,
    runtimeError: null,
    simRunning: false,
    realtimeRuntime: null,
    runtimeReady: false,
    runtimeError: null,
    runtimeEpoch: 0,
    runtimeMutationPending: 0,
    runtimeMutationChain: null,
    simStepInFlight: false,
    simLastTime: null,
    /**
     * Wall-clock debt is presentation/scheduling state, not physical truth.
     * Keep at most one authoritative 0.1 s physics step queued so a slow frame
     * cannot trigger an unbounded catch-up loop that monopolizes the UI thread.
     * When hardware cannot sustain realtime simulation, world time therefore
     * advances more slowly instead of accumulating unlimited work. Each physics
     * step itself is unchanged.
     */
    get simAccumulatedS() { return simAccumulatedS; },
    set simAccumulatedS(value) {
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

export const pendingGraphConnection = {
  active: false,
  source: null,
  x: 0,
  y: 0,
  scopeId: null,
  adapter: null,
};

export const inspector = {
  selectedNodeId: null,
  selectedConnId: null,
  selectedSystemId: null,
  selectedTransferId: null,
  message: '',
  renderKey: null,
};
