import { polygonArea, polygonBounds, polygonCentroid, removeCollinearVertices } from '../geometry.js';
import { createRng } from '../random.js';
import { EARTH_SCALE_METERS_PER_WORLD_UNIT, PLANET_MAP_HEIGHT, PLANET_MAP_WIDTH } from '../scale.js';
import type { Bounds, Continent, GeographicParentKind, Ocean, Point, SurfaceType, TectonicPlate } from '../types.js';
import {
  sampleSurfaceFieldRaw,
  surfaceFieldRawAtVertex,
  type GenerationSurfaceField,
  type PlanetEnvironmentContext,
} from './surfaceField.js';
import { wrappedDistanceSquared } from './tectonics.js';

export interface GeographyPatch {
  id: string;
  polygon: Point[];
  center: Point;
  surfaceType: SurfaceType;
  parentKind: GeographicParentKind;
  parentId: string;
}

export interface GeographicAnchor {
  id: string;
  kind: GeographicParentKind;
  point: Point;
}

export interface GeneratedGeography {
  patches: GeographyPatch[];
  anchors: GeographicAnchor[];
  continents: Continent[];
  oceans: Ocean[];
  surfaceField: GenerationSurfaceField;
}

interface ScalarVertex { point: Point; signed: number }
interface BoundaryEdge { start: Point; end: Point; startKey: string; endKey: string }

const CONTINENT_NAMES = ['Avaria', 'Ceryth', 'Damaris', 'Elyon', 'Kestrel', 'Orinth', 'Sereva', 'Talora'];
const OCEAN_NAMES = ['Pelagic', 'Boreal', 'Sapphire', 'Vesper', 'Meridian', 'Abyssal', 'Austral', 'Thalassic'];

function roundPoint(point: Point): Point { return { x: Number(point.x.toFixed(6)), y: Number(point.y.toFixed(6)) }; }
function pointKey(point: Point): string { return `${point.x.toFixed(6)}:${point.y.toFixed(6)}`; }
function edgeKey(start: Point, end: Point): string { const a = pointKey(start); const b = pointKey(end); return a < b ? `${a}|${b}` : `${b}|${a}`; }
function boundsForPolygons(polygons: readonly Point[][]): Bounds { return polygonBounds(polygons.flat()); }

function wrappedFocusBounds(polygons: readonly Point[][], center: Point): Bounds {
  const flat = polygons.flat();
  const ordinary = polygonBounds(flat);
  const xs = [...new Set(flat.map(point => Number(point.x.toFixed(6))))].sort((left, right) => left - right);
  if (xs.length < 2) return ordinary;
  let largestGap = xs[0]! + PLANET_MAP_WIDTH - xs[xs.length - 1]!;
  for (let index = 1; index < xs.length; index += 1) largestGap = Math.max(largestGap, xs[index]! - xs[index - 1]!);
  const wrappedWidth = Math.min(ordinary.width, PLANET_MAP_WIDTH - largestGap);
  return { x: center.x - wrappedWidth / 2, y: ordinary.y, width: wrappedWidth, height: ordinary.height };
}

function clippedTriangle(vertices: readonly ScalarVertex[], keepLand: boolean): Point[] {
  const output: ScalarVertex[] = [];
  const inside = (value: number): boolean => keepLand ? value >= 0 : value <= 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index]!;
    const next = vertices[(index + 1) % vertices.length]!;
    const currentInside = inside(current.signed);
    const nextInside = inside(next.signed);
    if (currentInside) output.push(current);
    if (currentInside !== nextInside) {
      const denominator = current.signed - next.signed;
      const t = Math.abs(denominator) < 1e-12 ? 0.5 : current.signed / denominator;
      output.push({
        point: roundPoint({ x: current.point.x + (next.point.x - current.point.x) * t, y: current.point.y + (next.point.y - current.point.y) * t }),
        signed: 0,
      });
    }
  }
  return removeCollinearVertices(output.map(vertex => roundPoint(vertex.point)));
}

