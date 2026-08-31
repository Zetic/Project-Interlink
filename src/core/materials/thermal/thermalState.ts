import { getMaterialSpecies } from '../species/materialSpecies.js';
import { specificHeatCapacityJPerKgKForSpecies } from '../properties/thermalProperties.js';
import type { ThermalState } from '../types.js';

export const THERMAL_REFERENCE_TEMPERATURE_K = 298.15;
export const THERMAL_ENERGY_TOLERANCE_J = 1e-6;

function assertFinite(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
}

export function createThermalState({ sensibleEnthalpyJ = 0 }: Partial<ThermalState> = {}): ThermalState {
  assertFinite(sensibleEnthalpyJ, 'sensibleEnthalpyJ');
  return { sensibleEnthalpyJ };
}

export function cloneThermalState(thermalState: Partial<ThermalState> = {}): ThermalState {
  return createThermalState(thermalState);
}

export function validateThermalState(thermalState: ThermalState): void {
  if (!thermalState || typeof thermalState !== 'object' || Array.isArray(thermalState)) {
    throw new Error('thermalState must be an object');
  }
  createThermalState(thermalState);
}

export function thermalPropertyCoverageError(speciesIds: string[]): string {
  return `Thermal property coverage missing for:\n${speciesIds.map(id => `- ${id}`).join('\n')}`;
}

export function heatCapacityJPerKForSpeciesMasses(speciesMassKg: Record<string, number>): number {
  const missing: string[] = [];
  let capacity = 0;
  for (const [speciesId, massKg] of Object.entries(speciesMassKg ?? {})) {
    if (!Number.isFinite(massKg) || massKg < 0) throw new Error(`Species '${speciesId}' mass must be finite and non-negative`);
    if (massKg <= 0) continue;
    const specificHeatCapacity = specificHeatCapacityJPerKgKForSpecies(getMaterialSpecies(speciesId));
    if (specificHeatCapacity == null) {
      missing.push(speciesId);
      continue;
    }
    capacity += massKg * specificHeatCapacity;
  }
  if (missing.length) throw new Error(thermalPropertyCoverageError(missing));
  return capacity;
}

export function temperatureKFromSensibleEnthalpy(sensibleEnthalpyJ: number, heatCapacityJPerK: number): number {
  assertFinite(sensibleEnthalpyJ, 'sensibleEnthalpyJ');
  assertFinite(heatCapacityJPerK, 'heatCapacityJPerK');
  if (heatCapacityJPerK < 0) throw new Error('heatCapacityJPerK must be non-negative');
  if (heatCapacityJPerK === 0) return THERMAL_REFERENCE_TEMPERATURE_K;
  const temperatureK = THERMAL_REFERENCE_TEMPERATURE_K + sensibleEnthalpyJ / heatCapacityJPerK;
  if (temperatureK <= 0) throw new Error('Thermal state implies a non-positive absolute temperature');
  return temperatureK;
}

export function sensibleEnthalpyJAtTemperature(temperatureK: number, heatCapacityJPerK: number): number {
  assertFinite(temperatureK, 'temperatureK');
  assertFinite(heatCapacityJPerK, 'heatCapacityJPerK');
  if (temperatureK <= 0) throw new Error('temperatureK must be positive');
  if (heatCapacityJPerK < 0) throw new Error('heatCapacityJPerK must be non-negative');
  return heatCapacityJPerK * (temperatureK - THERMAL_REFERENCE_TEMPERATURE_K);
}
