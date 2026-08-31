import { SCHEMA_VERSION, GENERATOR_VERSION } from '../versions.js';
import { createCompositeNode, createSystemPort } from '../../systems/systemNode.js';
import { PORT_CAPABILITIES } from '../../systems/ports.js';
import { validateWorld } from '../validation/worldValidation.js';
import type { SystemPort } from '../../systems/types.js';
import type {
  Feature,
  GeneratedPlanet,
  Planet,
  Region,
  Site,
  World,
} from '../types.js';

function materialBoundaryPort(direction: 'input' | 'output', id: string, label: string): SystemPort {
  return createSystemPort({
    id,
    direction,
    kind: 'material',
    label,
    ...(direction === 'input'
      ? { accepts: [PORT_CAPABILITIES.SOLID_PARTICULATE] }
      : {
        provides: [
          PORT_CAPABILITIES.SOLID_PARTICULATE,
          PORT_CAPABILITIES.STORED_SOLID_PARTICULATE,
        ],
      }),
  });
}

/**
 * Assemble serializable world truth from generated physical content.
 * Generation algorithms provide the planet; this module owns the world model
 * and its canonical hierarchy.
 */
export function assembleWorld(planet: GeneratedPlanet, seed: unknown): World {
  const seedStr = String(seed ?? 'default-seed');
  const world: World = {
    schemaVersion: SCHEMA_VERSION,
    generatorVersion: GENERATOR_VERSION,
    seed: seedStr,
    planetId: planet.id,
    planets: {},
    regions: {},
    sites: {},
    features: {},
    resourceOccurrences: {},
    materialBatches: {},
    processResults: {},
    nextMaterialBatchOrdinal: 1,
    nextProcessRunOrdinal: 1,
    simulation: {
      running: true,
      elapsedSeconds: 0,
      sessions: {},
    },
    systemNodes: {},
  };

  const regionIds: string[] = [];
  for (const generatedRegion of planet.regions) {
    const siteIds: string[] = [];
    for (const generatedSite of generatedRegion.sites ?? []) {
      const featureIds: string[] = [];
      for (const generatedFeature of generatedSite.features ?? []) {
        const occurrenceIds: string[] = [];
        for (const occurrence of generatedFeature.resourceOccurrences ?? []) {
          world.resourceOccurrences[occurrence.id] = occurrence;
          occurrenceIds.push(occurrence.id);
        }

        const feature: Feature = {
          ...generatedFeature,
          id: generatedFeature.id,
          siteId: generatedSite.id,
          regionId: generatedRegion.id,
          resourceOccurrences: occurrenceIds,
        };
        world.features[generatedFeature.id] = feature;
        featureIds.push(generatedFeature.id);
      }

      const siteNode = createCompositeNode({
        id: generatedSite.id,
        nodeType: 'site',
        systemType: 'site',
        childWorkspaceId: `${generatedSite.id}-workspace`,
        ports: [
          materialBoundaryPort('input', 'material-input', 'material in'),
          materialBoundaryPort('output', 'material-output', 'material out'),
        ],
        inspectableState: { regionId: generatedRegion.id, featureIds },
      });

      const site: Site = {
        id: generatedSite.id,
        name: generatedSite.name ?? world.features[featureIds[0]]?.name ?? generatedSite.id,
        siteKind: generatedSite.siteKind ?? 'localized',
        nodeType: 'site',
        systemType: 'site',
        regionId: generatedRegion.id,
        featureIds,
        childWorkspaceId: siteNode.childWorkspaceId,
        boundaryPorts: siteNode.ports,
      };
      world.sites[generatedSite.id] = site;
      world.systemNodes[generatedSite.id] = siteNode;
      siteIds.push(generatedSite.id);
    }

    const regionNode = createCompositeNode({
      id: generatedRegion.id,
      nodeType: 'region',
      systemType: 'region',
      childWorkspaceId: `${generatedRegion.id}-workspace`,
      ports: [
        materialBoundaryPort('input', 'material-input', 'material in'),
        materialBoundaryPort('output', 'material-output', 'material out'),
      ],
      inspectableState: { regionId: generatedRegion.id, siteIds },
    });
    world.systemNodes[generatedRegion.id] = regionNode;

    const { sites: _generatedSites, ...regionState } = generatedRegion;
    const region: Region = {
      ...regionState,
      id: generatedRegion.id,
      siteIds,
      boundaryPorts: regionNode.ports,
    };
    world.regions[generatedRegion.id] = region;
    regionIds.push(generatedRegion.id);
  }

  const planetState: Planet = {
    ...planet,
    id: planet.id,
    regions: regionIds,
  };
  world.planets[planet.id] = planetState;
  world.systemNodes[planet.id] = createCompositeNode({
    id: planet.id,
    nodeType: 'planet',
    systemType: 'planet',
    childWorkspaceId: `${planet.id}-workspace`,
    ports: [],
    inspectableState: { regionIds },
  });

  validateWorld(world);
  return world;
}
