/**
 * DOM-independent placement state and blueprint commit helpers.
 */

import { layoutMoveNode } from '../simulation/simulationEngine.js';
import { screenToGraph } from './viewport.js';

export const CATALOG_POINTER_MOVE_THRESHOLD_PX = 5;

export function createPlacementState() {
  return {
    definitionId: null,
    graphPosition: null,
  };
}

export function placementIsActive(state) {
  return Boolean(state?.definitionId);
}

export function armPlacement(state, definitionId) {
  state.definitionId = definitionId;
  return state;
}

export function updatePlacementPosition(state, point, viewport) {
  state.graphPosition = screenToGraph(point, viewport);
  return state.graphPosition;
}

export function graphPositionForCenteredPoint(point, viewport, nodeWidth = 0, nodeHeight = 0) {
  const graphPoint = screenToGraph(point, viewport);
  return {
    x: graphPoint.x - nodeWidth / 2,
    y: graphPoint.y - nodeHeight / 2,
  };
}

export function graphPositionForViewportCenter(viewport, size, nodeWidth = 0, nodeHeight = 0) {
  return graphPositionForCenteredPoint(
    { x: size.width / 2, y: size.height / 2 },
    viewport,
    nodeWidth,
    nodeHeight,
  );
}

export function pointerMovementExceedsThreshold(start, current, threshold = CATALOG_POINTER_MOVE_THRESHOLD_PX) {
  return Math.hypot(current.x - start.x, current.y - start.y) >= threshold;
}

export function cancelPlacement(state) {
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
