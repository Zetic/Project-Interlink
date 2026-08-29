/**
 * MaterialStream — continuous material flow between two connected ports.
 * Fraction-aware solid-state flow is the physical source of truth. Total flow is
 * always derived; streams never allocate MaterialBatch objects per tick.
 */

import { particleSizeBinIdForMm } from '../core/materials/solids/particleSizeBins.js';
import {
  SOLID_PARTICULATE_FORM,
  addSolidFractionDirect,
  cloneSolidMaterialState,
  createSolidMaterialState,
  scaleSolidMaterialState,
  totalSolidQuantity,
  validateSolidMaterialState,
} from '../core/materials/solids/solidMaterialState.js';
import { MATERIAL_FORMS } from '../core/materials/materialForms.js';
import {
  cloneGasMaterialState,
  createGasMaterialState,
  totalGasMassKg,
  validateGasMaterialState,
} from '../core/materials/gas/gasMaterialState.js';

export const STREAM_FLOW_TOLERANCE = 1e-12;

export function validateComponentMassFlowRates(rates) {
  if (!rates || typeof rates !== 'object' || Array.isArray(rates)) {
    throw new Error('componentMassFlowKgPerSecond must be an object');
  }
  for (const [id, rate] of Object.entries(rates)) {
    if (typeof rate !== 'number' || !Number.isFinite(rate)) {
      throw new Error(`Stream component '${id}' flow rate must be a finite number`);
    }
    if (rate < 0) {
      throw new Error(`Stream component '${id}' flow rate must be non-negative`);
    }
  }
}

function legacySolidFlow(componentMassFlowKgPerSecond, particleSizeMm, liberationClassId = 'partial') {
  const solidState = createSolidMaterialState();
  const sizeBinId = particleSizeBinIdForMm(particleSizeMm);
  for (const [speciesId, rateKgPerSecond] of Object.entries(componentMassFlowKgPerSecond)) {
    addSolidFractionDirect(solidState, { speciesId, sizeBinId, liberationClassId, quantity: rateKgPerSecond });
  }
  return solidState;
}

function normalizeSolidStateArg(solidStateOrRates, particleSizeMm = null) {
  if (solidStateOrRates && typeof solidStateOrRates === 'object' && !Array.isArray(solidStateOrRates) && solidStateOrRates.fractions) {
    return solidStateOrRates;
  }
  validateComponentMassFlowRates(solidStateOrRates ?? {});
  if (Object.keys(solidStateOrRates ?? {}).length === 0) return createSolidMaterialState();
  return legacySolidFlow(solidStateOrRates, particleSizeMm ?? 1);
}

export function validateSolidMaterialFlowRates(solidStateOrRates, particleSizeMm = null) {
  validateSolidMaterialState(normalizeSolidStateArg(solidStateOrRates, particleSizeMm));
}

export function totalMassFlowKgPerSecond(solidStateOrRates, particleSizeMm = null) {
  const solidState = normalizeSolidStateArg(solidStateOrRates, particleSizeMm);
  return totalSolidQuantity(solidState);
}

function refreshCachedTotalFlow(stream) {
  stream._cachedTotalMassFlowKgPerSecond = stream.physicalForm === MATERIAL_FORMS.GAS
    ? totalGasMassKg(stream.gasState)
    : totalSolidQuantity(stream.solidState);
}

