export const PACKED_SOLID_TOLERANCE = 1e-9;

function assertUnsigned(value, max, label) {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new Error(`${label} must be an integer from 0 to ${max}`);
  }
}

function assertQuantity(quantity) {
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0) {
    throw new Error('solid material quantity must be finite and non-negative');
  }
}

function descriptorKey(speciesId, sizeBinId, liberationClassId, textureProfileId) {
  return (BigInt(speciesId) << 48n)
    | (BigInt(sizeBinId) << 40n)
    | (BigInt(liberationClassId) << 32n)
    | BigInt(textureProfileId);
}

/**
 * Data-oriented JavaScript fallback for the Rust/WASM execution contract.
 *
 * This is runtime state only. Human-readable Blueprint/material state remains
 * string-ID based for authoring, saves, debugging and tests; a compiler maps
 * those values to runtime-local numeric IDs before they enter this structure.
 */
export class PackedSolidRuntimeState {
  constructor(initialCapacity = 16) {
    if (!Number.isInteger(initialCapacity) || initialCapacity < 1) {
      throw new Error('initialCapacity must be a positive integer');
    }
    this.length = 0;
    this.capacity = initialCapacity;
    this.speciesIds = new Uint16Array(initialCapacity);
    this.sizeBinIds = new Uint8Array(initialCapacity);
    this.liberationClassIds = new Uint8Array(initialCapacity);
    this.textureProfileIds = new Uint32Array(initialCapacity);
    this.quantities = new Float64Array(initialCapacity);
    this.indexByDescriptor = new Map();
  }

  clear() {
    this.length = 0;
    this.indexByDescriptor.clear();
  }

  isEmpty() {
    return this.length === 0;
  }

  pushFraction({
    speciesId,
    sizeBinId,
    liberationClassId,
    textureProfileId = 0,
    quantity,
  }) {
    assertUnsigned(speciesId, 0xffff, 'speciesId');
    assertUnsigned(sizeBinId, 0xff, 'sizeBinId');
    assertUnsigned(liberationClassId, 0xff, 'liberationClassId');
    assertUnsigned(textureProfileId, 0xffffffff, 'textureProfileId');
    assertQuantity(quantity);
    if (quantity <= PACKED_SOLID_TOLERANCE) return this;

    const key = descriptorKey(speciesId, sizeBinId, liberationClassId, textureProfileId);
    const existing = this.indexByDescriptor.get(key);
    if (existing != null) {
      this.quantities[existing] += quantity;
      return this;
    }

    this.#ensureCapacity(this.length + 1);
    const index = this.length++;
    this.speciesIds[index] = speciesId;
    this.sizeBinIds[index] = sizeBinId;
    this.liberationClassIds[index] = liberationClassId;
    this.textureProfileIds[index] = textureProfileId;
    this.quantities[index] = quantity;
    this.indexByDescriptor.set(key, index);
    return this;
  }

  totalQuantity() {
    let total = 0;
    for (let index = 0; index < this.length; index++) {
      const quantity = this.quantities[index];
      if (quantity > PACKED_SOLID_TOLERANCE) total += quantity;
    }
    return total;
  }

  scaleInPlace(factor) {
    if (typeof factor !== 'number' || !Number.isFinite(factor) || factor < 0) {
      throw new Error('solid material scale factor must be finite and non-negative');
    }
    if (factor <= PACKED_SOLID_TOLERANCE) {
      this.clear();
      return this;
    }

    let writeIndex = 0;
    this.indexByDescriptor.clear();
    for (let readIndex = 0; readIndex < this.length; readIndex++) {
      const quantity = this.quantities[readIndex] * factor;
      if (quantity <= PACKED_SOLID_TOLERANCE) continue;

      if (writeIndex !== readIndex) {
        this.speciesIds[writeIndex] = this.speciesIds[readIndex];
        this.sizeBinIds[writeIndex] = this.sizeBinIds[readIndex];
        this.liberationClassIds[writeIndex] = this.liberationClassIds[readIndex];
        this.textureProfileIds[writeIndex] = this.textureProfileIds[readIndex];
      }
      this.quantities[writeIndex] = quantity;
      this.indexByDescriptor.set(
        descriptorKey(
          this.speciesIds[writeIndex],
          this.sizeBinIds[writeIndex],
          this.liberationClassIds[writeIndex],
          this.textureProfileIds[writeIndex],
        ),
        writeIndex,
      );
      writeIndex++;
    }
    this.length = writeIndex;
    return this;
  }

  toColumns() {
    return {
      speciesIds: this.speciesIds.slice(0, this.length),
      sizeBinIds: this.sizeBinIds.slice(0, this.length),
      liberationClassIds: this.liberationClassIds.slice(0, this.length),
      textureProfileIds: this.textureProfileIds.slice(0, this.length),
      quantities: this.quantities.slice(0, this.length),
    };
  }

  #ensureCapacity(required) {
    if (required <= this.capacity) return;
    let nextCapacity = this.capacity;
    while (nextCapacity < required) nextCapacity *= 2;

    const speciesIds = new Uint16Array(nextCapacity);
    const sizeBinIds = new Uint8Array(nextCapacity);
    const liberationClassIds = new Uint8Array(nextCapacity);
    const textureProfileIds = new Uint32Array(nextCapacity);
    const quantities = new Float64Array(nextCapacity);
    speciesIds.set(this.speciesIds.subarray(0, this.length));
    sizeBinIds.set(this.sizeBinIds.subarray(0, this.length));
    liberationClassIds.set(this.liberationClassIds.subarray(0, this.length));
    textureProfileIds.set(this.textureProfileIds.subarray(0, this.length));
    quantities.set(this.quantities.subarray(0, this.length));

    this.capacity = nextCapacity;
    this.speciesIds = speciesIds;
    this.sizeBinIds = sizeBinIds;
    this.liberationClassIds = liberationClassIds;
    this.textureProfileIds = textureProfileIds;
    this.quantities = quantities;
  }
}
