import { createPlacementState } from './nodePlacement.js';

export function createWorkspaceState() {
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
    simRunning: false,
    simLastTime: null,
    simAccumulatedS: 0,
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
