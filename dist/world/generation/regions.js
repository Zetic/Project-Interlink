import { pointInPolygon, polygonArea, polygonBounds, polygonCentroid, polygonSignedArea } from '../geometry.js';
import { createRng, deterministicUnit } from '../random.js';
import { EARTH_SCALE_METERS_PER_WORLD_UNIT, PLANET_MAP_HEIGHT, PLANET_MAP_WIDTH } from '../scale.js';
import { parentIdAtPoint, tracePatchBoundaries, } from './geography.js';
import { createRegionEnvironment } from './regionEnvironment.js';
import { samplePlanetEnvironment } from './surfaceField.js';
import { wrappedDistanceSquared } from './tectonics.js';
export const REGION_SEED_COLUMNS = 100;
export const REGION_SEED_ROWS = 50;
export const TARGET_REGION_SPACING_WORLD_UNITS = PLANET_MAP_WIDTH / REGION_SEED_COLUMNS;
const REGION_SEED_BIN_SIZE = 64;
const REGION_WARP_SCALE_CELLS = 2.15;
const REGION_WARP_AMPLITUDE = 0.14;
const REGION_WARP_DETAIL = 0.01;
const NAME_STARTS = ['Aer', 'Ald', 'Ar', 'Bel', 'Cal', 'Cer', 'Cor', 'Dar', 'Del', 'Eir', 'El', 'Fal', 'Gal', 'Hal', 'Ith', 'Kar', 'Kel', 'Kor', 'Lor', 'Mar', 'Nor', 'Or', 'Ser', 'Tal'];
const NAME_MIDDLES = ['a', 'ae', 'al', 'an', 'ar', 'el', 'en', 'er', 'eth', 'ia', 'il', 'in', 'ir', 'or', 'os', 'ra', 're', 'ro', 'ul', 'un', 'ur', 'va', 've', 'yr'];
const NAME_ENDS = ['d', 'l', 'm', 'n', 'r', 's', 'th', 'v', 'x', 'ya', 'en', 'is', 'on', 'or', 'um', 'ys'];
function suffixForEnvironment(environment, ocean) {
    if (ocean) {
        if (environment.boundaryType === 'divergent' && environment.boundaryProximity > 0.65)
            return 'Ridge';
        if (environment.boundaryType === 'convergent' && environment.boundaryProximity > 0.7)
            return 'Trench';
        if (environment.meanElevationMeters < -4_000)
            return 'Abyss';
        if (environment.sedimentaryBasinFactor > 0.7)
            return 'Basin';
        if (environment.meanElevationMeters > -1_800)
            return 'Rise';
        return 'Pelagic Plain';
    }
    if (environment.volcanicActivity > 0.74)
        return 'Volcanic Belt';
    if (environment.tectonicActivity > 0.72 && environment.boundaryType === 'divergent')
        return 'Rift';
    if (environment.meanElevationMeters > 2_450 && environment.reliefMeters > 1_250)
        return 'Highlands';
    if (environment.meanElevationMeters > 2_300)
        return 'Plateau';
    if (environment.sedimentaryBasinFactor > 0.72)
        return 'Basin';
    if (environment.reliefMeters > 1_500)
        return 'Range';
    if (environment.moistureIndex < 0.32 && environment.reliefMeters < 900)
        return 'Flats';
    if (environment.meanElevationMeters < 900)
        return 'Lowlands';
    return environment.reliefMeters < 850 ? 'Plain' : 'Reach';
}
function createUniqueName(seed, regionId, environment, ocean, used) {
    const rng = createRng(seed, `region-name:${regionId}`);
    const suffix = suffixForEnvironment(environment, ocean);
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const candidate = `${rng.pick(NAME_STARTS)}${rng.pick(NAME_MIDDLES)}${rng.pick(NAME_ENDS)} ${suffix}`;
        if (!used.has(candidate)) {
            used.add(candidate);
            return candidate;
        }
    }
    const fallback = `${regionId} ${suffix}`;
    used.add(fallback);
    return fallback;
}
function createRegionSeeds(seed, geography, context) {
    const seeds = [];
    const cellWidth = PLANET_MAP_WIDTH / REGION_SEED_COLUMNS;
    const cellHeight = PLANET_MAP_HEIGHT / REGION_SEED_ROWS;
    const density = 0.87 + deterministicUnit(seed, 'regions:density:v4') * 0.1;
    for (let row = 0; row < REGION_SEED_ROWS; row += 1) {
        for (let column = 0; column < REGION_SEED_COLUMNS; column += 1) {
            const rng = createRng(seed, `region-seed:${row}:${column}`);
            if (rng.next() > density)
                continue;
            const point = {
                x: Number(((column + 0.5 + rng.range(-0.36, 0.36)) * cellWidth).toFixed(6)),
                y: Number(Math.max(0.001, Math.min(PLANET_MAP_HEIGHT - 0.001, (row + 0.5 + rng.range(-0.36, 0.36)) * cellHeight)).toFixed(6)),
            };
            const surfaceType = samplePlanetEnvironment(context, point).surfaceType;
            seeds.push({
                id: `seed-${row}-${column}`,
                point,
                surfaceType,
                parentId: parentIdAtPoint(geography.anchors, surfaceType, point),
                powerBias: rng.range(-cellWidth * cellHeight * 0.65, cellWidth * cellHeight * 0.95),
            });
        }
    }
    for (const anchor of geography.anchors) {
        if (seeds.some(candidate => candidate.parentId === anchor.id))
            continue;
        const surfaceType = anchor.kind === 'continent' ? 'land' : 'ocean';
        seeds.push({ id: `seed-${anchor.id}`, point: anchor.point, surfaceType, parentId: anchor.id, powerBias: 0 });
    }
    return seeds;
}
function seedBinKey(parentId, column, row) { return `${parentId}:${column}:${row}`; }
function assignPatchesToSeeds(patches, seeds) {
    const binColumns = Math.ceil(PLANET_MAP_WIDTH / REGION_SEED_BIN_SIZE);
    const binRows = Math.ceil(PLANET_MAP_HEIGHT / REGION_SEED_BIN_SIZE);
    const bins = new Map();
    const byParent = new Map();
    for (const seed of seeds) {
        const column = Math.floor(seed.point.x / REGION_SEED_BIN_SIZE) % binColumns;
        const row = Math.min(binRows - 1, Math.floor(seed.point.y / REGION_SEED_BIN_SIZE));
        const key = seedBinKey(seed.parentId, column, row);
        const values = bins.get(key) ?? [];
        values.push(seed);
        bins.set(key, values);
        const parentValues = byParent.get(seed.parentId) ?? [];
        parentValues.push(seed);
        byParent.set(seed.parentId, parentValues);
    }
    const assigned = new Map();
    for (const patch of patches) {
        const centerColumn = Math.floor(patch.center.x / REGION_SEED_BIN_SIZE) % binColumns;
        const centerRow = Math.min(binRows - 1, Math.max(0, Math.floor(patch.center.y / REGION_SEED_BIN_SIZE)));
        const candidates = [];
        for (let radius = 0; radius <= 2; radius += 1) {
            for (let row = Math.max(0, centerRow - radius); row <= Math.min(binRows - 1, centerRow + radius); row += 1) {
                for (let columnOffset = -radius; columnOffset <= radius; columnOffset += 1) {
                    if (radius > 0 && Math.abs(columnOffset) !== radius && Math.abs(row - centerRow) !== radius)
                        continue;
                    const column = ((centerColumn + columnOffset) % binColumns + binColumns) % binColumns;
                    candidates.push(...(bins.get(seedBinKey(patch.parentId, column, row)) ?? []));
                }
            }
        }
        const available = candidates.length ? candidates : (byParent.get(patch.parentId) ?? []);
        if (!available.length)
            throw new Error(`No Region seed resolves parent ${patch.parentId}.`);
        let nearest = available[0];
        let nearestScore = wrappedDistanceSquared(patch.center, nearest.point) - nearest.powerBias;
        for (let index = 1; index < available.length; index += 1) {
            const candidate = available[index];
            const score = wrappedDistanceSquared(patch.center, candidate.point) - candidate.powerBias;
            if (score < nearestScore || (score === nearestScore && candidate.id < nearest.id)) {
                nearest = candidate;
                nearestScore = score;
            }
        }
        const owned = assigned.get(nearest.id) ?? [];
        owned.push(patch);
        assigned.set(nearest.id, owned);
    }
    return assigned;
}
function roundPoint(point) {
    return { x: Number(point.x.toFixed(6)), y: Number(point.y.toFixed(6)) };
}
function pointKey(point) { return `${point.x.toFixed(6)}:${point.y.toFixed(6)}`; }
function edgeKey(start, end) {
    const a = pointKey(start);
    const b = pointKey(end);
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}
/**
 * Vertices on a Continent/Ocean exterior are immutable Region geometry.
 * Keeping them fixed guarantees that detail-level Region edges reuse the
 * canonical parent coastline and parent-to-parent borders exactly.
 */
