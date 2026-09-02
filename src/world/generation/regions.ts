import { pointInPolygon, polygonArea, polygonBounds, polygonCentroid, polygonSignedArea } from '../geometry.js';
import { createRng, deterministicUnit } from '../random.js';
import { EARTH_SCALE_METERS_PER_WORLD_UNIT, PLANET_MAP_HEIGHT, PLANET_MAP_WIDTH } from '../scale.js';
import type { GeographicParent, Point, Region, RegionEnvironment, SurfaceType } from '../types.js';
import {
  parentIdAtPoint,
  tracePatchBoundaries,
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

interface RegionSeed {
  id: string;
  point: Point;
  surfaceType: SurfaceType;
  parentId: string;
  powerBias: number;
}

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
  const fallback = `${regionId} ${suffix}`;
  used.add(fallback);
  return fallback;
}

function createRegionSeeds(seed: string, geography: GeneratedGeography, context: PlanetEnvironmentContext): RegionSeed[] {
  const seeds: RegionSeed[] = [];
  const cellWidth = PLANET_MAP_WIDTH / REGION_SEED_COLUMNS;
  const cellHeight = PLANET_MAP_HEIGHT / REGION_SEED_ROWS;
  const density = 0.87 + deterministicUnit(seed, 'regions:density:v4') * 0.1;
  for (let row = 0; row < REGION_SEED_ROWS; row += 1) {
    for (let column = 0; column < REGION_SEED_COLUMNS; column += 1) {
      const rng = createRng(seed, `region-seed:${row}:${column}`);
      if (rng.next() > density) continue;
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
    // A fixed neighborhood keeps assignment equivalent to one local power
    // diagram. Stopping after the first few seeds can create isolated one-cell
    // islands when the candidate set changes across an adjacent patch.
    for (let radius = 0; radius <= 2; radius += 1) {
      for (let row = Math.max(0, centerRow - radius); row <= Math.min(binRows - 1, centerRow + radius); row += 1) {
        for (let columnOffset = -radius; columnOffset <= radius; columnOffset += 1) {
          if (radius > 0 && Math.abs(columnOffset) !== radius && Math.abs(row - centerRow) !== radius) continue;
          const column = ((centerColumn + columnOffset) % binColumns + binColumns) % binColumns;
          candidates.push(...(bins.get(seedBinKey(patch.parentId, column, row)) ?? []));
        }
      }
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

function centerInsidePolygon(polygon: readonly Point[], patches: readonly GeographyPatch[]): Point {
  const centroid = polygonCentroid(polygon);
  if (pointInPolygon(centroid, polygon)) return { x: Number(centroid.x.toFixed(6)), y: Number(centroid.y.toFixed(6)) };
  return patches.find(patch => pointInPolygon(patch.center, polygon))?.center ?? polygon[0]!;
}

function approximateAreaSquareKm(polygon: readonly Point[], latitudeDeg: number): number {
  const flatArea = polygonArea(polygon) * EARTH_SCALE_METERS_PER_WORLD_UNIT ** 2;
  return Number((flatArea * Math.max(0.12, Math.cos(latitudeDeg * Math.PI / 180)) / 1_000_000).toFixed(1));
}

function boundaryKey(start: Point, end: Point): string {
  const a = `${start.x.toFixed(6)}:${start.y.toFixed(6)}`; const b = `${end.x.toFixed(6)}:${end.y.toFixed(6)}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function populateNeighbors(regions: Region[]): void {
  const ownerByEdge = new Map<string, string>();
  const neighbors = new Map(regions.map(region => [region.id, new Set<string>()]));
  for (const region of regions) for (let index = 0; index < region.polygon.length; index += 1) {
    const key = boundaryKey(region.polygon[index]!, region.polygon[(index + 1) % region.polygon.length]!);
    const owner = ownerByEdge.get(key);
    if (owner && owner !== region.id) { neighbors.get(owner)?.add(region.id); neighbors.get(region.id)?.add(owner); }
    else ownerByEdge.set(key, region.id);
  }
  for (const region of regions) region.neighborRegionIds = [...(neighbors.get(region.id) ?? [])].sort();
}

function bindParents(parents: readonly GeographicParent[], regions: readonly Region[]): void {
  const ids = new Map<string, string[]>();
  for (const region of regions) { const values = ids.get(region.parentId) ?? []; values.push(region.id); ids.set(region.parentId, values); }
  for (const parent of parents) parent.regionIds = (ids.get(parent.id) ?? []).sort();
}

export function generateRegions(seed: string, geography: GeneratedGeography, context: PlanetEnvironmentContext): Region[] {
  const seeds = createRegionSeeds(seed, geography, context);
  const seedsById = new Map(seeds.map(regionSeed => [regionSeed.id, regionSeed]));
  const patchesBySeed = assignPatchesToSeeds(geography.patches, seeds);
  const usedNames = new Set<string>();
  const regions: Region[] = [];
  for (const [seedId, patches] of [...patchesBySeed.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const regionSeed = seedsById.get(seedId)!;
    const loops = tracePatchBoundaries(patches).filter(polygon => polygonSignedArea(polygon) > 0);
    for (let component = 0; component < loops.length; component += 1) {
      const polygon = loops[component]!;
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
