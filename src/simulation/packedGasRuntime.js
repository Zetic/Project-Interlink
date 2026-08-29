import { PackedSolidRuntimeBody } from './packedStorageRuntime.js';
import { PackedSpeciesThermalRuntimeTable } from './packedThermalRuntime.js';

export const PACKED_GAS_TOLERANCE = 1e-9;
export const PACKED_THERMAL_REFERENCE_TEMPERATURE_K = 298.15;
export const PACKED_THERMAL_ENERGY_TOLERANCE_J = 1e-6;

function assertUnsigned16(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new Error(`${label} must be an integer from 0 to 65535`);
  }
}

function assertFinite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function assertNonNegativeFinite(value, label) {
  assertFinite(value, label);
  if (value < 0) throw new Error(`${label} must be non-negative`);
}

function assertPositiveFinite(value, label) {
  assertFinite(value, label);
  if (value <= 0) throw new Error(`${label} must be positive`);
}

/**
 * Packed gas composition for the JS fallback/runtime compiler contract.
 * Quantities are kg in bodies and kg/s in streams, mirroring how the canonical
 * gasState object is reused for both finite material and continuous flow.
 */
export class PackedGasRuntimeState {
  constructor(initialCapacity = 8) {
    if (!Number.isInteger(initialCapacity) || initialCapacity < 1) {
      throw new Error('gas initialCapacity must be a positive integer');
    }
    this.length = 0;
    this.capacity = initialCapacity;
    this.speciesIds = new Uint16Array(initialCapacity);
    this.quantities = new Float64Array(initialCapacity);
    this.indexBySpecies = new Map();
  }

  clear() {
    this.length = 0;
    this.indexBySpecies.clear();
  }

  isEmpty() {
    return this.length === 0;
  }

  pushSpecies(speciesId, quantity) {
    assertUnsigned16(speciesId, 'speciesId');
    assertNonNegativeFinite(quantity, 'gas material quantity');
    if (quantity <= PACKED_GAS_TOLERANCE) return this;
    const existing = this.indexBySpecies.get(speciesId);
    if (existing != null) {
      this.quantities[existing] += quantity;
      return this;
    }
    this.#ensureCapacity(this.length + 1);
    const index = this.length++;
    this.speciesIds[index] = speciesId;
    this.quantities[index] = quantity;
    this.indexBySpecies.set(speciesId, index);
    return this;
  }

  totalQuantity() {
    let total = 0;
    for (let index = 0; index < this.length; index++) {
      const quantity = this.quantities[index];
      if (quantity > PACKED_GAS_TOLERANCE) total += quantity;
    }
    return total;
  }

  scaleInPlace(factor) {
    assertNonNegativeFinite(factor, 'gas material scale factor');
    if (factor <= PACKED_GAS_TOLERANCE) {
      this.clear();
      return this;
    }
    let writeIndex = 0;
    this.indexBySpecies.clear();
    for (let readIndex = 0; readIndex < this.length; readIndex++) {
      const quantity = this.quantities[readIndex] * factor;
      if (quantity <= PACKED_GAS_TOLERANCE) continue;
      const speciesId = this.speciesIds[readIndex];
      this.speciesIds[writeIndex] = speciesId;
      this.quantities[writeIndex] = quantity;
      this.indexBySpecies.set(speciesId, writeIndex);
      writeIndex++;
    }
    this.length = writeIndex;
    return this;
  }

  toColumns() {
    return {
      speciesIds: this.speciesIds.slice(0, this.length),
      quantities: this.quantities.slice(0, this.length),
    };
  }

  #ensureCapacity(required) {
    if (required <= this.capacity) return;
    let nextCapacity = this.capacity;
    while (nextCapacity < required) nextCapacity *= 2;
    const speciesIds = new Uint16Array(nextCapacity);
    const quantities = new Float64Array(nextCapacity);
    speciesIds.set(this.speciesIds.subarray(0, this.length));
    quantities.set(this.quantities.subarray(0, this.length));
    this.capacity = nextCapacity;
    this.speciesIds = speciesIds;
    this.quantities = quantities;
  }
}

