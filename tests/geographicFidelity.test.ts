import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { profileWorldGeneration } from '../dist/world/generateWorld.js';
import { polygonArea, polygonPerimeter, removeCollinearVertices } from '../dist/world/geometry.js';

const SEEDS = ['geo-v6-a', 'geo-v6-b', 'geo-v6-c'];
const PROFILES = SEEDS.map(seed => profileWorldGeneration(seed));
const WORLDS = PROFILES.map(profile => profile.world.planet);

function percentile(sorted: readonly number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * fraction)))]!;
}

function average(values: readonly number[]): number { return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length); }

function undirectedEdgeAngleDegrees(start: { x: number; y: number }, end: { x: number; y: number }): number {
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  return Math.atan2(dy, dx) * 180 / Math.PI;
}

function distanceFromTechnicalMeshAngle(angle: number): number {
  return Math.min(Math.abs(angle), Math.abs(angle - 45), Math.abs(angle - 90));
}

test('surface truth remains independent from emergent semantic Region counts', () => {
  const counts = new Set<number>();
  for (const planet of WORLDS) {
    counts.add(planet.regions.length);
    assert.ok(planet.surfaceResolution.columns >= 176 && planet.surfaceResolution.rows >= 88);
    assert.notEqual(planet.surfaceResolution.columns * planet.surfaceResolution.rows, planet.regions.length);
    assert.ok(planet.regions.length >= 30 && planet.regions.length <= 2_500);
    assert.ok(new Set(planet.regions.map(region => region.geographicType)).size >= 6);
  }
  assert.ok(counts.size > 1);
});

test('semantic Region classes are caused by the world fields they describe', () => {
  const allRegions = WORLDS.flatMap(planet => planet.regions);
  const land = allRegions.filter(region => region.surfaceType === 'land');
  const ocean = allRegions.filter(region => region.surfaceType === 'ocean');
  const mountain = land.filter(region => region.geographicType === 'mountain-range');
  const volcanic = land.filter(region => region.geographicType === 'volcanic-arc');
  const rifts = land.filter(region => region.geographicType === 'rift-zone');
  const coasts = land.filter(region => region.geographicType === 'coastal-plain' || region.geographicType === 'coastal-highlands');
  const ridges = ocean.filter(region => region.geographicType === 'mid-ocean-ridge');
  const trenches = ocean.filter(region => region.geographicType === 'oceanic-trench');
  const shelves = ocean.filter(region => region.geographicType === 'continental-shelf');

  assert.ok(mountain.length > 0);
  assert.ok(coasts.length > 0);
  assert.ok(ridges.length > 0);
  assert.ok(shelves.length > 0);
  assert.ok(average(mountain.map(region => region.environment.reliefMeters)) > average(land.map(region => region.environment.reliefMeters)));
  if (volcanic.length) assert.ok(average(volcanic.map(region => region.environment.volcanicActivity)) > average(land.map(region => region.environment.volcanicActivity)));
  if (rifts.length) assert.ok(rifts.filter(region => region.environment.boundaryType === 'divergent').length / rifts.length > 0.6);
  assert.ok(ridges.filter(region => region.environment.boundaryType === 'divergent').length / ridges.length > 0.6);
  if (trenches.length) assert.ok(trenches.filter(region => region.environment.boundaryType === 'convergent').length / trenches.length > 0.6);
  assert.ok(average(shelves.map(region => Math.abs(region.environment.meanElevationMeters))) < average(ocean.map(region => Math.abs(region.environment.meanElevationMeters))));
  assert.ok(coasts.every(region => region.geographicTraits.includes('coastal')));
});

test('Region area, aspect, compactness, and effective polygon complexity remain varied', () => {
  for (const planet of WORLDS) {
    const areas = planet.regions.map(region => polygonArea(region.polygon)).sort((left, right) => left - right);
    const aspects = planet.regions.map(region => Math.max(region.bounds.width, region.bounds.height) / Math.max(1e-9, Math.min(region.bounds.width, region.bounds.height))).sort((left, right) => left - right);
    const effectiveVertices = new Set<number>();
    const compactness = new Set<number>();
    for (const region of planet.regions) {
      const polygon = removeCollinearVertices(region.polygon);
      effectiveVertices.add(polygon.length);
      const perimeter = polygonPerimeter(polygon);
      compactness.add(Number((4 * Math.PI * polygonArea(polygon) / (perimeter * perimeter)).toFixed(2)));
    }
    assert.ok(percentile(areas, 0.9) > percentile(areas, 0.1) * 3);
    assert.ok(percentile(aspects, 0.9) > percentile(aspects, 0.1) * 1.3);
    assert.ok(effectiveVertices.size >= 6);
    assert.ok(compactness.size >= 8);
  }
});

