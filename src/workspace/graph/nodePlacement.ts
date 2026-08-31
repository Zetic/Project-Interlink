/**
 * DOM-independent placement state and blueprint commit helpers.
 */

import { layoutMoveNode } from '../../simulation/simulationEngine.js';
import { screenToGraph } from './viewport.js';

export const CATALOG_POINTER_MOVE_THRESHOLD_PX = 5;

export function createPlacementState(): import('../types.js').PlacementState {
  return {
    definitionId: null,
    graphPosition: null,
  };
}

export function placementIsActive(state: import('../types.js').PlacementState): boolean {
  return Boolean(state?.definitionId);
}

export function armPlacement(state: import('../types.js').PlacementState, definitionId: string) {
  state.definitionId = definitionId;
  return state;
}

export function updatePlacementPosition(state: import('../types.js').PlacementState, point: import('../types.js').Point, viewport: import('../types.js').ViewportState) {
  state.graphPosition = screenToGraph(point, viewport);
  return state.graphPosition;
}

export function graphPositionForCenteredPoint(point: import('../types.js').Point, viewport: import('../types.js').ViewportState, nodeWidth = 0, nodeHeight = 0): import('../types.js').Point {
  const graphPoint = screenToGraph(point, viewport);
  return {
    x: graphPoint.x - nodeWidth / 2,
    y: graphPoint.y - nodeHeight / 2,
  };
}

export function graphPositionForViewportCenter(viewport: import('../types.js').ViewportState, size: import('../types.js').Size, nodeWidth = 0, nodeHeight = 0): import('../types.js').Point {
  return graphPositionForCenteredPoint(
    { x: size.width / 2, y: size.height / 2 },
    viewport,
    nodeWidth,
    nodeHeight,
  );
}

export function pointerMovementExceedsThreshold(start: import('../types.js').Point, current: import('../types.js').Point, threshold = CATALOG_POINTER_MOVE_THRESHOLD_PX) {
  return Math.hypot(current.x - start.x, current.y - start.y) >= threshold;
}

export function cancelPlacement(state: import('../types.js').PlacementState) {
  state.definitionId = null;
  state.graphPosition = null;
  return state;
}

export function commitNodePlacement(blueprint, layout, definition, context, graphPosition) {
  if (!definition || typeof definition.create !== 'function') {
    throw new Error('Placement requires a node definition');
  }
  if (!graphPosition || !Number.isFinite(graphPosition.x) || !Number.isFinite(graphPosition.y)) {
    throw new Error('Placement requires finite graph coordinates');
  }
  const node = definition.create(blueprint, context);
  layoutMoveNode(layout, node.id, graphPosition.x, graphPosition.y);
  return node;
}
