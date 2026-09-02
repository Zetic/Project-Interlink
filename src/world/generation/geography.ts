import { pointInPolygon, polygonBounds } from '../geometry.js';
import { createRng } from '../random.js';
import { PLANET_MAP_HEIGHT, PLANET_MAP_WIDTH } from '../scale.js';
import type { Landmass, Point } from '../types.js';

const LANDMASS_ANCHORS = [
  { x: 0.17, y: 0.28 }, { x: 0.43, y: 0.31 }, { x: 0.72, y: 0.30 },
  { x: 0.25, y: 0.69 }, { x: 0.56, y: 0.70 }, { x: 0.83, y: 0.66 },
] as const;
const LANDMASS_NAMES = ['Avarin', 'Ceryth', 'Damar', 'Elyon', 'Kestrel', 'Orinth', 'Serevan', 'Taland'];

function round(value: number): number { return Number(value.toFixed(3)); }

function createLandmassPolygon(seed: string, index: number, center: Point, radiusX: number, radiusY: number): Point[] {
  const rng = createRng(seed, `geography:landmass:${index}:coastline`);
  const vertexCount = 36;
  const radialOffsets = Array.from({ length: vertexCount }, () => rng.range(0.72, 1.18));
  return radialOffsets.map((offset, vertexIndex) => {
    const previous = radialOffsets[(vertexIndex + vertexCount - 1) % vertexCount]!;
    const next = radialOffsets[(vertexIndex + 1) % vertexCount]!;
    const smoothed = (previous + offset * 2 + next) / 4;
    const angle = (vertexIndex / vertexCount) * Math.PI * 2;
    return {
      x: round(Math.max(24, Math.min(PLANET_MAP_WIDTH - 24, center.x + Math.cos(angle) * radiusX * smoothed))),
      y: round(Math.max(24, Math.min(PLANET_MAP_HEIGHT - 24, center.y + Math.sin(angle) * radiusY * smoothed))),
    };
  });
}

export function generateLandmasses(seed: string): Landmass[] {
  const count = createRng(seed, 'geography:landmass-count').int(5, LANDMASS_ANCHORS.length);
  const usedNames = new Set<string>();
  return LANDMASS_ANCHORS.slice(0, count).map((anchor, index) => {
    const rng = createRng(seed, `geography:landmass:${index}`);
    const center = {
      x: PLANET_MAP_WIDTH * (anchor.x + rng.range(-0.045, 0.045)),
      y: PLANET_MAP_HEIGHT * (anchor.y + rng.range(-0.045, 0.045)),
    };
    const polygon = createLandmassPolygon(seed, index, center, rng.range(330, 570), rng.range(205, 355));
    let name = rng.pick(LANDMASS_NAMES);
    while (usedNames.has(name)) name = rng.pick(LANDMASS_NAMES);
    usedNames.add(name);
    return { id: `landmass-${index}`, name, polygon, bounds: polygonBounds(polygon) };
  });
}

export function landmassContaining(landmasses: readonly Landmass[], point: Point): Landmass | null {
  for (const landmass of landmasses) {
    const bounds = landmass.bounds;
    if (point.x < bounds.x || point.x > bounds.x + bounds.width || point.y < bounds.y || point.y > bounds.y + bounds.height) continue;
    if (pointInPolygon(point, landmass.polygon)) return landmass;
  }
  return null;
}

function latticeValue(seed: string, namespace: string, x: number, y: number): number {
  return createRng(seed, `${namespace}:${x}:${y}`).next();
}

function smooth(value: number): number { return value * value * (3 - 2 * value); }

export function valueNoise(seed: string, namespace: string, point: Point, scale: number): number {
  const scaledX = point.x / scale;
  const scaledY = point.y / scale;
  const x0 = Math.floor(scaledX);
  const y0 = Math.floor(scaledY);
  const tx = smooth(scaledX - x0);
  const ty = smooth(scaledY - y0);
  const north = latticeValue(seed, namespace, x0, y0) * (1 - tx) + latticeValue(seed, namespace, x0 + 1, y0) * tx;
  const south = latticeValue(seed, namespace, x0, y0 + 1) * (1 - tx) + latticeValue(seed, namespace, x0 + 1, y0 + 1) * tx;
  return north * (1 - ty) + south * ty;
}
