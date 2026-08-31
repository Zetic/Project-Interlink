import type { ComminutionProperties } from '../types.js';

function assertFinitePositive(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive number`);
  }
}

function assertFiniteNonNegative(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number`);
  }
}

export function validateComminutionProperties(properties: ComminutionProperties): ComminutionProperties {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    throw new Error('comminution properties must be an object');
  }
  assertFinitePositive(properties.bondCrushingWorkIndexKWhPerT, 'bondCrushingWorkIndexKWhPerT');
  assertFinitePositive(properties.bondBallMillWorkIndexKWhPerT, 'bondBallMillWorkIndexKWhPerT');
  assertFiniteNonNegative(properties.bondAbrasionIndex, 'bondAbrasionIndex');
  return properties;
}

export function cloneComminutionProperties(properties: ComminutionProperties): ComminutionProperties {
  validateComminutionProperties(properties);
  return {
    bondCrushingWorkIndexKWhPerT: properties.bondCrushingWorkIndexKWhPerT,
    bondBallMillWorkIndexKWhPerT: properties.bondBallMillWorkIndexKWhPerT,
    bondAbrasionIndex: properties.bondAbrasionIndex,
  };
}

export function comminutionPropertiesEqual(a: ComminutionProperties | null | undefined, b: ComminutionProperties | null | undefined): boolean {
  if (!a || !b) return a === b;
  return a.bondCrushingWorkIndexKWhPerT === b.bondCrushingWorkIndexKWhPerT
    && a.bondBallMillWorkIndexKWhPerT === b.bondBallMillWorkIndexKWhPerT
    && a.bondAbrasionIndex === b.bondAbrasionIndex;
}

export function bondSpecificEnergyKWhPerT(workIndexKWhPerT: number, feedP80Um: number, productP80Um: number): number {
  assertFinitePositive(workIndexKWhPerT, 'Bond work index');
  assertFinitePositive(feedP80Um, 'F80');
  assertFinitePositive(productP80Um, 'P80');
  if (productP80Um >= feedP80Um) return 0;
  return workIndexKWhPerT * 10 * ((1 / Math.sqrt(productP80Um)) - (1 / Math.sqrt(feedP80Um)));
}
