import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { profileWorldGeneration } from '../dist/world/generateWorld.js';
import { polygonArea, polygonPerimeter, removeCollinearVertices } from '../dist/world/geometry.js';

const SEEDS = ['geo-v5-a', 'geo-v5-b', 'geo-v5-c'];
const PROFILES = SEEDS.map(seed => profileWorldGeneration(seed));
const WORLDS = PROFILES.map(profile => profile.world.planet);

function percentile(sorted: readonly number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * fraction)))]!;
}

function undirectedEdgeAngleDegrees(start: { x: number; y: number }, end: { x: number; y: number }): number {
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  return Math.atan2(dy, dx) * 180 / Math.PI;
}

function distanceFromTechnicalMeshAngle(angle: number): number {
  return Math.min(Math.abs(angle), Math.abs(angle - 45), Math.abs(angle - 90));
}

test('surface truth remains independent from continuous variable Region counts', () => {
  const counts = new Set<number>();
  for (const planet of WORLDS) {
    counts.add(planet.regions.length);
    assert.ok(planet.surfaceResolution.columns >= 176 && planet.surfaceResolution.rows >= 88);
    assert.notEqual(planet.surfaceResolution.columns * planet.surfaceResolution.rows, planet.regions.length);
    assert.ok(planet.regions.length >= 3_500 && planet.regions.length <= 10_000);
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

test('interior Region borders no longer reveal the horizontal/vertical/45-degree technical triangle mesh', () => {
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
    assert.ok(offTechnicalMesh / total > 0.3, `expected free-angle Region borders, got ${(offTechnicalMesh / total * 100).toFixed(1)}%`);
    assert.ok(angleBuckets.size >= 14, `expected broad edge-angle diversity, got ${angleBuckets.size} buckets`);

    const parentSegments = [...planet.continents, ...planet.oceans].flatMap(parent => parent.polygons.flatMap(polygon => polygon.map((point, index) => [point, polygon[(index + 1) % polygon.length]!] as const)));
    assert.ok(parentSegments.some(([start, end]) => distanceFromTechnicalMeshAngle(undirectedEdgeAngleDegrees(start, end)) > 2));
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

test('Region generation deforms only internal technical geometry while preserving canonical parent edges', () => {
  const regions = fs.readFileSync('src/world/generation/regions.ts', 'utf8');
  assert.match(regions, /assignPatchesToSeeds/);
  assert.match(regions, /frozenParentBoundaryVertices/);
  assert.match(regions, /smoothWarpUnit/);
  assert.match(regions, /warpRegionPatches/);
  assert.doesNotMatch(regions, /powerCellForSeed|clipPolygonToConvex|piecesForPowerCell/);

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
