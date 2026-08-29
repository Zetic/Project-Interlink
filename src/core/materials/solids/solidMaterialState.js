import { requireLiberationClass } from './liberationClasses.js';
import { requireMaterialConstituentId } from '../species/materialSpecies.js';
import { particleSizeBinIdForMm, requireParticleSizeBin } from './particleSizeBins.js';
import {
  cloneMineralTextureProfile,
  mineralTextureProfilesEqual,
  validateMineralTextureProfile,
} from './mineralTextures.js';
import {
  cloneThermalState,
  createThermalState,
  validateThermalState,
} from '../thermal/thermalState.js';

export const SOLID_MATERIAL_TOLERANCE = 1e-9;
export const SOLID_PARTICULATE_FORM = 'solid-particulate';

// Serialized fraction keys are immutable descriptors. Hot simulation paths can
// encounter the same keys thousands of times per second, so splitting and
// validating their static species/size/liberation vocabulary repeatedly is pure
// overhead. Keep a bounded runtime-only descriptor cache; texture-profile
// ownership and quantity validity remain state-specific and are still checked.
const MAX_FRACTION_DESCRIPTOR_CACHE = 32768;
const fractionDescriptorCache = new Map();
const staticallyValidatedFractionKeys = new Set();

function fractionKey(speciesId, sizeBinId, liberationClassId, textureProfileId = null) {
  return textureProfileId
    ? `${speciesId}|${sizeBinId}|${liberationClassId}|${textureProfileId}`
    : `${speciesId}|${sizeBinId}|${liberationClassId}`;
}

function rememberFractionDescriptor(key, descriptor) {
  if (fractionDescriptorCache.size >= MAX_FRACTION_DESCRIPTOR_CACHE) {
    const oldestKey = fractionDescriptorCache.keys().next().value;
    if (oldestKey !== undefined) {
      fractionDescriptorCache.delete(oldestKey);
      staticallyValidatedFractionKeys.delete(oldestKey);
    }
  }
  fractionDescriptorCache.set(key, descriptor);
  return descriptor;
}

function parseFractionKey(key) {
  const cached = fractionDescriptorCache.get(key);
  if (cached) return cached;
  const segments = key.split('|');
  if (segments.length !== 3 && segments.length !== 4) {
    throw new Error(`Solid material fraction key '${key}' must have exactly 3 segments for legacy/untextured material or exactly 4 segments for textured material`);
  }
  if (segments.some(segment => segment.length === 0)) {
    throw new Error(`Solid material fraction key '${key}' must not contain empty segments`);
  }
  const [speciesId, sizeBinId, liberationClassId, textureProfileId = null] = segments;
  return rememberFractionDescriptor(key, Object.freeze({
    speciesId,
    sizeBinId,
    liberationClassId,
    textureProfileId,
  }));
}

function validateStaticFractionKey(key, descriptor) {
  if (staticallyValidatedFractionKeys.has(key)) return;
  requireMaterialConstituentId(descriptor.speciesId);
  requireParticleSizeBin(descriptor.sizeBinId);
  requireLiberationClass(descriptor.liberationClassId);
  staticallyValidatedFractionKeys.add(key);
}

function assertFiniteNonNegative(value, label) {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  if (value < 0) {
    throw new Error(`${label} must be non-negative`);
  }
}

function resolveSolidQuantity(quantity, massKg, rateKgPerSecond) {
  return quantity ?? massKg ?? rateKgPerSecond;
}

function cloneTextureProfiles(textureProfiles = {}) {
  const result = {};
  for (const [profileId, profile] of Object.entries(textureProfiles ?? {})) {
    validateMineralTextureProfile(profile);
    if (profile.id !== profileId) {
      throw new Error(`Mineral texture profile map key '${profileId}' does not match profile id '${profile.id}'`);
    }
    result[profileId] = cloneMineralTextureProfile(profile);
  }
  return result;
}

function profilesEquivalent(a, b) {
  return mineralTextureProfilesEqual(a, b);
}

function mergeTextureProfiles(target, source) {
  if (!target.textureProfiles) target.textureProfiles = {};
  for (const [profileId, profile] of Object.entries(source.textureProfiles ?? {})) {
    const existing = target.textureProfiles[profileId];
    if (existing && !profilesEquivalent(existing, profile)) {
      throw new Error(`Conflicting mineral texture profile '${profileId}' cannot be merged`);
    }
    if (!existing) target.textureProfiles[profileId] = cloneMineralTextureProfile(profile);
  }
}

