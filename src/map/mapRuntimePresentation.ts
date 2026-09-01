import { updateMechanicalRuntimePresentation } from './rendering/mechanicalRenderer.js';
import { updateResourceRuntimePresentation } from './rendering/resourceRenderer.js';
import type { RuntimeSnapshot } from '../runtime/presentation.js';
import type { AppStore } from '../state/appState.js';

/** Projects live runtime values into existing SVG text without rebuilding map geometry. */
export function installMapRuntimePresentation(root: HTMLElement, store: AppStore): void {
  const svg = root.querySelector<SVGSVGElement>('#ws-map-svg');
  if (!svg) return;
  let lastSnapshot: RuntimeSnapshot | null | undefined;

  const render = (): void => {
    const state = store.getState();
    if (state.runtime.snapshot === lastSnapshot) return;
    lastSnapshot = state.runtime.snapshot;
    const planet = state.world?.planet;
    if (!planet) return;
    updateMechanicalRuntimePresentation(svg, state.graph, state.runtime.snapshot);
    updateResourceRuntimePresentation(svg, planet, state.runtime.snapshot);
  };

  store.subscribeDomains(['world', 'graph', 'runtime'], render);
}
