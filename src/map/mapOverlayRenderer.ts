import type { AppStore } from '../state/appState.js';
import { resourcePotentialAt } from '../world/generation/resourceFeatures.js';
import { environmentContextForPlanet, samplePlanetEnvironment, type PlanetEnvironmentSample } from '../world/generation/surfaceField.js';
import { RESOURCE_DEFINITIONS } from '../world/resources.js';
import type { GeographicRegionType, MapCameraState, Planet } from '../world/types.js';
import { visibleWorldSize } from './camera/mapCamera.js';

export const MAP_OVERLAY_MAX_ZOOM = 2 ** 10;

type BaseOverlayId =
  | 'none'
  | 'elevation'
  | 'relief'
  | 'thermal'
  | 'moisture'
  | 'tectonic-plates'
  | 'crust-type'
  | 'crust-age'
  | 'crust-thickness'
  | 'plate-boundaries'
  | 'tectonic-activity'
  | 'uplift-subsidence'
  | 'orogeny'
  | 'rifting'
  | 'volcanic-activity'
  | 'sedimentary-tendency'
  | 'semantic-geography';
export type MapOverlayId = BaseOverlayId | `resource:${string}`;

export interface MapOverlayOption {
  id: MapOverlayId;
  label: string;
  group: 'Surface' | 'Geology' | 'Geography' | 'Resources' | 'None';
}

export interface MapOverlayLegend {
  title: string;
  detail: string;
  gradient?: string;
}

interface EnvironmentGrid {
  width: number;
  height: number;
  samples: PlanetEnvironmentSample[];
  plateIndexes: Uint16Array;
  crustTypes: Uint8Array;
}

interface PlanetOverlayCache {
  environmentGrid?: EnvironmentGrid;
  rasters: Map<MapOverlayId, HTMLCanvasElement>;
}

type Rgba = readonly [number, number, number, number];
type ColorStop = readonly [number, readonly [number, number, number]];

const PLANET_OVERLAY_CACHE = new WeakMap<Planet, PlanetOverlayCache>();

const BASE_OPTIONS: readonly MapOverlayOption[] = [
  { id: 'none', label: 'None', group: 'None' },
  { id: 'elevation', label: 'Elevation / Bathymetry', group: 'Surface' },
  { id: 'relief', label: 'Relief', group: 'Surface' },
  { id: 'thermal', label: 'Thermal Index', group: 'Surface' },
  { id: 'moisture', label: 'Moisture', group: 'Surface' },
  { id: 'tectonic-plates', label: 'Tectonic Plates', group: 'Geology' },
  { id: 'crust-type', label: 'Crust Type', group: 'Geology' },
  { id: 'crust-age', label: 'Crust Age', group: 'Geology' },
  { id: 'crust-thickness', label: 'Crust Thickness', group: 'Geology' },
  { id: 'plate-boundaries', label: 'Plate Boundaries', group: 'Geology' },
  { id: 'tectonic-activity', label: 'Tectonic Activity', group: 'Geology' },
  { id: 'uplift-subsidence', label: 'Uplift / Subsidence', group: 'Geology' },
  { id: 'orogeny', label: 'Orogenic Influence', group: 'Geology' },
  { id: 'rifting', label: 'Rift Influence', group: 'Geology' },
  { id: 'volcanic-activity', label: 'Volcanic Activity', group: 'Geology' },
  { id: 'sedimentary-tendency', label: 'Sedimentary Tendency', group: 'Geology' },
  { id: 'semantic-geography', label: 'Semantic Geography', group: 'Geography' },
];

export const MAP_OVERLAY_OPTIONS: readonly MapOverlayOption[] = [
  ...BASE_OPTIONS,
  ...RESOURCE_DEFINITIONS.map(definition => ({
    id: `resource:${definition.id}` as MapOverlayId,
    label: `${definition.name} Potential`,
    group: 'Resources' as const,
  })),
];

