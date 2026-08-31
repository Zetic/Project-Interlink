import { MECHANICAL_PLACEMENT_MIN_ZOOM } from '../camera/mapCamera.js';

/**
 * Engineering cards use a hard visibility boundary with hysteresis instead of
 * fractional alpha. FEATURE, APPARATUS, and CONTAINER cards always appear as one
 * complete unit: box, header, text, and ports.
 */
export const ENGINEERING_NODE_SHOW_ZOOM = 2 ** 16;
export const ENGINEERING_NODE_HIDE_ZOOM = 55_000;
export const ENGINEERING_NODE_INTERACTIVE_ZOOM = MECHANICAL_PLACEMENT_MIN_ZOOM;

export function engineeringNodesVisibleAtZoom(zoom: number, wasVisible: boolean): boolean {
  return wasVisible ? zoom > ENGINEERING_NODE_HIDE_ZOOM : zoom >= ENGINEERING_NODE_SHOW_ZOOM;
}

export function applyEngineeringNodeVisibility(svg: SVGSVGElement, layer: SVGGElement | null, zoom: number): void {
  if (!layer) return;
  const wasVisible = svg.dataset.engineeringNodesVisible === 'true';
  const visible = engineeringNodesVisibleAtZoom(zoom, wasVisible);
  svg.dataset.engineeringNodesVisible = visible ? 'true' : 'false';
  layer.style.opacity = '1';
  layer.style.visibility = visible ? 'visible' : 'hidden';
  layer.style.pointerEvents = visible && zoom >= ENGINEERING_NODE_INTERACTIVE_ZOOM ? 'auto' : 'none';
}