test('semantic Region borders retain broad angle diversity without moving canonical parent edges', () => {
  for (const planet of WORLDS) {
    let offTechnicalMesh = 0;
    let total = 0;
    const angleBuckets = new Set<number>();
    for (const region of planet.regions) {
      const polygon = removeCollinearVertices(region.polygon);
      for (let index = 0; index < polygon.length; index += 1) {
        const start = polygon[index]!;
        const end = polygon[(index + 1) % polygon.length]!;
        const angle = undirectedEdgeAngleDegrees(start, end);
        total += 1;
        angleBuckets.add(Math.round(angle / 5) * 5);
        if (distanceFromTechnicalMeshAngle(angle) > 2) offTechnicalMesh += 1;
      }
    }
    assert.ok(offTechnicalMesh / Math.max(1, total) > 0.2, `expected free-angle Region borders, got ${(offTechnicalMesh / Math.max(1, total) * 100).toFixed(1)}%`);
    assert.ok(angleBuckets.size >= 12, `expected broad edge-angle diversity, got ${angleBuckets.size} buckets`);

    const regionVertices = new Set(planet.regions.flatMap(region => region.polygon.map(point => `${point.x.toFixed(6)}:${point.y.toFixed(6)}`)));
    for (const parent of [...planet.continents, ...planet.oceans]) {
      assert.ok(parent.focusBounds.width <= parent.bounds.width + 1e-6);
      for (const point of parent.polygons.flat()) assert.ok(regionVertices.has(`${point.x.toFixed(6)}:${point.y.toFixed(6)}`), 'parent coastline vertex is reused by a child Region');
    }
  }
});

test('Region neighbor relationships are symmetric, resolved, and exclude self-links', () => {
  for (const planet of WORLDS) {
    const regions = new Map(planet.regions.map(region => [region.id, region]));
    for (const region of planet.regions) for (const neighborId of region.neighborRegionIds) {
      assert.notEqual(neighborId, region.id);
      const neighbor = regions.get(neighborId);
      assert.ok(neighbor);
      assert.ok(neighbor.neighborRegionIds.includes(region.id));
    }
  }
});

test('generation profiling exposes stage costs without contaminating deterministic world truth', () => {
  for (const profile of PROFILES) {
    for (const value of Object.values(profile.timings)) assert.ok(Number.isFinite(value) && value >= 0);
    assert.equal('timings' in profile.world.planet, false);
  }
});

test('Region generation is seeded by geographic provinces rather than a Region lattice', () => {
  const regions = fs.readFileSync('src/world/generation/regions.ts', 'utf8');
  assert.match(regions, /generateGeographicProvinceAssignments/);
  assert.doesNotMatch(regions, /REGION_SEED_COLUMNS|REGION_SEED_ROWS|assignPatchesToSeeds/);

  const provinces = fs.readFileSync('src/world/generation/geographicProvinces.ts', 'utf8');
  assert.match(provinces, /classifyLand/);
  assert.match(provinces, /classifyOcean/);
  assert.match(provinces, /coastDistance/);
  assert.match(provinces, /SIGNIFICANT_TYPES/);
  assert.match(provinces, /semanticTransitionMultiplier/);
  assert.match(provinces, /multi-source geographic-affinity flood|multi-source/i);

  const tectonics = fs.readFileSync('src/world/generation/tectonics.ts', 'utf8');
  const sampler = tectonics.slice(tectonics.indexOf('export function samplePlateModel'));
  assert.doesNotMatch(sampler, /\.map\(|\.sort\(/);
  const resources = fs.readFileSync('src/world/generation/resourceFeatures.ts', 'utf8');
  const weighted = resources.slice(resources.indexOf('function weightedResource'), resources.indexOf('function candidatePoint'));
  assert.doesNotMatch(weighted, /samplePlanetEnvironment|resourcePotentialAt/);
});
