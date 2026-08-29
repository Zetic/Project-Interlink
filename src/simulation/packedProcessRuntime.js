import { PackedSolidRuntimeState } from './packedRuntimeState.js';
import {
  PackedHopperRuntimeState,
  clonePackedSolidState,
  scaledPackedSolidState,
} from './packedStorageRuntime.js';

export const PACKED_APPARATUS_TRANSFER_TOLERANCE_KG = 1e-8;

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

/** Continuous packed solid stream. Quantities are kg/s. */
export class PackedSolidRuntimeStream {
  constructor(solidState = new PackedSolidRuntimeState(), specificSensibleEnthalpyJPerKg = 0) {
    if (!(solidState instanceof PackedSolidRuntimeState)) throw new Error('PackedSolidRuntimeStream requires packed solid state');
    assertFinite(specificSensibleEnthalpyJPerKg, 'stream specific sensible enthalpy');
    this.solidState = clonePackedSolidState(solidState);
    this.specificSensibleEnthalpyJPerKg = specificSensibleEnthalpyJPerKg;
    this.cachedTotalMassFlowKgPerSecond = this.solidState.totalQuantity();
  }

  clear() {
    this.solidState.clear();
    this.specificSensibleEnthalpyJPerKg = 0;
    this.cachedTotalMassFlowKgPerSecond = 0;
  }

  setFlow(solidState, specificSensibleEnthalpyJPerKg = 0) {
    if (!(solidState instanceof PackedSolidRuntimeState)) throw new Error('packed stream flow state is required');
    assertFinite(specificSensibleEnthalpyJPerKg, 'stream specific sensible enthalpy');
    this.solidState = clonePackedSolidState(solidState);
    this.specificSensibleEnthalpyJPerKg = specificSensibleEnthalpyJPerKg;
    this.cachedTotalMassFlowKgPerSecond = this.solidState.totalQuantity();
    return this;
  }

  totalMassFlowKgPerSecond() {
    return this.cachedTotalMassFlowKgPerSecond;
  }
}

/**
 * Typed-array parity implementation for the Rust Hopper -> Feeder -> Hopper
 * execution contract. Production remains on the canonical JS apparatus until
 * the Rust Worker owns enough runtime state to switch authority safely.
 */
export class PackedFeederRuntime {
  constructor({
    flowRateKgPerSecond,
    throughputKgPerSecond,
    enabled = false,
  } = {}) {
    assertNonNegativeFinite(flowRateKgPerSecond, 'Feeder flow rate');
    assertPositiveFinite(throughputKgPerSecond, 'Feeder throughput');
    if (typeof enabled !== 'boolean') throw new Error('Feeder enabled must be boolean');
    this.flowRateKgPerSecond = flowRateKgPerSecond;
    this.throughputKgPerSecond = throughputKgPerSecond;
    this.enabled = enabled;
    this.inputStream = new PackedSolidRuntimeStream();
    this.outputStream = new PackedSolidRuntimeStream();
    this.lastError = null;
    this.operatingState = enabled ? 'idle' : 'off';
  }

  setEnabled(enabled) {
    if (typeof enabled !== 'boolean') throw new Error('Feeder enabled must be boolean');
    this.enabled = enabled;
    if (!enabled) this.operatingState = 'off';
    else if (this.operatingState === 'off') this.operatingState = 'idle';
  }

  setFlowRateKgPerSecond(value) {
    assertNonNegativeFinite(value, 'Feeder flow rate');
    this.flowRateKgPerSecond = value;
  }

  setThroughputKgPerSecond(value) {
    assertPositiveFinite(value, 'Feeder throughput');
    this.throughputKgPerSecond = value;
  }

  #finish(operatingState, transferredMassKg, dt) {
    this.operatingState = operatingState;
    return {
      operatingState,
      transferredMassKg,
      actualRateKgPerSecond: transferredMassKg <= PACKED_APPARATUS_TRANSFER_TOLERANCE_KG
        ? 0
        : transferredMassKg / dt,
    };
  }

  tickHopperToHopper(source, target, dt) {
    if (!(source instanceof PackedHopperRuntimeState) || !(target instanceof PackedHopperRuntimeState)) {
      throw new Error('Packed Feeder requires packed Hopper source and target');
    }
    assertPositiveFinite(dt, 'Feeder simulation dt');
    this.inputStream.clear();
    this.outputStream.clear();
    this.lastError = null;

    if (!this.enabled) return this.#finish('off', 0, dt);
    if (source === target) {
      this.lastError = 'Feeder output must be distinct from the feed Hopper';
      return this.#finish('blocked', 0, dt);
    }

    const storedMassKg = source.storedMassKg();
    if (storedMassKg <= 1e-9) return this.#finish('idle', 0, dt);
    if (this.flowRateKgPerSecond <= PACKED_APPARATUS_TRANSFER_TOLERANCE_KG) {
      return this.#finish('idle', 0, dt);
    }

    const availableOutputCapacityKg = target.freeCapacityKg();
    if (availableOutputCapacityKg <= PACKED_APPARATUS_TRANSFER_TOLERANCE_KG) {
      this.lastError = 'Feeder product output is full';
      return this.#finish('blocked', 0, dt);
    }

    const plannedRate = Math.min(
      this.flowRateKgPerSecond,
      this.throughputKgPerSecond,
      storedMassKg / dt,
      availableOutputCapacityKg / dt,
    );
    if (plannedRate <= PACKED_APPARATUS_TRANSFER_TOLERANCE_KG) {
      return this.#finish('idle', 0, dt);
    }

    const stagedSource = source.clone();
    const stagedTarget = target.clone();
    const withdrawal = stagedSource.withdrawRate(plannedRate, dt);
    if (withdrawal.actualMassKg <= PACKED_APPARATUS_TRANSFER_TOLERANCE_KG) {
      return this.#finish('idle', 0, dt);
    }

    const specificSensibleEnthalpyJPerKg = withdrawal.body.specificSensibleEnthalpyJPerKg();
    const actualFlow = scaledPackedSolidState(withdrawal.body.solidState, 1 / dt);
    const acceptedKg = stagedTarget.receiveFlow(actualFlow, dt, specificSensibleEnthalpyJPerKg);
    const tolerance = PACKED_APPARATUS_TRANSFER_TOLERANCE_KG * Math.max(1, withdrawal.actualMassKg);
    if (Math.abs(acceptedKg - withdrawal.actualMassKg) > tolerance) {
      throw new Error('Feeder product could not commit its planned output atomically');
    }

    source.body = stagedSource.body;
    target.body = stagedTarget.body;
    this.inputStream.setFlow(actualFlow, specificSensibleEnthalpyJPerKg);
    this.outputStream.setFlow(actualFlow, specificSensibleEnthalpyJPerKg);
    return this.#finish('running', withdrawal.actualMassKg, dt);
  }
}
