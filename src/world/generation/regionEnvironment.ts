import type { Point, RegionEnvironment } from '../types.js';
import type { PlanetEnvironmentContext } from './surfaceField.js';
import { samplePlanetEnvironment } from './surfaceField.js';

/** Canonical regional summary sampled from the same surface field used for land/ocean ownership. */
export function createRegionEnvironment(context: PlanetEnvironmentContext, center: Point): RegionEnvironment {
  return samplePlanetEnvironment(context, center);
}
