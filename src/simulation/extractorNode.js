/** Extractor node — converts Feature resource access into an actual material stream. */

import { createSolidMaterialBodyFromOccurrence } from '../core/materials/occurrenceMaterialization.js';
import { MATERIAL_FORMS, physicalFormForOccurrence } from '../core/materials/materialForms.js';
import { PORT_CAPABILITIES } from '../core/systems/ports.js';

export const DEFAULT_EXTRACTOR_RATE_KG_PER_SECOND = 5;
export const EXTRACTOR_SUPPORTED_PHYSICAL_FORMS = Object.freeze([
  MATERIAL_FORMS.SOLID_PARTICULATE,
]);

export function createExtractor({
  id,
  occurrenceId = null,
  prototypeRateKgPerSecond = DEFAULT_EXTRACTOR_RATE_KG_PER_SECOND,
  enabled = false,
} = {}) {
  if (!id || typeof id !== 'string') throw new Error('Extractor id must be a non-empty string');
  if (occurrenceId != null && (typeof occurrenceId !== 'string' || !occurrenceId)) {
    throw new Error('Extractor occurrenceId must be null or a non-empty string');
  }
  if (typeof prototypeRateKgPerSecond !== 'number' || !Number.isFinite(prototypeRateKgPerSecond) || prototypeRateKgPerSecond <= 0) {
    throw new Error('Extractor prototypeRateKgPerSecond must be a finite positive number');
  }
  if (typeof enabled !== 'boolean') throw new Error('Extractor enabled must be boolean');

  return {
    id,
    // A requested occurrence is optional configuration only. The authoritative
    // active source lives on the resource-access connection.
    requestedOccurrenceId: occurrenceId,
    // Presentation compatibility for the currently connected occurrence. This
    // is synchronized by blueprintConnect/blueprintDisconnect and is not used
    // as the simulation source of truth.
    occurrenceId: null,
    prototypeRateKgPerSecond,
    enabled,
    operatingState: enabled ? 'idle' : 'off',
    lastError: null,
    sourceInputPortId: 'resource-source',
    outputPortId: 'output',
    nodeType: 'extractor',
    systemType: 'extractor',
    kind: 'primitive',
    ports: [
      {
        id: 'resource-source',
        direction: 'input',
        kind: 'resource-access',
        label: 'resource source',
        accepts: [PORT_CAPABILITIES.RESOURCE_SOURCE],
      },
      {
        id: 'output',
        direction: 'output',
        kind: 'material',
        label: 'material out',
        provides: [PORT_CAPABILITIES.SOLID_PARTICULATE],
      },
    ],
  };
}

export function extractorOccurrenceEligibility(occurrence) {
  const physicalForm = physicalFormForOccurrence(occurrence);
  if (!physicalForm) {
    return { ok: false, physicalForm: null, reason: 'Extractor cannot determine the resource physical form' };
  }
  if (!EXTRACTOR_SUPPORTED_PHYSICAL_FORMS.includes(physicalForm)) {
    return {
      ok: false,
      physicalForm,
      reason: `Extractor does not support resource physical form '${physicalForm}'`,
    };
  }
  return { ok: true, physicalForm, reason: '' };
}

/**
 * Produce the actual occurrence mixture. Extraction never purifies the source:
 * detailed occurrence composition is preserved proportionally in the output.
 */
export function extractorOutputRates(extractor, occurrence, throttle = 1) {
  const eligibility = extractorOccurrenceEligibility(occurrence);
  if (!eligibility.ok) throw new Error(eligibility.reason);
  const effectiveRate = extractor.prototypeRateKgPerSecond * Math.max(0, Math.min(1, throttle));
  return createSolidMaterialBodyFromOccurrence(occurrence, effectiveRate).solidState;
}
