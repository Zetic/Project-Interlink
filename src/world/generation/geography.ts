import { polygonBounds } from '../geometry.js';
import { createRng } from '../random.js';
import { EARTH_SCALE_METERS_PER_WORLD_UNIT, PLANET_MAP_HEIGHT, PLANET_MAP_WIDTH } from '../scale.js';
import type { Bounds, Continent, GeographicParentKind, Ocean, Point, RegionEnvironment, SurfaceType, TectonicPlate } from '../types.js';
import type { PlanetEnvironmentContext } from './surfaceField.js';
import { CANONICAL_SURFACE_COLUMNS, CANONICAL_SURFACE_ROWS, samplePlanetEnvironment } from './surfaceField.js';
import { wrappedDistanceSquared } from './tectonics.js';

export const GEOGRAPHY_COLUMNS = CANONICAL_SURFACE_COLUMNS;
export const GEOGRAPHY_ROWS = CANONICAL_SURFACE_ROWS;
export const GEOGRAPHY_CELL_WIDTH = PLANET_MAP_WIDTH / GEOGRAPHY_COLUMNS;
export const GEOGRAPHY_CELL_HEIGHT = PLANET_MAP_HEIGHT / GEOGRAPHY_ROWS;

export interface GeographyCell {
  column: number;
  row: number;
  id: string;
  center: Point;
  surfaceType: SurfaceType;
  environment: RegionEnvironment;
  parentKind: GeographicParentKind;
  parentId: string;
}

export interface GeneratedGeography {
  cells: GeographyCell[];
  continents: Continent[];
  oceans: Ocean[];
}

const CONTINENT_NAMES = ['Avaria', 'Ceryth', 'Damaris', 'Elyon', 'Kestrel', 'Orinth', 'Sereva', 'Talora'];
const OCEAN_NAMES = ['Pelagic', 'Boreal', 'Sapphire', 'Vesper', 'Meridian', 'Abyssal', 'Austral', 'Thalassic'];

function cellIndex(column: number, row: number): number { return row * GEOGRAPHY_COLUMNS + column; }
function pointKey(point: Point): string { return `${point.x}:${point.y}`; }
function boundsForPolygons(polygons: readonly Point[][]): Bounds { return polygonBounds(polygons.flat()); }

function createBaseCells(context: PlanetEnvironmentContext): GeographyCell[] {
  const cells: GeographyCell[] = [];
  for (let row = 0; row < GEOGRAPHY_ROWS; row += 1) {
    for (let column = 0; column < GEOGRAPHY_COLUMNS; column += 1) {
      const center = { x: (column + 0.5) * GEOGRAPHY_CELL_WIDTH, y: (row + 0.5) * GEOGRAPHY_CELL_HEIGHT };
      const sample = samplePlanetEnvironment(context, center);
      cells.push({ column, row, id: `region-${row}-${column}`, center, surfaceType: sample.surfaceType, environment: sample,
        parentKind: sample.surfaceType === 'land' ? 'continent' : 'ocean', parentId: '' });
    }
  }
  return cells;
}

function surfaceComponents(cells: readonly GeographyCell[], surfaceType: SurfaceType): number[][] {
  const visited = new Set<number>();
  const components: number[][] = [];
  for (let start = 0; start < cells.length; start += 1) {
    if (visited.has(start) || cells[start]!.surfaceType !== surfaceType) continue;
    const component: number[] = [];
    const queue = [start];
    visited.add(start);
    while (queue.length) {
      const currentIndex = queue.pop()!;
      const cell = cells[currentIndex]!;
      component.push(currentIndex);
      const neighbors = [[((cell.column - 1) + GEOGRAPHY_COLUMNS) % GEOGRAPHY_COLUMNS, cell.row], [(cell.column + 1) % GEOGRAPHY_COLUMNS, cell.row], [cell.column, cell.row - 1], [cell.column, cell.row + 1]] as const;
      for (const [column, row] of neighbors) {
        if (row < 0 || row >= GEOGRAPHY_ROWS) continue;
        const index = cellIndex(column, row);
        if (!visited.has(index) && cells[index]!.surfaceType === surfaceType) { visited.add(index); queue.push(index); }
      }
    }
    components.push(component);
  }
  return components.sort((left, right) => right.length - left.length || left[0]! - right[0]!);
}

