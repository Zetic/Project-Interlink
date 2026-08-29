/**
 * Domain rules for removing player-authored Site blueprint nodes.
 *
 * Removal is intentionally separate from the Inspector and keyboard UI so
 * every command uses the same eligibility, matter, and disconnect behavior.
 */

import {
  blueprintDisconnect,
  invalidateBlueprintExecutionPlan,
  invalidateBlueprintLayout,
} from '../../simulation/simulationEngine.js';
import {
  HOPPER_TOLERANCE_KG,
  hopperStoredMassKg,
} from '../../simulation/hopperNode.js';
import {
  roastingFurnaceChargeMassKg,
  roastingFurnacePendingFeedMassKg,
} from '../../simulation/apparatus/roastingFurnace.js';
import { getApparatusDefinition } from '../../content/apparatus/definitions.js';

function resolveNode(blueprint, nodeOrId) {
  if (typeof nodeOrId === 'string') return blueprint?.nodes?.[nodeOrId] ?? null;
  return nodeOrId ?? null;
}

function isPlayerRemovableNode(node) {
  if (!node || node.boundaryRole || node.systemType === 'boundary-buffer') return false;
  // Any registered apparatus may be removed, including compatibility apparatus
  // that is intentionally hidden from new placement. Catalog visibility is a
  // construction policy, not a reason to trap a legacy node in an existing Site.
  return Boolean(getApparatusDefinition(node.nodeType));
}

/**
 * Return persistent matter physically retained by a node. Environmental tally
 * nodes such as Exhaust Vent report emitted matter but no longer physically own
 * that matter, so their cumulative counters do not block deletion.
 */
export function nodeOwnedMatterKg(node) {
  if (node?.nodeType === 'hopper') return hopperStoredMassKg(node);
  if (node?.nodeType === 'roastingFurnace') {
    return roastingFurnaceChargeMassKg(node) + roastingFurnacePendingFeedMassKg(node);
  }
  return 0;
}

export function nodeRemovalMatterToleranceKg(node) {
  if (node?.nodeType === 'hopper' || node?.nodeType === 'roastingFurnace') return HOPPER_TOLERANCE_KG;
  return 0;
}

export function nodeRemovalEligibility(blueprint, nodeOrId) {
  const node = resolveNode(blueprint, nodeOrId);
  if (!node) {
    return { ok: false, removable: false, node: null, ownedMatterKg: 0, reason: 'Node no longer exists.' };
  }
  const removable = isPlayerRemovableNode(node);
  if (!removable) {
    return { ok: false, removable, node, ownedMatterKg: nodeOwnedMatterKg(node), reason: 'This node is part of the Site structure and cannot be deleted.' };
  }

  const ownedMatterKg = nodeOwnedMatterKg(node);
  if (ownedMatterKg > nodeRemovalMatterToleranceKg(node)) {
    return { ok: false, removable, node, ownedMatterKg, reason: 'Cannot delete node while it contains material.' };
  }

  return { ok: true, removable, node, ownedMatterKg, reason: '' };
}

export function canRemoveNode(blueprint, nodeOrId) {
  return nodeRemovalEligibility(blueprint, nodeOrId).ok;
}

/**
 * Disconnect all touching edges through blueprintDisconnect so material
 * streams are removed with their owning connection before the node goes away.
 */
export function removeBlueprintNode(blueprint, layout, nodeOrId) {
  const eligibility = nodeRemovalEligibility(blueprint, nodeOrId);
  if (!eligibility.ok) return { removed: false, ...eligibility };

  const nodeId = eligibility.node.id;
  for (const connection of Object.values(blueprint.connections ?? {})) {
    if (connection.sourceNodeId === nodeId || connection.targetNodeId === nodeId) {
      blueprintDisconnect(blueprint, connection.id);
    }
  }
  delete blueprint.nodes[nodeId];
  invalidateBlueprintExecutionPlan(blueprint);
  if (layout?.nodePositions) {
    delete layout.nodePositions[nodeId];
    invalidateBlueprintLayout(layout);
  }
  return { removed: true, ...eligibility };
}