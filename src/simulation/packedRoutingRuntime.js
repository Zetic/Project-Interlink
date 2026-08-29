import { PACKED_SOLID_TOLERANCE, PackedSolidRuntimeState } from './packedRuntimeState.js';
import {
  PackedHopperRuntimeState,
  addPackedSolidState,
  scaledPackedSolidState,
} from './packedStorageRuntime.js';
import {
  PACKED_APPARATUS_TRANSFER_TOLERANCE_KG,
  PackedSolidRuntimeStream,
} from './packedProcessRuntime.js';
import { PackedSpeciesThermalRuntimeTable } from './packedThermalRuntime.js';

const THERMAL_ENERGY_TOLERANCE_J = 1e-6;

function assertFinite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function assertPositiveFinite(value, label) {
  assertFinite(value, label);
  if (value <= 0) throw new Error(`${label} must be positive`);
}

function outputSpecificSensibleEnthalpies(inputBodies, outputStates, thermal) {
  if (!(thermal instanceof PackedSpeciesThermalRuntimeTable)) throw new Error('packed thermal table is required');
  const totalInputSensibleEnthalpyJ = inputBodies.reduce((sum, body) => sum + body.sensibleEnthalpyJ, 0);
  assertFinite(totalInputSensibleEnthalpyJ, 'total input sensible enthalpy');
  if (Math.abs(totalInputSensibleEnthalpyJ) <= THERMAL_ENERGY_TOLERANCE_J) {
    return outputStates.map(() => 0);
  }
  const totalInputHeatCapacityJPerK = inputBodies.reduce(
    (sum, body) => sum + thermal.heatCapacityJPerK(body.solidState),
    0,
  );
  if (!(totalInputHeatCapacityJPerK > 0) || !Number.isFinite(totalInputHeatCapacityJPerK)) {
    throw new Error('input thermal heat capacity must be finite and positive');
  }
  const deltaTemperatureK = totalInputSensibleEnthalpyJ / totalInputHeatCapacityJPerK;
  return outputStates.map(state => {
    const massRate = state.totalQuantity();
    if (massRate <= PACKED_SOLID_TOLERANCE) return 0;
    const capacityRate = thermal.heatCapacityJPerK(state);
    const specific = deltaTemperatureK * capacityRate / massRate;
    assertFinite(specific, 'output specific sensible enthalpy');
    return specific;
  });
}

function assertAccepted(expectedKg, acceptedKg, context) {
  const tolerance = PACKED_APPARATUS_TRANSFER_TOLERANCE_KG * Math.max(1, expectedKg);
  if (Math.abs(expectedKg - acceptedKg) > tolerance) {
    throw new Error(`${context} could not commit its planned output atomically`);
  }
}

function commitHopper(target, staged) {
  target.body = staged.body;
}

export class PackedSplitterRuntime {
  constructor({ splitFractionToA, throughputKgPerSecond, enabled = false } = {}) {
    if (typeof splitFractionToA !== 'number' || !Number.isFinite(splitFractionToA) || splitFractionToA < 0 || splitFractionToA > 1) {
      throw new Error('Splitter split fraction must be finite and within [0, 1]');
    }
    assertPositiveFinite(throughputKgPerSecond, 'Splitter throughput');
    if (typeof enabled !== 'boolean') throw new Error('Splitter enabled must be boolean');
    this.splitFractionToA = splitFractionToA;
    this.throughputKgPerSecond = throughputKgPerSecond;
    this.enabled = enabled;
    this.inputStream = new PackedSolidRuntimeStream();
    this.outputAStream = new PackedSolidRuntimeStream();
    this.outputBStream = new PackedSolidRuntimeStream();
    this.operatingState = enabled ? 'idle' : 'off';
    this.lastError = null;
  }

  setEnabled(enabled) {
    if (typeof enabled !== 'boolean') throw new Error('Splitter enabled must be boolean');
    this.enabled = enabled;
    if (!enabled) this.operatingState = 'off';
    else if (this.operatingState === 'off') this.operatingState = 'idle';
  }

