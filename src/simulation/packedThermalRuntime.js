import { PACKED_SOLID_TOLERANCE, PackedSolidRuntimeState } from './packedRuntimeState.js';

function assertUnsigned16(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new Error(`${label} must be an integer from 0 to 65535`);
  }
}

/** Runtime-local constant-Cp lookup keyed by packed species ID. */
export class PackedSpeciesThermalRuntimeTable {
  constructor(initialCapacity = 16) {
    if (!Number.isInteger(initialCapacity) || initialCapacity < 1) {
      throw new Error('thermal table initialCapacity must be a positive integer');
    }
    this.values = new Float64Array(initialCapacity);
  }

  setSpecificHeatCapacityJPerKgK(speciesId, value) {
    assertUnsigned16(speciesId, 'speciesId');
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new Error('specific heat capacity must be finite and positive');
    }
    if (speciesId >= this.values.length) {
      let capacity = this.values.length;
      while (capacity <= speciesId) capacity *= 2;
      const next = new Float64Array(capacity);
      next.set(this.values);
      this.values = next;
    }
    this.values[speciesId] = value;
    return this;
  }

  specificHeatCapacityJPerKgK(speciesId) {
    assertUnsigned16(speciesId, 'speciesId');
    const value = this.values[speciesId] ?? 0;
    if (!(value > 0)) {
      throw new Error(`Thermal property coverage missing for runtime species ID ${speciesId}`);
    }
    return value;
  }

  heatCapacityJPerK(state) {
    if (!(state instanceof PackedSolidRuntimeState)) throw new Error('packed solid state is required');
    let total = 0;
    for (let index = 0; index < state.length; index++) {
      const quantity = state.quantities[index];
      if (quantity <= PACKED_SOLID_TOLERANCE) continue;
      total += quantity * this.specificHeatCapacityJPerKgK(state.speciesIds[index]);
    }
    if (!Number.isFinite(total) || total < 0) {
      throw new Error('packed material heat capacity must be finite and non-negative');
    }
    return total;
  }
}
