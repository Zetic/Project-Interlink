/**
 * MaterialStream — continuous material flow between two connected ports.
 * Fraction-aware solid-state flow is the physical source of truth. Total flow is
 * always derived; streams never allocate MaterialBatch objects per tick.
 */

import { particleSizeBinIdForMm } from '../core/materials/particleSizeBins.js';
import {
  SOLID_PARTICULATE_FORM,
  addSolidFractionDirect,
  cloneSolidMaterialState,
  createSolidMaterialState,
  scaleSolidMaterialState,
  totalSolidQuantity,
  validateSolidMaterialState,
} from '../core/materials/solidMaterialState.js';

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

export function createMaterialStream({
  id,
  sourceNodeId,
  sourcePortId,
  targetNodeId,
  targetPortId,
  solidState = null,
  componentMassFlowKgPerSecond = null,
  particleSizeMm = null,
  connectionId = null,
}) {
  if (!id || typeof id !== 'string') throw new Error('Stream id must be a non-empty string');
  if (!sourceNodeId || typeof sourceNodeId !== 'string') throw new Error('Stream sourceNodeId must be a non-empty string');
  if (!sourcePortId || typeof sourcePortId !== 'string') throw new Error('Stream sourcePortId must be a non-empty string');
  if (!targetNodeId || typeof targetNodeId !== 'string') throw new Error('Stream targetNodeId must be a non-empty string');
  if (!targetPortId || typeof targetPortId !== 'string') throw new Error('Stream targetPortId must be a non-empty string');

  const normalizedSolidState = solidState
    ? cloneSolidMaterialState(solidState)
    : (componentMassFlowKgPerSecond && Object.keys(componentMassFlowKgPerSecond).length > 0
      ? legacySolidFlow(componentMassFlowKgPerSecond, particleSizeMm)
      : createSolidMaterialState());

  validateSolidMaterialFlowRates(normalizedSolidState);

  const stream = {
    id,
    connectionId,
    sourceNodeId,
    sourcePortId,
    targetNodeId,
    targetPortId,
    physicalForm: SOLID_PARTICULATE_FORM,
    nominalParticleSizeMm: particleSizeMm,
    solidState: normalizedSolidState,
  };
  Object.defineProperty(stream, 'componentMassFlowKgPerSecond', {
    enumerable: true,
    get() {
      const totals = new Map();
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
  return stream;
}

export function createZeroStream({ id, connectionId = null, sourceNodeId, sourcePortId, targetNodeId, targetPortId }) {
  return createMaterialStream({
    id,
    connectionId,
    sourceNodeId,
    sourcePortId,
    targetNodeId,
    targetPortId,
    solidState: createSolidMaterialState(),
  });
}

export function scaleFlowRates(solidState, factor) {
  return scaleSolidMaterialState(solidState, factor);
}
