import {
  GOETHITE_DEHYDROXYLATION_REACTION_ID,
  getReactionDefinition,
} from '../content/reactions/reactionDefinitions.js';
import { deriveReactionTextureProfile } from '../core/materials/solids/mineralTextures.js';
import {
  getParticleSizeBin,
  listParticleSizeBins,
  representativeParticleSizeMm,
} from '../core/materials/solids/particleSizeBins.js';
import { requireMaterialSpecies } from '../core/materials/species/materialSpecies.js';
import {
  compileSolidMaterialBodyForRuntime,
  createPackedMaterialIdTables,
} from './packedRuntimeCompiler.js';
import { compileGasMaterialBodyForRuntime } from './packedThermalGasCompiler.js';

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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function reactionSpeciesMassKg(reaction, speciesId) {
  const participant = [...reaction.reactants, ...reaction.products]
    .find(item => item.speciesId === speciesId);
  if (!participant) throw new Error(`Reaction '${reaction.id}' does not contain species '${speciesId}'`);
  const species = requireMaterialSpecies(speciesId);
  return species.chemistry.molarMassKgPerMol * participant.stoichiometricMoles;
}

function particleSizeFactor(sizeBinId, kinetics) {
  const particleSizeM = representativeParticleSizeMm(sizeBinId) / 1000;
  return clamp(
    (kinetics.referenceParticleSizeM / particleSizeM) ** kinetics.particleSizeExponent,
    kinetics.minimumParticleSizeFactor,
    kinetics.maximumParticleSizeFactor,
  );
}

function sizeVocabulary() {
  return [
    ...listParticleSizeBins(),
    ...LEGACY_PARTICLE_SIZE_BIN_IDS.map(id => getParticleSizeBin(id)),
  ];
}

function normalizedSolidStates(canonicalSolidStates) {
  if (canonicalSolidStates == null) return [];
  const states = Array.isArray(canonicalSolidStates) ? canonicalSolidStates : [canonicalSolidStates];
  return states.filter(Boolean).map(value => value.solidState ?? value);
}

/**
 * Compile the current declarative goethite-dehydroxylation definition into the
 * numeric Rust execution contract. The size response remains content-derived;
 * Rust does not hard-code canonical particle-size strings.
 *
 * Reaction product textures are allocated in the same runtime texture-ID table
 * as their source profiles. `derivedTextureProfiles` is returned so the later
 * world/runtime compiler can also feed those profiles into packed comminution
 * metadata before a reacted product reaches downstream grinding equipment.
 */
export function compileGoethiteReactionTablesForRuntime(
  canonicalSolidStates,
  idTables = createPackedMaterialIdTables(),
) {
  assertIdTables(idTables);
  const reaction = getReactionDefinition(GOETHITE_DEHYDROXYLATION_REACTION_ID);
  if (!reaction) throw new Error('Goethite dehydroxylation reaction definition is required');

  const sourceSpeciesId = idTables.species.idFor('goethite');
  const solidProductSpeciesId = idTables.species.idFor('hematite');
  const gasProductSpeciesId = idTables.species.idFor('waterVapor');
  const sizeFactors = sizeVocabulary().map(bin => ({
    runtimeId: idTables.sizeBin.idFor(bin.id),
    canonicalId: bin.id,
    factor: particleSizeFactor(bin.id, reaction.kinetics),
  }));

  const sourceProfiles = new Map();
  for (const state of normalizedSolidStates(canonicalSolidStates)) {
    for (const [profileId, profile] of Object.entries(state?.textureProfiles ?? {})) {
      if (profile?.speciesTextures?.goethite) sourceProfiles.set(profileId, profile);
    }
  }

  const textureMappings = [];
  const derivedTextureProfiles = {};
  for (const [sourceProfileId, sourceProfile] of sourceProfiles) {
    const derived = deriveReactionTextureProfile(
      sourceProfile,
      reaction.id,
      'goethite',
      'hematite',
    );
    const sourceRuntimeId = idTables.textureProfile.idFor(sourceProfileId);
    const productRuntimeId = idTables.textureProfile.idFor(derived.id);
    textureMappings.push({
      sourceRuntimeId,
      productRuntimeId,
      sourceCanonicalId: sourceProfileId,
      productCanonicalId: derived.id,
    });
    derivedTextureProfiles[derived.id] = derived;
  }

  return {
    reactionId: reaction.id,
    sourceSpeciesId,
    solidProductSpeciesId,
    gasProductSpeciesId,
    sourceMassPerExtentKg: reactionSpeciesMassKg(reaction, 'goethite'),
    solidProductMassPerExtentKg: reactionSpeciesMassKg(reaction, 'hematite'),
    gasProductMassPerExtentKg: reactionSpeciesMassKg(reaction, 'waterVapor'),
    reactionEnthalpyJPerMolExtent: reaction.thermochemistry.reactionEnthalpyJPerMolExtent,
    activationEnergyJPerMol: reaction.kinetics.activationEnergyJPerMol,
    preExponentialFactorPerSecond: reaction.kinetics.preExponentialFactorPerSecond,
    sizeFactors,
    textureMappings,
    derivedTextureProfiles,
    idTables,
  };
}

function furnaceConfig(node) {
  if (!node || node.nodeType !== 'roastingFurnace') {
    throw new Error('canonical roasting furnace node is required');
  }
  return {
    temperatureSetpointK: node.temperatureSetpointK,
    ratedHeaterPowerKw: node.ratedHeaterPowerKw,
    maximumOperatingTemperatureK: node.maximumOperatingTemperatureK,
    maximumSolidThroughputKgPerSecond: node.maximumSolidThroughputKgPerSecond,
    effectiveChamberHoldUpKg: node.effectiveChamberHoldUpKg,
    heatLossCoefficientWPerK: node.heatLossCoefficientWPerK,
    internalZoneCount: node.internalZoneCount,
    enabled: Boolean(node.enabled),
  };
}

/**
 * Compile an existing live JavaScript furnace into packed state data. Importing
 * that snapshot into the authoritative Rust world is intentionally a
 * graph/world-scheduler concern rather than a per-apparatus bridge protocol.
 */
export function compileRoastingFurnaceForRuntime(
  node,
  idTables = createPackedMaterialIdTables(),
) {
  const config = furnaceConfig(node);
  const zones = Array.isArray(node.zones) ? node.zones : [];
  if (zones.length !== config.internalZoneCount) {
    throw new Error('canonical roasting furnace zones must match internalZoneCount');
  }
  const packedZones = zones.map(zone => (
    compileSolidMaterialBodyForRuntime(zone, idTables).packedBody
  ));
  const packedPendingFeed = compileSolidMaterialBodyForRuntime(node.pendingFeed, idTables).packedBody;
  const packedGasInventory = compileGasMaterialBodyForRuntime(node.gasInventory, idTables).packedGasBody;
  const reaction = compileGoethiteReactionTablesForRuntime(
    [...zones.map(zone => zone.solidState), node.pendingFeed?.solidState],
    idTables,
  );
  return {
    config,
    packedZones,
    packedPendingFeed,
    packedGasInventory,
    reaction,
    idTables,
  };
}
