import { pointInPolygon, polygonArea, polygonBounds, polygonCentroid, polygonSignedArea, removeCollinearVertices } from '../geometry.js';
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

export const REGION_SEED_COLUMNS = 100;
export const REGION_SEED_ROWS = 50;
export const TARGET_REGION_SPACING_WORLD_UNITS = PLANET_MAP_WIDTH / REGION_SEED_COLUMNS;
const REGION_SEED_BIN_SIZE = 64;
const POWER_NEIGHBOR_BIN_RADIUS = 3;
const GEOMETRY_EPSILON = 1e-8;

interface RegionSeed {
  id: string;
  point: Point;
  surfaceType: SurfaceType;
  parentId: string;
  powerBias: number;
}

interface PowerHalfPlane {
  a: number;
  b: number;
  c: number;
}

interface SeedSpatialIndex {
  binColumns: number;
  binRows: number;
  bins: Map<string, RegionSeed[]>;
}

interface PatchSpatialIndex {
  binColumns: number;
  binRows: number;
  bins: Map<string, GeographyPatch[]>;
}

interface RegionPiece {
  id: string;
  polygon: Point[];
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

function roundPoint(point: Point): Point {
  return { x: Number(point.x.toFixed(6)), y: Number(point.y.toFixed(6)) };
}

function seedBinKey(parentId: string, column: number, row: number): string { return `${parentId}:${column}:${row}`; }
function patchBinKey(parentId: string, column: number, row: number): string { return `${parentId}:${column}:${row}`; }

function buildSeedSpatialIndex(seeds: readonly RegionSeed[]): SeedSpatialIndex {
  const binColumns = Math.ceil(PLANET_MAP_WIDTH / REGION_SEED_BIN_SIZE);
  const binRows = Math.ceil(PLANET_MAP_HEIGHT / REGION_SEED_BIN_SIZE);
  const bins = new Map<string, RegionSeed[]>();
  for (const seed of seeds) {
    const column = Math.min(binColumns - 1, Math.max(0, Math.floor(seed.point.x / REGION_SEED_BIN_SIZE)));
    const row = Math.min(binRows - 1, Math.max(0, Math.floor(seed.point.y / REGION_SEED_BIN_SIZE)));
    const key = seedBinKey(seed.parentId, column, row);
    const values = bins.get(key) ?? [];
    values.push(seed);
    bins.set(key, values);
  }
  return { binColumns, binRows, bins };
}

function localSeedCandidates(seed: RegionSeed, index: SeedSpatialIndex): RegionSeed[] {
  const centerColumn = Math.min(index.binColumns - 1, Math.max(0, Math.floor(seed.point.x / REGION_SEED_BIN_SIZE)));
  const centerRow = Math.min(index.binRows - 1, Math.max(0, Math.floor(seed.point.y / REGION_SEED_BIN_SIZE)));
  const candidates = new Map<string, RegionSeed>();
  for (let row = Math.max(0, centerRow - POWER_NEIGHBOR_BIN_RADIUS); row <= Math.min(index.binRows - 1, centerRow + POWER_NEIGHBOR_BIN_RADIUS); row += 1) {
    for (let column = Math.max(0, centerColumn - POWER_NEIGHBOR_BIN_RADIUS); column <= Math.min(index.binColumns - 1, centerColumn + POWER_NEIGHBOR_BIN_RADIUS); column += 1) {
      for (const candidate of index.bins.get(seedBinKey(seed.parentId, column, row)) ?? []) candidates.set(candidate.id, candidate);
    }
  }
  return [...candidates.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function halfPlaneForSeeds(seed: RegionSeed, competitor: RegionSeed): PowerHalfPlane {
  const competitorX = competitor.point.x;
  const a = 2 * (competitorX - seed.point.x);
  const b = 2 * (competitor.point.y - seed.point.y);
  const c = competitorX * competitorX + competitor.point.y * competitor.point.y - competitor.powerBias
    - seed.point.x * seed.point.x - seed.point.y * seed.point.y + seed.powerBias;
  return { a, b, c };
}

function signedHalfPlaneDistance(plane: PowerHalfPlane, point: Point): number {
  return plane.a * point.x + plane.b * point.y - plane.c;
}

function clipPolygonByHalfPlane(polygon: readonly Point[], plane: PowerHalfPlane): Point[] {
  if (polygon.length < 3) return [];
  const output: Point[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]!;
    const next = polygon[(index + 1) % polygon.length]!;
    const currentDistance = signedHalfPlaneDistance(plane, current);
    const nextDistance = signedHalfPlaneDistance(plane, next);
    const currentInside = currentDistance <= GEOMETRY_EPSILON;
    const nextInside = nextDistance <= GEOMETRY_EPSILON;
    if (currentInside) output.push(current);
    if (currentInside !== nextInside) {
      const denominator = currentDistance - nextDistance;
      const t = Math.abs(denominator) <= 1e-12 ? 0.5 : currentDistance / denominator;
      output.push(roundPoint({
        x: current.x + (next.x - current.x) * t,
        y: current.y + (next.y - current.y) * t,
      }));
    }
  }
  if (output.length < 3) return [];
  return removeCollinearVertices(output.map(roundPoint));
}

function powerCellForSeed(seed: RegionSeed, index: SeedSpatialIndex): Point[] {
  let cell: Point[] = [
    { x: 0, y: 0 },
    { x: PLANET_MAP_WIDTH, y: 0 },
    { x: PLANET_MAP_WIDTH, y: PLANET_MAP_HEIGHT },
    { x: 0, y: PLANET_MAP_HEIGHT },
  ];
  for (const competitor of localSeedCandidates(seed, index)) {
    if (competitor.id === seed.id) continue;
    cell = clipPolygonByHalfPlane(cell, halfPlaneForSeeds(seed, competitor));
    if (cell.length < 3) return [];
  }
  return removeCollinearVertices(cell.map(roundPoint));
}

function buildPatchSpatialIndex(patches: readonly GeographyPatch[]): PatchSpatialIndex {
  const binColumns = Math.ceil(PLANET_MAP_WIDTH / REGION_SEED_BIN_SIZE);
  const binRows = Math.ceil(PLANET_MAP_HEIGHT / REGION_SEED_BIN_SIZE);
  const bins = new Map<string, GeographyPatch[]>();
  for (const patch of patches) {
    const bounds = polygonBounds(patch.polygon);
    const minColumn = Math.min(binColumns - 1, Math.max(0, Math.floor(bounds.x / REGION_SEED_BIN_SIZE)));
    const maxColumn = Math.min(binColumns - 1, Math.max(0, Math.floor((bounds.x + bounds.width) / REGION_SEED_BIN_SIZE)));
    const minRow = Math.min(binRows - 1, Math.max(0, Math.floor(bounds.y / REGION_SEED_BIN_SIZE)));
    const maxRow = Math.min(binRows - 1, Math.max(0, Math.floor((bounds.y + bounds.height) / REGION_SEED_BIN_SIZE)));
    for (let row = minRow; row <= maxRow; row += 1) for (let column = minColumn; column <= maxColumn; column += 1) {
      const key = patchBinKey(patch.parentId, column, row);
      const values = bins.get(key) ?? [];
      values.push(patch);
      bins.set(key, values);
    }
  }
  return { binColumns, binRows, bins };
}

function patchesForCell(parentId: string, cell: readonly Point[], index: PatchSpatialIndex): GeographyPatch[] {
  const bounds = polygonBounds(cell);
  const minColumn = Math.min(index.binColumns - 1, Math.max(0, Math.floor(bounds.x / REGION_SEED_BIN_SIZE)));
  const maxColumn = Math.min(index.binColumns - 1, Math.max(0, Math.floor((bounds.x + bounds.width) / REGION_SEED_BIN_SIZE)));
  const minRow = Math.min(index.binRows - 1, Math.max(0, Math.floor(bounds.y / REGION_SEED_BIN_SIZE)));
  const maxRow = Math.min(index.binRows - 1, Math.max(0, Math.floor((bounds.y + bounds.height) / REGION_SEED_BIN_SIZE)));
  const candidates = new Map<string, GeographyPatch>();
  for (let row = minRow; row <= maxRow; row += 1) for (let column = minColumn; column <= maxColumn; column += 1) {
    for (const patch of index.bins.get(patchBinKey(parentId, column, row)) ?? []) candidates.set(patch.id, patch);
  }
  return [...candidates.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function cross(start: Point, end: Point, point: Point): number {
  return (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
}

function clipPolygonToConvex(subject: readonly Point[], clipPolygonInput: readonly Point[]): Point[] {
  if (subject.length < 3 || clipPolygonInput.length < 3) return [];
  const clipPolygon = polygonSignedArea(clipPolygonInput) >= 0 ? clipPolygonInput : [...clipPolygonInput].reverse();
  let output = subject.map(roundPoint);
  for (let edgeIndex = 0; edgeIndex < clipPolygon.length; edgeIndex += 1) {
    const clipStart = clipPolygon[edgeIndex]!;
    const clipEnd = clipPolygon[(edgeIndex + 1) % clipPolygon.length]!;
    const input = output;
    output = [];
    if (!input.length) break;
    for (let index = 0; index < input.length; index += 1) {
      const current = input[index]!;
      const next = input[(index + 1) % input.length]!;
      const currentDistance = cross(clipStart, clipEnd, current);
      const nextDistance = cross(clipStart, clipEnd, next);
      const currentInside = currentDistance >= -GEOMETRY_EPSILON;
      const nextInside = nextDistance >= -GEOMETRY_EPSILON;
      if (currentInside) output.push(current);
      if (currentInside !== nextInside) {
        const denominator = currentDistance - nextDistance;
        const t = Math.abs(denominator) <= 1e-12 ? 0.5 : currentDistance / denominator;
        output.push(roundPoint({
          x: current.x + (next.x - current.x) * t,
          y: current.y + (next.y - current.y) * t,
        }));
      }
    }
    if (output.length >= 3) output = removeCollinearVertices(output.map(roundPoint));
  }
  return output.length >= 3 && polygonArea(output) > 1e-7 ? removeCollinearVertices(output.map(roundPoint)) : [];
}

function piecesForPowerCell(seed: RegionSeed, cell: readonly Point[], patchIndex: PatchSpatialIndex): RegionPiece[] {
  const pieces: RegionPiece[] = [];
  for (const patch of patchesForCell(seed.parentId, cell, patchIndex)) {
    const polygon = clipPolygonToConvex(patch.polygon, cell);
    if (polygon.length >= 3 && polygonArea(polygon) > 1e-7) pieces.push({ id: `${seed.id}:${patch.id}`, polygon });
  }
  return pieces;
}

function centerInsidePolygon(polygon: readonly Point[], pieces: readonly RegionPiece[]): Point {
  const centroid = polygonCentroid(polygon);
  if (pointInPolygon(centroid, polygon)) return roundPoint(centroid);
  for (const piece of pieces) {
    const pieceCenter = polygonCentroid(piece.polygon);
    if (pointInPolygon(pieceCenter, polygon)) return roundPoint(pieceCenter);
  }
  return roundPoint(polygon[0]!);
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
  const seedIndex = buildSeedSpatialIndex(seeds);
  const patchIndex = buildPatchSpatialIndex(geography.patches);
  const usedNames = new Set<string>();
  const regions: Region[] = [];

  for (const regionSeed of [...seeds].sort((left, right) => left.id.localeCompare(right.id))) {
    const powerCell = powerCellForSeed(regionSeed, seedIndex);
    if (powerCell.length < 3) continue;
    const pieces = piecesForPowerCell(regionSeed, powerCell, patchIndex);
    if (!pieces.length) continue;
    const loops = tracePatchBoundaries(pieces).filter(polygon => polygonSignedArea(polygon) > 0);
    for (let component = 0; component < loops.length; component += 1) {
      const polygon = removeCollinearVertices(loops[component]!);
      const center = centerInsidePolygon(polygon, pieces);
      const environment = createRegionEnvironment(context, center);
      const id = `region-${regionSeed.id.replace(/^seed-/, '')}-${component}`;
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