function createSurfacePatches(field: GenerationSurfaceField): GeographyPatch[] {
  const patches: GeographyPatch[] = [];
  for (let row = 0; row < field.rows; row += 1) {
    for (let column = 0; column < field.columns; column += 1) {
      const x0 = column * field.cellWidth; const x1 = x0 + field.cellWidth;
      const y0 = row * field.cellHeight; const y1 = y0 + field.cellHeight;
      const corners: ScalarVertex[] = [
        { point: { x: x0, y: y0 }, signed: surfaceFieldRawAtVertex(field, column, row) - field.seaLevelRaw },
        { point: { x: x1, y: y0 }, signed: surfaceFieldRawAtVertex(field, column + 1, row) - field.seaLevelRaw },
        { point: { x: x1, y: y1 }, signed: surfaceFieldRawAtVertex(field, column + 1, row + 1) - field.seaLevelRaw },
        { point: { x: x0, y: y1 }, signed: surfaceFieldRawAtVertex(field, column, row + 1) - field.seaLevelRaw },
      ];
      const triangles = (row + column) % 2 === 0
        ? [[corners[0]!, corners[1]!, corners[2]!], [corners[0]!, corners[2]!, corners[3]!]]
        : [[corners[0]!, corners[1]!, corners[3]!], [corners[1]!, corners[2]!, corners[3]!]];
      for (let triangleIndex = 0; triangleIndex < triangles.length; triangleIndex += 1) {
        for (const surfaceType of ['land', 'ocean'] as const) {
          const polygon = clippedTriangle(triangles[triangleIndex]!, surfaceType === 'land');
          if (polygon.length < 3 || polygonArea(polygon) < 1e-7) continue;
          patches.push({
            id: `patch-${row}-${column}-${triangleIndex}-${surfaceType}`,
            polygon,
            center: roundPoint(polygonCentroid(polygon)),
            surfaceType,
            parentKind: surfaceType === 'land' ? 'continent' : 'ocean',
            parentId: '',
          });
        }
      }
    }
  }
  return patches;
}

function cellSurface(field: GenerationSurfaceField, column: number, row: number): SurfaceType {
  const raw = sampleSurfaceFieldRaw(field, { x: (column + 0.5) * field.cellWidth, y: (row + 0.5) * field.cellHeight });
  return raw >= field.seaLevelRaw ? 'land' : 'ocean';
}

function surfaceComponents(field: GenerationSurfaceField, surfaceType: SurfaceType): number[][] {
  const visited = new Uint8Array(field.columns * field.rows);
  const components: number[][] = [];
  const indexOf = (column: number, row: number): number => row * field.columns + column;
  for (let row = 0; row < field.rows; row += 1) {
    for (let column = 0; column < field.columns; column += 1) {
      const start = indexOf(column, row);
      if (visited[start] || cellSurface(field, column, row) !== surfaceType) continue;
      const component: number[] = [];
      const queue = [start]; visited[start] = 1;
      while (queue.length) {
        const current = queue.pop()!;
        component.push(current);
        const currentColumn = current % field.columns;
        const currentRow = Math.floor(current / field.columns);
        const neighbors = [
          [((currentColumn - 1) + field.columns) % field.columns, currentRow],
          [(currentColumn + 1) % field.columns, currentRow],
          [currentColumn, currentRow - 1],
          [currentColumn, currentRow + 1],
        ] as const;
        for (const [nextColumn, nextRow] of neighbors) {
          if (nextRow < 0 || nextRow >= field.rows) continue;
          const next = indexOf(nextColumn, nextRow);
          if (!visited[next] && cellSurface(field, nextColumn, nextRow) === surfaceType) { visited[next] = 1; queue.push(next); }
        }
      }
      components.push(component);
    }
  }
  return components.sort((left, right) => right.length - left.length || left[0]! - right[0]!);
}

function componentCenter(field: GenerationSurfaceField, indexes: readonly number[]): Point {
  let sinX = 0; let cosX = 0; let y = 0;
  for (const index of indexes) {
    const column = index % field.columns;
    const angle = ((column + 0.5) / field.columns) * Math.PI * 2;
    sinX += Math.sin(angle); cosX += Math.cos(angle);
    y += (Math.floor(index / field.columns) + 0.5) * field.cellHeight;
  }
  const angle = (Math.atan2(sinX, cosX) + Math.PI * 2) % (Math.PI * 2);
  return { x: angle / (Math.PI * 2) * PLANET_MAP_WIDTH, y: y / Math.max(1, indexes.length) };
}

