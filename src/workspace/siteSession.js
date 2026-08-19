import {
  createBlueprint,
  blueprintAddFeatureSource,
  blueprintAddExtractor,
  blueprintAddHopper,
  blueprintAddCrusher,
  blueprintAddMagSep,
  blueprintConnect,
  createBlueprintLayout,
  layoutMoveNode,
  DEFAULT_HOPPER_CAPACITY_KG,
  DEFAULT_CRUSHER_THROUGHPUT_KG_PER_S,
  DEFAULT_CRUSHER_TARGET_PARTICLE_SIZE_MM,
  DEFAULT_MAG_SEP_FIELD_STRENGTH,
} from '../simulation/simulationEngine.js';
import { setBoundaryMapping } from '../simulation/systemNode.js';
import {
  prototypeFeatureForSite,
  prototypeOccurrenceForSite,
} from './sitePrototype.js';

/**
 * Build the current Site runtime graph from canonical Site → Feature →
 * ResourceOccurrence ownership. The iron chain remains a temporary validation
 * scaffold, but its Extractor now physically attaches to the owning Feature.
 */
export function buildSiteSession(world, siteId, {
  siteImport = null,
  siteExport = null,
} = {}) {
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

  const featureNodes = new Map();
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

  const prototypeOccurrence = prototypeOccurrenceForSite(world, site);
  const prototypeFeature = prototypeFeatureForSite(world, site);
  const prototypeFeatureNode = prototypeFeature ? featureNodes.get(prototypeFeature.id) : null;
  const extractor = prototypeOccurrence && prototypeFeatureNode
    ? blueprintAddExtractor(blueprint, prototypeOccurrence.id, 5)
    : null;
  const hopperA = extractor ? blueprintAddHopper(blueprint, DEFAULT_HOPPER_CAPACITY_KG) : null;
  const crusher = extractor ? blueprintAddCrusher(blueprint, {
    throughputKgPerSecond: DEFAULT_CRUSHER_THROUGHPUT_KG_PER_S,
    targetParticleSizeMm: DEFAULT_CRUSHER_TARGET_PARTICLE_SIZE_MM,
  }) : null;
  const hopperB = extractor ? blueprintAddHopper(blueprint, DEFAULT_HOPPER_CAPACITY_KG) : null;
  const magSep = extractor ? blueprintAddMagSep(blueprint, { fieldStrength: DEFAULT_MAG_SEP_FIELD_STRENGTH }) : null;
  const concentrateHopper = extractor ? blueprintAddHopper(blueprint, DEFAULT_HOPPER_CAPACITY_KG) : null;
  const tailingsHopper = extractor ? blueprintAddHopper(blueprint, DEFAULT_HOPPER_CAPACITY_KG) : null;

  let featureIndex = 0;
  for (const featureNode of featureNodes.values()) {
    layoutMoveNode(blueprintLayout, featureNode.id, 60, 50 + featureIndex * 130);
    featureIndex++;
  }
  layoutMoveNode(blueprintLayout, importNode.id, 60, Math.max(330, 70 + featureIndex * 130));
  if (extractor) {
    layoutMoveNode(blueprintLayout, extractor.id, 260, 100);
    layoutMoveNode(blueprintLayout, hopperA.id, 460, 100);
    layoutMoveNode(blueprintLayout, crusher.id, 660, 100);
    layoutMoveNode(blueprintLayout, hopperB.id, 860, 100);
    layoutMoveNode(blueprintLayout, magSep.id, 1060, 100);
    layoutMoveNode(blueprintLayout, concentrateHopper.id, 1260, 30);
    layoutMoveNode(blueprintLayout, tailingsHopper.id, 1260, 190);
  }
  layoutMoveNode(blueprintLayout, exportNode.id, 1480, 60);

  if (extractor) {
    const access = blueprintConnect(
      blueprint,
      prototypeFeatureNode.id,
      prototypeFeatureNode.resourceAccessPortId,
      extractor.id,
      extractor.sourceInputPortId,
    );
    if (!access) throw new Error('Prototype Extractor could not connect to its owning Feature');
    blueprintConnect(blueprint, extractor.id, extractor.outputPortId, hopperA.id, hopperA.inputPortId);
    blueprintConnect(blueprint, hopperA.id, hopperA.outputPortId, crusher.id, crusher.inputPortId);
    blueprintConnect(blueprint, crusher.id, crusher.outputPortId, hopperB.id, hopperB.inputPortId);
    blueprintConnect(blueprint, hopperB.id, hopperB.outputPortId, magSep.id, magSep.inputPortId);
    blueprintConnect(blueprint, magSep.id, magSep.concentratePortId, concentrateHopper.id, concentrateHopper.inputPortId);
    blueprintConnect(blueprint, magSep.id, magSep.tailingsPortId, tailingsHopper.id, tailingsHopper.inputPortId);
  }

  const siteNode = world.systemNodes?.[siteId];
  if (siteNode) {
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
    prototypeOccurrenceId: prototypeOccurrence?.id ?? null,
    prototypeFeatureId: prototypeFeature?.id ?? null,
    prototypeExtractorId: extractor?.id ?? null,
  };
}