function componentCenter(cells: readonly GeographyCell[], indexes: readonly number[]): Point {
  const total = indexes.reduce((sum, index) => ({ x: sum.x + cells[index]!.center.x, y: sum.y + cells[index]!.center.y }), { x: 0, y: 0 });
  return { x: total.x / Math.max(1, indexes.length), y: total.y / Math.max(1, indexes.length) };
}

function farthestSurfaceAnchors(cells: readonly GeographyCell[], surfaceType: SurfaceType, target: number, initial: Point | undefined): Point[] {
  const available = cells.filter(cell => cell.surfaceType === surfaceType).map(cell => cell.center);
  if (!available.length) return [];
  const first = initial ? available.reduce((best, point) => wrappedDistanceSquared(point, initial) < wrappedDistanceSquared(best, initial) ? point : best) : available[0]!;
  const anchors = [first];
  while (anchors.length < Math.min(target, available.length)) {
    const next = available.reduce((best, point) => {
      const distance = Math.min(...anchors.map(anchor => wrappedDistanceSquared(point, anchor)));
      const bestDistance = Math.min(...anchors.map(anchor => wrappedDistanceSquared(best, anchor)));
      return distance > bestDistance ? point : best;
    });
    anchors.push(next);
  }
  return anchors;
}

function assignContinents(cells: GeographyCell[], plates: readonly TectonicPlate[]): string[] {
  const components = surfaceComponents(cells, 'land');
  const substantial = components.filter(component => component.length >= 12).slice(0, 7);
  const continentalPlates = plates.filter(plate => plate.crustType === 'continental');
  const anchors = substantial.length >= 3 ? substantial.map(component => componentCenter(cells, component))
    : farthestSurfaceAnchors(cells, 'land', Math.max(3, Math.min(6, continentalPlates.length)), continentalPlates[0]?.seedPoint);
  if (!anchors.length) throw new Error('Generator v3 requires continental anchors derived from tectonic truth.');
  const ids = anchors.map((_, index) => `continent-${index}`);
  for (const cell of cells) {
    if (cell.surfaceType !== 'land') continue;
    let best = 0;
    for (let index = 1; index < anchors.length; index += 1) if (wrappedDistanceSquared(cell.center, anchors[index]!) < wrappedDistanceSquared(cell.center, anchors[best]!)) best = index;
    cell.parentId = ids[best]!;
  }
  return ids.filter(id => cells.some(cell => cell.parentId === id));
}

function assignOceans(cells: GeographyCell[], plates: readonly TectonicPlate[]): string[] {
  const oceanic = plates.filter(plate => plate.crustType === 'oceanic');
  const target = Math.max(3, Math.min(8, Math.round(oceanic.length / 2)));
  const anchors = farthestSurfaceAnchors(cells, 'ocean', target, (oceanic[0] ?? plates[0])?.seedPoint);
  const ids = anchors.map((_, index) => `ocean-${index}`);
  for (const cell of cells) {
    if (cell.surfaceType !== 'ocean') continue;
    let best = 0;
    for (let index = 1; index < anchors.length; index += 1) if (wrappedDistanceSquared(cell.center, anchors[index]!) < wrappedDistanceSquared(cell.center, anchors[best]!)) best = index;
    cell.parentId = ids[best]!;
  }
  return ids.filter(id => cells.some(cell => cell.parentId === id));
}

