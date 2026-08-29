import { iterateSolidFractions } from '../core/materials/solids/solidMaterialState.js';
import { PackedSolidRuntimeState } from './packedRuntimeState.js';
import { PackedHopperRuntimeState, PackedSolidRuntimeBody } from './packedStorageRuntime.js';

class RuntimeIdTable {
  constructor(maxId, startId = 0) {
    this.maxId = maxId;
    this.nextId = startId;
    this.ids = new Map();
    this.values = [];
  }

  idFor(value) {
    if (typeof value !== 'string' || value.length === 0) throw new Error('runtime ID source must be a non-empty string');
    const existing = this.ids.get(value);
    if (existing != null) return existing;
    if (this.nextId > this.maxId) throw new Error('runtime ID table capacity exceeded');
    const id = this.nextId++;
    this.ids.set(value, id);
    this.values[id] = value;
    return id;
  }

  valueFor(id) {
    return this.values[id] ?? null;
  }
}

export function createPackedMaterialIdTables() {
  return {
    species: new RuntimeIdTable(0xffff),
    sizeBin: new RuntimeIdTable(0xff),
    liberationClass: new RuntimeIdTable(0xff),
    textureProfile: new RuntimeIdTable(0xffffffff, 1),
  };
}

export function compileSolidMaterialStateForRuntime(canonicalState, idTables = createPackedMaterialIdTables()) {
  const packed = new PackedSolidRuntimeState();
  for (const fraction of iterateSolidFractions(canonicalState)) {
    packed.pushFraction({
      speciesId: idTables.species.idFor(fraction.speciesId),
      sizeBinId: idTables.sizeBin.idFor(fraction.sizeBinId),
      liberationClassId: idTables.liberationClass.idFor(fraction.liberationClassId),
      textureProfileId: fraction.textureProfileId == null ? 0 : idTables.textureProfile.idFor(fraction.textureProfileId),
      quantity: fraction.quantity,
    });
  }
  return { packed, idTables };
}

export function compileSolidMaterialBodyForRuntime(canonicalBody, idTables = createPackedMaterialIdTables()) {
  if (!canonicalBody?.solidState) throw new Error('canonical solid material body is required');
  const { packed, idTables: resolvedTables } = compileSolidMaterialStateForRuntime(canonicalBody.solidState, idTables);
  const sensibleEnthalpyJ = canonicalBody.thermalState?.sensibleEnthalpyJ ?? 0;
  if (typeof sensibleEnthalpyJ !== 'number' || !Number.isFinite(sensibleEnthalpyJ)) {
    throw new Error('canonical sensible enthalpy must be finite');
  }
  return {
    packedBody: new PackedSolidRuntimeBody(packed, sensibleEnthalpyJ),
    idTables: resolvedTables,
  };
}

export function compileHopperForRuntime(canonicalHopper, idTables = createPackedMaterialIdTables()) {
  if (!canonicalHopper?.materialBody) throw new Error('canonical Hopper material body is required');
  if (typeof canonicalHopper.capacityKg !== 'number' || !Number.isFinite(canonicalHopper.capacityKg) || canonicalHopper.capacityKg <= 0) {
    throw new Error('canonical Hopper capacityKg must be finite and positive');
  }
  const { packedBody, idTables: resolvedTables } = compileSolidMaterialBodyForRuntime(canonicalHopper.materialBody, idTables);
  return {
    packedHopper: new PackedHopperRuntimeState(canonicalHopper.capacityKg, packedBody),
    idTables: resolvedTables,
  };
}
