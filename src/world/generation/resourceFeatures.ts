import { createResourceSource } from '../../material/resourceSources.js';
import { pointInPolygon, polygonCentroid } from '../geometry.js';
import { createRng, type RandomSource } from '../random.js';
import { RESOURCE_DEFINITIONS, resourceDefinitionById } from '../resources.js';
import type { Point, Region, ResourceDefinition, ResourceNode } from '../types.js';

function clamp01(value: number): number { return Math.max(0.01, Math.min(1, value)); }

export function resourceSuitability(region: Region, resourceId: string): number {
  const environment = region.environment;
  switch (resourceId) {
    case 'iron-ore': return clamp01(0.28 + environment.tectonicActivity * 0.32 + environment.reliefMeters / 7_500);
    case 'copper-ore': return clamp01(0.08 + environment.volcanicActivity * 0.56 + environment.tectonicActivity * 0.28);
    case 'aluminum-ore': return clamp01(0.06 + environment.thermalIndex * 0.45 + environment.moistureIndex * 0.42);
    case 'limestone': return clamp01(0.08 + environment.sedimentaryBasinFactor * 0.68 + (1 - environment.reliefMeters / 2_500) * 0.2);
    case 'silica-sand': return clamp01(0.12 + environment.sedimentaryBasinFactor * 0.42 + (1 - environment.reliefMeters / 2_500) * 0.34);
    case 'coal': return clamp01(0.04 + environment.sedimentaryBasinFactor * 0.48 + environment.moistureIndex * 0.25 + environment.thermalIndex * 0.12);
    case 'water-ice': return clamp01(0.02 + (1 - environment.thermalIndex) * 0.88);
    default: return 0.01;
  }
}

function weightedResource(rng: RandomSource, region: Region): ResourceDefinition {
  const weights = RESOURCE_DEFINITIONS.map(definition => resourceSuitability(region, definition.id));
  let cursor = rng.range(0, weights.reduce((sum, weight) => sum + weight, 0));
  for (let index = 0; index < RESOURCE_DEFINITIONS.length; index += 1) {
    cursor -= weights[index]!;
    if (cursor <= 0) return RESOURCE_DEFINITIONS[index]!;
  }
  return RESOURCE_DEFINITIONS[RESOURCE_DEFINITIONS.length - 1]!;
}

function pointInRegion(seed: string, region: Region, index: number): Point {
  const rng = createRng(seed, `${region.id}:feature-position:${index}`);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidate = { x: rng.range(region.bounds.x, region.bounds.x + region.bounds.width), y: rng.range(region.bounds.y, region.bounds.y + region.bounds.height) };
    if (pointInPolygon(candidate, region.polygon)) return { x: Number(candidate.x.toFixed(6)), y: Number(candidate.y.toFixed(6)) };
  }
  const center = polygonCentroid(region.polygon);
  return { x: Number(center.x.toFixed(6)), y: Number(center.y.toFixed(6)) };
}

function createNode(seed: string, region: Region, definition: ResourceDefinition, index: number): ResourceNode {
  const id = `${region.id}-feature-${index}`;
  return {
    id,
    name: `${definition.name} Deposit · ${region.name}`,
    resourceId: definition.id,
    regionId: region.id,
    position: pointInRegion(seed, region, index),
    nodeType: 'feature',
    featureType: 'mineral-deposit',
    source: createResourceSource(definition.id, createRng(seed, `${id}:source-composition`)),
    resourceAccessPortId: 'resource-access',
    ports: [{ id: 'resource-access', direction: 'output', kind: 'resource-access', medium: 'resource', label: 'resources' }],
  };
}

export function generateResourceFeatures(seed: string, regions: Region[]): ResourceNode[] {
  const iron = resourceDefinitionById('iron-ore');
  if (!iron || regions.length === 0) throw new Error('Earth-scale generation requires land and an Iron Ore definition.');
  const nodes: ResourceNode[] = [];
  const localCounts = new Map<string, number>();
  const startingRegion = regions.reduce((best, region) => resourceSuitability(region, 'iron-ore') > resourceSuitability(best, 'iron-ore') ? region : best);
  const append = (region: Region, definition: ResourceDefinition): void => {
    const index = localCounts.get(region.id) ?? 0;
    localCounts.set(region.id, index + 1);
    const node = createNode(seed, region, definition, index);
    region.resourceNodeIds.push(node.id);
    nodes.push(node);
  };
  append(startingRegion, iron);
  for (const region of regions) {
    const rng = createRng(seed, `${region.id}:resource-density`);
    const richness = (region.environment.tectonicActivity + region.environment.volcanicActivity + region.environment.sedimentaryBasinFactor) / 3;
    const density = 0.12 + richness * 0.22;
    if (rng.next() < density) append(region, weightedResource(rng, region));
    if (rng.next() < density * 0.1) append(region, weightedResource(rng, region));
  }
  return nodes;
}
