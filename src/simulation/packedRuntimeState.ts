
export const PACKED_SOLID_TOLERANCE = 1e-9;

function assertUnsigned(value, max, label) {
  if (!Number.isInteger(value) || value < 0 || value > max) throw new Error(`${label} must be an integer from 0 to ${max}`);
}

export class PackedSolidRuntimeState {
  constructor() { this.rows = new Map(); }
  get length() { return this.rows.size; }
  pushFraction({ speciesId, sizeBinId, liberationClassId, textureProfileId = 0, quantity }) {
    assertUnsigned(speciesId, 0xffff, 'speciesId');
    assertUnsigned(sizeBinId, 0xff, 'sizeBinId');
    assertUnsigned(liberationClassId, 0xff, 'liberationClassId');
    assertUnsigned(textureProfileId, 0xffffffff, 'textureProfileId');
    if (!Number.isFinite(quantity) || quantity < 0) throw new Error('solid material quantity must be finite and non-negative');
    if (quantity <= PACKED_SOLID_TOLERANCE) return this;
    const key = `${speciesId}|${sizeBinId}|${liberationClassId}|${textureProfileId}`;
    const existing = this.rows.get(key);
    if (existing) existing.quantity += quantity;
    else this.rows.set(key, { speciesId, sizeBinId, liberationClassId, textureProfileId, quantity });
    return this;
  }
  totalQuantity() { return [...this.rows.values()].reduce((sum, row) => sum + row.quantity, 0); }
  toColumns() {
    const rows = [...this.rows.values()];
    return {
      speciesIds: Uint16Array.from(rows, row => row.speciesId),
      sizeBinIds: Uint8Array.from(rows, row => row.sizeBinId),
      liberationClassIds: Uint8Array.from(rows, row => row.liberationClassId),
      textureProfileIds: Uint32Array.from(rows, row => row.textureProfileId),
      quantities: Float64Array.from(rows, row => row.quantity),
    };
  }
}
