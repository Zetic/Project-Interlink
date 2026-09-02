import { environmentContextForPlanet, samplePlanetEnvironment, type PlanetEnvironmentSample } from './generation/surfaceField.js';
import { worldSpatialIndexFor, type WorldSpatialIndex } from './spatialIndex.js';
import type { Continent, Ocean, Planet, Point, Region } from './types.js';

export interface GeographicLocationContext {
  region: Region;
  parent: Continent | Ocean;
  environment: PlanetEnvironmentSample;
}

export function geographicLocationAt(planet: Planet, point: Point, index: WorldSpatialIndex = worldSpatialIndexFor(planet)): GeographicLocationContext | null {
  const region = index.regionContaining(point);
  if (!region) return null;
  const parent = region.parentKind === 'continent' ? index.continentById(region.parentId) : index.oceanById(region.parentId);
  if (!parent) return null;
  return { region, parent, environment: samplePlanetEnvironment(environmentContextForPlanet(planet), point) };
}

export function geographicLocationKey(planet: Planet, point: Point, cellSize = 16): string {
  const context = geographicLocationAt(planet, point);
  if (!context) return `none:${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`;
  return `${context.parent.id}:${context.region.id}:${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`;
}
