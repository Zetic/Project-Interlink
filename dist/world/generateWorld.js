import { polygonBounds, polygonCentroid, pointInPolygon } from './geometry.js';
import { createRng } from './random.js';
import { RESOURCE_DEFINITIONS } from './resources.js';
export const PLANET_MAP_WIDTH = 4096;
export const PLANET_MAP_HEIGHT = 2048;
export const REGION_COUNT = 5;
const COAST_POINT_COUNT = 60;
const COAST_POINTS_PER_REGION = COAST_POINT_COUNT / REGION_COUNT;
const PLANET_NAMES = ['Aethon', 'Boras', 'Caldris', 'Draven', 'Eryndor', 'Feraxis', 'Galneth', 'Havar'];
const REGION_PREFIXES = ['Veyra', 'Talus', 'Solen', 'Kharon', 'Mareth', 'Calyx', 'Vorn', 'Eos'];
const REGION_SUFFIXES = ['Highlands', 'Basin', 'Reach', 'Expanse', 'Plateau', 'Flats', 'Rift', 'Plain'];
function roundCoordinate(value) {
    return Number(value.toFixed(2));
}
function createCoastline(seed) {
    const rng = createRng(seed, 'geography:coastline');
    const centerX = PLANET_MAP_WIDTH / 2;
    const centerY = PLANET_MAP_HEIGHT / 2;
    const radiusX = PLANET_MAP_WIDTH * 0.42;
    const radiusY = PLANET_MAP_HEIGHT * 0.39;
    const rawRadius = Array.from({ length: COAST_POINT_COUNT }, () => rng.range(0.78, 1.05));
    return rawRadius.map((radius, index) => {
        const previous = rawRadius[(index - 1 + COAST_POINT_COUNT) % COAST_POINT_COUNT];
        const next = rawRadius[(index + 1) % COAST_POINT_COUNT];
        const smoothedRadius = (previous + radius * 2 + next) / 4;
        const angle = -Math.PI + (index / COAST_POINT_COUNT) * Math.PI * 2;
        return {
            x: roundCoordinate(centerX + Math.cos(angle) * radiusX * smoothedRadius),
            y: roundCoordinate(centerY + Math.sin(angle) * radiusY * smoothedRadius),
        };
    });
}
function createBoundaryPath(seed, index, center, coastPoint) {
    const rng = createRng(seed, `geography:boundary:${index}`);
    const dx = coastPoint.x - center.x;
    const dy = coastPoint.y - center.y;
    const length = Math.hypot(dx, dy) || 1;
    const perpendicularX = -dy / length;
    const perpendicularY = dx / length;
    const path = [center];
    for (const fraction of [0.25, 0.5, 0.75]) {
        const bend = rng.range(-1, 1) * 95 * Math.sin(Math.PI * fraction);
        path.push({
            x: roundCoordinate(center.x + dx * fraction + perpendicularX * bend),
            y: roundCoordinate(center.y + dy * fraction + perpendicularY * bend),
        });
    }
    path.push(coastPoint);
    return path;
}
function createRegions(seed) {
    const coastline = createCoastline(seed);
    const center = { x: PLANET_MAP_WIDTH / 2, y: PLANET_MAP_HEIGHT / 2 };
    const boundaries = Array.from({ length: REGION_COUNT }, (_, index) => {
        const coastPoint = coastline[(index * COAST_POINTS_PER_REGION) % COAST_POINT_COUNT];
        return createBoundaryPath(seed, index, center, coastPoint);
    });
    const usedNames = new Set();
    return Array.from({ length: REGION_COUNT }, (_, index) => {
        const rng = createRng(seed, `region:${index}`);
        let name = '';
        while (!name || usedNames.has(name)) {
            name = `${rng.pick(REGION_PREFIXES)} ${rng.pick(REGION_SUFFIXES)}`;
        }
        usedNames.add(name);
        const start = index * COAST_POINTS_PER_REGION;
        const end = (index + 1) * COAST_POINTS_PER_REGION;
        const startBoundary = boundaries[index];
        const endBoundary = boundaries[(index + 1) % REGION_COUNT];
        const coastArc = [];
        for (let coastIndex = start + 1; coastIndex < end; coastIndex += 1) {
            coastArc.push(coastline[coastIndex % COAST_POINT_COUNT]);
        }
        const returnBoundary = endBoundary.slice(1).reverse();
        const polygon = [...startBoundary, ...coastArc, ...returnBoundary];
        return {
            id: `region-${index}`,
            name,
            bounds: polygonBounds(polygon),
            polygon,
            resourceNodeIds: [],
        };
    });
}
function randomPointInRegion(seed, region, index) {
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
function createResources(seed, regions) {
    const nodes = [];
    for (const region of regions) {
        const rng = createRng(seed, `${region.id}:resources`);
        const count = rng.int(3, 6);
        for (let index = 0; index < count; index += 1) {
            const definition = rng.pick(RESOURCE_DEFINITIONS);
            const node = {
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
export function generateWorld(seedInput) {
    const seed = String(seedInput || 'default-seed');
    const planetRng = createRng(seed, 'planet');
    const regions = createRegions(seed);
    const resourceNodes = createResources(seed, regions);
    const planet = {
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
