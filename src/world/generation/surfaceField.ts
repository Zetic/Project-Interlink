import { deterministicUnit } from '../random.js';
import { PLANET_MAP_HEIGHT, PLANET_MAP_WIDTH } from '../scale.js';
import type { Planet, PlateBoundaryType, Point, RegionEnvironment, SurfaceType, TectonicPlate } from '../types.js';
import { samplePlateModel } from './tectonics.js';

export interface PlanetEnvironmentContext {
  seed: string;
  plates: readonly TectonicPlate[];
  seaLevelRaw: number;
}

export interface PlanetEnvironmentSample extends RegionEnvironment {
  surfaceType: SurfaceType;
  surfaceElevationMeters: number;
  rawElevation: number;
}

export const CANONICAL_SURFACE_COLUMNS = 128;
export const CANONICAL_SURFACE_ROWS = 64;

export function environmentContextForPlanet(planet: Planet): PlanetEnvironmentContext {
  return { seed: planet.seed, plates: planet.tectonicPlates, seaLevelRaw: planet.seaLevelRaw };
}

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
function smooth(value: number): number { return value * value * (3 - 2 * value); }
function round(value: number, digits = 6): number { return Number(value.toFixed(digits)); }

function wrappedLatticeValue(seed: string, namespace: string, x: number, y: number, period: number): number {
  const wrappedX = ((x % period) + period) % period;
  return deterministicUnit(seed, `${namespace}:${wrappedX}:${y}`);
}

export function wrappedValueNoise(seed: string, namespace: string, point: Point, scale: number): number {
  const scaledX = point.x / scale;
  const scaledY = point.y / scale;
  const x0 = Math.floor(scaledX);
  const y0 = Math.floor(scaledY);
  const tx = smooth(scaledX - x0);
  const ty = smooth(scaledY - y0);
  const period = Math.max(1, Math.round(PLANET_MAP_WIDTH / scale));
  const north = wrappedLatticeValue(seed, namespace, x0, y0, period) * (1 - tx) + wrappedLatticeValue(seed, namespace, x0 + 1, y0, period) * tx;
  const south = wrappedLatticeValue(seed, namespace, x0, y0 + 1, period) * (1 - tx) + wrappedLatticeValue(seed, namespace, x0 + 1, y0 + 1, period) * tx;
  return north * (1 - ty) + south * ty;
}

export function rawSurfaceElevation(seed: string, plates: readonly TectonicPlate[], point: Point): number {
  const plate = samplePlateModel(plates, point);
  const macro = (wrappedValueNoise(seed, 'surface:macro', point, 1024) - 0.5) * 0.84;
  const meso = (wrappedValueNoise(seed, 'surface:meso', point, 512) - 0.5) * 0.42;
  const detail = (wrappedValueNoise(seed, 'surface:detail', point, 256) - 0.5) * 0.16;
  const boundaryEffect = plate.boundaryType === 'convergent' ? 0.34 * plate.boundaryProximity
    : plate.boundaryType === 'divergent' ? -0.22 * plate.boundaryProximity
      : 0;
  return plate.plate.crustBias + macro + meso + detail + boundaryEffect;
}

export function chooseSeaLevel(seed: string, plates: readonly TectonicPlate[]): number {
  const samples: number[] = [];
  const columns = CANONICAL_SURFACE_COLUMNS;
  const rows = CANONICAL_SURFACE_ROWS;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      samples.push(rawSurfaceElevation(seed, plates, {
        x: (column + 0.5) * PLANET_MAP_WIDTH / columns,
        y: (row + 0.5) * PLANET_MAP_HEIGHT / rows,
      }));
    }
  }
  samples.sort((left, right) => left - right);
  const landFraction = 0.3 + deterministicUnit(seed, 'surface:land-fraction') * 0.14;
  return round(samples[Math.floor(samples.length * (1 - landFraction))] ?? 0);
}

function boundaryActivity(type: PlateBoundaryType, proximity: number): number {
  const intensity = type === 'interior' ? 0 : type === 'transform' ? 0.72 : 1;
  return clamp01(proximity * intensity);
}