export function clonePackedGasState(source) {
  if (!(source instanceof PackedGasRuntimeState)) throw new Error('packed gas state is required');
  const result = new PackedGasRuntimeState(Math.max(1, source.length));
  const columns = source.toColumns();
  for (let index = 0; index < columns.quantities.length; index++) {
    result.pushSpecies(columns.speciesIds[index], columns.quantities[index]);
  }
  return result;
}

export function addPackedGasState(target, source, factor = 1) {
  if (!(target instanceof PackedGasRuntimeState) || !(source instanceof PackedGasRuntimeState)) {
    throw new Error('packed gas states are required');
  }
  assertNonNegativeFinite(factor, 'gas material add factor');
  if (factor <= PACKED_GAS_TOLERANCE) return target;
  const columns = source.toColumns();
  for (let index = 0; index < columns.quantities.length; index++) {
    target.pushSpecies(columns.speciesIds[index], columns.quantities[index] * factor);
  }
  return target;
}

export function scaledPackedGasState(source, factor) {
  const result = clonePackedGasState(source);
  result.scaleInPlace(factor);
  return result;
}

export function withdrawPackedGasQuantity(source, requestedQuantity) {
  if (!(source instanceof PackedGasRuntimeState)) throw new Error('packed gas state is required');
  assertNonNegativeFinite(requestedQuantity, 'requested gas quantity');
  const total = source.totalQuantity();
  if (total <= PACKED_GAS_TOLERANCE || requestedQuantity <= PACKED_GAS_TOLERANCE) {
    return new PackedGasRuntimeState();
  }
  const actual = Math.min(total, requestedQuantity);
  const fraction = actual / total;
  const withdrawn = scaledPackedGasState(source, fraction);
  if (actual >= total - PACKED_GAS_TOLERANCE) source.clear();
  else source.scaleInPlace(1 - fraction);
  return withdrawn;
}

export class PackedGasRuntimeBody {
  constructor(gasState = new PackedGasRuntimeState(), sensibleEnthalpyJ = 0) {
    if (!(gasState instanceof PackedGasRuntimeState)) {
      throw new Error('PackedGasRuntimeBody requires packed gas state');
    }
    assertFinite(sensibleEnthalpyJ, 'gas sensible enthalpy');
    this.gasState = clonePackedGasState(gasState);
    this.sensibleEnthalpyJ = sensibleEnthalpyJ;
  }

  clone() {
    return new PackedGasRuntimeBody(this.gasState, this.sensibleEnthalpyJ);
  }

  totalMassKg() {
    return this.gasState.totalQuantity();
  }

  specificSensibleEnthalpyJPerKg() {
    const mass = this.totalMassKg();
    return mass <= PACKED_GAS_TOLERANCE ? 0 : this.sensibleEnthalpyJ / mass;
  }

  addBody(incoming) {
    if (!(incoming instanceof PackedGasRuntimeBody)) throw new Error('incoming packed gas body is required');
    const mass = incoming.totalMassKg();
    if (mass <= PACKED_GAS_TOLERANCE) return 0;
    const staged = this.clone();
    addPackedGasState(staged.gasState, incoming.gasState);
    const nextEnthalpy = staged.sensibleEnthalpyJ + incoming.sensibleEnthalpyJ;
    assertFinite(nextEnthalpy, 'mixed gas sensible enthalpy');
    staged.sensibleEnthalpyJ = nextEnthalpy;
    this.gasState = staged.gasState;
    this.sensibleEnthalpyJ = staged.sensibleEnthalpyJ;
    return mass;
  }

  receiveFlow(flow, dt, specificSensibleEnthalpyJPerKg = 0) {
    if (!(flow instanceof PackedGasRuntimeState)) throw new Error('packed gas flow is required');
    assertPositiveFinite(dt, 'gas receive dt');
    assertFinite(specificSensibleEnthalpyJPerKg, 'gas flow specific sensible enthalpy');
    const acceptedMassKg = flow.totalQuantity() * dt;
    assertNonNegativeFinite(acceptedMassKg, 'received gas mass');
    if (acceptedMassKg <= PACKED_GAS_TOLERANCE) return 0;
    const staged = this.clone();
    addPackedGasState(staged.gasState, flow, dt);
    staged.sensibleEnthalpyJ += acceptedMassKg * specificSensibleEnthalpyJPerKg;
    assertFinite(staged.sensibleEnthalpyJ, 'gas sensible enthalpy');
    this.gasState = staged.gasState;
    this.sensibleEnthalpyJ = staged.sensibleEnthalpyJ;
    return acceptedMassKg;
  }

