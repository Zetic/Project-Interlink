import { updateMechanicalRuntimePresentation } from './rendering/mechanicalRenderer.js';
import { updateResourceRuntimePresentation } from './rendering/resourceRenderer.js';
import type { RuntimeSnapshot } from '../runtime/presentation.js';
import type { AppState, AppStore } from '../state/appState.js';

/** Projects live runtime values into existing SVG text without rebuilding map geometry. */
export function installMapRuntimePresentation(root: HTMLElement, store: AppStore): void {
  const svg = root.querySelector<SVGSVGElement>('#ws-map-svg');
  if (!svg) return;
  let lastWorld: Readonly<AppState>['world'] | undefined;
  let lastGraph: Readonly<AppState>['graph'] | undefined;
  let lastSnapshot: RuntimeSnapshot | null | undefined;

  const render = (): void => {
    const state = store.getState();
    if (state.world === lastWorld && state.graph === lastGraph && state.runtime.snapshot === lastSnapshot) return;
    lastWorld = state.world;
    lastGraph = state.graph;
    lastSnapshot = state.runtime.snapshot;
    const planet = state.world?.planet;
    if (!planet) return;
    updateMechanicalRuntimePresentation(svg, state.graph, state.runtime.snapshot);
    updateResourceRuntimePresentation(svg, planet, state.runtime.snapshot);
  };

  store.subscribeDomains(['world', 'graph', 'runtime'], render);
}
