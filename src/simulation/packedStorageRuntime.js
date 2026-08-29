import { PACKED_SOLID_TOLERANCE, PackedSolidRuntimeState } from './packedRuntimeState.js';

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

export function clonePackedSolidState(source) {
  if (!(source instanceof PackedSolidRuntimeState)) throw new Error('packed solid state is required');
  const clone = new PackedSolidRuntimeState(Math.max(1, source.length));
  const columns = source.toColumns();
  for (let index = 0; index < columns.quantities.length; index++) {
    clone.pushFraction({
      speciesId: columns.speciesIds[index],
      sizeBinId: columns.sizeBinIds[index],
      liberationClassId: columns.liberationClassIds[index],
      textureProfileId: columns.textureProfileIds[index],
      quantity: columns.quantities[index],
    });
  }
  return clone;
}

export function addPackedSolidState(target, source, factor = 1) {
  if (!(target instanceof PackedSolidRuntimeState) || !(source instanceof PackedSolidRuntimeState)) {
    throw new Error('packed solid states are required');
  }
  assertNonNegativeFinite(factor, 'solid material add factor');
  if (factor <= PACKED_SOLID_TOLERANCE) return target;
  const columns = source.toColumns();
  for (let index = 0; index < columns.quantities.length; index++) {
    target.pushFraction({
      speciesId: columns.speciesIds[index],
      sizeBinId: columns.sizeBinIds[index],
      liberationClassId: columns.liberationClassIds[index],
      textureProfileId: columns.textureProfileIds[index],
      quantity: columns.quantities[index] * factor,
    });
  }
  return target;
}

export function scaledPackedSolidState(source, factor) {
  assertNonNegativeFinite(factor, 'solid material scale factor');
  const result = clonePackedSolidState(source);
  result.scaleInPlace(factor);
  return result;
}

export function proportionalPackedSolidShare(source, requestedQuantity) {
  assertNonNegativeFinite(requestedQuantity, 'requested solid quantity');
  const total = source.totalQuantity();
  if (total <= PACKED_SOLID_TOLERANCE || requestedQuantity <= PACKED_SOLID_TOLERANCE) {
    return new PackedSolidRuntimeState();
  }
  return scaledPackedSolidState(source, Math.min(1, requestedQuantity / total));
}

export function withdrawPackedSolidQuantity(source, requestedQuantity) {
  assertNonNegativeFinite(requestedQuantity, 'requested solid quantity');
  const total = source.totalQuantity();
  if (total <= PACKED_SOLID_TOLERANCE || requestedQuantity <= PACKED_SOLID_TOLERANCE) {
    return new PackedSolidRuntimeState();
  }
  const actual = Math.min(total, requestedQuantity);
  const fraction = actual / total;
  const withdrawn = scaledPackedSolidState(source, fraction);
  if (actual >= total - PACKED_SOLID_TOLERANCE) source.clear();
  else source.scaleInPlace(1 - fraction);
  return withdrawn;
}

export class PackedSolidRuntimeBody {
  constructor(solidState = new PackedSolidRuntimeState(), sensibleEnthalpyJ = 0) {
    if (!(solidState instanceof PackedSolidRuntimeState)) throw new Error('PackedSolidRuntimeBody requires packed solid state');
    assertFinite(sensibleEnthalpyJ, 'sensible enthalpy');
    this.solidState = clonePackedSolidState(solidState);
    this.sensibleEnthalpyJ = sensibleEnthalpyJ;
  }

  clone() {
    return new PackedSolidRuntimeBody(this.solidState, this.sensibleEnthalpyJ);
  }

  totalMassKg() {
    return this.solidState.totalQuantity();
  }

  specificSensibleEnthalpyJPerKg() {
    const mass = this.totalMassKg();
    return mass <= PACKED_SOLID_TOLERANCE ? 0 : this.sensibleEnthalpyJ / mass;
  }
}

export class PackedHopperRuntimeState {
  constructor(capacityKg, body = new PackedSolidRuntimeBody()) {
    assertPositiveFinite(capacityKg, 'hopper capacity');
    if (!(body instanceof PackedSolidRuntimeBody)) throw new Error('PackedHopperRuntimeState requires packed solid body');
    if (body.totalMassKg() > capacityKg + PACKED_SOLID_TOLERANCE) {
      throw new Error(`hopper initial contents (${body.totalMassKg()} kg) exceed capacity (${capacityKg} kg)`);
    }
    this.capacityKg = capacityKg;
    this.body = body.clone();
  }

  clone() {
    return new PackedHopperRuntimeState(this.capacityKg, this.body);
  }

  storedMassKg() {
    return this.body.totalMassKg();
  }

  freeCapacityKg() {
    return Math.max(0, this.capacityKg - this.storedMassKg());
  }