function frozenParentBoundaryVertices(patches) {
    const owners = new Map();
    for (const patch of patches) {
        for (let index = 0; index < patch.polygon.length; index += 1) {
            const start = patch.polygon[index];
            const end = patch.polygon[(index + 1) % patch.polygon.length];
            const key = `${patch.parentId}:${edgeKey(start, end)}`;
            const existing = owners.get(key);
            if (existing)
                existing.count += 1;
            else
                owners.set(key, { count: 1, start, end });
        }
    }
    const frozen = new Set();
    for (const edge of owners.values())
        if (edge.count === 1) {
            frozen.add(pointKey(edge.start));
            frozen.add(pointKey(edge.end));
        }
    return frozen;
}
function smoothstep(value) { return value * value * (3 - 2 * value); }
function lerp(left, right, amount) { return left + (right - left) * amount; }
/** Deterministic bilinear value noise used only to bend internal Region geometry. */
function smoothWarpUnit(seed, axis, x, y) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = smoothstep(x - x0);
    const ty = smoothstep(y - y0);
    const sample = (column, row) => deterministicUnit(seed, `region-warp:${axis}:${column}:${row}`);
    const top = lerp(sample(x0, y0), sample(x0 + 1, y0), tx);
    const bottom = lerp(sample(x0, y0 + 1), sample(x0 + 1, y0 + 1), tx);
    return lerp(top, bottom, ty);
}
function warpedRegionPoint(seed, point, frozen, cellWidth, cellHeight) {
    const key = pointKey(point);
    if (frozen.has(key))
        return roundPoint(point);
    const noiseX = smoothWarpUnit(seed, 'x', point.x / (cellWidth * REGION_WARP_SCALE_CELLS), point.y / (cellHeight * REGION_WARP_SCALE_CELLS));
    const noiseY = smoothWarpUnit(seed, 'y', point.x / (cellWidth * REGION_WARP_SCALE_CELLS), point.y / (cellHeight * REGION_WARP_SCALE_CELLS));
    const detailX = deterministicUnit(seed, `region-warp-detail:x:${key}`) - 0.5;
    const detailY = deterministicUnit(seed, `region-warp-detail:y:${key}`) - 0.5;
    return roundPoint({
        x: Math.max(0, Math.min(PLANET_MAP_WIDTH, point.x + (noiseX - 0.5) * 2 * cellWidth * REGION_WARP_AMPLITUDE + detailX * 2 * cellWidth * REGION_WARP_DETAIL)),
        y: Math.max(0, Math.min(PLANET_MAP_HEIGHT, point.y + (noiseY - 0.5) * 2 * cellHeight * REGION_WARP_AMPLITUDE + detailY * 2 * cellHeight * REGION_WARP_DETAIL)),
    });
}
/**
 * Create one shared transform for resolved Region boundary vertices. Region
 * topology is traced from the canonical patches first, then only presentation
 * geometry is deformed. Parent/coastline vertices remain untouched.
 */
