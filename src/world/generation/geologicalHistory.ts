import type { Point, TectonicPlate } from '../types.js';
import { wrappedValueNoise } from './generationNoise.js';
import { samplePlateModel, type PlateSample } from './tectonics.js';

export interface GeologicalHistorySample {
  crustAgeMyr: number;
  crustThicknessKm: number;
  upliftIndex: number;
  subsidenceIndex: number;
  orogenicInfluence: number;
  riftInfluence: number;
  ridgeInfluence: number;
  trenchInfluence: number;
  basinInfluence: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function bell(value: number, center: number, width: number): number {
  const normalized = (value - center) / Math.max(1e-6, width);
  return Math.exp(-normalized * normalized);
}

/**
 * Converts one already-resolved plate sample into deterministic geological
 * history. Hot generation paths should use this form to avoid resolving the
 * same nearest plate pair twice for one world point.
 */
export function geologicalHistoryFromPlateSample(seed: string, point: Point, plateSample: PlateSample): GeologicalHistorySample {
  const plate = plateSample.plate;
  const neighbor = plateSample.neighbor;
  const proximity = plateSample.boundaryProximity;
  const convergent = plateSample.boundaryType === 'convergent' ? proximity : 0;
  const divergent = plateSample.boundaryType === 'divergent' ? proximity : 0;

  const continental = plate.crustType === 'continental' ? 1 : 0;
  const oceanic = 1 - continental;
  const neighborContinental = neighbor.crustType === 'continental' ? 1 : 0;
  const neighborOceanic = 1 - neighborContinental;

  const collisionStrength = convergent * (continental * (0.72 + neighborContinental * 0.28) + oceanic * neighborContinental * 0.2);
  const trenchStrength = convergent * (oceanic * 0.92 + continental * neighborOceanic * 0.68);
  const riftStrength = divergent * (continental * 0.92 + oceanic * 0.08);
  const ridgeStrength = divergent * (oceanic * 0.94 + continental * neighborOceanic * 0.16);

  // Foreland-style subsidence is offset inland from the strongest convergent
  // boundary rather than occupying the mountain crest itself.
  const forelandBand = continental * convergent * bell(proximity, 0.42, 0.18);
  const stableBasinNoise = wrappedValueNoise(seed, 'history:basin-province', point, 640);
  const stableInterior = clamp01(1 - proximity * 1.25);
  const basinInfluence = clamp01(forelandBand * 0.62 + stableBasinNoise * stableInterior * 0.46);

  const hotspot = wrappedValueNoise(seed, 'history:mantle-upwelling', point, 768);
  const hotspotUplift = clamp01((hotspot - 0.72) / 0.28) * 0.18;

  let crustAgeMyr = plate.baseCrustAgeMyr;
  if (plate.crustType === 'oceanic') {
    crustAgeMyr = Math.max(1, crustAgeMyr * (1 - ridgeStrength * 0.94));
  } else {
    crustAgeMyr = Math.max(250, crustAgeMyr * (1 - riftStrength * 0.08));
  }

  const oceanicCoolingSubsidence = oceanic * clamp01((crustAgeMyr - 20) / 150) * 0.28;
  const orogenicInfluence = clamp01(collisionStrength);
  const riftInfluence = clamp01(riftStrength);
  const ridgeInfluence = clamp01(ridgeStrength);
  const trenchInfluence = clamp01(trenchStrength);
  const upliftIndex = clamp01(orogenicInfluence * 0.82 + ridgeInfluence * 0.52 + hotspotUplift);
  const subsidenceIndex = clamp01(trenchInfluence * 0.78 + riftInfluence * 0.58 + basinInfluence * 0.38 + oceanicCoolingSubsidence);

  const thicknessDelta = orogenicInfluence * 13.5
    - riftInfluence * 8.5
    + ridgeInfluence * 1.2
    - trenchInfluence * 0.8;
  const crustThicknessKm = plate.crustType === 'continental'
    ? Math.max(22, Math.min(58, plate.baseCrustThicknessKm + thicknessDelta))
    : Math.max(5.2, Math.min(10.5, plate.baseCrustThicknessKm + thicknessDelta * 0.16));

  return {
    crustAgeMyr: round(crustAgeMyr, 1),
    crustThicknessKm: round(crustThicknessKm, 2),
    upliftIndex: round(upliftIndex),
    subsidenceIndex: round(subsidenceIndex),
    orogenicInfluence: round(orogenicInfluence),
    riftInfluence: round(riftInfluence),
    ridgeInfluence: round(ridgeInfluence),
    trenchInfluence: round(trenchInfluence),
    basinInfluence: round(basinInfluence),
  };
}

/** Convenience entry point for callers that do not already have a plate sample. */
export function sampleGeologicalHistory(seed: string, plates: readonly TectonicPlate[], point: Point): GeologicalHistorySample {
  return geologicalHistoryFromPlateSample(seed, point, samplePlateModel(plates, point));
}