function validateSolidFractionDescriptor(state, speciesId, sizeBinId, liberationClassId, textureProfileId, resolvedQuantity) {
  requireMaterialConstituentId(speciesId);
  requireParticleSizeBin(sizeBinId);
  requireLiberationClass(liberationClassId);
  if (textureProfileId != null) {
    if (typeof textureProfileId !== 'string' || textureProfileId.length === 0) {
      throw new Error('solid fraction textureProfileId must be a non-empty string when provided');
    }
    if (!state.textureProfiles?.[textureProfileId]) {
      throw new Error(`Solid fraction references unknown mineral texture profile '${textureProfileId}'`);
    }
  }
  assertFiniteNonNegative(resolvedQuantity, 'solid fraction quantity');
}

function addResolvedSolidFraction(state, speciesId, sizeBinId, liberationClassId, textureProfileId, resolvedQuantity) {
  if (resolvedQuantity <= SOLID_MATERIAL_TOLERANCE) return state;
  const key = fractionKey(speciesId, sizeBinId, liberationClassId, textureProfileId);
  state.fractions[key] = (state.fractions[key] ?? 0) + resolvedQuantity;
  return state;
}

function pruneSolidMaterialStateUnchecked(state, tolerance = SOLID_MATERIAL_TOLERANCE) {
  for (const [key, quantity] of Object.entries(state.fractions)) {
    if (quantity <= tolerance) delete state.fractions[key];
  }
  return state;
}

function *iterateSolidFractionsUnchecked(state) {
  for (const [key, quantity] of Object.entries(state.fractions)) {
    if (quantity <= SOLID_MATERIAL_TOLERANCE) continue;
    yield { ...parseFractionKey(key), quantity };
  }
}

function totalSolidQuantityUnchecked(state) {
  let total = 0;
  for (const quantity of Object.values(state.fractions)) {
    if (quantity > SOLID_MATERIAL_TOLERANCE) total += quantity;
  }
  return total;
}

function multiplySolidMaterialStateUnchecked(state, factor) {
  const scaled = createSolidMaterialState([], { textureProfiles: state.textureProfiles ?? {} });
  for (const fraction of iterateSolidFractionsUnchecked(state)) {
    addResolvedSolidFraction(
      scaled,
      fraction.speciesId,
      fraction.sizeBinId,
      fraction.liberationClassId,
      fraction.textureProfileId,
      fraction.quantity * factor,
    );
  }
  return pruneSolidMaterialStateUnchecked(scaled);
}

function proportionalSolidMaterialShareUnchecked(state, requestedQuantity) {
  const total = totalSolidQuantityUnchecked(state);
  if (total <= SOLID_MATERIAL_TOLERANCE || requestedQuantity <= SOLID_MATERIAL_TOLERANCE) {
    return createSolidMaterialState([], { textureProfiles: state.textureProfiles ?? {} });
  }
  return multiplySolidMaterialStateUnchecked(state, Math.min(1, requestedQuantity / total));
}

export function roundSolidQuantity(value) {
  return parseFloat(value.toFixed(6));
}

export function createSolidMaterialState(fractions = [], { textureProfiles = {} } = {}) {
  const state = { fractions: {}, textureProfiles: cloneTextureProfiles(textureProfiles) };
  for (const fraction of fractions) addSolidFractionDirect(state, fraction);
  pruneSolidMaterialStateUnchecked(state);
  validateSolidMaterialState(state);
  return state;
}

export function registerSolidTextureProfile(state, profile) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new Error('solid material state must be an object');
  }
  if (!state.fractions || typeof state.fractions !== 'object' || Array.isArray(state.fractions)) {
    throw new Error('solid material state fractions must be an object');
  }
  validateMineralTextureProfile(profile);
  if (!state.textureProfiles) state.textureProfiles = {};
  const existing = state.textureProfiles[profile.id];
  if (existing && !profilesEquivalent(existing, profile)) {
    throw new Error(`Conflicting mineral texture profile '${profile.id}' cannot be registered`);
  }
  if (!existing) state.textureProfiles[profile.id] = cloneMineralTextureProfile(profile);
  return state.textureProfiles[profile.id];
}

/**
 * Hot-path profile lookup. Public state validation occurs at process/material
 * boundaries; repeated full-state validation here would make per-fraction
 * comminution quadratic in the number of sparse populations.
 */
export function solidTextureProfile(state, textureProfileId) {
  if (textureProfileId == null) return null;
  return state?.textureProfiles?.[textureProfileId] ?? null;
}

