import type { Bounds, Point } from './types.js';

export function polygonBounds(points: readonly Point[]): Bounds {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

  let minX = points[0]!.x;
  let minY = points[0]!.y;
  let maxX = minX;
  let maxY = minY;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function polygonCentroid(points: readonly Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };

  let signedArea = 0;
  let centroidX = 0;
  let centroidY = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    const cross = current.x * next.y - next.x * current.y;
    signedArea += cross;
    centroidX += (current.x + next.x) * cross;
    centroidY += (current.y + next.y) * cross;
  }

  signedArea *= 0.5;
  if (Math.abs(signedArea) < 1e-6) {
    const total = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
    return { x: total.x / points.length, y: total.y / points.length };
  }

  const scale = 1 / (6 * signedArea);
  return { x: centroidX * scale, y: centroidY * scale };
}

export function polygonSignedArea(points: readonly Point[]): number {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return twiceArea / 2;
}

export function polygonArea(points: readonly Point[]): number {
  return Math.abs(polygonSignedArea(points));
}

export function polygonPerimeter(points: readonly Point[]): number {
  let perimeter = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    perimeter += Math.hypot(next.x - current.x, next.y - current.y);
  }
  return perimeter;
}

function pointLineDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-12) return Math.hypot(point.x - start.x, point.y - start.y);
  const projection = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + dx * projection), point.y - (start.y + dy * projection));
}

export function removeCollinearVertices(points: readonly Point[], tolerance = 1e-7): Point[] {
  if (points.length <= 3) return points.map(point => ({ ...point }));
  const retained: Point[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length]!;
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    if (pointLineDistance(current, previous, next) > tolerance) retained.push({ ...current });
  }
  return retained.length >= 3 ? retained : points.slice(0, 3).map(point => ({ ...point }));
}

function simplifyOpenPolyline(points: readonly Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points.map(point => ({ ...point }));
  let farthestIndex = 0;
  let farthestDistance = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = pointLineDistance(points[index]!, points[0]!, points[points.length - 1]!);
    if (distance > farthestDistance) { farthestDistance = distance; farthestIndex = index; }
  }
  if (farthestDistance <= tolerance) return [{ ...points[0]! }, { ...points[points.length - 1]! }];
  const left = simplifyOpenPolyline(points.slice(0, farthestIndex + 1), tolerance);
  const right = simplifyOpenPolyline(points.slice(farthestIndex), tolerance);
  return [...left.slice(0, -1), ...right];
}

/** Deterministic Ramer-Douglas-Peucker simplification for a closed polygon. */
export function simplifyPolygon(points: readonly Point[], tolerance: number): Point[] {
  const clean = removeCollinearVertices(points);
  if (clean.length <= 4 || tolerance <= 0) return clean;
  let split = 1;
  for (let index = 2; index < clean.length; index += 1) {
    if (Math.hypot(clean[index]!.x - clean[0]!.x, clean[index]!.y - clean[0]!.y)
      > Math.hypot(clean[split]!.x - clean[0]!.x, clean[split]!.y - clean[0]!.y)) split = index;
  }
  const first = simplifyOpenPolyline(clean.slice(0, split + 1), tolerance);
  const second = simplifyOpenPolyline([...clean.slice(split), clean[0]!], tolerance);
  return removeCollinearVertices([...first.slice(0, -1), ...second.slice(0, -1)]);
}

export function boundsIntersect(left: Bounds, right: Bounds): boolean {
  return left.x <= right.x + right.width && left.x + left.width >= right.x
    && left.y <= right.y + right.height && left.y + left.height >= right.y;
}

export function pointInBounds(point: Point, bounds: Bounds): boolean {
  return point.x >= bounds.x && point.x <= bounds.x + bounds.width
    && point.y >= bounds.y && point.y <= bounds.y + bounds.height;
}

export function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  for (let index = 0; index < polygon.length; index += 1) {
    if (pointLineDistance(point, polygon[index]!, polygon[(index + 1) % polygon.length]!) <= 1e-7) return true;
  }
  let inside = false;

  for (let currentIndex = 0, previousIndex = polygon.length - 1; currentIndex < polygon.length; previousIndex = currentIndex, currentIndex += 1) {
    const current = polygon[currentIndex]!;
    const previous = polygon[previousIndex]!;
    const intersects = ((current.y > point.y) !== (previous.y > point.y))
      && (point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x);
    if (intersects) inside = !inside;
  }

  return inside;
}
