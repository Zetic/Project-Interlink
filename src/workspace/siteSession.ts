import {
  createBlueprint,
  blueprintAddFeatureSource,
  blueprintAddHopper,
  createBlueprintLayout,
  layoutMoveNode,
  DEFAULT_HOPPER_CAPACITY_KG,
} from '../simulation/simulationEngine.js';
import { setBoundaryMapping } from '../core/systems/systemNode.js';
import type { World } from '../core/world/types.js';
import type { BlueprintNode } from '../simulation/types.js';
import type { SiteSessionLike } from './types.js';

export interface BuildSiteSessionOptions {
  siteImport?: BlueprintNode | null;
  siteExport?: BlueprintNode | null;
}

/**
 * Build the current Site runtime graph from canonical Site → Feature →
 * ResourceOccurrence ownership. Apparatus and containers are added later by
 * the player through the NODE catalog.
 */
export function buildSiteSession(
  world: World,
  siteId: string,
  {
    siteImport = null,
    siteExport = null,
  }: BuildSiteSessionOptions = {},
): SiteSessionLike {
  const site = world?.sites?.[siteId];
  if (!site) throw new Error(`Unknown Site '${siteId}'`);

  const blueprint = createBlueprint();
  const blueprintLayout = createBlueprintLayout();
  const importNode = siteImport ?? blueprintAddHopper(blueprint, DEFAULT_HOPPER_CAPACITY_KG);
  const exportNode = siteExport ?? blueprintAddHopper(blueprint, DEFAULT_HOPPER_CAPACITY_KG);

  importNode.boundaryRole = 'import';
  importNode.systemType = 'boundary-buffer';
  importNode.displayName = 'Site Import';
  exportNode.boundaryRole = 'export';
  exportNode.systemType = 'boundary-buffer';
  exportNode.displayName = 'Site Export';
  blueprint.nodes[importNode.id] = importNode;
  blueprint.nodes[exportNode.id] = exportNode;

  const featureNodes = new Map<string, BlueprintNode>();
  for (const featureId of site.featureIds ?? []) {
    const feature = world.features?.[featureId];
    if (!feature) continue;
    const featureNode = blueprintAddFeatureSource(blueprint, {
      featureId,
      displayName: feature.name,
      resourceOccurrenceIds: feature.resourceOccurrences,
    });
    featureNodes.set(featureId, featureNode);
  }

  let featureIndex = 0;
  for (const featureNode of featureNodes.values()) {
    layoutMoveNode(blueprintLayout, featureNode.id, 60, 50 + featureIndex * 130);
    featureIndex++;
  }
  layoutMoveNode(blueprintLayout, importNode.id, 60, Math.max(330, 70 + featureIndex * 130));
  layoutMoveNode(blueprintLayout, exportNode.id, 1480, 60);

  const siteNode = world.systemNodes?.[siteId];
  if (siteNode) {
    if (!importNode.inputPortId || !exportNode.outputPortId) {
      throw new Error(`Site '${siteId}' boundary buffers are missing canonical material ports`);
    }
    setBoundaryMapping(siteNode, 'material-input', importNode.id, importNode.inputPortId, blueprint);
    setBoundaryMapping(siteNode, 'material-output', exportNode.id, exportNode.outputPortId, blueprint);
  }

  return {
    id: siteId,
    siteId,
    blueprint,
    blueprintLayout,
    boundaryNode: siteNode ?? null,
    featureNodes,
  };
}