  withdrawMass(requestedMassKg) {
    assertNonNegativeFinite(requestedMassKg, 'requested gas withdrawal mass');
    const storedBefore = this.totalMassKg();
    if (storedBefore <= PACKED_GAS_TOLERANCE || requestedMassKg <= PACKED_GAS_TOLERANCE) {
      return { body: new PackedGasRuntimeBody(), actualMassKg: 0 };
    }
    const staged = this.clone();
    const withdrawnState = withdrawPackedGasQuantity(staged.gasState, requestedMassKg);
    const actualMassKg = withdrawnState.totalQuantity();
    const withdrawnEnthalpyJ = staged.sensibleEnthalpyJ * (actualMassKg / storedBefore);
    staged.sensibleEnthalpyJ -= withdrawnEnthalpyJ;
    if (Math.abs(staged.sensibleEnthalpyJ) <= PACKED_THERMAL_ENERGY_TOLERANCE_J) staged.sensibleEnthalpyJ = 0;
    this.gasState = staged.gasState;
    this.sensibleEnthalpyJ = staged.sensibleEnthalpyJ;
    return {
      body: new PackedGasRuntimeBody(withdrawnState, withdrawnEnthalpyJ),
      actualMassKg,
    };
  }
}

export class PackedGasStreamRuntimeState {
  constructor(gasState = new PackedGasRuntimeState(), specificSensibleEnthalpyJPerKg = 0) {
    if (!(gasState instanceof PackedGasRuntimeState)) throw new Error('packed gas stream state is required');
    assertFinite(specificSensibleEnthalpyJPerKg, 'gas stream specific sensible enthalpy');
    this.gasState = clonePackedGasState(gasState);
    this.specificSensibleEnthalpyJPerKg = specificSensibleEnthalpyJPerKg;
    this.totalMassFlowKgPerSecond = this.gasState.totalQuantity();
  }

  clear() {
    this.gasState.clear();
    this.specificSensibleEnthalpyJPerKg = 0;
    this.totalMassFlowKgPerSecond = 0;
  }

  setFlow(gasState, specificSensibleEnthalpyJPerKg = 0) {
    const next = new PackedGasStreamRuntimeState(gasState, specificSensibleEnthalpyJPerKg);
    this.gasState = next.gasState;
    this.specificSensibleEnthalpyJPerKg = next.specificSensibleEnthalpyJPerKg;
    this.totalMassFlowKgPerSecond = next.totalMassFlowKgPerSecond;
    return this;
  }
}

function assertThermalTable(table) {
  if (!(table instanceof PackedSpeciesThermalRuntimeTable)) {
    throw new Error('packed species thermal table is required');
  }
}

export function packedGasHeatCapacityJPerK(state, thermalTable) {
  if (!(state instanceof PackedGasRuntimeState)) throw new Error('packed gas state is required');
  assertThermalTable(thermalTable);
  let total = 0;
  for (let index = 0; index < state.length; index++) {
    const quantity = state.quantities[index];
    if (quantity <= PACKED_GAS_TOLERANCE) continue;
    total += quantity * thermalTable.specificHeatCapacityJPerKgK(state.speciesIds[index]);
  }
  assertNonNegativeFinite(total, 'packed gas heat capacity');
  return total;
}

export function packedTemperatureKFromSensibleEnthalpy(sensibleEnthalpyJ, heatCapacityJPerK) {
  assertFinite(sensibleEnthalpyJ, 'sensibleEnthalpyJ');
  assertFinite(heatCapacityJPerK, 'heatCapacityJPerK');
  if (heatCapacityJPerK < 0) throw new Error('heatCapacityJPerK must be non-negative');
  if (heatCapacityJPerK === 0) return PACKED_THERMAL_REFERENCE_TEMPERATURE_K;
  const temperatureK = PACKED_THERMAL_REFERENCE_TEMPERATURE_K + sensibleEnthalpyJ / heatCapacityJPerK;
  if (temperatureK <= 0) throw new Error('Thermal state implies a non-positive absolute temperature');
  return temperatureK;
}

