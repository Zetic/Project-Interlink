import { MATERIAL_FORMS } from '../core/materials/materialForms.js';
import {
  validateGasMaterialBody,
  validateGasMaterialState,
} from '../core/materials/gas/gasMaterialState.js';
import {
  compileSpeciesThermalTableForRuntime,
  createPackedMaterialIdTables,
} from './packedRuntimeCompiler.js';
import {
  PackedGasRuntimeBody,
  PackedGasRuntimeState,
} from './packedGasRuntime.js';

/** Compile canonical string-keyed gas composition into the shared runtime ID space. */
export function compileGasMaterialStateForRuntime(
  canonicalGasState,
  idTables = createPackedMaterialIdTables(),
) {
  validateGasMaterialState(canonicalGasState);
  const packedGasState = new PackedGasRuntimeState();
  for (const [speciesId, quantity] of Object.entries(canonicalGasState.speciesMassKg)) {
    packedGasState.pushSpecies(idTables.species.idFor(speciesId), quantity);
  }
  return { packedGasState, idTables };
}

/**
 * Compile a canonical gas MaterialBody. Sensible enthalpy is copied exactly;
 * temperature remains derived in both canonical and packed runtimes.
 */
export function compileGasMaterialBodyForRuntime(
  canonicalBody,
  idTables = createPackedMaterialIdTables(),
) {
  validateGasMaterialBody(canonicalBody);
  if (canonicalBody.physicalForm !== MATERIAL_FORMS.GAS) {
    throw new Error(`canonical gas body must have physical form '${MATERIAL_FORMS.GAS}'`);
  }
  const { packedGasState, idTables: resolvedTables } = compileGasMaterialStateForRuntime(
    canonicalBody.gasState,
    idTables,
  );
  const sensibleEnthalpyJ = canonicalBody.thermalState?.sensibleEnthalpyJ ?? 0;
  if (typeof sensibleEnthalpyJ !== 'number' || !Number.isFinite(sensibleEnthalpyJ)) {
    throw new Error('canonical gas sensible enthalpy must be finite');
  }
  return {
    packedGasBody: new PackedGasRuntimeBody(packedGasState, sensibleEnthalpyJ),
    idTables: resolvedTables,
  };
}

/**
 * Compile gas bodies first, then build the constant-Cp lookup from the resulting
 * shared species ID table. This ensures gas-only species such as water vapor are
 * present even when no solid population references them.
 */
export function compileGasBodiesAndThermalTableForRuntime(
  canonicalBodies,
  idTables = createPackedMaterialIdTables(),
) {
  if (!Array.isArray(canonicalBodies)) throw new Error('canonical gas bodies must be an array');
  const packedGasBodies = canonicalBodies.map(body => (
    compileGasMaterialBodyForRuntime(body, idTables).packedGasBody
  ));
  return {
    packedGasBodies,
    thermalTable: compileSpeciesThermalTableForRuntime(idTables),
    idTables,
  };
}

/** Populate a WASM gas body once during setup; no per-tick bridge loop is needed. */
export function populateWasmPackedGasBody(wasmGasBody, packedGasBody) {
  if (!wasmGasBody || typeof wasmGasBody.push_species !== 'function') {
    throw new Error('WASM packed gas body bridge is required');
  }
  if (!(packedGasBody instanceof PackedGasRuntimeBody)) {
    throw new Error('packed gas runtime body is required');
  }
  const columns = packedGasBody.gasState.toColumns();
  for (let index = 0; index < columns.quantities.length; index++) {
    wasmGasBody.push_species(columns.speciesIds[index], columns.quantities[index]);
  }
  if (typeof wasmGasBody.set_sensible_enthalpy_j !== 'function') {
    throw new Error('WASM packed gas body bridge must expose set_sensible_enthalpy_j');
  }
  wasmGasBody.set_sensible_enthalpy_j(packedGasBody.sensibleEnthalpyJ);
  return wasmGasBody;
}

/** Populate the Rust thermal table from the same canonical runtime ID mapping. */
export function populateWasmThermalGasTable(wasmThermalTable, idTables) {
  if (!wasmThermalTable || typeof wasmThermalTable.set_specific_heat_capacity_j_per_kg_k !== 'function') {
    throw new Error('WASM thermal gas table bridge is required');
  }
  const compiled = compileSpeciesThermalTableForRuntime(idTables);
  for (let runtimeId = 0; runtimeId < idTables.species.values.length; runtimeId++) {
    const speciesId = idTables.species.valueFor(runtimeId);
    if (speciesId == null) continue;
    try {
      const cp = compiled.specificHeatCapacityJPerKgK(runtimeId);
      wasmThermalTable.set_specific_heat_capacity_j_per_kg_k(runtimeId, cp);
    } catch (error) {
      if (!String(error?.message ?? error).includes('Thermal property coverage missing')) throw error;
    }
  }
  return wasmThermalTable;
}