function createRegionBoundaryWarper(seed, geography) {
    const frozen = frozenParentBoundaryVertices(geography.patches);
    const cellWidth = geography.surfaceField.cellWidth;
    const cellHeight = geography.surfaceField.cellHeight;
    const pointCache = new Map();
    return (point) => {
        const key = pointKey(point);
        const cached = pointCache.get(key);
        if (cached)
            return cached;
        const transformed = warpedRegionPoint(seed, point, frozen, cellWidth, cellHeight);
        pointCache.set(key, transformed);
        return transformed;
    };
}
function centerInsidePolygon(polygon, patches) {
    const centroid = polygonCentroid(polygon);
    if (pointInPolygon(centroid, polygon))
        return { x: Number(centroid.x.toFixed(6)), y: Number(centroid.y.toFixed(6)) };
    return patches.find(patch => pointInPolygon(patch.center, polygon))?.center ?? polygon[0];
}
function approximateAreaSquareKm(polygon, latitudeDeg) {
    const flatArea = polygonArea(polygon) * EARTH_SCALE_METERS_PER_WORLD_UNIT ** 2;
    return Number((flatArea * Math.max(0.12, Math.cos(latitudeDeg * Math.PI / 180)) / 1_000_000).toFixed(1));
}
function boundaryKey(start, end) {
    const a = `${start.x.toFixed(6)}:${start.y.toFixed(6)}`;
    const b = `${end.x.toFixed(6)}:${end.y.toFixed(6)}`;
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}
function populateNeighbors(regions) {
    const ownerByEdge = new Map();
    const neighbors = new Map(regions.map(region => [region.id, new Set()]));
    for (const region of regions)
        for (let index = 0; index < region.polygon.length; index += 1) {
            const key = boundaryKey(region.polygon[index], region.polygon[(index + 1) % region.polygon.length]);
            const owner = ownerByEdge.get(key);
            if (owner && owner !== region.id) {
                neighbors.get(owner)?.add(region.id);
                neighbors.get(region.id)?.add(owner);
            }
            else
                ownerByEdge.set(key, region.id);
        }
    for (const region of regions)
        region.neighborRegionIds = [...(neighbors.get(region.id) ?? [])].sort();
}
function bindParents(parents, regions) {
    const ids = new Map();
    for (const region of regions) {
        const values = ids.get(region.parentId) ?? [];
        values.push(region.id);
        ids.set(region.parentId, values);
    }
    for (const parent of parents)
        parent.regionIds = (ids.get(parent.id) ?? []).sort();
}
export function generateRegions(seed, geography, context) {
    const seeds = createRegionSeeds(seed, geography, context);
    const seedsById = new Map(seeds.map(regionSeed => [regionSeed.id, regionSeed]));
    const patchesBySeed = assignPatchesToSeeds(geography.patches, seeds);
    const warpBoundaryPoint = createRegionBoundaryWarper(seed, geography);
    const usedNames = new Set();
    const regions = [];
    for (const [seedId, patches] of [...patchesBySeed.entries()].sort(([left], [right]) => left.localeCompare(right))) {
        const regionSeed = seedsById.get(seedId);
        const loops = tracePatchBoundaries(patches).filter(polygon => polygonSignedArea(polygon) > 0);
        for (let component = 0; component < loops.length; component += 1) {
            const polygon = loops[component].map(warpBoundaryPoint);
            const center = centerInsidePolygon(polygon, patches);
            const environment = createRegionEnvironment(context, center);
            const id = `region-${seedId.replace(/^seed-/, '')}-${component}`;
            regions.push({
                id,
                name: createUniqueName(seed, id, environment, regionSeed.surfaceType === 'ocean', usedNames),
                parentKind: regionSeed.surfaceType === 'land' ? 'continent' : 'ocean',
                parentId: regionSeed.parentId,
                surfaceType: regionSeed.surfaceType,
                bounds: polygonBounds(polygon),
                polygon,
                center,
                approximateAreaSquareKm: approximateAreaSquareKm(polygon, environment.latitudeDeg),
                environment,
                resourceNodeIds: [],
                neighborRegionIds: [],
            });
        }
    }
    populateNeighbors(regions);
    bindParents([...geography.continents, ...geography.oceans], regions);
    return regions;
}
