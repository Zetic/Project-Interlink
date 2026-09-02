import { polygonArea, polygonBounds, polygonCentroid } from '../geometry.js';
import { createRng } from '../random.js';
import { EARTH_SCALE_METERS_PER_WORLD_UNIT, PLANET_MAP_HEIGHT, PLANET_MAP_WIDTH } from '../scale.js';
import type { Landmass, Point, Region, RegionEnvironment } from '../types.js';
import { landmassContaining } from './geography.js';
import { createRegionEnvironment } from './regionEnvironment.js';

export const TARGET_REGION_SPACING_WORLD_UNITS = 32;
const NAME_STARTS = ['Aer', 'Ald', 'Ar', 'Bel', 'Cal', 'Cer', 'Cor', 'Dar', 'Del', 'Eir', 'El', 'Fal', 'Gal', 'Hal', 'Ith', 'Kar', 'Kel', 'Kor', 'Lor', 'Mar', 'Nor', 'Or', 'Ser', 'Tal'];
const NAME_MIDDLES = ['a', 'ae', 'al', 'an', 'ar', 'el', 'en', 'er', 'eth', 'ia', 'il', 'in', 'ir', 'or', 'os', 'ra', 're', 'ro', 'ul', 'un', 'ur', 'va', 've', 'yr'];
const NAME_ENDS = ['d', 'l', 'm', 'n', 'r', 's', 'th', 'v', 'x', 'ya', 'en', 'is', 'on', 'or', 'um', 'ys'];

function suffixForEnvironment(environment: RegionEnvironment): string {
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

function createUniqueRegionName(seed: string, row: number, column: number, environment: RegionEnvironment, used: Set<string>): string {
  const rng = createRng(seed, `region-name:${row}:${column}`);
  const suffix = suffixForEnvironment(environment);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = `${rng.pick(NAME_STARTS)}${rng.pick(NAME_MIDDLES)}${rng.pick(NAME_ENDS)} ${suffix}`;
    if (!used.has(candidate)) { used.add(candidate); return candidate; }
  }
  const fallback = `Sector ${row + 1}-${column + 1} ${suffix}`;
  used.add(fallback);
  return fallback;
}

function sharedVertex(seed: string, column: number, row: number, columns: number, rows: number): Point {
  const spacingX = PLANET_MAP_WIDTH / columns;
  const spacingY = PLANET_MAP_HEIGHT / rows;
  const rng = createRng(seed, `geography:region-vertex:${column}:${row}`);
  const x = column === 0 || column === columns ? column * spacingX : column * spacingX + rng.range(-spacingX * 0.2, spacingX * 0.2);
  const y = row === 0 || row === rows ? row * spacingY : row * spacingY + rng.range(-spacingY * 0.2, spacingY * 0.2);
  return { x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) };
}

export function generateRegions(seed: string, landmasses: readonly Landmass[]): Region[] {
  const columns = Math.round(PLANET_MAP_WIDTH / TARGET_REGION_SPACING_WORLD_UNITS);
  const rows = Math.round(PLANET_MAP_HEIGHT / TARGET_REGION_SPACING_WORLD_UNITS);
  const vertices = Array.from({ length: rows + 1 }, (_, row) => Array.from({ length: columns + 1 }, (_, column) => sharedVertex(seed, column, row, columns, rows)));
  const regions: Region[] = [];
  const usedNames = new Set<string>();
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const polygon = [vertices[row]![column]!, vertices[row]![column + 1]!, vertices[row + 1]![column + 1]!, vertices[row + 1]![column]!];
      const center = polygonCentroid(polygon);
      const landmass = landmassContaining(landmasses, center);
      if (!landmass) continue;
      const environment = createRegionEnvironment(seed, center);
      const flatAreaSquareMeters = polygonArea(polygon) * EARTH_SCALE_METERS_PER_WORLD_UNIT ** 2;
      const latitudeScale = Math.max(0.12, Math.cos(environment.latitudeDeg * Math.PI / 180));
      regions.push({
        id: `region-${row}-${column}`,
        name: createUniqueRegionName(seed, row, column, environment, usedNames),
        landmassId: landmass.id,
        bounds: polygonBounds(polygon),
        polygon,
        center: { x: Number(center.x.toFixed(6)), y: Number(center.y.toFixed(6)) },
        approximateAreaSquareKm: Number((flatAreaSquareMeters * latitudeScale / 1_000_000).toFixed(1)),
        environment,
        resourceNodeIds: [],
      });
    }
  }
  return regions;
}
