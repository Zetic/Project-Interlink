import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAP_OVERLAY_MAX_ZOOM,
  MAP_OVERLAY_OPTIONS,
  overlayColorForEnvironment,
  overlayLegendFor,
} from '../dist/map/mapOverlayRenderer.js';
import type { PlanetEnvironmentSample } from '../src/world/generation/surfaceField.js';

function sample(overrides: Partial<PlanetEnvironmentSample> = {}): PlanetEnvironmentSample {
  return {
    surfaceType: 'land',
    surfaceElevationMeters: 500,
    rawElevation: 0.2,
    latitudeDeg: 20,
    meanElevationMeters: 500,
    reliefMeters: 800,
    thermalIndex: 0.5,
    moistureIndex: 0.5,
    tectonicActivity: 0.4,
    volcanicActivity: 0.3,
    sedimentaryBasinFactor: 0.45,
    plateId: 'plate-0',
    boundaryType: 'interior',
    boundaryProximity: 0,
    ...overrides,
  };
}

test('map overlays expose current surface, geology, geography, and resource world truth', () => {
  const ids = new Set(MAP_OVERLAY_OPTIONS.map(option => option.id));
  for (const id of [
    'elevation', 'relief', 'thermal', 'moisture', 'tectonic-plates', 'crust-type',
    'plate-boundaries', 'tectonic-activity', 'volcanic-activity', 'sedimentary-tendency',
    'semantic-geography', 'resource:iron-ore', 'resource:copper-ore', 'resource:water-ice',
  ]) assert.ok(ids.has(id), `missing overlay ${id}`);

  assert.equal(MAP_OVERLAY_MAX_ZOOM, 2 ** 10);
  assert.match(overlayLegendFor('elevation')?.detail ?? '', /sea level/i);
  assert.match(overlayLegendFor('semantic-geography')?.detail ?? '', /Region classification/i);
});

test('continuous overlay colors preserve the physical distinctions they visualize', () => {
  const deepOcean = overlayColorForEnvironment('elevation', sample({ surfaceType: 'ocean', surfaceElevationMeters: -6000, meanElevationMeters: -6000 }));
  const mountain = overlayColorForEnvironment('elevation', sample({ surfaceElevationMeters: 4200, meanElevationMeters: 4200 }));
  assert.notDeepEqual(deepOcean.slice(0, 3), mountain.slice(0, 3));

  const interior = overlayColorForEnvironment('plate-boundaries', sample());
  const convergent = overlayColorForEnvironment('plate-boundaries', sample({ boundaryType: 'convergent', boundaryProximity: 0.9 }));
  assert.equal(interior[3], 0);
  assert.ok(convergent[3] > 200);

  const plateA = overlayColorForEnvironment('tectonic-plates', sample(), 0);
  const plateB = overlayColorForEnvironment('tectonic-plates', sample(), 1);
  assert.notDeepEqual(plateA.slice(0, 3), plateB.slice(0, 3));

  const continental = overlayColorForEnvironment('crust-type', sample(), 0, 'continental');
  const oceanic = overlayColorForEnvironment('crust-type', sample(), 0, 'oceanic');
  assert.notDeepEqual(continental.slice(0, 3), oceanic.slice(0, 3));
});
