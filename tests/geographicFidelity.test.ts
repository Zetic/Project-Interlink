import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { profileWorldGeneration } from '../dist/world/generateWorld.js';
import { polygonArea, polygonPerimeter, removeCollinearVertices } from '../dist/world/geometry.js';

const SEEDS = ['geo-v4-a', 'geo-v4-b', 'geo-v4-c'];
const PROFILES = SEEDS.map(seed => profileWorldGeneration(seed));
const WORLDS = PROFILES.map(profile => profile.world.planet);

function percentile(sorted: readonly number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * fraction)))]!;
}

test('surface truth is higher-resolution and independent from variable Region counts', () => {
  const counts = new Set<number>();
  for (const planet of WORLDS) {
    counts.add(planet.regions.length);
    assert.ok(planet.surfaceResolution.columns >= 176 && planet.surfaceResolution.rows >= 88);
    assert.notEqual(planet.surfaceResolution.columns * planet.surfaceResolution.rows, planet.regions.length);
    assert.ok(planet.regions.length >= 4_000 && planet.regions.length <= 10_000);
  }
  assert.ok(counts.size > 1);
});

test('Region area, aspect, compactness, and effective polygon complexity vary materially', () => {
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
    assert.ok(percentile(areas, 0.9) > percentile(areas, 0.1) * 4);
    assert.ok(percentile(aspects, 0.9) > percentile(aspects, 0.1) * 1.4);
    assert.ok(effectiveVertices.size >= 8);
    assert.ok(compactness.size >= 12);
  }
});

test('Region and canonical parent boundaries no longer expose an axis-aligned square grid', () => {
  for (const planet of WORLDS) {
    let diagonal = 0; let total = 0;
    for (const region of planet.regions) {
      const polygon = removeCollinearVertices(region.polygon);
      for (let index = 0; index < polygon.length; index += 1) {
        const start = polygon[index]!; const end = polygon[(index + 1) % polygon.length]!;
        total += 1;
        if (Math.abs(end.x - start.x) > 1e-6 && Math.abs(end.y - start.y) > 1e-6) diagonal += 1;
      }
    }
    assert.ok(diagonal / total > 0.25);
    const parentSegments = [...planet.continents, ...planet.oceans].flatMap(parent => parent.polygons.flatMap(polygon => polygon.map((point, index) => [point, polygon[(index + 1) % polygon.length]!] as const)));
    assert.ok(parentSegments.some(([start, end]) => Math.abs(end.x - start.x) > 1e-6 && Math.abs(end.y - start.y) > 1e-6));
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

test('hot generation paths reuse cached samples and avoid sorted plate-distance arrays', () => {
  const tectonics = fs.readFileSync('src/world/generation/tectonics.ts', 'utf8');
  const sampler = tectonics.slice(tectonics.indexOf('export function samplePlateModel'));
  assert.doesNotMatch(sampler, /\.map\(|\.sort\(/);
  const resources = fs.readFileSync('src/world/generation/resourceFeatures.ts', 'utf8');
  const weighted = resources.slice(resources.indexOf('function weightedResource'), resources.indexOf('function candidatePoint'));
  assert.doesNotMatch(weighted, /samplePlanetEnvironment|resourcePotentialAt/);
  const geography = fs.readFileSync('src/world/generation/geography.ts', 'utf8');
  assert.match(geography, /clippedTriangle/);
  assert.match(geography, /surfaceFieldRawAtVertex/);
  assert.match(geography, /tracePatchBoundaries/);
});