function polygonsForParent(cells: readonly GeographyCell[], parentId: string): Point[][] {
  const owned = new Set(cells.filter(cell => cell.parentId === parentId).map(cell => cellIndex(cell.column, cell.row)));
  const edges: Array<[Point, Point]> = [];
  const isOwned = (column: number, row: number): boolean => row >= 0 && row < GEOGRAPHY_ROWS && column >= 0 && column < GEOGRAPHY_COLUMNS && owned.has(cellIndex(column, row));
  for (const index of owned) {
    const cell = cells[index]!;
    const x0 = cell.column * GEOGRAPHY_CELL_WIDTH; const x1 = x0 + GEOGRAPHY_CELL_WIDTH;
    const y0 = cell.row * GEOGRAPHY_CELL_HEIGHT; const y1 = y0 + GEOGRAPHY_CELL_HEIGHT;
    if (!isOwned(cell.column, cell.row - 1)) edges.push([{ x: x0, y: y0 }, { x: x1, y: y0 }]);
    if (!isOwned(cell.column + 1, cell.row)) edges.push([{ x: x1, y: y0 }, { x: x1, y: y1 }]);
    if (!isOwned(cell.column, cell.row + 1)) edges.push([{ x: x1, y: y1 }, { x: x0, y: y1 }]);
    if (!isOwned(cell.column - 1, cell.row)) edges.push([{ x: x0, y: y1 }, { x: x0, y: y0 }]);
  }
  const outgoing = new Map<string, Array<[Point, Point]>>();
  for (const edge of edges) { const list = outgoing.get(pointKey(edge[0])) ?? []; list.push(edge); outgoing.set(pointKey(edge[0]), list); }
  const remaining = new Set(edges);
  const polygons: Point[][] = [];
  while (remaining.size) {
    const first = remaining.values().next().value as [Point, Point];
    const polygon: Point[] = [first[0]];
    let edge: [Point, Point] | undefined = first;
    while (edge && remaining.has(edge)) {
      remaining.delete(edge);
      const end: Point = edge[1];
      if (pointKey(end) === pointKey(polygon[0]!)) break;
      polygon.push(end);
      edge = (outgoing.get(pointKey(end)) ?? []).find(candidate => remaining.has(candidate));
    }
    if (polygon.length >= 3) polygons.push(polygon);
  }
  return polygons.sort((left, right) => right.length - left.length);
}

function parentAreaSquareKm(cells: readonly GeographyCell[], parentId: string): number {
  const flatCellArea = GEOGRAPHY_CELL_WIDTH * GEOGRAPHY_CELL_HEIGHT * EARTH_SCALE_METERS_PER_WORLD_UNIT ** 2;
  return cells.filter(cell => cell.parentId === parentId).reduce((sum, cell) => sum + flatCellArea * Math.max(0.12, Math.cos(cell.environment.latitudeDeg * Math.PI / 180)) / 1_000_000, 0);
}

function createParents<K extends GeographicParentKind>(cells: readonly GeographyCell[], ids: readonly string[], kind: K, names: readonly string[], seed: string): Array<K extends 'continent' ? Continent : Ocean> {
  const available = names.map((name, index) => ({ name, order: createRng(seed, `geography:${kind}:name:${index}`).next() })).sort((left, right) => left.order - right.order).map(entry => entry.name);
  return ids.map((id, index) => {
    const owned = cells.filter(cell => cell.parentId === id);
    const polygons = polygonsForParent(cells, id);
    const center = componentCenter(cells, owned.map(cell => cellIndex(cell.column, cell.row)));
    const mean = owned.reduce((sum, cell) => sum + cell.environment.meanElevationMeters, 0) / Math.max(1, owned.length);
    return { id, name: `${available[index % available.length] ?? `${kind}-${index + 1}`}${kind === 'ocean' ? ' Ocean' : ''}`, kind, polygons,
      bounds: boundsForPolygons(polygons), center, approximateAreaSquareKm: Number(parentAreaSquareKm(cells, id).toFixed(1)), regionIds: owned.map(cell => cell.id), meanSurfaceElevationMeters: Math.round(mean) } as K extends 'continent' ? Continent : Ocean;
  });
}

export function generateGeography(context: PlanetEnvironmentContext): GeneratedGeography {
  const cells = createBaseCells(context);
  const continentIds = assignContinents(cells, context.plates);
  const oceanIds = assignOceans(cells, context.plates);
  return { cells, continents: createParents(cells, continentIds, 'continent', CONTINENT_NAMES, context.seed), oceans: createParents(cells, oceanIds, 'ocean', OCEAN_NAMES, context.seed) };
}
