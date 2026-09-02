import { pointInPolygon, polygonArea, polygonBounds, polygonCentroid, polygonSignedArea } from '../geometry.js';
import { createRng, deterministicUnit } from '../random.js';
import { EARTH_SCALE_METERS_PER_WORLD_UNIT, PLANET_MAP_HEIGHT, PLANET_MAP_WIDTH } from '../scale.js';
import type { GeographicParent, GeographicRegionType, Point, Region, SurfaceType } from '../types.js';
import {
  tracePatchBoundaries,
  type GeneratedGeography,
  type GeographyPatch,
} from './geography.js';
import { generateGeographicProvinceAssignments } from './geographicProvinces.js';
import { createRegionEnvironment } from './regionEnvironment.js';
import type { PlanetEnvironmentContext } from './surfaceField.js';
import { samplePlanetEnvironment } from './surfaceField.js';

const REGION_WARP_SCALE_CELLS = 2.15;
const REGION_WARP_AMPLITUDE = 0.13;
const REGION_WARP_DETAIL = 0.008;

interface RegionBoundaryEdge { start: Point; end: Point }

const NAME_STARTS = ['Aer', 'Ald', 'Ar', 'Bel', 'Cal', 'Cer', 'Cor', 'Dar', 'Del', 'Eir', 'El', 'Fal', 'Gal', 'Hal', 'Ith', 'Kar', 'Kel', 'Kor', 'Lor', 'Mar', 'Nor', 'Or', 'Ser', 'Tal'];
const NAME_MIDDLES = ['a', 'ae', 'al', 'an', 'ar', 'el', 'en', 'er', 'eth', 'ia', 'il', 'in', 'ir', 'or', 'os', 'ra', 're', 'ro', 'ul', 'un', 'ur', 'va', 've', 'yr'];
const NAME_ENDS = ['d', 'l', 'm', 'n', 'r', 's', 'th', 'v', 'x', 'ya', 'en', 'is', 'on', 'or', 'um', 'ys'];

const TYPE_LABELS: Record<GeographicRegionType, string> = {
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

function createUniqueName(seed: string, regionId: string, geographicType: GeographicRegionType, used: Set<string>): string {
  const rng = createRng(seed, `region-name:${regionId}`);
  const suffix = TYPE_LABELS[geographicType];
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = `${rng.pick(NAME_STARTS)}${rng.pick(NAME_MIDDLES)}${rng.pick(NAME_ENDS)} ${suffix}`;
    if (!used.has(candidate)) { used.add(candidate); return candidate; }
  }
  const fallback = `${regionId} ${suffix}`; used.add(fallback); return fallback;
}

function roundPoint(point: Point): Point { return { x: Number(point.x.toFixed(6)), y: Number(point.y.toFixed(6)) }; }
function pointKey(point: Point): string { return `${point.x.toFixed(6)}:${point.y.toFixed(6)}`; }
function edgeKey(start: Point, end: Point): string { const a = pointKey(start); const b = pointKey(end); return a < b ? `${a}|${b}` : `${b}|${a}`; }

/** Exposed technical vertices are reinserted only after semantic ownership has resolved loop topology. */
function exposedBoundaryVertices(patches: readonly GeographyPatch[]): Point[] {
  const boundary = new Map<string, RegionBoundaryEdge>();
  for (const patch of patches) for (let index = 0; index < patch.polygon.length; index += 1) {
    const start = roundPoint(patch.polygon[index]!); const end = roundPoint(patch.polygon[(index + 1) % patch.polygon.length]!); const key = edgeKey(start, end);
    if (boundary.has(key)) boundary.delete(key); else boundary.set(key, { start, end });
  }
  const vertices = new Map<string, Point>();
  for (const edge of boundary.values()) { vertices.set(pointKey(edge.start), edge.start); vertices.set(pointKey(edge.end), edge.end); }
  return [...vertices.values()];
}

