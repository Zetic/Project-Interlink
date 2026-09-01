import { updateMechanicalRuntimePresentation } from './rendering/mechanicalRenderer.js';
import { updateResourceRuntimePresentation } from './rendering/resourceRenderer.js';
import type { AppStore } from '../state/appState.js';

/**
 * Projects live runtime values into already-rendered SVG cards without touching
 * world geometry, camera state, selection, or interaction rendering.
 */
export function installMapRuntimePresentation(root: HTMLElement, store: AppStore): void {
  const svg = root.querySelector<SVGSVGElement>('#ws-map-svg');
  if (!svg) return;

  const render = (): void => {
    const state = store.getState();
    const planet = state.world?.planet;
    if (!planet) return;
    updateMechanicalRuntimePresentation(svg, state.graph, state.runtime.snapshot);
    updateResourceRuntimePresentation(svg, planet, state.runtime.snapshot);
  };

  store.subscribeDomains(['world', 'graph', 'runtime'], render);
}
