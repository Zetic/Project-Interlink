import { requireMaterialConstituentId } from '../species/materialSpecies.js';

const PROFILE_ID_SEPARATOR = '|';
const OCCURRENCE_MODE_KEYS = Object.freeze(['free', 'boundary', 'intergrown', 'included']);

// Physical interpretation: more complex mineral associations require a particle
// to be progressively smaller relative to its grain-size distribution before a
// mono-mineral particle is likely. These are equipment-model constants, not
// generated occurrence properties.
const MODE_REQUIRED_SIZE_MULTIPLIER = Object.freeze({
  free: 1,
  boundary: 1.3,
  intergrown: 2,
  included: 4,
});

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

function validateGrainSizeDistribution(grainSizeUm, label) {
  if (!grainSizeUm || typeof grainSizeUm !== 'object' || Array.isArray(grainSizeUm)) {
    throw new Error(`${label} grainSizeUm must be an object`);
  }
  assertFinitePositive(grainSizeUm.d10, `${label} grainSizeUm.d10`);
  assertFinitePositive(grainSizeUm.d50, `${label} grainSizeUm.d50`);
  assertFinitePositive(grainSizeUm.d90, `${label} grainSizeUm.d90`);
  if (!(grainSizeUm.d10 < grainSizeUm.d50 && grainSizeUm.d50 < grainSizeUm.d90)) {
    throw new Error(`${label} grain sizes must satisfy d10 < d50 < d90`);
  }
}

function validateOccurrenceModes(modes, label) {
  if (!modes || typeof modes !== 'object' || Array.isArray(modes)) {
    throw new Error(`${label} occurrenceModes must be an object`);
  }
  let total = 0;
  for (const mode of OCCURRENCE_MODE_KEYS) {
    assertUnitInterval(modes[mode], `${label} occurrenceModes.${mode}`);
    total += modes[mode];
  }
  if (Math.abs(total - 1) > 0.005) {
    throw new Error(`${label} occurrenceModes must sum to 1; got ${total}`);
  }
}

function cloneSpeciesTexture(texture) {
  return {
    grainSizeUm: { ...texture.grainSizeUm },
    occurrenceModes: { ...texture.occurrenceModes },
  };
}

/**
 * Persistent geological texture for one ResourceOccurrence. Grain-size D10/D50/D90
 * and mineral occurrence modes are measurable mineralogical properties; comminution
 * changes particle populations but does not rewrite this source texture.
 */
export function validateMineralTextureProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error('mineral texture profile must be an object');
  }
  if (typeof profile.id !== 'string' || profile.id.length === 0 || profile.id.includes(PROFILE_ID_SEPARATOR)) {
    throw new Error(`mineral texture profile id must be a non-empty string without '${PROFILE_ID_SEPARATOR}'`);
  }
  if (!profile.speciesTextures || typeof profile.speciesTextures !== 'object' || Array.isArray(profile.speciesTextures)) {
    throw new Error(`Mineral texture '${profile.id}' speciesTextures must be an object`);
  }
  if (Object.keys(profile.speciesTextures).length === 0) {
    throw new Error(`Mineral texture '${profile.id}' must define at least one species texture`);
  }
  for (const [speciesId, texture] of Object.entries(profile.speciesTextures)) {
    requireMaterialConstituentId(speciesId);
    if (!texture || typeof texture !== 'object' || Array.isArray(texture)) {
      throw new Error(`Mineral texture '${profile.id}' species '${speciesId}' must be an object`);
    }
    const label = `Mineral texture '${profile.id}' species '${speciesId}'`;
    validateGrainSizeDistribution(texture.grainSizeUm, label);
    validateOccurrenceModes(texture.occurrenceModes, label);
  }
  return profile;
}

export function cloneMineralTextureProfile(profile) {
  validateMineralTextureProfile(profile);
  return {
    id: profile.id,
    speciesTextures: Object.fromEntries(
      Object.entries(profile.speciesTextures).map(([speciesId, texture]) => [
        speciesId,
        cloneSpeciesTexture(texture),
      ]),
    ),
  };
}

export function mineralTextureProfilesEqual(a, b) {
  if (!a || !b) return a === b;
  if (a.id !== b.id) return false;
  const speciesIds = new Set([
    ...Object.keys(a.speciesTextures ?? {}),
    ...Object.keys(b.speciesTextures ?? {}),
  ]);
  for (const speciesId of speciesIds) {
    const at = a.speciesTextures?.[speciesId];
    const bt = b.speciesTextures?.[speciesId];
    if (!at || !bt) return false;
    for (const key of ['d10', 'd50', 'd90']) {
      if (at.grainSizeUm?.[key] !== bt.grainSizeUm?.[key]) return false;
    }
    for (const mode of OCCURRENCE_MODE_KEYS) {
      if (at.occurrenceModes?.[mode] !== bt.occurrenceModes?.[mode]) return false;
    }
  }
  return true;
}

export function speciesMineralTexture(profile, speciesId) {
  return profile?.speciesTextures?.[speciesId] ?? null;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Approximate the cumulative grain-size distribution in log-size space from
 * measured D10/D50/D90 anchors. The interpolation passes through all three
 * reported quantiles and extrapolates their adjacent log slopes into the tails.
 */
export function grainSizeCdfAtUm(grainSizeUm, particleSizeUm) {
  validateGrainSizeDistribution(grainSizeUm, 'grain-size distribution');
  assertFinitePositive(particleSizeUm, 'particleSizeUm');
  const points = [
    [Math.log(grainSizeUm.d10), 0.10],
    [Math.log(grainSizeUm.d50), 0.50],
    [Math.log(grainSizeUm.d90), 0.90],
  ];
  const x = Math.log(particleSizeUm);
  const [a, b] = x <= points[1][0] ? [points[0], points[1]] : [points[1], points[2]];
  const slope = (b[1] - a[1]) / (b[0] - a[0]);
  return clamp(a[1] + slope * (x - a[0]), 0, 1);
}

/**
 * Statistical liberation potential derived from physical mineral texture.
 * Potential rises as product particles become small relative to the measured
 * mineral grain-size distribution. Mineral occurrence mode shifts the required
 * particle/grain scale: inclusions and complex intergrowths require finer breakage
 * than free or boundary-hosted grains. No occurrence-specific liberation-size or
 * curve-width tuning property is stored.
 */
export function liberationPotentialAtParticleSize(profile, speciesId, particleSizeMm) {
  assertFinitePositive(particleSizeMm, 'particleSizeMm');
  const texture = speciesMineralTexture(profile, speciesId);
  if (!texture) {
    throw new Error(`Mineral texture '${profile?.id ?? 'unknown'}' is missing species '${speciesId}'`);
  }
  const particleSizeUm = particleSizeMm * 1000;
  let potential = 0;
  for (const mode of OCCURRENCE_MODE_KEYS) {
    const requiredSizeUm = particleSizeUm * MODE_REQUIRED_SIZE_MULTIPLIER[mode];
    const fractionOfGrainsLargerThanParticle = 1 - grainSizeCdfAtUm(texture.grainSizeUm, requiredSizeUm);
    potential += texture.occurrenceModes[mode] * fractionOfGrainsLargerThanParticle;
  }
  return clamp(potential, 0, 1);
}
