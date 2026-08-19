import { requireLiberationClass } from './liberationClasses.js';
import { requireMaterialSpecies } from './materialSpecies.js';
import { particleSizeBinIdForMm, requireParticleSizeBin } from './particleSizeBins.js';

export const SOLID_MATERIAL_TOLERANCE = 1e-9;
export const SOLID_PARTICULATE_FORM = 'solid-particulate';

function fractionKey(speciesId, sizeBinId, liberationClassId) {
  return `${speciesId}|${sizeBinId}|${liberationClassId}`;
}

function parseFractionKey(key) {
  const [speciesId, sizeBinId, liberationClassId] = key.split('|');
  return { speciesId, sizeBinId, liberationClassId };
}

function assertFiniteNonNegative(value, label) {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  if (value < 0) {
    throw new Error(`${label} must be non-negative`);
  }
}

export function roundSolidQuantity(value) {
  return parseFloat(value.toFixed(6));
}

export function createSolidMaterialState(fractions = []) {
  const state = { fractions: {} };
  for (const fraction of fractions) addSolidFraction(state, fraction);
  return state;
}

export function createSolidMaterialStateFromSpeciesQuantities(speciesQuantities, particleSizeMm, liberationClassId = 'partial') {
  if (typeof particleSizeMm !== 'number' || !Number.isFinite(particleSizeMm) || particleSizeMm <= 0) {
    throw new Error('particle size must be a finite positive number');
  }
  const sizeBinId = particleSizeBinIdForMm(particleSizeMm);
  const state = createSolidMaterialState();
  for (const [speciesId, quantity] of Object.entries(speciesQuantities ?? {})) {
    addSolidFraction(state, { speciesId, sizeBinId, liberationClassId, quantity });
  }
  return state;
}

export function cloneSolidMaterialState(state) {
  validateSolidMaterialState(state);
  return { fractions: { ...state.fractions } };
}

export function commitSolidMaterialState(target, staged) {
  validateSolidMaterialState(staged);
  target.fractions = { ...staged.fractions };
  return target;
}

export function createSolidMaterialBody(solidState = createSolidMaterialState()) {
  return {
    physicalForm: SOLID_PARTICULATE_FORM,
    solidState: cloneSolidMaterialState(solidState),
  };
}

export function cloneSolidMaterialBody(body) {
  validateSolidMaterialBody(body);
  return createSolidMaterialBody(body.solidState);
}

export function commitSolidMaterialBody(target, staged) {
  validateSolidMaterialBody(staged);
  target.physicalForm = staged.physicalForm;
  target.solidState = cloneSolidMaterialState(staged.solidState);
  return target;
}

export function validateSolidMaterialState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new Error('solid material state must be an object');
  }
  if (!state.fractions || typeof state.fractions !== 'object' || Array.isArray(state.fractions)) {
    throw new Error('solid material state fractions must be an object');
  }
  for (const [key, quantity] of Object.entries(state.fractions)) {
    const { speciesId, sizeBinId, liberationClassId } = parseFractionKey(key);
    requireMaterialSpecies(speciesId);
    requireParticleSizeBin(sizeBinId);
    requireLiberationClass(liberationClassId);
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
}

export function iterateSolidFractions(state) {
  validateSolidMaterialState(state);
  return Object.entries(state.fractions)
    .filter(([, quantity]) => quantity > SOLID_MATERIAL_TOLERANCE)
    .map(([key, quantity]) => ({ ...parseFractionKey(key), quantity }));
}

export function addSolidFraction(state, {
  speciesId,
  sizeBinId,
  liberationClassId,
  quantity,
  massKg,
  rateKgPerSecond,
}) {
  validateSolidMaterialState(state);
  requireMaterialSpecies(speciesId);
  requireParticleSizeBin(sizeBinId);
  requireLiberationClass(liberationClassId);
  const resolvedQuantity = quantity ?? massKg ?? rateKgPerSecond;
  assertFiniteNonNegative(resolvedQuantity, 'solid fraction quantity');
  if (resolvedQuantity <= SOLID_MATERIAL_TOLERANCE) return state;
  const key = fractionKey(speciesId, sizeBinId, liberationClassId);
  state.fractions[key] = (state.fractions[key] ?? 0) + resolvedQuantity;
  return pruneSolidMaterialState(state);
}

export function addSolidMaterialState(target, source, factor = 1) {
  validateSolidMaterialState(target);
  validateSolidMaterialState(source);
  if (typeof factor !== 'number' || !Number.isFinite(factor) || factor < 0) {
    throw new Error('solid material factor must be a finite non-negative number');
  }
  for (const fraction of iterateSolidFractions(source)) {
    addSolidFraction(target, { ...fraction, quantity: fraction.quantity * factor });
  }
  return pruneSolidMaterialState(target);
}

export function pruneSolidMaterialState(state, tolerance = SOLID_MATERIAL_TOLERANCE) {
  validateSolidMaterialState(state);
  for (const [key, quantity] of Object.entries(state.fractions)) {
    if (quantity <= tolerance) delete state.fractions[key];
  }
  return state;
}

export function totalSolidQuantity(state) {
  validateSolidMaterialState(state);
  return iterateSolidFractions(state).reduce((sum, fraction) => sum + fraction.quantity, 0);
}

function summarize(state, pickKey) {
  const summary = {};
  for (const fraction of iterateSolidFractions(state)) {
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

export function multiplySolidMaterialState(state, factor) {
  validateSolidMaterialState(state);
  if (typeof factor !== 'number' || !Number.isFinite(factor) || factor < 0) {
    throw new Error('solid material factor must be a finite non-negative number');
  }
  const scaled = createSolidMaterialState();
  for (const fraction of iterateSolidFractions(state)) {
    addSolidFraction(scaled, { ...fraction, quantity: fraction.quantity * factor });
  }
  return scaled;
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
  const total = totalSolidQuantity(state);
  if (total <= SOLID_MATERIAL_TOLERANCE || requestedQuantity <= SOLID_MATERIAL_TOLERANCE) {
    return createSolidMaterialState();
  }
  return scaleSolidMaterialState(state, Math.min(1, requestedQuantity / total));
}

export function withdrawSolidMaterialState(state, requestedQuantity) {
  validateSolidMaterialState(state);
  assertFiniteNonNegative(requestedQuantity, 'withdraw requested quantity');
  const withdrawn = proportionalSolidMaterialShare(state, requestedQuantity);
  for (const fraction of iterateSolidFractions(withdrawn)) {
    const key = fractionKey(fraction.speciesId, fraction.sizeBinId, fraction.liberationClassId);
    state.fractions[key] = Math.max(0, (state.fractions[key] ?? 0) - fraction.quantity);
  }
  pruneSolidMaterialState(state);
  return withdrawn;
}

export function solidMaterialStatesEqual(a, b, tolerance = SOLID_MATERIAL_TOLERANCE) {
  validateSolidMaterialState(a);
  validateSolidMaterialState(b);
  const keys = new Set([...Object.keys(a.fractions), ...Object.keys(b.fractions)]);
  for (const key of keys) {
    if (Math.abs((a.fractions[key] ?? 0) - (b.fractions[key] ?? 0)) > tolerance) return false;
  }
  return true;
}