const SEMANTIC_COLORS: Record<GeographicRegionType, string> = {
  'mountain-range': '#c8c0b0',
  'volcanic-arc': '#d86b3f',
  'rift-zone': '#c25473',
  plateau: '#ad9862',
  highlands: '#8d8f66',
  'sedimentary-basin': '#b69462',
  'coastal-plain': '#6f9b72',
  'coastal-highlands': '#77916a',
  lowlands: '#5f8a72',
  'interior-plain': '#75866a',
  'oceanic-trench': '#241b4f',
  'mid-ocean-ridge': '#4b8f9f',
  'continental-shelf': '#4a8fb8',
  'continental-slope': '#356c99',
  'ocean-plateau': '#3f7395',
  'abyssal-plain': '#152e59',
  'ocean-basin': '#1d416d',
};

const RESOURCE_COLORS: Record<string, readonly [number, number, number]> = {
  'iron-ore': [224, 120, 82],
  'copper-ore': [91, 201, 175],
  'aluminum-ore': [196, 209, 222],
  limestone: [222, 211, 176],
  'silica-sand': [234, 213, 145],
  coal: [166, 151, 181],
  'water-ice': [157, 220, 255],
};

const ELEVATION_STOPS: readonly ColorStop[] = [
  [-7500, [8, 19, 55]],
  [-4000, [16, 54, 96]],
  [-500, [45, 104, 151]],
  [0, [218, 206, 145]],
  [400, [88, 128, 75]],
  [1600, [137, 119, 79]],
  [3200, [174, 159, 139]],
  [5800, [244, 244, 239]],
];

const CRUST_AGE_STOPS: readonly ColorStop[] = [
  [0, [63, 211, 219]],
  [100, [65, 142, 198]],
  [500, [83, 92, 164]],
  [1500, [121, 85, 139]],
  [2500, [160, 105, 112]],
  [3300, [211, 151, 105]],
];

const CRUST_THICKNESS_STOPS: readonly ColorStop[] = [
  [5, [36, 70, 112]],
  [10, [62, 111, 143]],
  [25, [111, 129, 117]],
  [35, [163, 142, 99]],
  [50, [205, 166, 107]],
  [60, [239, 207, 151]],
];

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
function byte(value: number): number { return Math.max(0, Math.min(255, Math.round(value))); }

function interpolateStops(stops: readonly ColorStop[], value: number, alpha = 236): Rgba {
  if (value <= stops[0]![0]) return [...stops[0]![1], alpha];
  if (value >= stops[stops.length - 1]![0]) return [...stops[stops.length - 1]![1], alpha];
  for (let index = 1; index < stops.length; index += 1) {
    const right = stops[index]!;
    const left = stops[index - 1]!;
    if (value > right[0]) continue;
    const t = (value - left[0]) / Math.max(1e-9, right[0] - left[0]);
    return [
      byte(left[1][0] + (right[1][0] - left[1][0]) * t),
      byte(left[1][1] + (right[1][1] - left[1][1]) * t),
      byte(left[1][2] + (right[1][2] - left[1][2]) * t),
      alpha,
    ];
  }
  return [255, 255, 255, alpha];
}

function heat(value: number, low: readonly [number, number, number], high: readonly [number, number, number], alpha = 236): Rgba {
  const t = clamp01(value);
  return [
    byte(low[0] + (high[0] - low[0]) * t),
    byte(low[1] + (high[1] - low[1]) * t),
    byte(low[2] + (high[2] - low[2]) * t),
    alpha,
  ];
}

function diverging(value: number): Rgba {
  const clamped = Math.max(-1, Math.min(1, value));
  const neutral: readonly [number, number, number] = [88, 94, 98];
  return clamped >= 0
    ? heat(clamped, neutral, [236, 122, 70])
    : heat(-clamped, neutral, [61, 132, 187]);
}

