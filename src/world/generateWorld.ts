import { createRng } from './random.js';
import { RESOURCE_DEFINITIONS } from './resources.js';
import type { Bounds, Planet, Point, Region, ResourceNode, WorldState } from './types.js';

export const PLANET_MAP_WIDTH = 4096;
export const PLANET_MAP_HEIGHT = 2048;
export const REGION_COUNT = 5;

const PLANET_NAMES = ['Aethon', 'Boras', 'Caldris', 'Draven', 'Eryndor', 'Feraxis', 'Galneth', 'Havar'];
const REGION_PREFIXES = ['Veyra', 'Talus', 'Solen', 'Kharon', 'Mareth', 'Calyx', 'Vorn', 'Eos'];
const REGION_SUFFIXES = ['Highlands', 'Basin', 'Reach', 'Expanse', 'Plateau', 'Flats', 'Rift', 'Plain'];

function roundCoordinate(value: number): number {
  return Number(value.toFixed(2));
}

function rectanglePolygon(bounds: Bounds): Point[] {
  return [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ];
}

function createRegions(seed: string): Region[] {
  const widthPerRegion = PLANET_MAP_WIDTH / REGION_COUNT;
  const usedNames = new Set<string>();

  return Array.from({ length: REGION_COUNT }, (_, index) => {
    const rng = createRng(seed, `region:${index}`);
    let name = '';
    while (!name || usedNames.has(name)) {
      name = `${rng.pick(REGION_PREFIXES)} ${rng.pick(REGION_SUFFIXES)}`;
    }
    usedNames.add(name);

    const left = roundCoordinate(widthPerRegion * index);
    const right = roundCoordinate(widthPerRegion * (index + 1));
    const bounds: Bounds = {
      x: left,
      y: 0,
      width: roundCoordinate(right - left),
      height: PLANET_MAP_HEIGHT,
    };

    return {
      id: `region-${index}`,
      name,
      bounds,
      polygon: rectanglePolygon(bounds),
      resourceNodeIds: [],
    };
  });
}

function createResources(seed: string, regions: Region[]): ResourceNode[] {
  const nodes: ResourceNode[] = [];

  for (const region of regions) {
    const rng = createRng(seed, `${region.id}:resources`);
    const count = rng.int(3, 6);
    const marginX = Math.min(80, region.bounds.width * 0.1);
    const marginY = 100;

    for (let index = 0; index < count; index += 1) {
      const definition = rng.pick(RESOURCE_DEFINITIONS);
      const node: ResourceNode = {
        id: `${region.id}-resource-${index}`,
        name: `${definition.name} Deposit ${index + 1}`,
        resourceId: definition.id,
        regionId: region.id,
        position: {
          x: Number(rng.range(region.bounds.x + marginX, region.bounds.x + region.bounds.width - marginX).toFixed(2)),
          y: Number(rng.range(region.bounds.y + marginY, region.bounds.y + region.bounds.height - marginY).toFixed(2)),
        },
      };
      region.resourceNodeIds.push(node.id);
      nodes.push(node);
    }
  }

  return nodes;
}

export function generateWorld(seedInput: string): WorldState {
  const seed = String(seedInput || 'default-seed');
  const planetRng = createRng(seed, 'planet');
  const regions = createRegions(seed);
  const resourceNodes = createResources(seed, regions);

  const planet: Planet = {
    id: `planet-${seed.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 48) || 'default'}`,
    seed,
    name: planetRng.pick(PLANET_NAMES),
    width: PLANET_MAP_WIDTH,
    height: PLANET_MAP_HEIGHT,
    regions,
    resourceNodes,
  };

  return { planet };
}