function farthestAnchors(field: GenerationSurfaceField, surfaceType: SurfaceType, target: number, initial?: Point): Point[] {
  const available: Point[] = [];
  for (let row = 0; row < field.rows; row += 2) for (let column = 0; column < field.columns; column += 2) {
    if (cellSurface(field, column, row) === surfaceType) available.push({ x: (column + 0.5) * field.cellWidth, y: (row + 0.5) * field.cellHeight });
  }
  if (!available.length) return [];
  const first = initial ? available.reduce((best, point) => wrappedDistanceSquared(point, initial) < wrappedDistanceSquared(best, initial) ? point : best) : available[0]!;
  const anchors = [first];
  while (anchors.length < Math.min(target, available.length)) {
    let next = available[0]!; let nextDistance = -1;
    for (const point of available) {
      let nearest = Infinity;
      for (const anchor of anchors) nearest = Math.min(nearest, wrappedDistanceSquared(point, anchor));
      if (nearest > nextDistance) { next = point; nextDistance = nearest; }
    }
    anchors.push(next);
  }
  return anchors;
}

function createAnchors(field: GenerationSurfaceField, plates: readonly TectonicPlate[]): GeographicAnchor[] {
  const landComponents = surfaceComponents(field, 'land');
  const substantial = landComponents.filter(component => component.length >= 48).slice(0, 7);
  const continentalPlates = plates.filter(plate => plate.crustType === 'continental');
  const land = substantial.length >= 3
    ? substantial.map(component => componentCenter(field, component))
    : farthestAnchors(field, 'land', Math.max(3, Math.min(7, Math.round(continentalPlates.length / 2))), continentalPlates[0]?.seedPoint);
  const oceanicPlates = plates.filter(plate => plate.crustType === 'oceanic');
  const ocean = farthestAnchors(field, 'ocean', Math.max(3, Math.min(8, Math.round(oceanicPlates.length / 2))), (oceanicPlates[0] ?? plates[0])?.seedPoint);
  if (!land.length || !ocean.length) throw new Error('Generator v4 requires both land and ocean parent anchors.');
  return [
    ...land.map((point, index) => ({ id: `continent-${index}`, kind: 'continent' as const, point: roundPoint(point) })),
    ...ocean.map((point, index) => ({ id: `ocean-${index}`, kind: 'ocean' as const, point: roundPoint(point) })),
  ];
}

export function parentIdAtPoint(anchors: readonly GeographicAnchor[], surfaceType: SurfaceType, point: Point): string {
  const kind: GeographicParentKind = surfaceType === 'land' ? 'continent' : 'ocean';
  const available = anchors.filter(anchor => anchor.kind === kind);
  if (!available.length) throw new Error(`No ${kind} anchor exists.`);
  let best = available[0]!; let distance = wrappedDistanceSquared(point, best.point);
  for (let index = 1; index < available.length; index += 1) {
    const candidateDistance = wrappedDistanceSquared(point, available[index]!.point);
    if (candidateDistance < distance) { best = available[index]!; distance = candidateDistance; }
  }
  return best.id;
}