  #finish(operatingState, transferredMassKg, outputAMassKg = 0, outputBMassKg = 0) {
    this.operatingState = operatingState;
    return { operatingState, transferredMassKg, outputAMassKg, outputBMassKg };
  }

  tickHopperToHoppers(source, outputA, outputB, thermal, dt) {
    if (!(source instanceof PackedHopperRuntimeState)
      || !(outputA instanceof PackedHopperRuntimeState)
      || !(outputB instanceof PackedHopperRuntimeState)) {
      throw new Error('Packed Splitter requires packed Hopper feed and outputs');
    }
    assertPositiveFinite(dt, 'Splitter simulation dt');
    this.inputStream.clear();
    this.outputAStream.clear();
    this.outputBStream.clear();
    this.lastError = null;

    if (!this.enabled) return this.#finish('off', 0);
    if (source === outputA || source === outputB) {
      this.lastError = 'Splitter outputs must use storage distinct from the feed Hopper';
      return this.#finish('blocked', 0);
    }

    const storedMassKg = source.storedMassKg();
    if (storedMassKg <= PACKED_SOLID_TOLERANCE) return this.#finish('idle', 0);

    const candidateRate = Math.min(this.throughputKgPerSecond, storedMassKg / dt);
    const requestedAKg = candidateRate * this.splitFractionToA * dt;
    const requestedBKg = candidateRate * (1 - this.splitFractionToA) * dt;
    const scaleA = requestedAKg <= PACKED_APPARATUS_TRANSFER_TOLERANCE_KG
      ? 1
      : outputA.freeCapacityKg() / requestedAKg;
    const scaleB = requestedBKg <= PACKED_APPARATUS_TRANSFER_TOLERANCE_KG
      ? 1
      : outputB.freeCapacityKg() / requestedBKg;
    const capacityScale = Math.max(0, Math.min(1, scaleA, scaleB));
    if (capacityScale <= PACKED_APPARATUS_TRANSFER_TOLERANCE_KG) {
      this.lastError = 'One or more required Splitter outputs are full';
      return this.#finish('blocked', 0);
    }

    const stagedSource = source.clone();
    const stagedA = outputA.clone();
    const stagedB = outputB.clone();
    const withdrawal = stagedSource.withdrawRate(candidateRate * capacityScale, dt);
    if (withdrawal.actualMassKg <= PACKED_APPARATUS_TRANSFER_TOLERANCE_KG) {
      return this.#finish('idle', 0);
    }

    const actualFeed = scaledPackedSolidState(withdrawal.body.solidState, 1 / dt);
    const outputAFlow = scaledPackedSolidState(actualFeed, this.splitFractionToA);
    const outputBFlow = scaledPackedSolidState(actualFeed, 1 - this.splitFractionToA);
    const [specificA, specificB] = outputSpecificSensibleEnthalpies(
      [withdrawal.body],
      [outputAFlow, outputBFlow],
      thermal,
    );
    const expectedAKg = outputAFlow.totalQuantity() * dt;
    const expectedBKg = outputBFlow.totalQuantity() * dt;
    const acceptedA = stagedA.receiveFlow(outputAFlow, dt, specificA);
    const acceptedB = stagedB.receiveFlow(outputBFlow, dt, specificB);
    assertAccepted(expectedAKg, acceptedA, 'Splitter output A');
    assertAccepted(expectedBKg, acceptedB, 'Splitter output B');

    commitHopper(source, stagedSource);
    commitHopper(outputA, stagedA);
    commitHopper(outputB, stagedB);
    this.inputStream.setFlow(actualFeed, withdrawal.body.specificSensibleEnthalpyJPerKg());
    this.outputAStream.setFlow(outputAFlow, specificA);
    this.outputBStream.setFlow(outputBFlow, specificB);
    return this.#finish('running', withdrawal.actualMassKg, acceptedA, acceptedB);
  }
}

export class PackedMergerRuntime {
  constructor({ throughputKgPerSecond, enabled = false } = {}) {
    assertPositiveFinite(throughputKgPerSecond, 'Material Merger throughput');
    if (typeof enabled !== 'boolean') throw new Error('Material Merger enabled must be boolean');
    this.throughputKgPerSecond = throughputKgPerSecond;
    this.enabled = enabled;
    this.inputAStream = new PackedSolidRuntimeStream();
    this.inputBStream = new PackedSolidRuntimeStream();
    this.outputStream = new PackedSolidRuntimeStream();
    this.operatingState = enabled ? 'idle' : 'off';
    this.lastError = null;
  }