export function packedSensibleEnthalpyJAtTemperature(temperatureK, heatCapacityJPerK) {
  assertFinite(temperatureK, 'temperatureK');
  assertFinite(heatCapacityJPerK, 'heatCapacityJPerK');
  if (temperatureK <= 0) throw new Error('temperatureK must be positive');
  if (heatCapacityJPerK < 0) throw new Error('heatCapacityJPerK must be non-negative');
  return heatCapacityJPerK * (temperatureK - PACKED_THERMAL_REFERENCE_TEMPERATURE_K);
}

export function packedGasBodyTemperatureK(body, thermalTable) {
  if (!(body instanceof PackedGasRuntimeBody)) throw new Error('packed gas body is required');
  if (Math.abs(body.sensibleEnthalpyJ) <= PACKED_THERMAL_ENERGY_TOLERANCE_J) {
    return PACKED_THERMAL_REFERENCE_TEMPERATURE_K;
  }
  return packedTemperatureKFromSensibleEnthalpy(
    body.sensibleEnthalpyJ,
    packedGasHeatCapacityJPerK(body.gasState, thermalTable),
  );
}

export function setPackedGasBodyTemperatureK(body, thermalTable, temperatureK) {
  if (!(body instanceof PackedGasRuntimeBody)) throw new Error('packed gas body is required');
  const heatCapacityJPerK = packedGasHeatCapacityJPerK(body.gasState, thermalTable);
  body.sensibleEnthalpyJ = packedSensibleEnthalpyJAtTemperature(temperatureK, heatCapacityJPerK);
  return body;
}

export function packedSolidBodyTemperatureK(body, thermalTable) {
  if (!(body instanceof PackedSolidRuntimeBody)) throw new Error('packed solid body is required');
  assertThermalTable(thermalTable);
  if (Math.abs(body.sensibleEnthalpyJ) <= PACKED_THERMAL_ENERGY_TOLERANCE_J) {
    return PACKED_THERMAL_REFERENCE_TEMPERATURE_K;
  }
  return packedTemperatureKFromSensibleEnthalpy(
    body.sensibleEnthalpyJ,
    thermalTable.heatCapacityJPerK(body.solidState),
  );
}

export function setPackedSolidBodyTemperatureK(body, thermalTable, temperatureK) {
  if (!(body instanceof PackedSolidRuntimeBody)) throw new Error('packed solid body is required');
  assertThermalTable(thermalTable);
  body.sensibleEnthalpyJ = packedSensibleEnthalpyJAtTemperature(
    temperatureK,
    thermalTable.heatCapacityJPerK(body.solidState),
  );
  return body;
}

export function mixPackedGasBodies(bodies) {
  const result = new PackedGasRuntimeBody();
  for (const body of bodies) result.addBody(body);
  return result;
}

export function packedAmbientHeatTransferEnergyJ(
  temperatureK,
  heatTransferCoefficientWPerK,
  dt,
  ambientTemperatureK = PACKED_THERMAL_REFERENCE_TEMPERATURE_K,
) {
  [temperatureK, heatTransferCoefficientWPerK, dt, ambientTemperatureK].forEach((value, index) => {
    assertFinite(value, ['temperatureK', 'heatTransferCoefficientWPerK', 'dt', 'ambientTemperatureK'][index]);
  });
  if (heatTransferCoefficientWPerK < 0) throw new Error('heatTransferCoefficientWPerK must be non-negative');
  if (dt < 0) throw new Error('dt must be non-negative');
  return heatTransferCoefficientWPerK * (temperatureK - ambientTemperatureK) * dt;
}

export function packedBoundedCoolingEnergyJ(
  sensibleEnthalpyJ,
  heatCapacityJPerK,
  requestedHeatLossEnergyJ,
  minimumTemperatureK = 1,
) {
  assertFinite(sensibleEnthalpyJ, 'sensibleEnthalpyJ');
  assertFinite(heatCapacityJPerK, 'heatCapacityJPerK');
  assertFinite(requestedHeatLossEnergyJ, 'requestedHeatLossEnergyJ');
  assertPositiveFinite(minimumTemperatureK, 'minimumTemperatureK');
  if (heatCapacityJPerK < 0) throw new Error('heatCapacityJPerK must be non-negative');
  if (requestedHeatLossEnergyJ <= 0) return requestedHeatLossEnergyJ;
  const minimumSensibleEnthalpyJ = packedSensibleEnthalpyJAtTemperature(minimumTemperatureK, heatCapacityJPerK);
  return Math.min(requestedHeatLossEnergyJ, Math.max(0, sensibleEnthalpyJ - minimumSensibleEnthalpyJ));
}