function interiorSegmentPosition(point: Point, start: Point, end: Point): number | null {
  const dx = end.x - start.x; const dy = end.y - start.y; const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-12) return null;
  const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  if (t <= 1e-8 || t >= 1 - 1e-8) return null;
  const distance = Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
  return distance <= 2e-6 ? t : null;
}

function densifyResolvedLoop(loop: readonly Point[], boundaryVertices: readonly Point[]): Point[] {
  const dense: Point[] = [];
  for (let index = 0; index < loop.length; index += 1) {
    const start = roundPoint(loop[index]!); const end = roundPoint(loop[(index + 1) % loop.length]!); dense.push(start);
    const intermediate: { point: Point; t: number }[] = [];
    for (const point of boundaryVertices) {
      const t = interiorSegmentPosition(point, start, end);
      if (t !== null) intermediate.push({ point, t });
    }
    intermediate.sort((left, right) => left.t - right.t || pointKey(left.point).localeCompare(pointKey(right.point)));
    for (const value of intermediate) dense.push(value.point);
  }
  return dense;
}

/** Canonical parent/coastline vertices remain immutable across geographic LOD. */
function frozenParentBoundaryVertices(patches: readonly GeographyPatch[]): Set<string> {
  const owners = new Map<string, { count: number; start: Point; end: Point }>();
  for (const patch of patches) for (let index = 0; index < patch.polygon.length; index += 1) {
    const start = patch.polygon[index]!; const end = patch.polygon[(index + 1) % patch.polygon.length]!; const key = `${patch.parentId}:${edgeKey(start, end)}`;
    const existing = owners.get(key); if (existing) existing.count += 1; else owners.set(key, { count: 1, start, end });
  }
  const frozen = new Set<string>();
  for (const edge of owners.values()) if (edge.count === 1) { frozen.add(pointKey(edge.start)); frozen.add(pointKey(edge.end)); }
  return frozen;
}

function smoothstep(value: number): number { return value * value * (3 - 2 * value); }
function lerp(left: number, right: number, amount: number): number { return left + (right - left) * amount; }
function smoothWarpUnit(seed: string, axis: 'x' | 'y', x: number, y: number): number {
  const x0 = Math.floor(x); const y0 = Math.floor(y); const tx = smoothstep(x - x0); const ty = smoothstep(y - y0);
  const sample = (column: number, row: number): number => deterministicUnit(seed, `region-warp:v6:${axis}:${column}:${row}`);
  return lerp(lerp(sample(x0, y0), sample(x0 + 1, y0), tx), lerp(sample(x0, y0 + 1), sample(x0 + 1, y0 + 1), tx), ty);
}

function warpedRegionPoint(seed: string, point: Point, frozen: ReadonlySet<string>, cellWidth: number, cellHeight: number): Point {
  const key = pointKey(point); if (frozen.has(key)) return roundPoint(point);
  const noiseX = smoothWarpUnit(seed, 'x', point.x / (cellWidth * REGION_WARP_SCALE_CELLS), point.y / (cellHeight * REGION_WARP_SCALE_CELLS));
  const noiseY = smoothWarpUnit(seed, 'y', point.x / (cellWidth * REGION_WARP_SCALE_CELLS), point.y / (cellHeight * REGION_WARP_SCALE_CELLS));
  const detailX = deterministicUnit(seed, `region-warp-detail:v6:x:${key}`) - 0.5; const detailY = deterministicUnit(seed, `region-warp-detail:v6:y:${key}`) - 0.5;
  return roundPoint({
    x: Math.max(0, Math.min(PLANET_MAP_WIDTH, point.x + (noiseX - 0.5) * 2 * cellWidth * REGION_WARP_AMPLITUDE + detailX * 2 * cellWidth * REGION_WARP_DETAIL)),
    y: Math.max(0, Math.min(PLANET_MAP_HEIGHT, point.y + (noiseY - 0.5) * 2 * cellHeight * REGION_WARP_AMPLITUDE + detailY * 2 * cellHeight * REGION_WARP_DETAIL)),
  });
}

