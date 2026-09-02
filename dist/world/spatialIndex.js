import { boundsIntersect, pointInBounds, pointInPolygon } from './geometry.js';
export const WORLD_SPATIAL_CHUNK_SIZE = 128;
function distanceSquared(left, right) {
    const dx = left.x - right.x;
    const dy = left.y - right.y;
    return dx * dx + dy * dy;
}
export class WorldSpatialIndex {
    planet;
    chunkSize;
    regionsById;
    featuresById;
    continentsById;
    oceansById;
    regionIdsByChunk = new Map();
    featureIdsByChunk = new Map();
    constructor(planet, chunkSize = WORLD_SPATIAL_CHUNK_SIZE) {
        this.planet = planet;
        this.chunkSize = chunkSize;
        this.regionsById = new Map(planet.regions.map(region => [region.id, region]));
        this.featuresById = new Map(planet.resourceNodes.map(feature => [feature.id, feature]));
        this.continentsById = new Map(planet.continents.map(continent => [continent.id, continent]));
        this.oceansById = new Map(planet.oceans.map(ocean => [ocean.id, ocean]));
        for (const region of planet.regions)
            this.indexBounds(this.regionIdsByChunk, region.id, region.bounds);
        for (const feature of planet.resourceNodes)
            this.indexPoint(this.featureIdsByChunk, feature.id, feature.position);
    }
    regionContaining(point) {
        for (const region of this.regionsForPoint(point)) {
            if (pointInPolygon(point, region.polygon))
                return region;
        }
        return null;
    }
    regionsIntersecting(bounds) {
        const candidates = this.idsInBounds(this.regionIdsByChunk, bounds);
        return [...candidates].map(id => this.regionsById.get(id)).filter((region) => Boolean(region && boundsIntersect(region.bounds, bounds)));
    }
    resourceNodesIntersecting(bounds) {
        const candidates = this.idsInBounds(this.featureIdsByChunk, bounds);
        return [...candidates].map(id => this.featuresById.get(id)).filter((feature) => Boolean(feature && pointInBounds(feature.position, bounds)));
    }
    regionById(id) { return this.regionsById.get(id) ?? null; }
    featureById(id) { return this.featuresById.get(id) ?? null; }
    continentById(id) { return this.continentsById.get(id) ?? null; }
    oceanById(id) { return this.oceansById.get(id) ?? null; }
    nearbyRegions(point, limit) {
        const candidates = this.nearbyIds(this.regionIdsByChunk, point, limit);
        return [...candidates]
            .map(id => this.regionsById.get(id))
            .filter((region) => Boolean(region))
            .sort((left, right) => distanceSquared(left.center, point) - distanceSquared(right.center, point) || left.id.localeCompare(right.id))
            .slice(0, Math.max(0, limit));
    }
    nearbyFeatures(point, limit) {
        const candidates = this.nearbyIds(this.featureIdsByChunk, point, limit);
        return [...candidates]
            .map(id => this.featuresById.get(id))
            .filter((feature) => Boolean(feature))
            .sort((left, right) => distanceSquared(left.position, point) - distanceSquared(right.position, point) || left.id.localeCompare(right.id))
            .slice(0, Math.max(0, limit));
    }
    regionsForPoint(point) {
        const ids = this.regionIdsByChunk.get(this.chunkKey(Math.floor(point.x / this.chunkSize), Math.floor(point.y / this.chunkSize)));
        if (!ids)
            return [];
        return [...ids].map(id => this.regionsById.get(id)).filter((region) => Boolean(region));
    }
    indexBounds(index, id, bounds) {
        const range = this.chunkRange(bounds);
        for (let row = range.minRow; row <= range.maxRow; row += 1) {
            for (let column = range.minColumn; column <= range.maxColumn; column += 1)
                this.add(index, this.chunkKey(column, row), id);
        }
    }
    indexPoint(index, id, point) {
        this.add(index, this.chunkKey(Math.floor(point.x / this.chunkSize), Math.floor(point.y / this.chunkSize)), id);
    }
    idsInBounds(index, bounds) {
        const ids = new Set();
        const range = this.chunkRange(bounds);
        for (let row = range.minRow; row <= range.maxRow; row += 1) {
            for (let column = range.minColumn; column <= range.maxColumn; column += 1) {
                for (const id of index.get(this.chunkKey(column, row)) ?? [])
                    ids.add(id);
            }
        }
        return ids;
    }
    nearbyIds(index, point, limit) {
        const ids = new Set();
        if (limit <= 0)
            return ids;
        const centerColumn = Math.floor(point.x / this.chunkSize);
        const centerRow = Math.floor(point.y / this.chunkSize);
        const maxRadius = Math.ceil(Math.max(this.planet.width, this.planet.height) / this.chunkSize);
        for (let radius = 0; radius <= maxRadius; radius += 1) {
            for (let row = centerRow - radius; row <= centerRow + radius; row += 1) {
                for (let column = centerColumn - radius; column <= centerColumn + radius; column += 1) {
                    if (radius > 0 && Math.abs(column - centerColumn) !== radius && Math.abs(row - centerRow) !== radius)
                        continue;
                    for (const id of index.get(this.chunkKey(column, row)) ?? [])
                        ids.add(id);
                }
            }
            if (ids.size >= limit * 3 || (ids.size >= limit && radius >= 2))
                break;
        }
        return ids;
    }
    chunkRange(bounds) {
        return {
            minColumn: Math.floor(Math.max(0, bounds.x) / this.chunkSize),
            maxColumn: Math.floor(Math.min(this.planet.width, bounds.x + bounds.width) / this.chunkSize),
            minRow: Math.floor(Math.max(0, bounds.y) / this.chunkSize),
            maxRow: Math.floor(Math.min(this.planet.height, bounds.y + bounds.height) / this.chunkSize),
        };
    }
    chunkKey(column, row) { return `${column}:${row}`; }
    add(index, key, id) {
        const ids = index.get(key) ?? new Set();
        ids.add(id);
        index.set(key, ids);
    }
}
export function createWorldSpatialIndex(planet) {
    return new WorldSpatialIndex(planet);
}
const SHARED_WORLD_INDEXES = new WeakMap();
export function worldSpatialIndexFor(planet) {
    const existing = SHARED_WORLD_INDEXES.get(planet);
    if (existing)
        return existing;
    const created = new WorldSpatialIndex(planet);
    SHARED_WORLD_INDEXES.set(planet, created);
    return created;
}
