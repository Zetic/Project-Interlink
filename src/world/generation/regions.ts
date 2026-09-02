import { pointInPolygon, polygonArea, polygonBounds, polygonCentroid, polygonSignedArea, removeCollinearVertices } from '../geometry.js';
import { createRng, deterministicUnit } from '../random.js';
import { EARTH_SCALE_METERS_PER_WORLD_UNIT, PLANET_MAP_HEIGHT, PLANET_MAP_WIDTH } from '../scale.js';
import type { GeographicParent, Point, Region, RegionEnvironment, SurfaceType } from '../types.js';
import {
  parentIdAtPoint,
  type GeneratedGeography,
  type GeographyPatch,
} from './geography.js';
import { createRegionEnvironment } from './regionEnvironment.js';
import type { PlanetEnvironmentContext } from './surfaceField.js';
import { samplePlanetEnvironment } from './surfaceField.js';
import { wrappedDistanceSquared } from './tectonics.js';

export const REGION_SEED_COLUMNS = 100;
export const REGION_SEED_ROWS = 50;
export const TARGET_REGION_SPACING_WORLD_UNITS = PLANET_MAP_WIDTH / REGION_SEED_COLUMNS;
const REGION_SEED_BIN_SIZE = 64;
const REGION_WARP_SCALE_CELLS = 2.15;
const REGION_WARP_AMPLITUDE = 0.08;
const REGION_WARP_DETAIL = 0.004;

interface RegionSeed { id: string; point: Point; surfaceType: SurfaceType; parentId: string; powerBias: number }
interface RegionBoundaryEdge { start: Point; end: Point; startKey: string; endKey: string }

const NAME_STARTS = ['Aer', 'Ald', 'Ar', 'Bel', 'Cal', 'Cer', 'Cor', 'Dar', 'Del', 'Eir', 'El', 'Fal', 'Gal', 'Hal', 'Ith', 'Kar', 'Kel', 'Kor', 'Lor', 'Mar', 'Nor', 'Or', 'Ser', 'Tal'];
const NAME_MIDDLES = ['a', 'ae', 'al', 'an', 'ar', 'el', 'en', 'er', 'eth', 'ia', 'il', 'in', 'ir', 'or', 'os', 'ra', 're', 'ro', 'ul', 'un', 'ur', 'va', 've', 'yr'];
const NAME_ENDS = ['d', 'l', 'm', 'n', 'r', 's', 'th', 'v', 'x', 'ya', 'en', 'is', 'on', 'or', 'um', 'ys'];

function suffixForEnvironment(environment: RegionEnvironment, ocean: boolean): string {
  if (ocean) {
    if (environment.boundaryType === 'divergent' && environment.boundaryProximity > 0.65) return 'Ridge';
    if (environment.boundaryType === 'convergent' && environment.boundaryProximity > 0.7) return 'Trench';
    if (environment.meanElevationMeters < -4_000) return 'Abyss';
    if (environment.sedimentaryBasinFactor > 0.7) return 'Basin';
    if (environment.meanElevationMeters > -1_800) return 'Rise';
    return 'Pelagic Plain';
  }
  if (environment.volcanicActivity > 0.74) return 'Volcanic Belt';
  if (environment.tectonicActivity > 0.72 && environment.boundaryType === 'divergent') return 'Rift';
  if (environment.meanElevationMeters > 2_450 && environment.reliefMeters > 1_250) return 'Highlands';
  if (environment.meanElevationMeters > 2_300) return 'Plateau';
  if (environment.sedimentaryBasinFactor > 0.72) return 'Basin';
  if (environment.reliefMeters > 1_500) return 'Range';
  if (environment.moistureIndex < 0.32 && environment.reliefMeters < 900) return 'Flats';
  if (environment.meanElevationMeters < 900) return 'Lowlands';
  return environment.reliefMeters < 850 ? 'Plain' : 'Reach';
}

function createUniqueName(seed: string, regionId: string, environment: RegionEnvironment, ocean: boolean, used: Set<string>): string {
  const rng = createRng(seed, `region-name:${regionId}`);
  const suffix = suffixForEnvironment(environment, ocean);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = `${rng.pick(NAME_STARTS)}${rng.pick(NAME_MIDDLES)}${rng.pick(NAME_ENDS)} ${suffix}`;
    if (!used.has(candidate)) { used.add(candidate); return candidate; }
  }
  const fallback = `${regionId} ${suffix}`; used.add(fallback); return fallback;
}

