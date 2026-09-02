import { pointInPolygon, polygonArea, polygonBounds, polygonCentroid, polygonSignedArea } from '../geometry.js';
import { createRng, deterministicUnit } from '../random.js';
import { EARTH_SCALE_METERS_PER_WORLD_UNIT, PLANET_MAP_HEIGHT, PLANET_MAP_WIDTH } from '../scale.js';
import { generateGeographicProvinceAssignments } from './geographicProvinces.js';
import { createRegionEnvironment } from './regionEnvironment.js';
import { samplePlanetEnvironment } from './surfaceField.js';
const REGION_WARP_SCALE_CELLS = 2.15;
const REGION_WARP_AMPLITUDE = 0.13;
const REGION_WARP_DETAIL = 0.008;
const NAME_STARTS = ['Aer', 'Ald', 'Ar', 'Bel', 'Cal', 'Cer', 'Cor', 'Dar', 'Del', 'Eir', 'El', 'Fal', 'Gal', 'Hal', 'Ith', 'Kar', 'Kel', 'Kor', 'Lor', 'Mar', 'Nor', 'Or', 'Ser', 'Tal'];
const NAME_MIDDLES = ['a', 'ae', 'al', 'an', 'ar', 'el', 'en', 'er', 'eth', 'ia', 'il', 'in', 'ir', 'or', 'os', 'ra', 're', 'ro', 'ul', 'un', 'ur', 'va', 've', 'yr'];
const NAME_ENDS = ['d', 'l', 'm', 'n', 'r', 's', 'th', 'v', 'x', 'ya', 'en', 'is', 'on', 'or', 'um', 'ys'];
const TYPE_LABELS = {
    'mountain-range': 'Range',
    'volcanic-arc': 'Volcanic Arc',
    'rift-zone': 'Rift',
    plateau: 'Plateau',
    highlands: 'Highlands',
    'sedimentary-basin': 'Basin',
    'coastal-plain': 'Coastal Plain',
    'coastal-highlands': 'Coastal Highlands',
    lowlands: 'Lowlands',
    'interior-plain': 'Interior Plain',
    'oceanic-trench': 'Trench',
    'mid-ocean-ridge': 'Ridge',
    'continental-shelf': 'Shelf',
    'continental-slope': 'Continental Slope',
    'ocean-plateau': 'Ocean Plateau',
    'abyssal-plain': 'Abyssal Plain',
    'ocean-basin': 'Ocean Basin',
};
function createUniqueName(seed, regionId, geographicType, used) {
    const rng = createRng(seed, `region-name:${regionId}`);
    const suffix = TYPE_LABELS[geographicType];
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
function roundPoint(point) { return { x: Number(point.x.toFixed(6)), y: Number(point.y.toFixed(6)) }; }
function pointKey(point) { return `${point.x.toFixed(6)}:${point.y.toFixed(6)}`; }
function edgeKey(start, end) { const a = pointKey(start); const b = pointKey(end); return a < b ? `${a}|${b}` : `${b}|${a}`; }
/**
 * Region topology must retain the complete shared patch-edge chain until after
 * the deterministic shared warp. This traces those full loops directly instead
 * of simplifying and then doing the old O(boundary²) vertex-reinsertion pass.
 */
function traceRegionBoundaryLoops(patches) {
    const boundary = new Map();
    for (const patch of patches) {
        for (let index = 0; index < patch.polygon.length; index += 1) {
            const start = roundPoint(patch.polygon[index]);
            const end = roundPoint(patch.polygon[(index + 1) % patch.polygon.length]);
            const key = edgeKey(start, end);
            if (boundary.has(key))
                boundary.delete(key);
            else
                boundary.set(key, { start, end, startKey: pointKey(start), endKey: pointKey(end) });
        }
    }
    const edges = [...boundary.values()].sort((left, right) => left.startKey.localeCompare(right.startKey) || left.endKey.localeCompare(right.endKey));
    const outgoing = new Map();
    edges.forEach((edge, index) => {
        const values = outgoing.get(edge.startKey) ?? [];
        values.push(index);
        outgoing.set(edge.startKey, values);
    });
    const used = new Uint8Array(edges.length);
    const loops = [];
    for (let startIndex = 0; startIndex < edges.length; startIndex += 1) {
        if (used[startIndex])
            continue;
        const first = edges[startIndex];
        const loop = [first.start];
        let currentIndex = startIndex;
        while (!used[currentIndex]) {
            used[currentIndex] = 1;
            const current = edges[currentIndex];
            if (current.endKey === first.startKey)
                break;
            loop.push(current.end);
            const candidates = (outgoing.get(current.endKey) ?? []).filter(index => !used[index]);
            if (!candidates.length)
                break;
            if (candidates.length === 1)
                currentIndex = candidates[0];
            else {
                const incomingAngle = Math.atan2(current.end.y - current.start.y, current.end.x - current.start.x);
                currentIndex = candidates.reduce((best, candidate) => {
                    const edge = edges[candidate];
                    const bestEdge = edges[best];
                    const turn = (Math.atan2(edge.end.y - edge.start.y, edge.end.x - edge.start.x) - incomingAngle + Math.PI * 2) % (Math.PI * 2);
                    const bestTurn = (Math.atan2(bestEdge.end.y - bestEdge.start.y, bestEdge.end.x - bestEdge.start.x) - incomingAngle + Math.PI * 2) % (Math.PI * 2);
                    return turn < bestTurn ? candidate : best;
                });
            }
        }
        if (loop.length >= 3 && polygonArea(loop) > 1e-6)
            loops.push(loop);
    }
    return loops.sort((left, right) => polygonArea(right) - polygonArea(left) || pointKey(left[0]).localeCompare(pointKey(right[0])));
}
/** Canonical parent/coastline vertices remain immutable across geographic LOD. */
function frozenParentBoundaryVertices(patches) {
    const owners = new Map();
    for (const patch of patches)
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
function smoothWarpUnit(seed, axis, x, y) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = smoothstep(x - x0);
    const ty = smoothstep(y - y0);
    const sample = (column, row) => deterministicUnit(seed, `region-warp:v6:${axis}:${column}:${row}`);
    return lerp(lerp(sample(x0, y0), sample(x0 + 1, y0), tx), lerp(sample(x0, y0 + 1), sample(x0 + 1, y0 + 1), tx), ty);
}
function warpedRegionPoint(seed, point, frozen, cellWidth, cellHeight) {
    const key = pointKey(point);
    if (frozen.has(key))
        return roundPoint(point);
    const noiseX = smoothWarpUnit(seed, 'x', point.x / (cellWidth * REGION_WARP_SCALE_CELLS), point.y / (cellHeight * REGION_WARP_SCALE_CELLS));
    const noiseY = smoothWarpUnit(seed, 'y', point.x / (cellWidth * REGION_WARP_SCALE_CELLS), point.y / (cellHeight * REGION_WARP_SCALE_CELLS));
    const detailX = deterministicUnit(seed, `region-warp-detail:v6:x:${key}`) - 0.5;
    const detailY = deterministicUnit(seed, `region-warp-detail:v6:y:${key}`) - 0.5;
    return roundPoint({
        x: Math.max(0, Math.min(PLANET_MAP_WIDTH, point.x + (noiseX - 0.5) * 2 * cellWidth * REGION_WARP_AMPLITUDE + detailX * 2 * cellWidth * REGION_WARP_DETAIL)),
        y: Math.max(0, Math.min(PLANET_MAP_HEIGHT, point.y + (noiseY - 0.5) * 2 * cellHeight * REGION_WARP_AMPLITUDE + detailY * 2 * cellHeight * REGION_WARP_DETAIL)),
    });
}
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
function centerInsidePolygon(preferred, polygon, patches, context, expectedSurfaceType) {
    if (pointInPolygon(preferred, polygon) && samplePlanetEnvironment(context, preferred).surfaceType === expectedSurfaceType)
        return roundPoint(preferred);
    const centroid = polygonCentroid(polygon);
    if (pointInPolygon(centroid, polygon) && samplePlanetEnvironment(context, centroid).surfaceType === expectedSurfaceType)
        return roundPoint(centroid);
    const owned = patches.find(patch => pointInPolygon(patch.center, polygon) && samplePlanetEnvironment(context, patch.center).surfaceType === expectedSurfaceType);
    return roundPoint(owned?.center ?? patches[0].center);
}
function approximateAreaSquareKm(polygon, latitudeDeg) {
    const flatArea = polygonArea(polygon) * EARTH_SCALE_METERS_PER_WORLD_UNIT ** 2;
    return Number((flatArea * Math.max(0.12, Math.cos(latitudeDeg * Math.PI / 180)) / 1_000_000).toFixed(1));
}
function boundaryKey(start, end) { const a = `${start.x.toFixed(6)}:${start.y.toFixed(6)}`; const b = `${end.x.toFixed(6)}:${end.y.toFixed(6)}`; return a < b ? `${a}|${b}` : `${b}|${a}`; }
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
    const assignments = generateGeographicProvinceAssignments(geography, context);
    const warpBoundaryPoint = createRegionBoundaryWarper(seed, geography);
    const usedNames = new Set();
    const regions = [];
    for (const assignment of assignments) {
        const loops = traceRegionBoundaryLoops(assignment.patches).filter(polygon => polygonSignedArea(polygon) > 0);
        for (let component = 0; component < loops.length; component += 1) {
            const polygon = loops[component].map(warpBoundaryPoint);
            const center = centerInsidePolygon(assignment.seed.point, polygon, assignment.patches, context, assignment.seed.surfaceType);
            const environment = createRegionEnvironment(context, center);
            const id = `region-${assignment.seed.id.replace(/^province-/, '')}-${component}`;
            regions.push({
                id,
                name: createUniqueName(seed, id, assignment.seed.geographicType, usedNames),
                parentKind: assignment.seed.surfaceType === 'land' ? 'continent' : 'ocean',
                parentId: assignment.seed.parentId,
                surfaceType: assignment.seed.surfaceType,
                geographicType: assignment.seed.geographicType,
                geographicTraits: assignment.seed.geographicTraits,
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
