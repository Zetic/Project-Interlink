import { listLiberationClasses } from '../core/materials/solids/liberationClasses.js';
import {
  getParticleSizeBin,
  listParticleSizeBins,
} from '../core/materials/solids/particleSizeBins.js';
import { magneticResponseForSpecies } from '../core/materials/properties/magneticProperties.js';
import { specificHeatCapacityJPerKgKForSpecies } from '../core/materials/properties/thermalProperties.js';
import { getMaterialSpecies } from '../core/materials/species/materialSpecies.js';

const LEGACY_PARTICLE_SIZE_BIN_IDS = Object.freeze([
  'lt-0.032mm',
  'lt-1mm',
  '120mm-plus',
]);

// Preserve the existing Magnetic Separator process-size response exactly. The
// values are compiled once as immutable runtime metadata; Rust owns the recovery
// equation, field curve, liberation response, and carryover calculation.
const MAGNETIC_SIZE_SUITABILITY_BY_BIN_ID = Object.freeze({
  'lt-0.032mm': 0.05,
  '0.032-0.063mm': 0.10,
  '0.063-0.125mm': 0.15,
  '0.125-0.25mm': 0.20,
  '0.25-0.5mm': 0.30,
  '0.5-1mm': 0.40,
  'lt-1mm': 0.40,
  '1-5mm': 0.65,
  '5-15mm': 0.90,
  '15-25mm': 1.00,
});

function assertIdTables(idTables) {
  if (!idTables?.species?.idFor || !idTables?.sizeBin?.idFor
    || !idTables?.liberationClass?.idFor) {
    throw new Error('packed material ID tables are required');
  }
}

function compileSizeVocabulary(idTables) {
  const rows = [];
  for (const bin of listParticleSizeBins()) {
    rows.push({
      runtimeId: idTables.sizeBin.idFor(bin.id),
      canonicalId: bin.id,
      maxMm: bin.maxMm,
      magneticSuitability: MAGNETIC_SIZE_SUITABILITY_BY_BIN_ID[bin.id] ?? 0,
    });
  }
  for (const binId of LEGACY_PARTICLE_SIZE_BIN_IDS) {
    const bin = getParticleSizeBin(binId);
    if (!bin) throw new Error(`Missing legacy particle-size bin '${binId}'`);
    rows.push({
      runtimeId: idTables.sizeBin.idFor(bin.id),
      canonicalId: bin.id,
      maxMm: bin.maxMm,
      magneticSuitability: MAGNETIC_SIZE_SUITABILITY_BY_BIN_ID[bin.id] ?? 0,
    });
  }
  return rows;
}

function compileLiberationVocabulary(idTables) {
  return listLiberationClasses().map(item => ({
    runtimeId: idTables.liberationClass.idFor(item.id),
    canonicalId: item.id,
    recoveryFactor: item.recoveryFactor,
  }));
}

function compileSpeciesProperties(idTables) {
  const magneticResponses = [];
  const thermalProperties = [];
  for (let runtimeId = 0; runtimeId < idTables.species.values.length; runtimeId += 1) {
    const canonicalId = idTables.species.valueFor(runtimeId);
    if (canonicalId == null) continue;
    const species = getMaterialSpecies(canonicalId);
    const magnetic = magneticResponseForSpecies(species);
    if (magnetic) {
      magneticResponses.push({
        runtimeId,
        canonicalId,
        normalizedSeparationCoefficient: magnetic.normalizedSeparationCoefficient,
      });
    }
    const specificHeatCapacityJPerKgK = specificHeatCapacityJPerKgKForSpecies(species);
    if (specificHeatCapacityJPerKgK != null) {
      thermalProperties.push({
        runtimeId,
        canonicalId,
        specificHeatCapacityJPerKgK,
      });
    }
  }
  return { magneticResponses, thermalProperties };
}

/**
 * Compile Screen/Magnetic-Separator metadata into the runtime-local numeric ID
 * space. Call this after the relevant material states have been compiled so all
 * species present in those states already have runtime IDs.
 */
export function compileSeparationTablesForRuntime(idTables) {
  assertIdTables(idTables);
  const sizeBins = compileSizeVocabulary(idTables);
  const liberationClasses = compileLiberationVocabulary(idTables);
  const { magneticResponses, thermalProperties } = compileSpeciesProperties(idTables);
  return {
    sizeBins,
    liberationClasses,
    magneticResponses,
    thermalProperties,
    idTables,
  };
}
