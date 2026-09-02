import { createEmptyGraphState } from '../graph/graphCommands.js';
import type { GraphState, PortEndpoint } from '../graph/types.js';
import { createDisconnectedRuntimeState, type RuntimePresentationState } from '../runtime/presentation.js';
import { worldSpatialIndexFor } from '../world/spatialIndex.js';
import type { Bounds, MapCameraState, MapSelection, WorldState } from '../world/types.js';

export interface GraphInteractionState {
  placementDefinitionId: string | null;
  pendingConnection: PortEndpoint | null;
  notice: string | null;
}

export interface AppState {
  world: WorldState | null;
  graph: GraphState;
  selection: MapSelection;
  camera: MapCameraState;
  interaction: GraphInteractionState;
  runtime: RuntimePresentationState;
}

export type AppStateDomain = keyof AppState | 'telemetry';
export type AppStateListener = (state: Readonly<AppState>) => void;

interface AppStateSubscription {
  listener: AppStateListener;
  domains: ReadonlySet<AppStateDomain> | null;
}

const STRUCTURAL_APP_DOMAINS: readonly AppStateDomain[] = ['world', 'graph', 'selection', 'camera', 'interaction'];

export const RESOURCE_FOCUS_ZOOM = 2 ** 19;
export const MECHANICAL_FOCUS_ZOOM = 2 ** 20;

export function geographicFocusZoom(world: WorldState, bounds: Bounds): number {
  const widthZoom = world.planet.width / Math.max(1, bounds.width * 1.3);
  const heightZoom = world.planet.height / Math.max(1, bounds.height * 1.3);
  return Math.max(1, Math.min(2 ** 13, Math.min(widthZoom, heightZoom)));
}

const emptyInteraction = (): GraphInteractionState => ({ placementDefinitionId: null, pendingConnection: null, notice: null });

export class AppStore {
  private readonly subscriptions = new Set<AppStateSubscription>();

  private state: AppState = {
    world: null,
    graph: createEmptyGraphState(),
    selection: { type: 'planet' },
    camera: { centerX: 0, centerY: 0, zoom: 1 },
    interaction: emptyInteraction(),
    runtime: createDisconnectedRuntimeState(),
  };

  getState(): Readonly<AppState> {
    return this.state;
  }

  setWorld(world: WorldState): void {
    this.state = {
      world,
      graph: createEmptyGraphState(),
      selection: { type: 'planet' },
      camera: { centerX: world.planet.width / 2, centerY: world.planet.height / 2, zoom: 1 },
      interaction: emptyInteraction(),
      runtime: createDisconnectedRuntimeState(),
    };
    this.emit('world', 'graph', 'selection', 'camera', 'interaction', 'runtime', 'telemetry');
  }

  setSelection(selection: MapSelection): void {
    this.state = { ...this.state, selection };
    this.emit('selection');
  }

  setCamera(camera: MapCameraState): void {
    this.state = { ...this.state, camera };
    this.emit('camera');
  }

  setGraph(graph: GraphState): void {
    this.state = { ...this.state, graph };
    this.emit('graph');
  }

  updateRuntime(patch: Partial<RuntimePresentationState>): void {
    this.state = {
      ...this.state,
      runtime: {
        ...this.state.runtime,
        ...patch,
        telemetry: patch.telemetry
          ? { ...this.state.runtime.telemetry, ...patch.telemetry }
          : this.state.runtime.telemetry,
        details: patch.details ?? this.state.runtime.details,
      },
    };
    const presentationChanged = Object.keys(patch).some(key => key !== 'telemetry');
    if (presentationChanged && patch.telemetry) this.emit('runtime', 'telemetry');
    else if (presentationChanged) this.emit('runtime');
    else if (patch.telemetry) this.emit('telemetry');
  }

  setPlacement(placementDefinitionId: string | null): void {
    this.state = {
      ...this.state,
      interaction: { placementDefinitionId, pendingConnection: null, notice: null },
    };
    this.emit('interaction');
  }

  setPendingConnection(pendingConnection: PortEndpoint | null): void {
    this.state = {
      ...this.state,
      interaction: { ...this.state.interaction, placementDefinitionId: null, pendingConnection },
    };
    this.emit('interaction');
  }

  setInteractionNotice(notice: string | null): void {
    this.state = { ...this.state, interaction: { ...this.state.interaction, notice } };
    this.emit('interaction');
  }

  clearInteraction(): void {
    this.state = { ...this.state, interaction: emptyInteraction() };
    this.emit('interaction');
  }

  focusSelection(selection: MapSelection): void {
    const world = this.state.world;
    if (!world) {
      this.setSelection(selection);
      return;
    }

    let camera: MapCameraState = this.state.camera;
    const index = worldSpatialIndexFor(world.planet);
    if (selection.type === 'planet') {
      camera = { centerX: world.planet.width / 2, centerY: world.planet.height / 2, zoom: 1 };
    } else if (selection.type === 'continent') {
      const continent = index.continentById(selection.continentId);
      if (continent) camera = { centerX: continent.center.x, centerY: continent.center.y, zoom: geographicFocusZoom(world, continent.focusBounds) };
    } else if (selection.type === 'ocean') {
      const ocean = index.oceanById(selection.oceanId);
      if (ocean) camera = { centerX: ocean.center.x, centerY: ocean.center.y, zoom: geographicFocusZoom(world, ocean.focusBounds) };
    } else if (selection.type === 'region') {
      const region = index.regionById(selection.regionId);
      if (region) {
        camera = {
          centerX: region.center.x,
          centerY: region.center.y,
          zoom: geographicFocusZoom(world, region.bounds),
        };
      }
    } else if (selection.type === 'resource') {
      const resource = index.featureById(selection.resourceNodeId);
      if (resource) camera = { centerX: resource.position.x, centerY: resource.position.y, zoom: RESOURCE_FOCUS_ZOOM };
    } else if (selection.type === 'mechanical') {
      const node = this.state.graph.nodes.find(candidate => candidate.id === selection.mechanicalNodeId);
      if (node) camera = { centerX: node.position.x, centerY: node.position.y, zoom: MECHANICAL_FOCUS_ZOOM };
    }

    this.state = { ...this.state, selection, camera };
    this.emit('selection', 'camera');
  }

  /** Structural UI subscription. Runtime presentation consumers use subscribeDomains. */
  subscribe(listener: AppStateListener): () => void {
    return this.subscribeDomains(STRUCTURAL_APP_DOMAINS, listener);
  }

  subscribeDomains(domains: readonly AppStateDomain[] | null, listener: AppStateListener): () => void {
    const subscription: AppStateSubscription = {
      listener,
      domains: domains ? new Set(domains) : null,
    };
    this.subscriptions.add(subscription);
    listener(this.state);
    return () => this.subscriptions.delete(subscription);
  }

  private emit(...changedDomains: AppStateDomain[]): void {
    const changed = new Set(changedDomains);
    for (const subscription of this.subscriptions) {
      if (subscription.domains && ![...subscription.domains].some(domain => changed.has(domain))) continue;
      subscription.listener(this.state);
    }
  }
}
