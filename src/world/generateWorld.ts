import { generateGeography } from './generation/geography.js';
import { generateRegions } from './generation/regions.js';
import { generateResourceFeatures } from './generation/resourceFeatures.js';
import { generateSurfaceField, registerPlanetSurfaceField } from './generation/surfaceField.js';
import { generateTectonicPlates } from './generation/tectonics.js';
import { createRng } from './random.js';
import {
  EARTH_SCALE_PHYSICAL_HEIGHT_METERS,
  EARTH_SCALE_PHYSICAL_WIDTH_METERS,
  PLANET_MAP_HEIGHT,
  PLANET_MAP_WIDTH,
} from './scale.js';
import type { Planet, WorldState } from './types.js';

export { PLANET_MAP_HEIGHT, PLANET_MAP_WIDTH } from './scale.js';
export const WORLD_GENERATOR_VERSION = 7;
const PLANET_NAMES = ['Aethon', 'Boras', 'Caldris', 'Draven', 'Eryndor', 'Feraxis', 'Galneth', 'Havar'];

export interface WorldGenerationTimings {
  tectonicPlatesMs: number;
  surfaceFieldMs: number;
  parentGeographyMs: number;
  regionsMs: number;
  resourcesMs: number;
  totalMs: number;
}

function clock(): number { return globalThis.performance?.now() ?? Date.now(); }

function generateWorldInternal(seedInput: string): { world: WorldState; timings: WorldGenerationTimings } {
  const started = clock();
  let stage = started;
  const elapsed = (): number => { const next = clock(); const value = next - stage; stage = next; return value; };

  const seed = String(seedInput || 'default-seed');
  const planetRng = createRng(seed, `planet:v${WORLD_GENERATOR_VERSION}`);
  const tectonicPlates = generateTectonicPlates(seed);
  const tectonicPlatesMs = elapsed();
  const surfaceField = generateSurfaceField(seed, tectonicPlates);
  const seaLevelRaw = surfaceField.seaLevelRaw;
  const environmentContext = { seed, plates: tectonicPlates, seaLevelRaw, surfaceField };
  const surfaceFieldMs = elapsed();
  const geography = generateGeography(environmentContext);
  const parentGeographyMs = elapsed();
  const regions = generateRegions(seed, geography, environmentContext);
  const regionsMs = elapsed();
  const resourceNodes = generateResourceFeatures(seed, regions, environmentContext);
  const resourcesMs = elapsed();
  const planet: Planet = {
    id: `planet-${seed.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 48) || 'default'}`,
    seed,
    generatorVersion: WORLD_GENERATOR_VERSION,
    name: planetRng.pick(PLANET_NAMES),
    width: PLANET_MAP_WIDTH,
    height: PLANET_MAP_HEIGHT,
    physicalWidthMeters: EARTH_SCALE_PHYSICAL_WIDTH_METERS,
    physicalHeightMeters: EARTH_SCALE_PHYSICAL_HEIGHT_METERS,
    seaLevelRaw,
    surfaceResolution: { columns: surfaceField.columns, rows: surfaceField.rows },
    tectonicPlates,
    continents: geography.continents,
    oceans: geography.oceans,
    regions,
    resourceNodes,
  };
  registerPlanetSurfaceField(planet, surfaceField);
  return {
    world: { planet },
    timings: {
      tectonicPlatesMs,
      surfaceFieldMs,
      parentGeographyMs,
      regionsMs,
      resourcesMs,
      totalMs: clock() - started,
    },
  };
}

export function generateWorld(seedInput: string): WorldState {
  return generateWorldInternal(seedInput).world;
}

/** Developer-facing profiling API. Timings are excluded from deterministic world truth. */
export function profileWorldGeneration(seedInput: string): { world: WorldState; timings: WorldGenerationTimings } {
  return generateWorldInternal(seedInput);
}