  setEnabled(enabled) {
    if (typeof enabled !== 'boolean') throw new Error('Material Merger enabled must be boolean');
    this.enabled = enabled;
    if (!enabled) this.operatingState = 'off';
    else if (this.operatingState === 'off') this.operatingState = 'idle';
  }

  #finish(operatingState, inputAMassKg = 0, inputBMassKg = 0, outputMassKg = 0) {
    this.operatingState = operatingState;
    return { operatingState, inputAMassKg, inputBMassKg, outputMassKg };
  }

  tickHoppersToHopper(inputA, inputB, output, thermal, dt) {
    if (!(inputA instanceof PackedHopperRuntimeState)
      || !(inputB instanceof PackedHopperRuntimeState)
      || !(output instanceof PackedHopperRuntimeState)) {
      throw new Error('Packed Material Merger requires packed Hopper inputs and output');
    }
    assertPositiveFinite(dt, 'Material Merger simulation dt');
    this.inputAStream.clear();
    this.inputBStream.clear();
    this.outputStream.clear();
    this.lastError = null;

    if (!this.enabled) return this.#finish('off');
    if (output === inputA || output === inputB) {
      this.lastError = 'Material Merger output storage must be distinct from both input Hoppers';
      return this.#finish('blocked');
    }

    const storedA = inputA.storedMassKg();
    const storedB = inputB.storedMassKg();
    const totalStored = storedA + storedB;
    if (totalStored <= PACKED_SOLID_TOLERANCE) return this.#finish('idle');

    const candidateTotalRate = Math.min(this.throughputKgPerSecond, totalStored / dt);
    const candidateRateA = candidateTotalRate * (storedA / totalStored);
    const candidateRateB = candidateTotalRate * (storedB / totalStored);
    const requestedOutputKg = candidateTotalRate * dt;
    const capacityScale = requestedOutputKg <= PACKED_APPARATUS_TRANSFER_TOLERANCE_KG
      ? 1
      : Math.max(0, Math.min(1, output.freeCapacityKg() / requestedOutputKg));
    if (capacityScale <= PACKED_APPARATUS_TRANSFER_TOLERANCE_KG) {
      this.lastError = 'Material Merger product output is full';
      return this.#finish('blocked');
    }

    const stagedA = inputA.clone();
    const stagedB = inputB.clone();
    const stagedOutput = output.clone();
    const withdrawalA = stagedA.withdrawRate(candidateRateA * capacityScale, dt);
    const withdrawalB = stagedB.withdrawRate(candidateRateB * capacityScale, dt);
    const totalWithdrawn = withdrawalA.actualMassKg + withdrawalB.actualMassKg;
    if (totalWithdrawn <= PACKED_APPARATUS_TRANSFER_TOLERANCE_KG) return this.#finish('idle');

    const actualA = scaledPackedSolidState(withdrawalA.body.solidState, 1 / dt);
    const actualB = scaledPackedSolidState(withdrawalB.body.solidState, 1 / dt);
    const product = new PackedSolidRuntimeState(Math.max(1, actualA.length + actualB.length));
    addPackedSolidState(product, actualA);
    addPackedSolidState(product, actualB);
    const [productSpecific] = outputSpecificSensibleEnthalpies(
      [withdrawalA.body, withdrawalB.body],
      [product],
      thermal,
    );
    const expectedOutputKg = product.totalQuantity() * dt;
    const acceptedOutputKg = stagedOutput.receiveFlow(product, dt, productSpecific);
    assertAccepted(expectedOutputKg, acceptedOutputKg, 'Material Merger product');

    commitHopper(inputA, stagedA);
    commitHopper(inputB, stagedB);
    commitHopper(output, stagedOutput);
    this.inputAStream.setFlow(actualA, withdrawalA.body.specificSensibleEnthalpyJPerKg());
    this.inputBStream.setFlow(actualB, withdrawalB.body.specificSensibleEnthalpyJPerKg());
    this.outputStream.setFlow(product, productSpecific);
    return this.#finish('running', withdrawalA.actualMassKg, withdrawalB.actualMassKg, acceptedOutputKg);
  }
}
