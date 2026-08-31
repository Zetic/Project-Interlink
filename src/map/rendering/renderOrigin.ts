import type { MapCameraState, Point } from '../../world/types.js';

export const FLOATING_ORIGIN_ENTER_ZOOM = 2 ** 15;
export const FLOATING_ORIGIN_EXIT_ZOOM = 2 ** 14;
export const FLOATING_ORIGIN_RECENTER_DISTANCE_WORLD_UNITS = 0.25;

export interface RenderOriginState {
  active: boolean;
  origin: Point;
}

export interface RenderOriginOptions {
  recenter?: boolean;
  allowDeactivate?: boolean;
}

export function initialRenderOrigin(): RenderOriginState {
  return { active: false, origin: { x: 0, y: 0 } };
}

export function renderOriginForCamera(
  current: RenderOriginState,
  camera: MapCameraState,
  options: RenderOriginOptions = {},
): RenderOriginState {
  if (!current.active) {
    if (camera.zoom < FLOATING_ORIGIN_ENTER_ZOOM) return current;
    return { active: true, origin: { x: camera.centerX, y: camera.centerY } };
  }

  if (options.allowDeactivate && camera.zoom <= FLOATING_ORIGIN_EXIT_ZOOM) {
    return initialRenderOrigin();
  }

  if (options.recenter) {
    const distance = Math.hypot(camera.centerX - current.origin.x, camera.centerY - current.origin.y);
    if (distance >= FLOATING_ORIGIN_RECENTER_DISTANCE_WORLD_UNITS) {
      return { active: true, origin: { x: camera.centerX, y: camera.centerY } };
    }
  }

  return current;
}

export function sameRenderOrigin(left: RenderOriginState, right: RenderOriginState): boolean {
  return left.active === right.active
    && left.origin.x === right.origin.x
    && left.origin.y === right.origin.y;
}

export function worldToRenderPoint(point: Point, state: RenderOriginState): Point {
  return { x: point.x - state.origin.x, y: point.y - state.origin.y };
}
