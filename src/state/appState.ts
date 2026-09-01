import { createEmptyGraphState } from '../graph/graphCommands.js';
import type { GraphState, PortEndpoint } from '../graph/types.js';
import { createDisconnectedRuntimeState, type RuntimePresentationState } from '../runtime/presentation.js';
import type { MapCameraState, MapSelection, Region, WorldState } from '../world/types.js';

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

export const RESOURCE_FOCUS_ZOOM = 2 ** 19;
export const MECHANICAL_FOCUS_ZOOM = 2 ** 20;

function regionFocusZoom(world: WorldState, region: Region): number {
  const widthZoom = world.planet.width / Math.max(1, region.bounds.width * 1.35);
  const heightZoom = world.planet.height / Math.max(1, region.bounds.height * 1.35);
  return Math.min(6, Math.max(2, Math.min(widthZoom, heightZoom)));
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
    if (selection.type === 'planet') {
      camera = { centerX: world.planet.width / 2, centerY: world.planet.height / 2, zoom: 1 };
    } else if (selection.type === 'region') {
      const region = world.planet.regions.find(candidate => candidate.id === selection.regionId);
      if (region) {
        camera = {
          centerX: region.bounds.x + region.bounds.width / 2,
          centerY: region.bounds.y + region.bounds.height / 2,
          zoom: regionFocusZoom(world, region),
        };
      }
    } else if (selection.type === 'resource') {
      const resource = world.planet.resourceNodes.find(candidate => candidate.id === selection.resourceNodeId);
      if (resource) camera = { centerX: resource.position.x, centerY: resource.position.y, zoom: RESOURCE_FOCUS_ZOOM };
    } else {
      const node = this.state.graph.nodes.find(candidate => candidate.id === selection.mechanicalNodeId);
      if (node) camera = { centerX: node.position.x, centerY: node.position.y, zoom: MECHANICAL_FOCUS_ZOOM };
    }

    this.state = { ...this.state, selection, camera };
    this.emit('selection', 'camera');
  }

  subscribe(listener: AppStateListener): () => void {
    return this.subscribeDomains(null, listener);
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
