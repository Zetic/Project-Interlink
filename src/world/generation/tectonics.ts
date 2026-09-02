import { createRng } from '../random.js';
import { PLANET_MAP_HEIGHT, PLANET_MAP_WIDTH } from '../scale.js';
import type { PlateBoundaryType, Point, TectonicPlate } from '../types.js';

export interface PlateSample {
  plate: TectonicPlate;
  neighbor: TectonicPlate;
  boundaryType: PlateBoundaryType;
  boundaryProximity: number;
}

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }

export function wrappedDeltaX(leftX: number, rightX: number, width = PLANET_MAP_WIDTH): number {
  const direct = rightX - leftX;
  if (direct > width / 2) return direct - width;
  if (direct < -width / 2) return direct + width;
  return direct;
}

export function wrappedDistanceSquared(left: Point, right: Point): number {
  const dx = wrappedDeltaX(left.x, right.x);
  const dy = right.y - left.y;
  return dx * dx + dy * dy;
}

export function generateTectonicPlates(seed: string): TectonicPlate[] {
  const rng = createRng(seed, 'tectonics:plates:v3');
  const count = rng.int(12, 24);
  const points: Point[] = [];
  const minimumSeparation = Math.sqrt((PLANET_MAP_WIDTH * PLANET_MAP_HEIGHT) / count) * 0.34;
  for (let index = 0; index < count; index += 1) {
    let best = { x: rng.range(0, PLANET_MAP_WIDTH), y: rng.range(0, PLANET_MAP_HEIGHT) };
    let bestDistance = -1;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const candidate = { x: rng.range(0, PLANET_MAP_WIDTH), y: rng.range(0, PLANET_MAP_HEIGHT) };
      const distance = points.length === 0 ? Infinity : Math.min(...points.map(point => wrappedDistanceSquared(point, candidate)));
      if (distance > bestDistance) { best = candidate; bestDistance = distance; }
      if (distance >= minimumSeparation ** 2) break;
    }
    points.push({ x: Number(best.x.toFixed(4)), y: Number(best.y.toFixed(4)) });
  }

  const continentalTarget = Math.max(4, Math.min(count - 4, Math.round(count * rng.range(0.38, 0.58))));
  const crustOrder = points.map((_, index) => index).sort((left, right) => {
    const leftValue = createRng(seed, `tectonics:crust-order:${left}`).next();
    const rightValue = createRng(seed, `tectonics:crust-order:${right}`).next();
    return leftValue - rightValue || left - right;
  });
  const continental = new Set(crustOrder.slice(0, continentalTarget));
  return points.map((seedPoint, index) => {
    const plateRng = createRng(seed, `tectonics:plate:${index}`);
    const direction = plateRng.range(0, Math.PI * 2);
    const speed = plateRng.range(0.35, 1);
    const crustType = continental.has(index) ? 'continental' as const : 'oceanic' as const;
    return {
      id: `plate-${index}`,
      seedPoint,
      motion: { x: Number((Math.cos(direction) * speed).toFixed(6)), y: Number((Math.sin(direction) * speed).toFixed(6)) },
      crustType,
      crustBias: Number((crustType === 'continental' ? plateRng.range(0.28, 0.48) : plateRng.range(-0.48, -0.2)).toFixed(6)),
    };
  });
}

export function samplePlateModel(plates: readonly TectonicPlate[], point: Point): PlateSample {
  if (plates.length < 2) throw new Error('A tectonic model requires at least two plates.');
  const ranked = plates
    .map(plate => ({ plate, distanceSquared: wrappedDistanceSquared(point, plate.seedPoint) }))
    .sort((left, right) => left.distanceSquared - right.distanceSquared || left.plate.id.localeCompare(right.plate.id));
  const nearest = ranked[0]!;
  const second = ranked[1]!;
  const nearestDistance = Math.sqrt(nearest.distanceSquared);
  const secondDistance = Math.sqrt(second.distanceSquared);
  const boundaryProximity = clamp01(1 - (secondDistance - nearestDistance) / 300);
  const dx = wrappedDeltaX(nearest.plate.seedPoint.x, second.plate.seedPoint.x);
  const dy = second.plate.seedPoint.y - nearest.plate.seedPoint.y;
  const length = Math.max(1e-9, Math.hypot(dx, dy));
  const relativeX = second.plate.motion.x - nearest.plate.motion.x;
  const relativeY = second.plate.motion.y - nearest.plate.motion.y;
  const normalVelocity = (relativeX * dx + relativeY * dy) / length;
  const boundaryType: PlateBoundaryType = boundaryProximity < 0.05
    ? 'interior'
    : normalVelocity < -0.12 ? 'convergent' : normalVelocity > 0.12 ? 'divergent' : 'transform';
  return { plate: nearest.plate, neighbor: second.plate, boundaryType, boundaryProximity: Number(boundaryProximity.toFixed(6)) };
}
