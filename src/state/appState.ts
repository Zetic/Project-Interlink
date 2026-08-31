import type { AppState, MapSelection, WorldState } from '../world/types.js';

export type AppStateListener = (state: Readonly<AppState>) => void;

export class AppStore {
  private readonly listeners = new Set<AppStateListener>();

  private state: AppState = {
    world: null,
    selection: { type: 'planet' },
    camera: { centerX: 0, centerY: 0, zoom: 1 },
  };

  getState(): Readonly<AppState> {
    return this.state;
  }

  setWorld(world: WorldState): void {
    this.state = {
      world,
      selection: { type: 'planet' },
      camera: {
        centerX: world.planet.width / 2,
        centerY: world.planet.height / 2,
        zoom: 1,
      },
    };
    this.emit();
  }

  setSelection(selection: MapSelection): void {
    this.state = { ...this.state, selection };
    this.emit();
  }

  subscribe(listener: AppStateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.state);
  }
}