export function tracePatchBoundaries(patches: readonly { polygon: readonly Point[] }[]): Point[][] {
  const boundary = new Map<string, BoundaryEdge>();
  for (const patch of patches) {
    for (let index = 0; index < patch.polygon.length; index += 1) {
      const start = roundPoint(patch.polygon[index]!);
      const end = roundPoint(patch.polygon[(index + 1) % patch.polygon.length]!);
      const key = edgeKey(start, end);
      if (boundary.has(key)) boundary.delete(key);
      else boundary.set(key, { start, end, startKey: pointKey(start), endKey: pointKey(end) });
    }
  }
  const edges = [...boundary.values()].sort((left, right) => left.startKey.localeCompare(right.startKey) || left.endKey.localeCompare(right.endKey));
  const outgoing = new Map<string, number[]>();
  edges.forEach((edge, index) => { const values = outgoing.get(edge.startKey) ?? []; values.push(index); outgoing.set(edge.startKey, values); });
  const used = new Uint8Array(edges.length);
  const loops: Point[][] = [];
  for (let startIndex = 0; startIndex < edges.length; startIndex += 1) {
    if (used[startIndex]) continue;
    const first = edges[startIndex]!;
    const loop: Point[] = [first.start];
    let currentIndex = startIndex;
    while (!used[currentIndex]) {
      used[currentIndex] = 1;
      const current = edges[currentIndex]!;
      if (current.endKey === first.startKey) break;
      loop.push(current.end);
      const candidates = (outgoing.get(current.endKey) ?? []).filter(index => !used[index]);
      if (!candidates.length) break;
      if (candidates.length === 1) currentIndex = candidates[0]!;
      else {
        const incomingAngle = Math.atan2(current.end.y - current.start.y, current.end.x - current.start.x);
        currentIndex = candidates.reduce((best, candidate) => {
          const edge = edges[candidate]!; const bestEdge = edges[best]!;
          const turn = (Math.atan2(edge.end.y - edge.start.y, edge.end.x - edge.start.x) - incomingAngle + Math.PI * 2) % (Math.PI * 2);
          const bestTurn = (Math.atan2(bestEdge.end.y - bestEdge.start.y, bestEdge.end.x - bestEdge.start.x) - incomingAngle + Math.PI * 2) % (Math.PI * 2);
          return turn < bestTurn ? candidate : best;
        });
      }
    }
    const clean = removeCollinearVertices(loop);
    if (clean.length >= 3 && polygonArea(clean) > 1e-6) loops.push(clean);
  }
  return loops.sort((left, right) => polygonArea(right) - polygonArea(left) || pointKey(left[0]!).localeCompare(pointKey(right[0]!)));
}

function approximateAreaSquareKm(polygons: readonly Point[][]): number {
  let squareMeters = 0;
  for (const polygon of polygons) {
    const center = polygonCentroid(polygon);
    const latitude = 90 - center.y / PLANET_MAP_HEIGHT * 180;
    squareMeters += polygonArea(polygon) * EARTH_SCALE_METERS_PER_WORLD_UNIT ** 2 * Math.max(0.12, Math.cos(latitude * Math.PI / 180));
  }
  return Number((squareMeters / 1_000_000).toFixed(1));
}

function createParents<K extends GeographicParentKind>(
  context: PlanetEnvironmentContext,
  patches: readonly GeographyPatch[],
  anchors: readonly GeographicAnchor[],
  kind: K,
  names: readonly string[],
): Array<K extends 'continent' ? Continent : Ocean> {
  const availableNames = names.map((name, index) => ({ name, order: createRng(context.seed, `geography:${kind}:name:${index}`).next() }))
    .sort((left, right) => left.order - right.order).map(entry => entry.name);
  return anchors.filter(anchor => anchor.kind === kind).map((anchor, index) => {
    const owned = patches.filter(patch => patch.parentId === anchor.id);
    const polygons = tracePatchBoundaries(owned);
    const meanElevation = owned.reduce((sum, patch) => sum + (sampleSurfaceFieldRaw(context.surfaceField!, patch.center) - context.seaLevelRaw) * 7_200, 0) / Math.max(1, owned.length);
    const bounds = boundsForPolygons(polygons);
    return {
      id: anchor.id,
      name: `${availableNames[index % availableNames.length] ?? `${kind}-${index + 1}`}${kind === 'ocean' ? ' Ocean' : ''}`,
      kind,
      polygons,
      bounds,
      focusBounds: wrappedFocusBounds(polygons, anchor.point),
      center: anchor.point,
      approximateAreaSquareKm: approximateAreaSquareKm(polygons),
      regionIds: [],
      meanSurfaceElevationMeters: Math.round(meanElevation),
    } as unknown as K extends 'continent' ? Continent : Ocean;
  });
}

export function generateGeography(context: PlanetEnvironmentContext): GeneratedGeography {
  if (!context.surfaceField) throw new Error('Generator v4 geography requires a cached surface field.');
  const patches = createSurfacePatches(context.surfaceField);
  const anchors = createAnchors(context.surfaceField, context.plates);
  for (const patch of patches) patch.parentId = parentIdAtPoint(anchors, patch.surfaceType, patch.center);
  return {
    patches,
    anchors,
    continents: createParents(context, patches, anchors, 'continent', CONTINENT_NAMES),
    oceans: createParents(context, patches, anchors, 'ocean', OCEAN_NAMES),
    surfaceField: context.surfaceField,
  };
}