function hslToRgb(hue: number, saturation = 0.58, lightness = 0.52): readonly [number, number, number] {
  const h = ((hue % 360) + 360) % 360 / 360;
  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const channel = (offset: number): number => {
    let t = h + offset;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [byte(channel(1 / 3) * 255), byte(channel(0) * 255), byte(channel(-1 / 3) * 255)];
}

export function overlayLegendFor(id: MapOverlayId): MapOverlayLegend | null {
  if (id === 'none') return null;
  if (id === 'elevation') return { title: 'Elevation / Bathymetry', detail: '−7.5 km → sea level → +5.8 km', gradient: 'linear-gradient(90deg,#081337,#2d6897,#dacea0,#58804b,#89774f,#f4f4ef)' };
  if (id === 'relief') return { title: 'Relief', detail: 'Local ruggedness · 0 → ~4 km', gradient: 'linear-gradient(90deg,#17232c,#747b58,#d7b861,#f2eee0)' };
  if (id === 'thermal') return { title: 'Thermal Index', detail: 'Cold → warm', gradient: 'linear-gradient(90deg,#315b8c,#64b6cf,#e5d56a,#d5654f)' };
  if (id === 'moisture') return { title: 'Moisture', detail: 'Dry → wet', gradient: 'linear-gradient(90deg,#8a6947,#758a63,#4d92a8,#6db8cf)' };
  if (id === 'crust-age') return { title: 'Crust Age', detail: 'Young spreading crust → ancient continental crust', gradient: 'linear-gradient(90deg,#3fd3db,#418ec6,#535ca4,#79558b,#d39769)' };
  if (id === 'crust-thickness') return { title: 'Crust Thickness', detail: '~5 km oceanic → ~60 km thickened continental', gradient: 'linear-gradient(90deg,#244670,#3e6f8f,#6f8175,#a38e63,#efcf97)' };
  if (id === 'tectonic-activity') return { title: 'Tectonic Activity', detail: 'Stable interior → active boundary', gradient: 'linear-gradient(90deg,#202a31,#d0a04d,#e34d3f)' };
  if (id === 'uplift-subsidence') return { title: 'Uplift / Subsidence', detail: 'Subsidence → neutral → uplift', gradient: 'linear-gradient(90deg,#3d84bb,#585e62,#ec7a46)' };
  if (id === 'orogeny') return { title: 'Orogenic Influence', detail: 'Low → active crustal shortening / mountain building', gradient: 'linear-gradient(90deg,#20252b,#8d6d56,#d49a62,#f2d6a2)' };
  if (id === 'rifting') return { title: 'Rift Influence', detail: 'Low → active continental extension', gradient: 'linear-gradient(90deg,#20252b,#5d547b,#a74f78,#e26d78)' };
  if (id === 'volcanic-activity') return { title: 'Volcanic Activity', detail: 'Low → high', gradient: 'linear-gradient(90deg,#201a2d,#8d3f74,#e46b35,#f6c15d)' };
  if (id === 'sedimentary-tendency') return { title: 'Sedimentary Tendency', detail: 'Low → basin-prone', gradient: 'linear-gradient(90deg,#1d2a35,#6f6d5c,#c3a36b,#ead8a5)' };
  if (id === 'plate-boundaries') return { title: 'Plate Boundaries', detail: 'Convergent red · divergent cyan · transform violet' };
  if (id === 'tectonic-plates') return { title: 'Tectonic Plates', detail: 'Categorical plate identity' };
  if (id === 'crust-type') return { title: 'Crust Type', detail: 'Continental tan · oceanic blue' };
  if (id === 'semantic-geography') return { title: 'Semantic Geography', detail: 'Generator v7 Region classification' };
  if (id.startsWith('resource:')) {
    const resourceId = id.slice('resource:'.length);
    const definition = RESOURCE_DEFINITIONS.find(candidate => candidate.id === resourceId);
    return { title: `${definition?.name ?? resourceId} Potential`, detail: 'Low → high hidden world potential', gradient: 'linear-gradient(90deg,#15191e,#655d49,#d8bf68,#fff1a8)' };
  }
  return { title: id, detail: '' };
}

export function overlayColorForEnvironment(id: MapOverlayId, sample: PlanetEnvironmentSample, plateIndex = 0, crustType: 'continental' | 'oceanic' = 'continental'): Rgba {
  if (id === 'elevation') return interpolateStops(ELEVATION_STOPS, sample.surfaceElevationMeters);
  if (id === 'relief') return heat(sample.reliefMeters / 4_000, [23, 35, 44], [242, 238, 224]);
  if (id === 'thermal') {
    const cold: readonly [number, number, number] = [49, 91, 140];
    const warm: readonly [number, number, number] = [213, 82, 63];
    return heat(sample.thermalIndex, cold, warm);
  }
  if (id === 'moisture') return heat(sample.moistureIndex, [132, 97, 65], [79, 164, 191]);
  if (id === 'crust-age') return interpolateStops(CRUST_AGE_STOPS, sample.crustAgeMyr);
  if (id === 'crust-thickness') return interpolateStops(CRUST_THICKNESS_STOPS, sample.crustThicknessKm);
  if (id === 'tectonic-activity') return heat(sample.tectonicActivity, [29, 39, 46], [229, 69, 51]);
  if (id === 'uplift-subsidence') return diverging(sample.upliftIndex - sample.subsidenceIndex);
  if (id === 'orogeny') return heat(sample.orogenicInfluence, [29, 35, 42], [242, 205, 151]);
  if (id === 'rifting') return heat(sample.riftInfluence, [28, 34, 42], [226, 91, 119]);
  if (id === 'volcanic-activity') return heat(sample.volcanicActivity, [30, 24, 43], [244, 167, 66]);
  if (id === 'sedimentary-tendency') return heat(sample.sedimentaryBasinFactor, [29, 42, 53], [235, 216, 165]);
  if (id === 'tectonic-plates') return [...hslToRgb(plateIndex * 137.508), 226];
  if (id === 'crust-type') return crustType === 'continental' ? [167, 143, 91, 232] : [48, 104, 151, 232];
  if (id === 'plate-boundaries') {
    if (sample.boundaryType === 'interior') return [0, 0, 0, 0];
    const alpha = byte(30 + sample.boundaryProximity * 225);
    if (sample.boundaryType === 'convergent') return [236, 78, 66, alpha];
    if (sample.boundaryType === 'divergent') return [72, 205, 223, alpha];
    return [180, 110, 216, alpha];
  }
  return [0, 0, 0, 0];
}

function overlayOption(id: MapOverlayId): MapOverlayOption | undefined {
  return MAP_OVERLAY_OPTIONS.find(option => option.id === id);
}

function cacheFor(planet: Planet): PlanetOverlayCache {
  let cache = PLANET_OVERLAY_CACHE.get(planet);
  if (!cache) {
    cache = { rasters: new Map() };
    PLANET_OVERLAY_CACHE.set(planet, cache);
  }
  return cache;
}

function environmentGridFor(planet: Planet): EnvironmentGrid {
  const cache = cacheFor(planet);
  if (cache.environmentGrid) return cache.environmentGrid;
  const width = planet.surfaceResolution.columns;
  const height = planet.surfaceResolution.rows;
  const samples: PlanetEnvironmentSample[] = new Array(width * height);
  const plateIndexes = new Uint16Array(width * height);
  const crustTypes = new Uint8Array(width * height);
  const plateById = new Map(planet.tectonicPlates.map((plate, index) => [plate.id, { plate, index }] as const));
  const context = environmentContextForPlanet(planet);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const point = {
        x: (column + 0.5) / width * planet.width,
        y: (row + 0.5) / height * planet.height,
      };
      const sample = samplePlanetEnvironment(context, point);
      const index = row * width + column;
      samples[index] = sample;
      const plate = plateById.get(sample.plateId);
      plateIndexes[index] = plate?.index ?? 0;
      crustTypes[index] = plate?.plate.crustType === 'oceanic' ? 1 : 0;
    }
  }
  cache.environmentGrid = { width, height, samples, plateIndexes, crustTypes };
  return cache.environmentGrid;
}