export function createMaterialStream({
  id,
  sourceNodeId,
  sourcePortId,
  targetNodeId,
  targetPortId,
  solidState = null,
  gasState = null,
  physicalForm = SOLID_PARTICULATE_FORM,
  specificSensibleEnthalpyJPerKg = 0,
  componentMassFlowKgPerSecond = null,
  particleSizeMm = null,
  connectionId = null,
}) {
  if (!id || typeof id !== 'string') throw new Error('Stream id must be a non-empty string');
  if (!sourceNodeId || typeof sourceNodeId !== 'string') throw new Error('Stream sourceNodeId must be a non-empty string');
  if (!sourcePortId || typeof sourcePortId !== 'string') throw new Error('Stream sourcePortId must be a non-empty string');
  if (!targetNodeId || typeof targetNodeId !== 'string') throw new Error('Stream targetNodeId must be a non-empty string');
  if (!targetPortId || typeof targetPortId !== 'string') throw new Error('Stream targetPortId must be a non-empty string');

  if (!Number.isFinite(specificSensibleEnthalpyJPerKg)) {
    throw new Error('specificSensibleEnthalpyJPerKg must be finite');
  }
  if (![MATERIAL_FORMS.SOLID_PARTICULATE, MATERIAL_FORMS.GAS].includes(physicalForm)) {
    throw new Error(`Unsupported material stream physical form '${physicalForm}'`);
  }
  const normalizedSolidState = physicalForm === MATERIAL_FORMS.SOLID_PARTICULATE
    ? (solidState
      ? cloneSolidMaterialState(solidState)
      : (componentMassFlowKgPerSecond && Object.keys(componentMassFlowKgPerSecond).length > 0
        ? legacySolidFlow(componentMassFlowKgPerSecond, particleSizeMm)
        : createSolidMaterialState()))
    : null;
  const normalizedGasState = physicalForm === MATERIAL_FORMS.GAS
    ? cloneGasMaterialState(gasState ?? createGasMaterialState())
    : null;
  if (normalizedSolidState) validateSolidMaterialFlowRates(normalizedSolidState);
  if (normalizedGasState) validateGasMaterialState(normalizedGasState);

  const stream = {
    id,
    connectionId,
    sourceNodeId,
    sourcePortId,
    targetNodeId,
    targetPortId,
    physicalForm,
    nominalParticleSizeMm: particleSizeMm,
    ...(normalizedSolidState ? { solidState: normalizedSolidState } : { gasState: normalizedGasState }),
    specificSensibleEnthalpyJPerKg,
    _cachedTotalMassFlowKgPerSecond: 0,
  };
  refreshCachedTotalFlow(stream);
  Object.defineProperty(stream, 'componentMassFlowKgPerSecond', {
    enumerable: true,
    get() {
      const totals = new Map();
      if (stream.physicalForm === MATERIAL_FORMS.GAS) {
        return { ...stream.gasState.speciesMassKg };
      }
      for (const [key, quantity] of Object.entries(stream.solidState.fractions)) {
        const speciesId = key.split('|')[0];
        totals.set(speciesId, Number(((totals.get(speciesId) ?? 0) + quantity).toFixed(12)));
      }
      return Object.fromEntries(totals.entries());
    },
  });
  Object.defineProperty(stream, 'particleSizeMm', {
    enumerable: true,
    get() { return stream.nominalParticleSizeMm ?? null; },
  });
  return stream;
}

/** Mutate only the physical rate/state portion of an existing stream. */
export function setMaterialStreamState(stream, solidStateOrRates = createSolidMaterialState(), particleSizeMm = null) {
  const solidState = normalizeSolidStateArg(solidStateOrRates, particleSizeMm);
  validateSolidMaterialFlowRates(solidState);
  stream.physicalForm = SOLID_PARTICULATE_FORM;
  if (arguments.length >= 3) stream.nominalParticleSizeMm = particleSizeMm;
  stream.solidState = cloneSolidMaterialState(solidState);
  delete stream.gasState;
  stream.specificSensibleEnthalpyJPerKg = arguments.length >= 4 ? arguments[3] : 0;
  if (!Number.isFinite(stream.specificSensibleEnthalpyJPerKg)) {
    throw new Error('specificSensibleEnthalpyJPerKg must be finite');
  }
  refreshCachedTotalFlow(stream);
  return stream;
}

export function setGasMaterialStreamState(stream, gasState = createGasMaterialState(), specificSensibleEnthalpyJPerKg = 0) {
  validateGasMaterialState(gasState);
  if (!Number.isFinite(specificSensibleEnthalpyJPerKg)) {
    throw new Error('specificSensibleEnthalpyJPerKg must be finite');
  }
  stream.physicalForm = MATERIAL_FORMS.GAS;
  stream.gasState = cloneGasMaterialState(gasState);
  stream.specificSensibleEnthalpyJPerKg = specificSensibleEnthalpyJPerKg;
  delete stream.solidState;
  refreshCachedTotalFlow(stream);
  return stream;
}

export function createZeroStream({
  id,
  connectionId = null,
  sourceNodeId,
  sourcePortId,
  targetNodeId,
  targetPortId,
  physicalForm = SOLID_PARTICULATE_FORM,
}) {
  return createMaterialStream({
    id,
    connectionId,
    sourceNodeId,
    sourcePortId,
    targetNodeId,
    targetPortId,
    physicalForm,
    ...(physicalForm === MATERIAL_FORMS.GAS
      ? { gasState: createGasMaterialState() }
      : { solidState: createSolidMaterialState() }),
  });
}

export function clearMaterialStream(stream) {
  if (stream.physicalForm === MATERIAL_FORMS.GAS) {
    return setGasMaterialStreamState(stream, createGasMaterialState());
  }
  return setMaterialStreamState(stream, createSolidMaterialState());
}

export function totalMaterialStreamMassFlowKgPerSecond(stream) {
  if (!Number.isFinite(stream?._cachedTotalMassFlowKgPerSecond)) refreshCachedTotalFlow(stream);
  return stream._cachedTotalMassFlowKgPerSecond;
}

export function scaleFlowRates(solidState, factor) {
  return scaleSolidMaterialState(solidState, factor);
}