export function createSolidMaterialStateFromSpeciesQuantities(speciesQuantities, particleSizeMm, liberationClassId = 'partial') {
  if (typeof particleSizeMm !== 'number' || !Number.isFinite(particleSizeMm) || particleSizeMm <= 0) {
    throw new Error('particle size must be a finite positive number');
  }
  const sizeBinId = particleSizeBinIdForMm(particleSizeMm);
  const state = createSolidMaterialState();
  for (const [speciesId, quantity] of Object.entries(speciesQuantities ?? {})) {
    addSolidFractionDirect(state, { speciesId, sizeBinId, liberationClassId, quantity });
  }
  pruneSolidMaterialStateUnchecked(state);
  validateSolidMaterialState(state);
  return state;
}

export function cloneSolidMaterialState(state) {
  validateSolidMaterialState(state);
  return {
    fractions: { ...state.fractions },
    textureProfiles: cloneTextureProfiles(state.textureProfiles ?? {}),
  };
}

export function commitSolidMaterialState(target, staged) {
  validateSolidMaterialState(staged);
  target.fractions = { ...staged.fractions };
  target.textureProfiles = cloneTextureProfiles(staged.textureProfiles ?? {});
  return target;
}

export function createSolidMaterialBody(
  solidState = createSolidMaterialState(),
  thermalState = createThermalState(),
) {
  return {
    physicalForm: SOLID_PARTICULATE_FORM,
    solidState: cloneSolidMaterialState(solidState),
    thermalState: cloneThermalState(thermalState),
  };
}

export function cloneSolidMaterialBody(body) {
  validateSolidMaterialBody(body);
  return createSolidMaterialBody(body.solidState, body.thermalState ?? createThermalState());
}

export function commitSolidMaterialBody(target, staged) {
  validateSolidMaterialBody(staged);
  target.physicalForm = staged.physicalForm;
  target.solidState = cloneSolidMaterialState(staged.solidState);
  target.thermalState = cloneThermalState(staged.thermalState);
  return target;
}

export function validateSolidMaterialState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new Error('solid material state must be an object');
  }
  if (!state.fractions || typeof state.fractions !== 'object' || Array.isArray(state.fractions)) {
    throw new Error('solid material state fractions must be an object');
  }
  if (state.textureProfiles != null && (typeof state.textureProfiles !== 'object' || Array.isArray(state.textureProfiles))) {
    throw new Error('solid material state textureProfiles must be an object');
  }
  for (const [profileId, profile] of Object.entries(state.textureProfiles ?? {})) {
    validateMineralTextureProfile(profile);
    if (profile.id !== profileId) {
      throw new Error(`Mineral texture profile map key '${profileId}' does not match profile id '${profile.id}'`);
    }
  }
  for (const [key, quantity] of Object.entries(state.fractions)) {
    const descriptor = parseFractionKey(key);
    validateStaticFractionKey(key, descriptor);
    if (descriptor.textureProfileId && !state.textureProfiles?.[descriptor.textureProfileId]) {
      throw new Error(`Fraction '${key}' references unknown mineral texture profile '${descriptor.textureProfileId}'; textured material must have exactly 3 base segments plus a registered texture-profile segment`);
    }
    assertFiniteNonNegative(quantity, `Fraction '${key}' quantity`);
  }
}

export function validateSolidMaterialBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('material body must be an object');
  }
  if (body.physicalForm !== SOLID_PARTICULATE_FORM) {
    throw new Error(`Unsupported material body physical form '${body.physicalForm}'`);
  }
  validateSolidMaterialState(body.solidState);
  // Older serialized solid bodies predate thermal state. They remain readable
  // at the named reference condition and are normalized on their next clone.
  if (body.thermalState != null) validateThermalState(body.thermalState);
}

export function iterateSolidFractions(state) {
  validateSolidMaterialState(state);
  return [...iterateSolidFractionsUnchecked(state)];
}

export function forEachSolidFraction(state, callback) {
  validateSolidMaterialState(state);
  for (const fraction of iterateSolidFractionsUnchecked(state)) callback(fraction);
}

// Validates the incoming fraction descriptor once, but skips whole-state validation and pruning.
export function addSolidFractionDirect(state, {
  speciesId,
  sizeBinId,
  liberationClassId,
  textureProfileId = null,
  quantity,
  massKg,
  rateKgPerSecond,
}) {
  const resolvedQuantity = resolveSolidQuantity(quantity, massKg, rateKgPerSecond);
  validateSolidFractionDescriptor(state, speciesId, sizeBinId, liberationClassId, textureProfileId, resolvedQuantity);
  return addResolvedSolidFraction(state, speciesId, sizeBinId, liberationClassId, textureProfileId, resolvedQuantity);
}