export function packedBoundedConductiveHeatTransferEnergyJ(
  temperatureAK,
  heatCapacityAJPerK,
  temperatureBK,
  heatCapacityBJPerK,
  conductanceWPerK,
  dt,
) {
  const values = [temperatureAK, heatCapacityAJPerK, temperatureBK, heatCapacityBJPerK, conductanceWPerK, dt];
  const labels = ['temperatureAK', 'heatCapacityAJPerK', 'temperatureBK', 'heatCapacityBJPerK', 'conductanceWPerK', 'dt'];
  values.forEach((value, index) => assertFinite(value, labels[index]));
  if (temperatureAK <= 0 || temperatureBK <= 0) throw new Error('heat-transfer temperatures must be positive');
  if (heatCapacityAJPerK < 0 || heatCapacityBJPerK < 0) throw new Error('heat-transfer capacities must be non-negative');
  if (conductanceWPerK < 0 || dt < 0) throw new Error('heat-transfer conductance and dt must be non-negative');
  if (heatCapacityAJPerK === 0 || heatCapacityBJPerK === 0 || conductanceWPerK === 0 || dt === 0) return 0;
  const deltaTemperatureK = temperatureAK - temperatureBK;
  if (deltaTemperatureK === 0) return 0;
  const requested = conductanceWPerK * deltaTemperatureK * dt;
  const equilibrium = deltaTemperatureK / (1 / heatCapacityAJPerK + 1 / heatCapacityBJPerK);
  return requested > 0
    ? Math.min(requested, Math.max(0, equilibrium))
    : Math.max(requested, Math.min(0, equilibrium));
}

/** Positive returned energy moves from the solid body into the gas body. */
export function exchangePackedHeatBetweenSolidAndGas(
  solidBody,
  gasBody,
  thermalTable,
  conductanceWPerK,
  dt,
) {
  if (!(solidBody instanceof PackedSolidRuntimeBody)) throw new Error('packed solid body is required');
  if (!(gasBody instanceof PackedGasRuntimeBody)) throw new Error('packed gas body is required');
  assertThermalTable(thermalTable);
  assertNonNegativeFinite(conductanceWPerK, 'conductanceWPerK');
  assertNonNegativeFinite(dt, 'dt');
  if (solidBody.totalMassKg() <= PACKED_GAS_TOLERANCE || gasBody.totalMassKg() <= PACKED_GAS_TOLERANCE || conductanceWPerK === 0 || dt === 0) {
    return 0;
  }
  const solidCapacity = thermalTable.heatCapacityJPerK(solidBody.solidState);
  const gasCapacity = packedGasHeatCapacityJPerK(gasBody.gasState, thermalTable);
  const transfer = packedBoundedConductiveHeatTransferEnergyJ(
    packedSolidBodyTemperatureK(solidBody, thermalTable),
    solidCapacity,
    packedGasBodyTemperatureK(gasBody, thermalTable),
    gasCapacity,
    conductanceWPerK,
    dt,
  );
  if (Math.abs(transfer) <= PACKED_THERMAL_ENERGY_TOLERANCE_J) return 0;
  const nextSolidEnthalpy = solidBody.sensibleEnthalpyJ - transfer;
  const nextGasEnthalpy = gasBody.sensibleEnthalpyJ + transfer;
  // Validate the resulting absolute temperatures before committing.
  packedTemperatureKFromSensibleEnthalpy(nextSolidEnthalpy, solidCapacity);
  packedTemperatureKFromSensibleEnthalpy(nextGasEnthalpy, gasCapacity);
  solidBody.sensibleEnthalpyJ = nextSolidEnthalpy;
  gasBody.sensibleEnthalpyJ = nextGasEnthalpy;
  return transfer;
}
