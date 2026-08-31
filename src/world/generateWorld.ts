import { polygonBounds, polygonCentroid, pointInPolygon } from './geometry.js';
import { createRng } from './random.js';
import { RESOURCE_DEFINITIONS } from './resources.js';
import type { Planet, Point, Region, ResourceNode, WorldState } from './types.js';

export const PLANET_MAP_WIDTH = 4096;
export const PLANET_MAP_HEIGHT = 2048;
export const REGION_COUNT = 5;

const COAST_POINT_COUNT = 60;
const COAST_POINTS_PER_REGION = COAST_POINT_COUNT / REGION_COUNT;
const PLANET_NAMES = ['Aethon', 'Boras', 'Caldris', 'Draven', 'Eryndor', 'Feraxis', 'Galneth', 'Havar'];
const REGION_PREFIXES = ['Veyra', 'Talus', 'Solen', 'Kharon', 'Mareth', 'Calyx', 'Vorn', 'Eos'];
const REGION_SUFFIXES = ['Highlands', 'Basin', 'Reach', 'Expanse', 'Plateau', 'Flats', 'Rift', 'Plain'];

function roundCoordinate(value: number): number {
  return Number(value.toFixed(2));
}

function createCoastline(seed: string): Point[] {
  const rng = createRng(seed, 'geography:coastline');
  const centerX = PLANET_MAP_WIDTH / 2;
  const centerY = PLANET_MAP_HEIGHT / 2;
  const radiusX = PLANET_MAP_WIDTH * 0.42;
  const radiusY = PLANET_MAP_HEIGHT * 0.39;
  const rawRadius = Array.from({ length: COAST_POINT_COUNT }, () => rng.range(0.78, 1.05));

  return rawRadius.map((radius, index) => {
    const previous = rawRadius[(index - 1 + COAST_POINT_COUNT) % COAST_POINT_COUNT]!;
    const next = rawRadius[(index + 1) % COAST_POINT_COUNT]!;
    const smoothedRadius = (previous + radius * 2 + next) / 4;
    const angle = -Math.PI + (index / COAST_POINT_COUNT) * Math.PI * 2;
    return {
      x: roundCoordinate(centerX + Math.cos(angle) * radiusX * smoothedRadius),
      y: roundCoordinate(centerY + Math.sin(angle) * radiusY * smoothedRadius),
    };
  });
}

function createRegions(seed: string): Region[] {
  const coastline = createCoastline(seed);
  const center = { x: PLANET_MAP_WIDTH / 2, y: PLANET_MAP_HEIGHT / 2 };
  const usedNames = new Set<string>();

  return Array.from({ length: REGION_COUNT }, (_, index) => {
    const rng = createRng(seed, `region:${index}`);
    let name = '';
    while (!name || usedNames.has(name)) {
      name = `${rng.pick(REGION_PREFIXES)} ${rng.pick(REGION_SUFFIXES)}`;
    }
    usedNames.add(name);

    const arc: Point[] = [];
    const start = index * COAST_POINTS_PER_REGION;
    const end = (index + 1) * COAST_POINTS_PER_REGION;
    for (let coastIndex = start; coastIndex <= end; coastIndex += 1) {
      arc.push(coastline[coastIndex % COAST_POINT_COUNT]!);
    }

    const polygon = [center, ...arc];
    return {
      id: `region-${index}`,
      name,
      bounds: polygonBounds(polygon),
      polygon,
      resourceNodeIds: [],
    };
  });
}

function randomPointInRegion(seed: string, region: Region, index: number): Point {
  const rng = createRng(seed, `${region.id}:resource-position:${index}`);

  for (let attempt = 0; attempt < 600; attempt += 1) {
    const candidate = {
      x: rng.range(region.bounds.x, region.bounds.x + region.bounds.width),
      y: rng.range(region.bounds.y, region.bounds.y + region.bounds.height),
    };
    if (pointInPolygon(candidate, region.polygon)) {
      return { x: roundCoordinate(candidate.x), y: roundCoordinate(candidate.y) };
    }
  }

  const centroid = polygonCentroid(region.polygon);
  return { x: roundCoordinate(centroid.x), y: roundCoordinate(centroid.y) };
}

function createResources(seed: string, regions: Region[]): ResourceNode[] {
  const nodes: ResourceNode[] = [];

  for (const region of regions) {
    const rng = createRng(seed, `${region.id}:resources`);
    const count = rng.int(3, 6);

    for (let index = 0; index < count; index += 1) {
      const definition = rng.pick(RESOURCE_DEFINITIONS);
      const node: ResourceNode = {
        id: `${region.id}-resource-${index}`,
        name: `${definition.name} Deposit ${index + 1}`,
        resourceId: definition.id,
        regionId: region.id,
        position: randomPointInRegion(seed, region, index),
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