function rasterFromPixels(width: number, height: number, pixel: (index: number, column: number, row: number) => Rgba): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  const image = context.createImageData(width, height);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const index = row * width + column;
      const [red, green, blue, alpha] = pixel(index, column, row);
      const offset = index * 4;
      image.data[offset] = red;
      image.data[offset + 1] = green;
      image.data[offset + 2] = blue;
      image.data[offset + 3] = alpha;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function semanticRaster(planet: Planet): HTMLCanvasElement {
  const width = Math.max(512, planet.surfaceResolution.columns * 2);
  const height = Math.max(256, planet.surfaceResolution.rows * 2);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  context.clearRect(0, 0, width, height);
  for (const region of planet.regions) {
    if (region.polygon.length < 3) continue;
    context.beginPath();
    region.polygon.forEach((point, index) => {
      const x = point.x / planet.width * width;
      const y = point.y / planet.height * height;
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.closePath();
    context.fillStyle = SEMANTIC_COLORS[region.geographicType];
    context.fill();
  }
  return canvas;
}

function continuousRaster(planet: Planet, id: MapOverlayId): HTMLCanvasElement {
  const grid = environmentGridFor(planet);
  if (id.startsWith('resource:')) {
    const resourceId = id.slice('resource:'.length);
    const context = environmentContextForPlanet(planet);
    const resourceColor = RESOURCE_COLORS[resourceId] ?? [245, 218, 116] as const;
    return rasterFromPixels(grid.width, grid.height, (_index, column, row) => {
      const point = { x: (column + 0.5) / grid.width * planet.width, y: (row + 0.5) / grid.height * planet.height };
      const potential = resourcePotentialAt(context, point, resourceId);
      if (potential <= 0) return [0, 0, 0, 0];
      return heat(potential, [20, 24, 29], resourceColor, byte(50 + potential * 205));
    });
  }
  return rasterFromPixels(grid.width, grid.height, index => {
    const sample = grid.samples[index]!;
    const plate = planet.tectonicPlates[grid.plateIndexes[index]!] ?? planet.tectonicPlates[0];
    return overlayColorForEnvironment(id, sample, grid.plateIndexes[index]!, grid.crustTypes[index] ? 'oceanic' : plate?.crustType ?? 'continental');
  });
}

function rasterFor(planet: Planet, id: MapOverlayId): HTMLCanvasElement | null {
  if (id === 'none') return null;
  const cache = cacheFor(planet);
  const existing = cache.rasters.get(id);
  if (existing) return existing;
  const raster = id === 'semantic-geography' ? semanticRaster(planet) : continuousRaster(planet, id);
  cache.rasters.set(id, raster);
  return raster;
}

function buildOverlaySelect(select: HTMLSelectElement): void {
  select.replaceChildren();
  const groups = ['None', 'Surface', 'Geology', 'Geography', 'Resources'] as const;
  for (const group of groups) {
    const options = MAP_OVERLAY_OPTIONS.filter(option => option.group === group);
    if (!options.length) continue;
    if (group === 'None') {
      for (const option of options) {
        const element = document.createElement('option');
        element.value = option.id;
        element.textContent = option.label;
        select.appendChild(element);
      }
      continue;
    }
    const optgroup = document.createElement('optgroup');
    optgroup.label = group;
    for (const option of options) {
      const element = document.createElement('option');
      element.value = option.id;
      element.textContent = option.label;
      optgroup.appendChild(element);
    }
    select.appendChild(optgroup);
  }
}

function installOverlayControls(root: HTMLElement): { select: HTMLSelectElement; opacity: HTMLInputElement; legend: HTMLElement } | null {
  const controls = root.querySelector<HTMLElement>('.ws-context-controls');
  const viewport = root.querySelector<HTMLElement>('.ws-viewport');
  if (!controls || !viewport) return null;
  const wrapper = document.createElement('div');
  wrapper.className = 'ws-map-overlay-controls';
  const label = document.createElement('label');
  label.className = 'ws-map-overlay-select-label';
  label.textContent = 'Overlay';
  const select = document.createElement('select');
  select.id = 'ws-map-overlay-select';
  select.className = 'ws-map-overlay-select';
  select.setAttribute('aria-label', 'Map overlay');
  buildOverlaySelect(select);
  label.appendChild(select);

  const opacityLabel = document.createElement('label');
  opacityLabel.className = 'ws-map-overlay-opacity-label';
  opacityLabel.textContent = 'Opacity';
  const opacity = document.createElement('input');
  opacity.type = 'range';
  opacity.min = '0.2';
  opacity.max = '1';
  opacity.step = '0.05';
  opacity.value = '0.72';
  opacity.setAttribute('aria-label', 'Map overlay opacity');
  opacityLabel.appendChild(opacity);
  wrapper.append(label, opacityLabel);
  controls.appendChild(wrapper);

  const legend = document.createElement('div');
  legend.id = 'ws-map-overlay-legend';
  legend.className = 'ws-map-overlay-legend';
  legend.hidden = true;
  viewport.appendChild(legend);
  return { select, opacity, legend };
}

function updateLegend(element: HTMLElement, id: MapOverlayId, hiddenForZoom: boolean): void {
  const legend = overlayLegendFor(id);
  if (!legend) {
    element.hidden = true;
    element.replaceChildren();
    return;
  }
  element.hidden = false;
  const title = document.createElement('strong');
  title.textContent = legend.title;
  const detail = document.createElement('span');
  detail.textContent = hiddenForZoom ? `${legend.detail} · hidden beyond ${MAP_OVERLAY_MAX_ZOOM.toLocaleString()}×` : legend.detail;
  element.replaceChildren(title, detail);
  if (legend.gradient) {
    const gradient = document.createElement('i');
    gradient.className = 'ws-map-overlay-gradient';
    gradient.style.background = legend.gradient;
    element.appendChild(gradient);
  }
}

export function installMapOverlayRenderer(root: HTMLElement, store: AppStore): void {
  const host = root.querySelector<HTMLElement>('#ws-map-canvas');
  const svg = root.querySelector<SVGSVGElement>('#ws-map-svg');
  const controls = installOverlayControls(root);
  if (!host || !svg || !controls) return;

  const displayCanvas = document.createElement('canvas');
  displayCanvas.className = 'ws-map-overlay-canvas';
  host.appendChild(displayCanvas);
  const context = displayCanvas.getContext('2d');
  if (!context) return;

  let currentOverlay: MapOverlayId = 'none';
  let currentPlanet: Planet | null = null;
  let currentCamera: MapCameraState = store.getState().camera;
  let scheduled = false;
  let buildToken = 0;

  const draw = (): void => {
    scheduled = false;
    const planet = currentPlanet;
    const active = Boolean(planet && currentOverlay !== 'none');
    const hiddenForZoom = active && currentCamera.zoom > MAP_OVERLAY_MAX_ZOOM;
    svg.classList.toggle('ws-map-overlay-active', active && !hiddenForZoom);
    displayCanvas.hidden = !active || hiddenForZoom;
    updateLegend(controls.legend, currentOverlay, Boolean(hiddenForZoom));
    if (!planet || currentOverlay === 'none' || hiddenForZoom) {
      context.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
      return;
    }

    const raster = rasterFor(planet, currentOverlay);
    if (!raster) return;
    const rect = host.getBoundingClientRect();
    const cssWidth = Math.max(1, rect.width);
    const cssHeight = Math.max(1, rect.height);
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
    const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));
    if (displayCanvas.width !== pixelWidth || displayCanvas.height !== pixelHeight) {
      displayCanvas.width = pixelWidth;
      displayCanvas.height = pixelHeight;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);
    context.imageSmoothingEnabled = currentOverlay !== 'tectonic-plates' && currentOverlay !== 'crust-type';
    context.imageSmoothingQuality = 'high';

    const visible = visibleWorldSize(svg, planet, currentCamera.zoom);
    const worldX = currentCamera.centerX - visible.width / 2;
    const worldY = currentCamera.centerY - visible.height / 2;
    const sourceX = worldX / planet.width * raster.width;
    const sourceY = worldY / planet.height * raster.height;
    const sourceWidth = visible.width / planet.width * raster.width;
    const sourceHeight = visible.height / planet.height * raster.height;
    context.drawImage(raster, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, cssWidth, cssHeight);
  };

  const scheduleDraw = (): void => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(draw);
  };

  const renderSelectedOverlay = (): void => {
    buildToken += 1;
    const token = buildToken;
    currentOverlay = controls.select.value as MapOverlayId;
    controls.opacity.disabled = currentOverlay === 'none';
    displayCanvas.style.opacity = controls.opacity.value;
    if (currentOverlay === 'none') {
      scheduleDraw();
      return;
    }
    controls.legend.hidden = false;
    controls.legend.textContent = `Rendering ${overlayOption(currentOverlay)?.label ?? currentOverlay}…`;
    window.setTimeout(() => {
      if (token !== buildToken || !currentPlanet) return;
      rasterFor(currentPlanet, currentOverlay);
      scheduleDraw();
    }, 0);
  };

  controls.select.addEventListener('change', renderSelectedOverlay);
  controls.opacity.addEventListener('input', () => { displayCanvas.style.opacity = controls.opacity.value; });
  const resizeObserver = new ResizeObserver(scheduleDraw);
  resizeObserver.observe(host);

  store.subscribeDomains(['world', 'camera'], state => {
    const nextPlanet = state.world?.planet ?? null;
    if (currentPlanet !== nextPlanet) {
      currentPlanet = nextPlanet;
      buildToken += 1;
    }
    currentCamera = state.camera;
    scheduleDraw();
  });
}