function createRegionSeeds(seed: string, geography: GeneratedGeography, context: PlanetEnvironmentContext): RegionSeed[] {
  const seeds: RegionSeed[] = [];
  const cellWidth = PLANET_MAP_WIDTH / REGION_SEED_COLUMNS;
  const cellHeight = PLANET_MAP_HEIGHT / REGION_SEED_ROWS;
  const density = 0.87 + deterministicUnit(seed, 'regions:density:v4') * 0.1;
  for (let row = 0; row < REGION_SEED_ROWS; row += 1) for (let column = 0; column < REGION_SEED_COLUMNS; column += 1) {
    const rng = createRng(seed, `region-seed:${row}:${column}`);
    if (rng.next() > density) continue;
    const point = {
      x: Number(((column + 0.5 + rng.range(-0.36, 0.36)) * cellWidth).toFixed(6)),
      y: Number(Math.max(0.001, Math.min(PLANET_MAP_HEIGHT - 0.001, (row + 0.5 + rng.range(-0.36, 0.36)) * cellHeight)).toFixed(6)),
    };
    const surfaceType = samplePlanetEnvironment(context, point).surfaceType;
    seeds.push({ id: `seed-${row}-${column}`, point, surfaceType, parentId: parentIdAtPoint(geography.anchors, surfaceType, point), powerBias: rng.range(-cellWidth * cellHeight * 0.65, cellWidth * cellHeight * 0.95) });
  }
  for (const anchor of geography.anchors) {
    if (seeds.some(candidate => candidate.parentId === anchor.id)) continue;
    const surfaceType: SurfaceType = anchor.kind === 'continent' ? 'land' : 'ocean';
    seeds.push({ id: `seed-${anchor.id}`, point: anchor.point, surfaceType, parentId: anchor.id, powerBias: 0 });
  }
  return seeds;
}

function seedBinKey(parentId: string, column: number, row: number): string { return `${parentId}:${column}:${row}`; }

function assignPatchesToSeeds(patches: readonly GeographyPatch[], seeds: readonly RegionSeed[]): Map<string, GeographyPatch[]> {
  const binColumns = Math.ceil(PLANET_MAP_WIDTH / REGION_SEED_BIN_SIZE);
  const binRows = Math.ceil(PLANET_MAP_HEIGHT / REGION_SEED_BIN_SIZE);
  const bins = new Map<string, RegionSeed[]>();
  const byParent = new Map<string, RegionSeed[]>();
  for (const seed of seeds) {
    const column = Math.floor(seed.point.x / REGION_SEED_BIN_SIZE) % binColumns;
    const row = Math.min(binRows - 1, Math.floor(seed.point.y / REGION_SEED_BIN_SIZE));
    const key = seedBinKey(seed.parentId, column, row);
    const values = bins.get(key) ?? []; values.push(seed); bins.set(key, values);
    const parentValues = byParent.get(seed.parentId) ?? []; parentValues.push(seed); byParent.set(seed.parentId, parentValues);
  }
  const assigned = new Map<string, GeographyPatch[]>();
  for (const patch of patches) {
    const centerColumn = Math.floor(patch.center.x / REGION_SEED_BIN_SIZE) % binColumns;
    const centerRow = Math.min(binRows - 1, Math.max(0, Math.floor(patch.center.y / REGION_SEED_BIN_SIZE)));
    const candidates: RegionSeed[] = [];
    for (let radius = 0; radius <= 2; radius += 1) for (let row = Math.max(0, centerRow - radius); row <= Math.min(binRows - 1, centerRow + radius); row += 1) for (let columnOffset = -radius; columnOffset <= radius; columnOffset += 1) {
      if (radius > 0 && Math.abs(columnOffset) !== radius && Math.abs(row - centerRow) !== radius) continue;
      const column = ((centerColumn + columnOffset) % binColumns + binColumns) % binColumns;
      candidates.push(...(bins.get(seedBinKey(patch.parentId, column, row)) ?? []));
    }
    const available = candidates.length ? candidates : (byParent.get(patch.parentId) ?? []);
    if (!available.length) throw new Error(`No Region seed resolves parent ${patch.parentId}.`);
    let nearest = available[0]!;
    let nearestScore = wrappedDistanceSquared(patch.center, nearest.point) - nearest.powerBias;
    for (let index = 1; index < available.length; index += 1) {
      const candidate = available[index]!;
      const score = wrappedDistanceSquared(patch.center, candidate.point) - candidate.powerBias;
      if (score < nearestScore || (score === nearestScore && candidate.id < nearest.id)) { nearest = candidate; nearestScore = score; }
    }
    const owned = assigned.get(nearest.id) ?? []; owned.push(patch); assigned.set(nearest.id, owned);
  }
  return assigned;
}

function roundPoint(point: Point): Point { return { x: Number(point.x.toFixed(6)), y: Number(point.y.toFixed(6)) }; }
function pointKey(point: Point): string { return `${point.x.toFixed(6)}:${point.y.toFixed(6)}`; }
function edgeKey(start: Point, end: Point): string { const a = pointKey(start); const b = pointKey(end); return a < b ? `${a}|${b}` : `${b}|${a}`; }

