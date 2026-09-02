import test from 'node:test';

import { profileWorldGeneration } from '../dist/world/generateWorld.js';

test('diagnose semantic geographic province distribution', () => {
  for (const seed of ['geo-v6-a', 'geo-v6-b', 'geo-v6-c']) {
    const profile = profileWorldGeneration(seed);
    const planet = profile.world.planet;
    const types = Object.fromEntries([...new Set(planet.regions.map(region => region.geographicType))].sort().map(type => [type, planet.regions.filter(region => region.geographicType === type).length]));
    console.log('SEMANTIC_GEOGRAPHY_DIAGNOSTIC', JSON.stringify({
      seed,
      regions: planet.regions.length,
      landRegions: planet.regions.filter(region => region.surfaceType === 'land').length,
      oceanRegions: planet.regions.filter(region => region.surfaceType === 'ocean').length,
      features: planet.resourceNodes.length,
      types,
      timings: profile.timings,
    }));
  }
});
