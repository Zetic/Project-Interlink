import { MECHANICAL_PLACEMENT_MIN_ZOOM, smoothStep } from '../camera/mapCamera.js';

/** Shared visibility contract for FEATURE, APPARATUS, and CONTAINER cards. */
export const ENGINEERING_NODE_FADE_START_ZOOM = 2 ** 16;
export const ENGINEERING_NODE_FULL_OPACITY_ZOOM = 2 ** 17;
export const ENGINEERING_NODE_INTERACTIVE_ZOOM = MECHANICAL_PLACEMENT_MIN_ZOOM;

export function engineeringNodeOpacity(zoom: number): number {
  const progress = (zoom - ENGINEERING_NODE_FADE_START_ZOOM)
    / (ENGINEERING_NODE_FULL_OPACITY_ZOOM - ENGINEERING_NODE_FADE_START_ZOOM);
  return smoothStep(progress);
}

export function applyEngineeringNodeVisibility(layer: SVGGElement | null, zoom: number): void {
  if (!layer) return;
  layer.style.opacity = engineeringNodeOpacity(zoom).toFixed(3);
  layer.style.visibility = zoom <= ENGINEERING_NODE_FADE_START_ZOOM ? 'hidden' : 'visible';
  layer.style.pointerEvents = zoom >= ENGINEERING_NODE_INTERACTIVE_ZOOM ? 'auto' : 'none';
}