/** Trace canonical Region topology while retaining every shared technical boundary vertex. */
function traceRegionBoundaryTopology(patches: readonly GeographyPatch[]): Point[][] {
  const boundary = new Map<string, RegionBoundaryEdge>();
  for (const patch of patches) for (let index = 0; index < patch.polygon.length; index += 1) {
    const start = roundPoint(patch.polygon[index]!); const end = roundPoint(patch.polygon[(index + 1) % patch.polygon.length]!); const key = edgeKey(start, end);
    if (boundary.has(key)) boundary.delete(key); else boundary.set(key, { start, end, startKey: pointKey(start), endKey: pointKey(end) });
  }
  const edges = [...boundary.values()].sort((left, right) => left.startKey.localeCompare(right.startKey) || left.endKey.localeCompare(right.endKey));
  const outgoing = new Map<string, number[]>();
  edges.forEach((edge, index) => { const values = outgoing.get(edge.startKey) ?? []; values.push(index); outgoing.set(edge.startKey, values); });
  const used = new Uint8Array(edges.length); const loops: Point[][] = [];
  for (let startIndex = 0; startIndex < edges.length; startIndex += 1) {
    if (used[startIndex]) continue;
    const first = edges[startIndex]!; const loop: Point[] = [first.start]; let currentIndex = startIndex;
    while (!used[currentIndex]) {
      used[currentIndex] = 1; const current = edges[currentIndex]!;
      if (current.endKey === first.startKey) break;
      loop.push(current.end);
      const candidates = (outgoing.get(current.endKey) ?? []).filter(index => !used[index]);
      if (!candidates.length) break;
      if (candidates.length === 1) currentIndex = candidates[0]!;
      else {
        const incomingAngle = Math.atan2(current.end.y - current.start.y, current.end.x - current.start.x);
        currentIndex = candidates.reduce((best, candidate) => {
          const edge = edges[candidate]!; const bestEdge = edges[best]!;
          const turn = (Math.atan2(edge.end.y - edge.start.y, edge.end.x - edge.start.x) - incomingAngle + Math.PI * 2) % (Math.PI * 2);
          const bestTurn = (Math.atan2(bestEdge.end.y - bestEdge.start.y, bestEdge.end.x - bestEdge.start.x) - incomingAngle + Math.PI * 2) % (Math.PI * 2);
          return turn < bestTurn ? candidate : best;
        });
      }
    }
    if (loop.length >= 3 && polygonArea(loop) > 1e-6) loops.push(loop);
  }
  return loops.sort((left, right) => polygonArea(right) - polygonArea(left) || pointKey(left[0]!).localeCompare(pointKey(right[0]!)));
}

/** Parent/coastline vertices remain immutable so LOD levels share canonical geography. */
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
  const sample = (column: number, row: number): number => deterministicUnit(seed, `region-warp:${axis}:${column}:${row}`);
  return lerp(lerp(sample(x0, y0), sample(x0 + 1, y0), tx), lerp(sample(x0, y0 + 1), sample(x0 + 1, y0 + 1), tx), ty);
}

function warpedRegionPoint(seed: string, point: Point, frozen: ReadonlySet<string>, cellWidth: number, cellHeight: number): Point {
  const key = pointKey(point); if (frozen.has(key)) return roundPoint(point);
  const noiseX = smoothWarpUnit(seed, 'x', point.x / (cellWidth * REGION_WARP_SCALE_CELLS), point.y / (cellHeight * REGION_WARP_SCALE_CELLS));
  const noiseY = smoothWarpUnit(seed, 'y', point.x / (cellWidth * REGION_WARP_SCALE_CELLS), point.y / (cellHeight * REGION_WARP_SCALE_CELLS));
  const detailX = deterministicUnit(seed, `region-warp-detail:x:${key}`) - 0.5; const detailY = deterministicUnit(seed, `region-warp-detail:y:${key}`) - 0.5;
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

function centerInsidePolygon(polygon: readonly Point[], patches: readonly GeographyPatch[], context: PlanetEnvironmentContext, expectedSurfaceType: SurfaceType): Point {
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
  const seeds = createRegionSeeds(seed, geography, context); const seedsById = new Map(seeds.map(regionSeed => [regionSeed.id, regionSeed]));
  const patchesBySeed = assignPatchesToSeeds(geography.patches, seeds); const warpBoundaryPoint = createRegionBoundaryWarper(seed, geography); const usedNames = new Set<string>(); const regions: Region[] = [];
  for (const [seedId, patches] of [...patchesBySeed.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const regionSeed = seedsById.get(seedId)!; const loops = traceRegionBoundaryTopology(patches).filter(polygon => polygonSignedArea(polygon) > 0);
    for (let component = 0; component < loops.length; component += 1) {
      const polygon = removeCollinearVertices(loops[component]!.map(warpBoundaryPoint)); const center = centerInsidePolygon(polygon, patches, context, regionSeed.surfaceType); const environment = createRegionEnvironment(context, center); const id = `region-${seedId.replace(/^seed-/, '')}-${component}`;
      regions.push({ id, name: createUniqueName(seed, id, environment, regionSeed.surfaceType === 'ocean', usedNames), parentKind: regionSeed.surfaceType === 'land' ? 'continent' : 'ocean', parentId: regionSeed.parentId, surfaceType: regionSeed.surfaceType, bounds: polygonBounds(polygon), polygon, center, approximateAreaSquareKm: approximateAreaSquareKm(polygon, environment.latitudeDeg), environment, resourceNodeIds: [], neighborRegionIds: [] });
    }
  }
  populateNeighbors(regions); bindParents([...geography.continents, ...geography.oceans], regions); return regions;
}