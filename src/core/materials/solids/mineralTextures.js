import { requireMaterialConstituentId } from '../species/materialSpecies.js';

const PROFILE_ID_SEPARATOR = '|';

function assertFinitePositive(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive number`);
  }
}

function assertUnitInterval(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be a finite number in [0, 1]`);
  }
}

/**
 * A mineral texture profile is immutable geological lineage carried with solid
 * particulate matter. It describes the original grain/intergrowth scale that
 * governs future liberation; comminution changes particle size/liberation but
 * does not rewrite this source texture.
 */
export function validateMineralTextureProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error('mineral texture profile must be an object');
  }
  if (typeof profile.id !== 'string' || profile.id.length === 0 || profile.id.includes(PROFILE_ID_SEPARATOR)) {
    throw new Error(`mineral texture profile id must be a non-empty string without '${PROFILE_ID_SEPARATOR}'`);
  }
  assertFinitePositive(profile.fallbackLiberationSizeUm, `Mineral texture '${profile.id}' fallbackLiberationSizeUm`);
  assertFinitePositive(profile.curveSpread, `Mineral texture '${profile.id}' curveSpread`);
  assertUnitInterval(profile.boundaryBreakageAffinity, `Mineral texture '${profile.id}' boundaryBreakageAffinity`);
  if (!profile.speciesLiberationSizeUm || typeof profile.speciesLiberationSizeUm !== 'object' || Array.isArray(profile.speciesLiberationSizeUm)) {
    throw new Error(`Mineral texture '${profile.id}' speciesLiberationSizeUm must be an object`);
  }
  for (const [speciesId, liberationSizeUm] of Object.entries(profile.speciesLiberationSizeUm)) {
    requireMaterialConstituentId(speciesId);
    assertFinitePositive(liberationSizeUm, `Mineral texture '${profile.id}' species '${speciesId}' liberation size`);
  }
  return profile;
}

export function cloneMineralTextureProfile(profile) {
  validateMineralTextureProfile(profile);
  return {
    id: profile.id,
    fallbackLiberationSizeUm: profile.fallbackLiberationSizeUm,
    curveSpread: profile.curveSpread,
    boundaryBreakageAffinity: profile.boundaryBreakageAffinity,
    speciesLiberationSizeUm: { ...profile.speciesLiberationSizeUm },
  };
}

export function characteristicLiberationSizeUm(profile, speciesId) {
  validateMineralTextureProfile(profile);
  requireMaterialConstituentId(speciesId);
  return profile.speciesLiberationSizeUm[speciesId] ?? profile.fallbackLiberationSizeUm;
}

/**
 * Smooth statistical liberation potential at a particle size. The
 * characteristic liberation size is the 50% point; curveSpread controls how
 * broadly the transition occurs in log-size space. This is an aggregate model,
 * not explicit mineral-grain simulation.
 */
export function liberationPotentialAtParticleSize(profile, speciesId, particleSizeMm) {
  assertFinitePositive(particleSizeMm, 'particleSizeMm');
  const characteristicSizeUm = characteristicLiberationSizeUm(profile, speciesId);
  const particleSizeUm = particleSizeMm * 1000;
  const logRatio = Math.log(particleSizeUm / characteristicSizeUm);
  return 1 / (1 + Math.exp(logRatio / profile.curveSpread));
}