export function addSolidFraction(state, {
  speciesId,
  sizeBinId,
  liberationClassId,
  textureProfileId = null,
  quantity,
  massKg,
  rateKgPerSecond,
}) {
  validateSolidMaterialState(state);
  addSolidFractionDirect(state, {
    speciesId,
    sizeBinId,
    liberationClassId,
    textureProfileId,
    quantity,
    massKg,
    rateKgPerSecond,
  });
  return pruneSolidMaterialStateUnchecked(state);
}

export function addSolidMaterialState(target, source, factor = 1) {
  validateSolidMaterialState(target);
  validateSolidMaterialState(source);
  if (typeof factor !== 'number' || !Number.isFinite(factor) || factor < 0) {
    throw new Error('solid material factor must be a finite non-negative number');
  }
  mergeTextureProfiles(target, source);
  for (const fraction of iterateSolidFractionsUnchecked(source)) {
    addResolvedSolidFraction(
      target,
      fraction.speciesId,
      fraction.sizeBinId,
      fraction.liberationClassId,
      fraction.textureProfileId,
      fraction.quantity * factor,
    );
  }
  return pruneSolidMaterialStateUnchecked(target);
}

export function pruneSolidMaterialState(state, tolerance = SOLID_MATERIAL_TOLERANCE) {
  validateSolidMaterialState(state);
  return pruneSolidMaterialStateUnchecked(state, tolerance);
}

export function totalSolidQuantity(state) {
  validateSolidMaterialState(state);
  return totalSolidQuantityUnchecked(state);
}

function summarize(state, pickKey) {
  const summary = {};
  validateSolidMaterialState(state);
  for (const fraction of iterateSolidFractionsUnchecked(state)) {
    const key = pickKey(fraction);
    summary[key] = (summary[key] ?? 0) + fraction.quantity;
  }
  return summary;
}

export function summarizeSolidMaterialBySpecies(state) {
  return summarize(state, fraction => fraction.speciesId);
}

export function summarizeSolidMaterialBySizeBin(state) {
  return summarize(state, fraction => fraction.sizeBinId);
}

export function summarizeSolidMaterialByLiberationClass(state) {
  return summarize(state, fraction => fraction.liberationClassId);
}

export function summarizeSolidMaterialByTextureProfile(state) {
  return Object.fromEntries(
    Object.entries(summarize(state, fraction => fraction.textureProfileId ?? 'untextured'))
      .map(([profileId, quantity]) => [profileId, roundSolidQuantity(quantity)]),
  );
}

export function multiplySolidMaterialState(state, factor) {
  validateSolidMaterialState(state);
  if (typeof factor !== 'number' || !Number.isFinite(factor) || factor < 0) {
    throw new Error('solid material factor must be a finite non-negative number');
  }
  return multiplySolidMaterialStateUnchecked(state, factor);
}

export function scaleSolidMaterialState(state, factor) {
  if (factor > 1) {
    throw new Error('solid material scale factor must be a finite number in [0, 1]');
  }
  return multiplySolidMaterialState(state, factor);
}

export function proportionalSolidMaterialShare(state, requestedQuantity) {
  validateSolidMaterialState(state);
  assertFiniteNonNegative(requestedQuantity, 'requested solid material quantity');
  return proportionalSolidMaterialShareUnchecked(state, requestedQuantity);
}

export function withdrawSolidMaterialState(state, requestedQuantity) {
  validateSolidMaterialState(state);
  assertFiniteNonNegative(requestedQuantity, 'withdraw requested quantity');
  const withdrawn = proportionalSolidMaterialShareUnchecked(state, requestedQuantity);
  for (const fraction of iterateSolidFractionsUnchecked(withdrawn)) {
    const key = fractionKey(
      fraction.speciesId,
      fraction.sizeBinId,
      fraction.liberationClassId,
      fraction.textureProfileId,
    );
    state.fractions[key] = Math.max(0, (state.fractions[key] ?? 0) - fraction.quantity);
  }
  pruneSolidMaterialStateUnchecked(state);
  return withdrawn;
}

export function solidMaterialStatesEqual(a, b, tolerance = SOLID_MATERIAL_TOLERANCE) {
  validateSolidMaterialState(a);
  validateSolidMaterialState(b);
  const keys = new Set([...Object.keys(a.fractions), ...Object.keys(b.fractions)]);
  for (const key of keys) {
    if (Math.abs((a.fractions[key] ?? 0) - (b.fractions[key] ?? 0)) > tolerance) return false;
  }
  const profileIds = new Set([
    ...Object.keys(a.textureProfiles ?? {}),
    ...Object.keys(b.textureProfiles ?? {}),
  ]);
  for (const profileId of profileIds) {
    if (!profilesEquivalent(a.textureProfiles?.[profileId], b.textureProfiles?.[profileId])) return false;
  }
  return true;
}
