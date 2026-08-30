
export class PackedGasRuntimeState {
  constructor() { this.species = new Map(); }
  pushSpecies(speciesId, quantity) {
    if (!Number.isInteger(speciesId) || speciesId < 0 || speciesId > 0xffff) throw new Error('gas speciesId must be a u16');
    if (!Number.isFinite(quantity) || quantity < 0) throw new Error('gas quantity must be finite and non-negative');
    if (quantity > 1e-12) this.species.set(speciesId, (this.species.get(speciesId) ?? 0) + quantity);
    return this;
  }
  toColumns() {
    const rows = [...this.species.entries()];
    return { speciesIds: Uint16Array.from(rows, row => row[0]), quantities: Float64Array.from(rows, row => row[1]) };
  }
}

export class PackedGasRuntimeBody {
  constructor(gasState = new PackedGasRuntimeState(), sensibleEnthalpyJ = 0) {
    if (!(gasState instanceof PackedGasRuntimeState)) throw new Error('PackedGasRuntimeBody requires packed gas state');
    if (!Number.isFinite(sensibleEnthalpyJ)) throw new Error('gas sensible enthalpy must be finite');
    this.gasState = gasState;
    this.sensibleEnthalpyJ = sensibleEnthalpyJ;
  }
}
