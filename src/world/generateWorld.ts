import { polygonBounds, polygonCentroid, pointInPolygon } from './geometry.js';
import { createRng } from './random.js';
import { RESOURCE_DEFINITIONS } from './resources.js';
import type { Planet, Point, Region, ResourceNode, WorldState } from './types.js';

export const PLANET_MAP_WIDTH = 4096;
export const PLANET_MAP_HEIGHT = 2048;
export const REGION_COUNT = 5;

const BOUNDARY_Y_FRACTIONS = [0, 0.12, 0.25, 0.38, 0.5, 0.62, 0.75, 0.88, 1] as const;
const MIDDLE_SPLIT_LEFT_INDEX = 5;
const MIDDLE_SPLIT_RIGHT_INDEX = 3;
const RIGHT_SPLIT_BOUNDARY_INDEX = 6;
const PLANET_NAMES = ['Aethon', 'Boras', 'Caldris', 'Draven', 'Eryndor', 'Feraxis', 'Galneth', 'Havar'];
const REGION_PREFIXES = ['Veyra', 'Talus', 'Solen', 'Kharon', 'Mareth', 'Calyx', 'Vorn', 'Eos'];
const REGION_SUFFIXES = ['Highlands', 'Basin', 'Reach', 'Expanse', 'Plateau', 'Flats', 'Rift', 'Plain'];

function roundCoordinate(value: number): number {
  return Number(value.toFixed(2));
}

function createVerticalBoundary(seed: string, namespace: string, baseFraction: number, jitterFraction: number): Point[] {
  const rng = createRng(seed, namespace);
  const rawOffsets = BOUNDARY_Y_FRACTIONS.map(() => rng.range(-jitterFraction, jitterFraction));
  const drift = rng.range(-0.055, 0.055);

  return BOUNDARY_Y_FRACTIONS.map((fraction, index) => {
    const previous = rawOffsets[Math.max(0, index - 1)]!;
    const current = rawOffsets[index]!;
    const next = rawOffsets[Math.min(rawOffsets.length - 1, index + 1)]!;
    const smoothedOffset = (previous + current * 2 + next) / 4;
    const xFraction = baseFraction + drift * (fraction - 0.5) + smoothedOffset;
    return {
      x: roundCoordinate(PLANET_MAP_WIDTH * xFraction),
      y: roundCoordinate(PLANET_MAP_HEIGHT * fraction),
    };
  });
}

function createConnectorPath(seed: string, namespace: string, start: Point, end: Point, bendScale: number): Point[] {
  const rng = createRng(seed, namespace);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const perpendicularX = -dy / length;
  const perpendicularY = dx / length;
  const path: Point[] = [start];

  for (const fraction of [0.2, 0.4, 0.6, 0.8]) {
    const bend = rng.range(-bendScale, bendScale) * Math.sin(Math.PI * fraction);
    path.push({
      x: roundCoordinate(start.x + dx * fraction + perpendicularX * bend),
      y: roundCoordinate(start.y + dy * fraction + perpendicularY * bend),
    });
  }

  path.push(end);
  return path;
}

function createRegionName(seed: string, index: number, usedNames: Set<string>): string {
  const rng = createRng(seed, `region:${index}`);
  let name = '';
  while (!name || usedNames.has(name)) {
    name = `${rng.pick(REGION_PREFIXES)} ${rng.pick(REGION_SUFFIXES)}`;
  }
  usedNames.add(name);
  return name;
}

function createRegions(seed: string): Region[] {
  const westBoundary = createVerticalBoundary(seed, 'geography:boundary:west', 0.23, 0.045);
  const eastBoundary = createVerticalBoundary(seed, 'geography:boundary:east', 0.61, 0.05);
  const middleSplit = createConnectorPath(
    seed,
    'geography:boundary:middle-split',
    westBoundary[MIDDLE_SPLIT_LEFT_INDEX]!,
    eastBoundary[MIDDLE_SPLIT_RIGHT_INDEX]!,
    85,
  );
  const rightEdgeSplit = {
    x: PLANET_MAP_WIDTH,
    y: roundCoordinate(PLANET_MAP_HEIGHT * createRng(seed, 'geography:right-edge-split').range(0.43, 0.55)),
  };
  const rightSplit = createConnectorPath(
    seed,
    'geography:boundary:right-split',
    eastBoundary[RIGHT_SPLIT_BOUNDARY_INDEX]!,
    rightEdgeSplit,
    95,
  );

  const westLast = westBoundary.length - 1;
  const eastLast = eastBoundary.length - 1;
  const polygons: Point[][] = [
    [
      { x: 0, y: 0 },
      ...westBoundary,
      { x: 0, y: PLANET_MAP_HEIGHT },
    ],
    [
      westBoundary[0]!,
      eastBoundary[0]!,
      ...eastBoundary.slice(1, MIDDLE_SPLIT_RIGHT_INDEX + 1),
      ...middleSplit.slice(0, -1).reverse(),
      ...westBoundary.slice(1, MIDDLE_SPLIT_LEFT_INDEX).reverse(),
    ],
    [
      westBoundary[MIDDLE_SPLIT_LEFT_INDEX]!,
      ...middleSplit.slice(1),
      ...eastBoundary.slice(MIDDLE_SPLIT_RIGHT_INDEX + 1),
      westBoundary[westLast]!,
      ...westBoundary.slice(MIDDLE_SPLIT_LEFT_INDEX + 1, westLast).reverse(),
    ],
    [
      eastBoundary[0]!,
      { x: PLANET_MAP_WIDTH, y: 0 },
      rightEdgeSplit,
      ...rightSplit.slice(0, -1).reverse(),
      ...eastBoundary.slice(1, RIGHT_SPLIT_BOUNDARY_INDEX).reverse(),
    ],
    [
      eastBoundary[RIGHT_SPLIT_BOUNDARY_INDEX]!,
      ...rightSplit.slice(1),
      { x: PLANET_MAP_WIDTH, y: PLANET_MAP_HEIGHT },
      eastBoundary[eastLast]!,
      ...eastBoundary.slice(RIGHT_SPLIT_BOUNDARY_INDEX + 1, eastLast).reverse(),
    ],
  ];

  const usedNames = new Set<string>();
  return polygons.map((polygon, index) => ({
    id: `region-${index}`,
    name: createRegionName(seed, index, usedNames),
    bounds: polygonBounds(polygon),
    polygon,
    resourceNodeIds: [],
  }));
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
        nodeType: 'feature',
        featureType: 'mineral-deposit',
        resourceAccessPortId: 'resource-access',
        ports: [{
          id: 'resource-access',
          direction: 'output',
          kind: 'resource-access',
          label: 'resources',
        }],
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
