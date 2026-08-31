import { listLiberationClasses } from '../core/materials/solids/liberationClasses.js';
import {
  getParticleSizeBin,
  listParticleSizeBins,
  particleSizeBinIdForMm,
} from '../core/materials/solids/particleSizeBins.js';

const LEGACY_PARTICLE_SIZE_BIN_IDS = Object.freeze([
  'lt-0.032mm',
  'lt-1mm',
  '120mm-plus',
]);

function assertIdTables(idTables) {
  if (!idTables?.species?.idFor || !idTables?.sizeBin?.idFor
    || !idTables?.liberationClass?.idFor || !idTables?.textureProfile?.idFor) {
    throw new Error('packed material ID tables are required');
  }
}

function compileSizeVocabulary(idTables) {
  const rows = [];
  for (const [orderIndex, bin] of listParticleSizeBins().entries()) {
    rows.push({
      runtimeId: idTables.sizeBin.idFor(bin.id),
      canonicalId: bin.id,
      orderIndex,
      maxMm: bin.maxMm,
      representativeMm: bin.representativeMm,
      canonical: true,
    });
  }
  for (const binId of LEGACY_PARTICLE_SIZE_BIN_IDS) {
    const bin = getParticleSizeBin(binId);
    if (!bin) throw new Error(`Missing legacy particle-size bin '${binId}'`);
    rows.push({
      runtimeId: idTables.sizeBin.idFor(bin.id),
      canonicalId: bin.id,
      orderIndex: bin.index,
      maxMm: bin.maxMm,
      representativeMm: bin.representativeMm,
      canonical: false,
    });
  }
  return rows;
}

function compileLiberationVocabulary(idTables) {
  return listLiberationClasses().map((item, orderIndex) => ({
    runtimeId: idTables.liberationClass.idFor(item.id),
    canonicalId: item.id,
    orderIndex,
  }));
}

function compileTextureProfiles(canonicalState, idTables) {
  const textures = [];
  const properties = [];
  for (const [profileId, profile] of Object.entries(canonicalState?.textureProfiles ?? {})) {
    const runtimeTextureId = idTables.textureProfile.idFor(profileId);
    for (const [speciesId, texture] of Object.entries(profile.speciesTextures ?? {})) {
      textures.push({
        textureProfileId: runtimeTextureId,
        speciesId: idTables.species.idFor(speciesId),
        canonicalTextureProfileId: profileId,
        canonicalSpeciesId: speciesId,
        d10Um: texture.grainSizeUm.d10,
        d50Um: texture.grainSizeUm.d50,
        d90Um: texture.grainSizeUm.d90,
        free: texture.occurrenceModes.free,
        boundary: texture.occurrenceModes.boundary,
        intergrown: texture.occurrenceModes.intergrown,
        included: texture.occurrenceModes.included,
      });
    }
    if (profile.comminutionProperties) {
      properties.push({
        textureProfileId: runtimeTextureId,
        canonicalTextureProfileId: profileId,
        bondCrushingWorkIndexKWhPerT: profile.comminutionProperties.bondCrushingWorkIndexKWhPerT,
        bondBallMillWorkIndexKWhPerT: profile.comminutionProperties.bondBallMillWorkIndexKWhPerT,
        bondAbrasionIndex: profile.comminutionProperties.bondAbrasionIndex,
      });
    }
  }
  return { textures, properties };
}

/**
 * Compile all string-keyed comminution metadata required by the Rust/WASM hot
 * path into runtime-local numeric IDs. The returned object is deliberately
 * serializable/testable and can be applied to a WASM table in one setup pass.
 */
export function compileComminutionTablesForRuntime(canonicalState, idTables) {
  assertIdTables(idTables);
  const sizeBins = compileSizeVocabulary(idTables);
  const liberationClasses = compileLiberationVocabulary(idTables);
  const { textures, properties } = compileTextureProfiles(canonicalState, idTables);
  const legacyLtOneMmId = idTables.sizeBin.idFor('lt-1mm');

  return {
    sizeBins,
    liberationClasses,
    textures,
    properties,
    legacyLtOneMmId,
    runtimeSizeBinIdForMm(sizeMm) {
      return idTables.sizeBin.idFor(particleSizeBinIdForMm(sizeMm));
    },
    idTables,
  };
}