export function samplePlanetEnvironment(context: PlanetEnvironmentContext, point: Point): PlanetEnvironmentSample {
  const x = ((point.x % PLANET_MAP_WIDTH) + PLANET_MAP_WIDTH) % PLANET_MAP_WIDTH;
  const y = Math.max(0, Math.min(PLANET_MAP_HEIGHT, point.y));
  const normalizedPoint = { x, y };
  const plate = samplePlateModel(context.plates, normalizedPoint);
  // Surface ownership is sampled on the same canonical 128 × 64 field used to
  // derive parent coastlines and Regions. Other environmental fields remain
  // continuous within a Region, but land/ocean truth cannot disagree by LOD.
  const surfaceCellWidth = PLANET_MAP_WIDTH / CANONICAL_SURFACE_COLUMNS;
  const surfaceCellHeight = PLANET_MAP_HEIGHT / CANONICAL_SURFACE_ROWS;
  const surfacePoint = {
    x: (Math.floor(x / surfaceCellWidth) + 0.5) * surfaceCellWidth,
    y: (Math.min(CANONICAL_SURFACE_ROWS - 1, Math.floor(y / surfaceCellHeight)) + 0.5) * surfaceCellHeight,
  };
  const rawElevation = rawSurfaceElevation(context.seed, context.plates, surfacePoint);
  const signedElevation = rawElevation - context.seaLevelRaw;
  const surfaceElevationMeters = Math.round(Math.max(-7_500, Math.min(5_800, signedElevation * 7_200)));
  const surfaceType: SurfaceType = surfaceElevationMeters >= 0 ? 'land' : 'ocean';
  const latitudeDeg = 90 - (y / PLANET_MAP_HEIGHT) * 180;
  const latitudeWarmth = 1 - Math.abs(latitudeDeg) / 90;
  const tectonicActivity = clamp01(0.08 + boundaryActivity(plate.boundaryType, plate.boundaryProximity) * 0.9);
  const reliefNoise = wrappedValueNoise(context.seed, 'surface:relief', normalizedPoint, 256);
  const reliefMeters = Math.round(80 + reliefNoise * 1_100 + tectonicActivity * 2_100);
  const moistureIndex = clamp01(wrappedValueNoise(context.seed, 'climate:moisture', normalizedPoint, 512) * 0.68 + latitudeWarmth * 0.22 + (surfaceType === 'ocean' ? 0.1 : 0));
  const volcanicActivity = clamp01((plate.boundaryType === 'convergent' ? 0.78 : plate.boundaryType === 'divergent' ? 0.62 : 0.16) * plate.boundaryProximity + wrappedValueNoise(context.seed, 'geology:volcanic', normalizedPoint, 256) * 0.18);
  const sedimentaryBasinFactor = clamp01(wrappedValueNoise(context.seed, 'geology:sedimentary', normalizedPoint, 512) * 0.54 + (1 - tectonicActivity) * 0.25 + (surfaceElevationMeters < 800 ? 0.18 : 0));
  const thermalIndex = clamp01(latitudeWarmth * 0.82 + wrappedValueNoise(context.seed, 'climate:thermal', normalizedPoint, 1024) * 0.18 - Math.max(0, surfaceElevationMeters) / 30_000);
  return {
    surfaceType,
    surfaceElevationMeters,
    rawElevation: round(rawElevation),
    latitudeDeg: round(latitudeDeg, 3),
    meanElevationMeters: surfaceElevationMeters,
    reliefMeters,
    thermalIndex: round(thermalIndex, 4),
    moistureIndex: round(moistureIndex, 4),
    tectonicActivity: round(tectonicActivity, 4),
    volcanicActivity: round(volcanicActivity, 4),
    sedimentaryBasinFactor: round(sedimentaryBasinFactor, 4),
    plateId: plate.plate.id,
    boundaryType: plate.boundaryType,
    boundaryProximity: round(plate.boundaryProximity, 4),
  };
}