function createRegionBoundaryWarper(seed: string, geography: GeneratedGeography): (point: Point) => Point {
  const frozen = frozenParentBoundaryVertices(geography.patches); const cellWidth = geography.surfaceField.cellWidth; const cellHeight = geography.surfaceField.cellHeight; const pointCache = new Map<string, Point>();
  return (point: Point): Point => {
    const key = pointKey(point); const cached = pointCache.get(key); if (cached) return cached;
    const transformed = warpedRegionPoint(seed, point, frozen, cellWidth, cellHeight); pointCache.set(key, transformed); return transformed;
  };
}

function centerInsidePolygon(preferred: Point, polygon: readonly Point[], patches: readonly GeographyPatch[], context: PlanetEnvironmentContext, expectedSurfaceType: SurfaceType): Point {
  if (pointInPolygon(preferred, polygon) && samplePlanetEnvironment(context, preferred).surfaceType === expectedSurfaceType) return roundPoint(preferred);
  const centroid = polygonCentroid(polygon);
  if (pointInPolygon(centroid, polygon) && samplePlanetEnvironment(context, centroid).surfaceType === expectedSurfaceType) return roundPoint(centroid);
  const owned = patches.find(patch => pointInPolygon(patch.center, polygon) && samplePlanetEnvironment(context, patch.center).surfaceType === expectedSurfaceType);
  return roundPoint(owned?.center ?? patches[0]!.center);
}
function approximateAreaSquareKm(polygon: readonly Point[], latitudeDeg: number): number {
  const flatArea = polygonArea(polygon) * EARTH_SCALE_METERS_PER_WORLD_UNIT ** 2;
  return Number((flatArea * Math.max(0.12, Math.cos(latitudeDeg * Math.PI / 180)) / 1_000_000).toFixed(1));
}
function boundaryKey(start: Point, end: Point): string { const a = `${start.x.toFixed(6)}:${start.y.toFixed(6)}`; const b = `${end.x.toFixed(6)}:${end.y.toFixed(6)}`; return a < b ? `${a}|${b}` : `${b}|${a}`; }
function populateNeighbors(regions: Region[]): void {
  const ownerByEdge = new Map<string, string>(); const neighbors = new Map(regions.map(region => [region.id, new Set<string>()]));
  for (const region of regions) for (let index = 0; index < region.polygon.length; index += 1) {
    const key = boundaryKey(region.polygon[index]!, region.polygon[(index + 1) % region.polygon.length]!); const owner = ownerByEdge.get(key);
    if (owner && owner !== region.id) { neighbors.get(owner)?.add(region.id); neighbors.get(region.id)?.add(owner); } else ownerByEdge.set(key, region.id);
  }
  for (const region of regions) region.neighborRegionIds = [...(neighbors.get(region.id) ?? [])].sort();
}
function bindParents(parents: readonly GeographicParent[], regions: readonly Region[]): void {
  const ids = new Map<string, string[]>();
  for (const region of regions) { const values = ids.get(region.parentId) ?? []; values.push(region.id); ids.set(region.parentId, values); }
  for (const parent of parents) parent.regionIds = (ids.get(parent.id) ?? []).sort();
}

export function generateRegions(seed: string, geography: GeneratedGeography, context: PlanetEnvironmentContext): Region[] {
  const assignments = generateGeographicProvinceAssignments(geography, context);
  const warpBoundaryPoint = createRegionBoundaryWarper(seed, geography);
  const usedNames = new Set<string>();
  const regions: Region[] = [];
  for (const assignment of assignments) {
    const loops = tracePatchBoundaries(assignment.patches).filter(polygon => polygonSignedArea(polygon) > 0);
    const boundaryVertices = exposedBoundaryVertices(assignment.patches);
    for (let component = 0; component < loops.length; component += 1) {
      const denseLoop = densifyResolvedLoop(loops[component]!, boundaryVertices);
      const polygon = denseLoop.map(warpBoundaryPoint);
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
