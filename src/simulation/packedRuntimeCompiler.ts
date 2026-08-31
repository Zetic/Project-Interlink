import { iterateSolidFractions } from '../core/materials/solids/solidMaterialState.js';
import { getMaterialSpecies } from '../core/materials/species/materialSpecies.js';
import { specificHeatCapacityJPerKgKForSpecies } from '../core/materials/properties/thermalProperties.js';
import { PackedSolidRuntimeState } from './packedRuntimeState.js';
import { PackedHopperRuntimeState, PackedSolidRuntimeBody } from './packedStorageRuntime.js';
import { PackedSpeciesThermalRuntimeTable } from './packedThermalRuntime.js';

class RuntimeIdTable {
  constructor(maxId, startId = 0, seedValues = []) {
    this.maxId = maxId;
    this.nextId = startId;
    this.ids = new Map();
    this.values = [];
    for (let id = 0; id < (seedValues?.length ?? 0); id++) {
      const value = seedValues[id];
      if (typeof value !== 'string' || value.length === 0) continue;
      if (id > maxId) throw new Error('runtime ID seed exceeds table capacity');
      this.ids.set(value, id);
      this.values[id] = value;
      this.nextId = Math.max(this.nextId, id + 1);
    }
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

/**
 * Recreate the execution-local material vocabulary from a previous Worker setup.
 * Existing IDs are never renumbered; newly encountered canonical identities append
 * to the corresponding table. This lets live topology edits preserve Rust-owned
 * material without translating every fraction back through JavaScript.
 */
export function createPackedMaterialIdTablesFromValues(values = {}) {
  return {
    species: new RuntimeIdTable(0xffff, 0, values.species ?? []),
    sizeBin: new RuntimeIdTable(0xff, 0, values.sizeBins ?? []),
    liberationClass: new RuntimeIdTable(0xff, 0, values.liberationClasses ?? []),
    textureProfile: new RuntimeIdTable(0xffffffff, 1, values.textureProfiles ?? []),
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

/**
 * Compile canonical MaterialSpecies constant-Cp values into the same runtime ID
 * space used by packed material fractions. Missing canonical Cp values remain
 * absent so thermal routing fails at the same point production would require
 * unsupported thermal-property coverage.
 */
export function compileSpeciesThermalTableForRuntime(idTables) {
  if (!idTables?.species?.values) throw new Error('packed material ID tables are required');
  const table = new PackedSpeciesThermalRuntimeTable(Math.max(16, idTables.species.values.length || 1));
  for (let runtimeId = 0; runtimeId < idTables.species.values.length; runtimeId++) {
    const speciesId = idTables.species.valueFor(runtimeId);
    if (speciesId == null) continue;
    const specificHeatCapacityJPerKgK = specificHeatCapacityJPerKgKForSpecies(getMaterialSpecies(speciesId));
    if (specificHeatCapacityJPerKgK == null) continue;
    table.setSpecificHeatCapacityJPerKgK(runtimeId, specificHeatCapacityJPerKgK);
  }
  return table;
}
