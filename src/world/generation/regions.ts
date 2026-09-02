import { polygonArea, polygonBounds } from '../geometry.js';
import { createRng } from '../random.js';
import { EARTH_SCALE_METERS_PER_WORLD_UNIT } from '../scale.js';
import type { Point, Region, RegionEnvironment } from '../types.js';
import { GEOGRAPHY_CELL_HEIGHT, GEOGRAPHY_CELL_WIDTH, GEOGRAPHY_COLUMNS, GEOGRAPHY_ROWS, type GeographyCell } from './geography.js';

export const TARGET_REGION_SPACING_WORLD_UNITS = 32;
const NAME_STARTS = ['Aer', 'Ald', 'Ar', 'Bel', 'Cal', 'Cer', 'Cor', 'Dar', 'Del', 'Eir', 'El', 'Fal', 'Gal', 'Hal', 'Ith', 'Kar', 'Kel', 'Kor', 'Lor', 'Mar', 'Nor', 'Or', 'Ser', 'Tal'];
const NAME_MIDDLES = ['a', 'ae', 'al', 'an', 'ar', 'el', 'en', 'er', 'eth', 'ia', 'il', 'in', 'ir', 'or', 'os', 'ra', 're', 'ro', 'ul', 'un', 'ur', 'va', 've', 'yr'];
const NAME_ENDS = ['d', 'l', 'm', 'n', 'r', 's', 'th', 'v', 'x', 'ya', 'en', 'is', 'on', 'or', 'um', 'ys'];

function suffixForEnvironment(environment: RegionEnvironment, ocean: boolean): string {
  if (ocean) {
    if (environment.boundaryType === 'divergent' && environment.boundaryProximity > 0.65) return 'Ridge';
    if (environment.boundaryType === 'convergent' && environment.boundaryProximity > 0.7) return 'Trench';
    if (environment.meanElevationMeters < -4_000) return 'Deep';
    if (environment.sedimentaryBasinFactor > 0.7) return 'Basin';
    return 'Pelagic Plain';
  }
  if (environment.volcanicActivity > 0.74) return 'Volcanic Belt';
  if (environment.tectonicActivity > 0.72) return 'Rift';
  if (environment.meanElevationMeters > 2_450 && environment.reliefMeters > 1_250) return 'Highlands';
  if (environment.meanElevationMeters > 2_300) return 'Plateau';
  if (environment.sedimentaryBasinFactor > 0.72) return 'Basin';
  if (environment.reliefMeters > 1_500) return 'Range';
  if (environment.moistureIndex < 0.32 && environment.reliefMeters < 900) return 'Flats';
  if (environment.meanElevationMeters < 900) return 'Lowlands';
  return environment.reliefMeters < 850 ? 'Plain' : 'Reach';
}

function createUniqueName(seed: string, cell: GeographyCell, used: Set<string>): string {
  const rng = createRng(seed, `region-name:${cell.row}:${cell.column}`);
  const suffix = suffixForEnvironment(cell.environment, cell.surfaceType === 'ocean');
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = `${rng.pick(NAME_STARTS)}${rng.pick(NAME_MIDDLES)}${rng.pick(NAME_ENDS)} ${suffix}`;
    if (!used.has(candidate)) { used.add(candidate); return candidate; }
  }
  const fallback = `Sector ${cell.row + 1}-${cell.column + 1} ${suffix}`;
  used.add(fallback);
  return fallback;
}

function coastal(cell: GeographyCell, cells: readonly GeographyCell[], dc: number, dr: number): boolean {
  const column = cell.column + dc;
  const row = cell.row + dr;
  if (column < 0 || column >= GEOGRAPHY_COLUMNS || row < 0 || row >= GEOGRAPHY_ROWS) return true;
  return cells[row * GEOGRAPHY_COLUMNS + column]!.surfaceType !== cell.surfaceType;
}

function regionPolygon(cell: GeographyCell, cells: readonly GeographyCell[]): Point[] {
  const x0 = cell.column * GEOGRAPHY_CELL_WIDTH; const x1 = x0 + GEOGRAPHY_CELL_WIDTH;
  const y0 = cell.row * GEOGRAPHY_CELL_HEIGHT; const y1 = y0 + GEOGRAPHY_CELL_HEIGHT;
  const points: Point[] = [{ x: x0, y: y0 }];
  if (coastal(cell, cells, 0, -1)) points.push({ x: (x0 + x1) / 2, y: y0 });
  points.push({ x: x1, y: y0 });
  if (coastal(cell, cells, 1, 0)) points.push({ x: x1, y: (y0 + y1) / 2 });
  points.push({ x: x1, y: y1 });
  if (coastal(cell, cells, 0, 1)) points.push({ x: (x0 + x1) / 2, y: y1 });
  points.push({ x: x0, y: y1 });
  if (coastal(cell, cells, -1, 0)) points.push({ x: x0, y: (y0 + y1) / 2 });
  return points;
}

export function generateRegions(seed: string, cells: readonly GeographyCell[]): Region[] {
  const usedNames = new Set<string>();
  return cells.map(cell => {
    const polygon = regionPolygon(cell, cells);
    const flatAreaSquareMeters = polygonArea(polygon) * EARTH_SCALE_METERS_PER_WORLD_UNIT ** 2;
    const latitudeScale = Math.max(0.12, Math.cos(cell.environment.latitudeDeg * Math.PI / 180));
    return { id: cell.id, name: createUniqueName(seed, cell, usedNames), parentKind: cell.parentKind, parentId: cell.parentId, surfaceType: cell.surfaceType,
      bounds: polygonBounds(polygon), polygon, center: { x: Number(cell.center.x.toFixed(6)), y: Number(cell.center.y.toFixed(6)) },
      approximateAreaSquareKm: Number((flatAreaSquareMeters * latitudeScale / 1_000_000).toFixed(1)), environment: cell.environment, resourceNodeIds: [] };
  });
}
