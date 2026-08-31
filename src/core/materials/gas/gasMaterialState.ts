import { MATERIAL_FORMS } from '../materialForms.js';
import { requireMaterialSpecies } from '../species/materialSpecies.js';
import { cloneThermalState, createThermalState, validateThermalState } from '../thermal/thermalState.js';
import type { GasMaterialBody, GasMaterialState, ThermalState } from '../types.js';

export const GAS_MATERIAL_TOLERANCE = 1e-9;

function assertFiniteNonNegative(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number`);
  }
}

export function createGasMaterialState(speciesMassKg: Record<string, number> = {}): GasMaterialState {
  if (!speciesMassKg || typeof speciesMassKg !== 'object' || Array.isArray(speciesMassKg)) {
    throw new Error('gas speciesMassKg must be an object');
  }
  const state: GasMaterialState = { speciesMassKg: {} };
  for (const [speciesId, massKg] of Object.entries(speciesMassKg)) {
    requireMaterialSpecies(speciesId);
    assertFiniteNonNegative(massKg, `Gas species '${speciesId}' mass`);
    if (massKg > GAS_MATERIAL_TOLERANCE) state.speciesMassKg[speciesId] = massKg;
  }
  return state;
}

export function cloneGasMaterialState(gasState: GasMaterialState): GasMaterialState {
  validateGasMaterialState(gasState);
  return createGasMaterialState(gasState.speciesMassKg);
}

export function validateGasMaterialState(gasState: GasMaterialState): void {
  if (!gasState || typeof gasState !== 'object' || Array.isArray(gasState)) {
    throw new Error('gasState must be an object');
  }
  createGasMaterialState(gasState.speciesMassKg);
}

export function totalGasMassKg(gasState: GasMaterialState): number {
  validateGasMaterialState(gasState);
  return Object.values(gasState.speciesMassKg).reduce((sum, massKg) => sum + massKg, 0);
}

export function addGasMaterialState(target: GasMaterialState, source: GasMaterialState, factor = 1): GasMaterialState {
  validateGasMaterialState(target);
  validateGasMaterialState(source);
  assertFiniteNonNegative(factor, 'gas material factor');
  for (const [speciesId, massKg] of Object.entries(source.speciesMassKg)) {
    target.speciesMassKg[speciesId] = (target.speciesMassKg[speciesId] ?? 0) + massKg * factor;
  }
  for (const [speciesId, massKg] of Object.entries(target.speciesMassKg)) {
    if (massKg <= GAS_MATERIAL_TOLERANCE) delete target.speciesMassKg[speciesId];
  }
  return target;
}

export function scaleGasMaterialState(gasState: GasMaterialState, factor: number): GasMaterialState {
  if (!Number.isFinite(factor) || factor < 0 || factor > 1) {
    throw new Error('gas material scale factor must be in [0, 1]');
  }
  const scaled = createGasMaterialState();
  return addGasMaterialState(scaled, gasState, factor);
}

export function createGasMaterialBody(
  gasState: GasMaterialState = createGasMaterialState(),
  thermalState: ThermalState = createThermalState(),
): GasMaterialBody {
  return {
    physicalForm: MATERIAL_FORMS.GAS,
    gasState: cloneGasMaterialState(gasState),
    thermalState: cloneThermalState(thermalState),
  };
}

export function validateGasMaterialBody(body: GasMaterialBody): void {
  if (!body || typeof body !== 'object' || Array.isArray(body) || body.physicalForm !== MATERIAL_FORMS.GAS) {
    throw new Error(`Unsupported material body physical form '${body?.physicalForm ?? 'unknown'}'`);
  }
  validateGasMaterialState(body.gasState);
  validateThermalState(body.thermalState);
}

export function cloneGasMaterialBody(body: GasMaterialBody): GasMaterialBody {
  validateGasMaterialBody(body);
  return createGasMaterialBody(body.gasState, body.thermalState);
}
