import { boundsIntersect, pointInBounds, pointInPolygon } from './geometry.js';
import type { Bounds, Planet, Point, Region, ResourceNode } from './types.js';

export const WORLD_SPATIAL_CHUNK_SIZE = 128;

function distanceSquared(left: Point, right: Point): number {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return dx * dx + dy * dy;
}

export class WorldSpatialIndex {
  private readonly regionsById: Map<string, Region>;
  private readonly featuresById: Map<string, ResourceNode>;
  private readonly regionIdsByChunk = new Map<string, Set<string>>();
  private readonly featureIdsByChunk = new Map<string, Set<string>>();

  constructor(readonly planet: Planet, readonly chunkSize = WORLD_SPATIAL_CHUNK_SIZE) {
    this.regionsById = new Map(planet.regions.map(region => [region.id, region]));
    this.featuresById = new Map(planet.resourceNodes.map(feature => [feature.id, feature]));
    for (const region of planet.regions) this.indexBounds(this.regionIdsByChunk, region.id, region.bounds);
    for (const feature of planet.resourceNodes) this.indexPoint(this.featureIdsByChunk, feature.id, feature.position);
  }

  regionContaining(point: Point): Region | null {
    for (const region of this.regionsForPoint(point)) {
      if (pointInPolygon(point, region.polygon)) return region;
    }
    return null;
  }

  regionsIntersecting(bounds: Bounds): Region[] {
    const candidates = this.idsInBounds(this.regionIdsByChunk, bounds);
    return this.planet.regions.filter(region => candidates.has(region.id) && boundsIntersect(region.bounds, bounds));
  }

  resourceNodesIntersecting(bounds: Bounds): ResourceNode[] {
    const candidates = this.idsInBounds(this.featureIdsByChunk, bounds);
    return this.planet.resourceNodes.filter(feature => candidates.has(feature.id) && pointInBounds(feature.position, bounds));
  }

  nearbyRegions(point: Point, limit: number): Region[] {
    const candidates = this.nearbyIds(this.regionIdsByChunk, point, limit);
    return [...candidates]
      .map(id => this.regionsById.get(id))
      .filter((region): region is Region => Boolean(region))
      .sort((left, right) => distanceSquared(left.center, point) - distanceSquared(right.center, point) || left.id.localeCompare(right.id))
      .slice(0, Math.max(0, limit));
  }

  nearbyFeatures(point: Point, limit: number): ResourceNode[] {
    const candidates = this.nearbyIds(this.featureIdsByChunk, point, limit);
    return [...candidates]
      .map(id => this.featuresById.get(id))
      .filter((feature): feature is ResourceNode => Boolean(feature))
      .sort((left, right) => distanceSquared(left.position, point) - distanceSquared(right.position, point) || left.id.localeCompare(right.id))
      .slice(0, Math.max(0, limit));
  }

  private regionsForPoint(point: Point): Region[] {
    const ids = this.regionIdsByChunk.get(this.chunkKey(Math.floor(point.x / this.chunkSize), Math.floor(point.y / this.chunkSize)));
    if (!ids) return [];
    return [...ids].map(id => this.regionsById.get(id)).filter((region): region is Region => Boolean(region));
  }

  private indexBounds(index: Map<string, Set<string>>, id: string, bounds: Bounds): void {
    const range = this.chunkRange(bounds);
    for (let row = range.minRow; row <= range.maxRow; row += 1) {
      for (let column = range.minColumn; column <= range.maxColumn; column += 1) this.add(index, this.chunkKey(column, row), id);
    }
  }

  private indexPoint(index: Map<string, Set<string>>, id: string, point: Point): void {
    this.add(index, this.chunkKey(Math.floor(point.x / this.chunkSize), Math.floor(point.y / this.chunkSize)), id);
  }

  private idsInBounds(index: Map<string, Set<string>>, bounds: Bounds): Set<string> {
    const ids = new Set<string>();
    const range = this.chunkRange(bounds);
    for (let row = range.minRow; row <= range.maxRow; row += 1) {
      for (let column = range.minColumn; column <= range.maxColumn; column += 1) {
        for (const id of index.get(this.chunkKey(column, row)) ?? []) ids.add(id);
      }
    }
    return ids;
  }

  private nearbyIds(index: Map<string, Set<string>>, point: Point, limit: number): Set<string> {
    const ids = new Set<string>();
    if (limit <= 0) return ids;
    const centerColumn = Math.floor(point.x / this.chunkSize);
    const centerRow = Math.floor(point.y / this.chunkSize);
    const maxRadius = Math.ceil(Math.max(this.planet.width, this.planet.height) / this.chunkSize);
    for (let radius = 0; radius <= maxRadius; radius += 1) {
      for (let row = centerRow - radius; row <= centerRow + radius; row += 1) {
        for (let column = centerColumn - radius; column <= centerColumn + radius; column += 1) {
          if (radius > 0 && Math.abs(column - centerColumn) !== radius && Math.abs(row - centerRow) !== radius) continue;
          for (const id of index.get(this.chunkKey(column, row)) ?? []) ids.add(id);
        }
      }
      if (ids.size >= limit * 3 || (ids.size >= limit && radius >= 2)) break;
    }
    return ids;
  }

  private chunkRange(bounds: Bounds): { minColumn: number; maxColumn: number; minRow: number; maxRow: number } {
    return {
      minColumn: Math.floor(Math.max(0, bounds.x) / this.chunkSize),
      maxColumn: Math.floor(Math.min(this.planet.width, bounds.x + bounds.width) / this.chunkSize),
      minRow: Math.floor(Math.max(0, bounds.y) / this.chunkSize),
      maxRow: Math.floor(Math.min(this.planet.height, bounds.y + bounds.height) / this.chunkSize),
    };
  }

  private chunkKey(column: number, row: number): string { return `${column}:${row}`; }
  private add(index: Map<string, Set<string>>, key: string, id: string): void {
    const ids = index.get(key) ?? new Set<string>();
    ids.add(id);
    index.set(key, ids);
  }
}

export function createWorldSpatialIndex(planet: Planet): WorldSpatialIndex {
  return new WorldSpatialIndex(planet);
}
