import test from 'node:test';

import { PLANET_MAP_HEIGHT, PLANET_MAP_WIDTH, profileWorldGeneration } from '../dist/world/generateWorld.js';
import { polygonArea, polygonSignedArea } from '../dist/world/geometry.js';

test('diagnose continuous Region area accounting', () => {
  for (const seed of ['bounded-geography-v4', 'bounded-geography-v5']) {
    const profile = profileWorldGeneration(seed);
    const planet = profile.world.planet;
    const signed = planet.regions.reduce((sum, region) => sum + polygonSignedArea(region.polygon), 0);
    const absolute = planet.regions.reduce((sum, region) => sum + polygonArea(region.polygon), 0);
    const target = PLANET_MAP_WIDTH * PLANET_MAP_HEIGHT;
    console.log('REGION_GEOMETRY_DIAGNOSTIC', JSON.stringify({
      seed,
      regions: planet.regions.length,
      target,
      signed,
      absolute,
      signedDelta: signed - target,
      absoluteDelta: absolute - target,
      timings: profile.timings,
    }));
  }
});
