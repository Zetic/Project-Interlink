
import { PackedSolidRuntimeState } from './packedRuntimeState.js';

export class PackedSolidRuntimeBody {
  constructor(solidState = new PackedSolidRuntimeState(), sensibleEnthalpyJ = 0) {
    if (!(solidState instanceof PackedSolidRuntimeState)) throw new Error('PackedSolidRuntimeBody requires packed solid state');
    if (!Number.isFinite(sensibleEnthalpyJ)) throw new Error('sensible enthalpy must be finite');
    this.solidState = solidState;
    this.sensibleEnthalpyJ = sensibleEnthalpyJ;
  }
  totalMassKg() { return this.solidState.totalQuantity(); }
}

export class PackedHopperRuntimeState {
  constructor(capacityKg, body = new PackedSolidRuntimeBody()) {
    if (!Number.isFinite(capacityKg) || capacityKg <= 0) throw new Error('hopper capacity must be positive');
    if (!(body instanceof PackedSolidRuntimeBody)) throw new Error('PackedHopperRuntimeState requires packed solid body');
    if (body.totalMassKg() > capacityKg + 1e-9) throw new Error(`hopper initial contents (${body.totalMassKg()} kg) exceed capacity (${capacityKg} kg)`);
    this.capacityKg = capacityKg;
    this.body = body;
  }
}
