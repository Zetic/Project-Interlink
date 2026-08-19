/**
 * DOM-independent placement state and blueprint commit helpers.
 */

import { layoutMoveNode } from '../simulation/simulationEngine.js';
import { screenToGraph } from './viewport.js';

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