  receiveBody(incoming) {
    if (!(incoming instanceof PackedSolidRuntimeBody)) throw new Error('incoming packed solid body is required');
    const incomingMass = incoming.totalMassKg();
    if (incomingMass <= PACKED_SOLID_TOLERANCE) return 0;
    if (incomingMass > this.freeCapacityKg() + PACKED_SOLID_TOLERANCE) {
      throw new Error('hopper could not accept the requested material body atomically');
    }
    const staged = this.clone();
    addPackedSolidState(staged.body.solidState, incoming.solidState);
    const nextEnthalpy = staged.body.sensibleEnthalpyJ + incoming.sensibleEnthalpyJ;
    assertFinite(nextEnthalpy, 'hopper sensible enthalpy');
    staged.body.sensibleEnthalpyJ = nextEnthalpy;
    this.body = staged.body;
    return incomingMass;
  }

  receiveFlow(flow, dt, specificSensibleEnthalpyJPerKg = 0) {
    if (!(flow instanceof PackedSolidRuntimeState)) throw new Error('packed solid flow is required');
    assertPositiveFinite(dt, 'hopper receive dt');
    assertFinite(specificSensibleEnthalpyJPerKg, 'flow specific sensible enthalpy');
    const free = this.freeCapacityKg();
    if (free <= PACKED_SOLID_TOLERANCE) return 0;
    const totalRate = flow.totalQuantity();
    const requested = totalRate * dt;
    assertNonNegativeFinite(requested, 'requested inflow mass');
    if (requested <= PACKED_SOLID_TOLERANCE || totalRate <= PACKED_SOLID_TOLERANCE) return 0;
    const accepted = Math.min(requested, free);
    const secondsOfFlow = accepted / totalRate;
    const staged = this.clone();
    addPackedSolidState(staged.body.solidState, flow, secondsOfFlow);
    const energy = accepted * specificSensibleEnthalpyJPerKg;
    assertFinite(energy, 'accepted sensible enthalpy');
    const nextEnthalpy = staged.body.sensibleEnthalpyJ + energy;
    assertFinite(nextEnthalpy, 'hopper sensible enthalpy');
    staged.body.sensibleEnthalpyJ = nextEnthalpy;
    this.body = staged.body;
    return accepted;
  }

  withdrawRate(requestedRateKgPerSecond, dt) {
    assertNonNegativeFinite(requestedRateKgPerSecond, 'hopper withdrawal rate');
    assertPositiveFinite(dt, 'hopper withdrawal dt');
    const storedBefore = this.storedMassKg();
    if (storedBefore <= PACKED_SOLID_TOLERANCE || requestedRateKgPerSecond <= PACKED_SOLID_TOLERANCE) {
      return { body: new PackedSolidRuntimeBody(), actualMassKg: 0 };
    }
    const requested = requestedRateKgPerSecond * dt;
    assertNonNegativeFinite(requested, 'requested withdrawal mass');
    const staged = this.clone();
    const withdrawnState = withdrawPackedSolidQuantity(staged.body.solidState, requested);
    const actualMassKg = withdrawnState.totalQuantity();
    const withdrawnEnthalpyJ = staged.body.sensibleEnthalpyJ * (actualMassKg / storedBefore);
    assertFinite(withdrawnEnthalpyJ, 'withdrawn sensible enthalpy');
    staged.body.sensibleEnthalpyJ -= withdrawnEnthalpyJ;
    if (Math.abs(staged.body.sensibleEnthalpyJ) <= PACKED_SOLID_TOLERANCE) staged.body.sensibleEnthalpyJ = 0;
    this.body = staged.body;
    return {
      body: new PackedSolidRuntimeBody(withdrawnState, withdrawnEnthalpyJ),
      actualMassKg,
    };
  }
}

export function transferPackedHoppers(source, target, maxRateKgPerSecond, dt) {
  if (!(source instanceof PackedHopperRuntimeState) || !(target instanceof PackedHopperRuntimeState)) {
    throw new Error('packed hopper states are required');
  }
  assertNonNegativeFinite(maxRateKgPerSecond, 'transfer rate');
  assertPositiveFinite(dt, 'transfer dt');
  const transferable = Math.min(maxRateKgPerSecond * dt, source.storedMassKg(), target.freeCapacityKg());
  assertNonNegativeFinite(transferable, 'transferable mass');
  if (transferable <= PACKED_SOLID_TOLERANCE) return 0;

  const stagedSource = source.clone();
  const stagedTarget = target.clone();
  const withdrawal = stagedSource.withdrawRate(transferable / dt, dt);
  const accepted = stagedTarget.receiveBody(withdrawal.body);
  const tolerance = PACKED_SOLID_TOLERANCE * Math.max(1, accepted, withdrawal.actualMassKg);
  if (Math.abs(accepted - withdrawal.actualMassKg) > tolerance) {
    throw new Error('packed storage transfer failed conservation check');
  }
  source.body = stagedSource.body;
  target.body = stagedTarget.body;
  return accepted;
}
