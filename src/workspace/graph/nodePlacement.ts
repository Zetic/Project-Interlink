/**
 * DOM-independent placement state and blueprint commit helpers.
 */

import { layoutMoveNode } from '../../simulation/simulationEngine.js';
import type { Blueprint, BlueprintLayout, BlueprintNode } from '../../simulation/types.js';
import type { NodeDefinition, NodePlacementContext } from '../catalog/nodeCatalog.js';
import type { PlacementState, Point, Size, ViewportState } from '../types.js';
import { screenToGraph } from './viewport.js';

export const CATALOG_POINTER_MOVE_THRESHOLD_PX = 5;

export function createPlacementState(): PlacementState {
  return {
    definitionId: null,
    graphPosition: null,
  };
}

export function placementIsActive(state: PlacementState): boolean {
  return Boolean(state?.definitionId);
}

export function armPlacement(state: PlacementState, definitionId: string): PlacementState {
  state.definitionId = definitionId;
  return state;
}

export function updatePlacementPosition(state: PlacementState, point: Point, viewport: ViewportState): Point {
  state.graphPosition = screenToGraph(point, viewport);
  return state.graphPosition;
}

export function graphPositionForCenteredPoint(
  point: Point,
  viewport: ViewportState,
  nodeWidth = 0,
  nodeHeight = 0,
): Point {
  const graphPoint = screenToGraph(point, viewport);
  return {
    x: graphPoint.x - nodeWidth / 2,
    y: graphPoint.y - nodeHeight / 2,
  };
}

export function graphPositionForViewportCenter(
  viewport: ViewportState,
  size: Size,
  nodeWidth = 0,
  nodeHeight = 0,
): Point {
  return graphPositionForCenteredPoint(
    { x: size.width / 2, y: size.height / 2 },
    viewport,
    nodeWidth,
    nodeHeight,
  );
}

export function pointerMovementExceedsThreshold(
  start: Point,
  current: Point,
  threshold = CATALOG_POINTER_MOVE_THRESHOLD_PX,
): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) >= threshold;
}

export function cancelPlacement(state: PlacementState): PlacementState {
  state.definitionId = null;
  state.graphPosition = null;
  return state;
}

export function commitNodePlacement(
  blueprint: Blueprint,
  layout: BlueprintLayout,
  definition: NodeDefinition,
  context: NodePlacementContext,
  graphPosition: Point,
): BlueprintNode {
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
