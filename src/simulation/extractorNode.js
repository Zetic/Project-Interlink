/** Extractor node — converts Feature resource access into an actual material stream. */

import { createSolidMaterialBodyFromOccurrence } from '../core/materials/occurrenceMaterialization.js';

export const DEFAULT_EXTRACTOR_RATE_KG_PER_SECOND = 5;

export function createExtractor({
  id,
  occurrenceId,
  prototypeRateKgPerSecond = DEFAULT_EXTRACTOR_RATE_KG_PER_SECOND,
  enabled = false,
} = {}) {
  if (!id || typeof id !== 'string') throw new Error('Extractor id must be a non-empty string');
  if (!occurrenceId || typeof occurrenceId !== 'string') throw new Error('Extractor occurrenceId must be a non-empty string');
  if (typeof prototypeRateKgPerSecond !== 'number' || !Number.isFinite(prototypeRateKgPerSecond) || prototypeRateKgPerSecond <= 0) {
    throw new Error('Extractor prototypeRateKgPerSecond must be a finite positive number');
  }
  if (typeof enabled !== 'boolean') throw new Error('Extractor enabled must be boolean');

  return {
    id,
    occurrenceId,
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
      { id: 'resource-source', direction: 'input', kind: 'resource-access', label: 'resource source' },
      { id: 'output', direction: 'output', kind: 'material', label: 'material out' },
    ],
  };
}

/**
 * Produce the actual occurrence mixture. Extraction never purifies the source:
 * detailed occurrence composition is preserved proportionally in the output.
 */
export function extractorOutputRates(extractor, occurrence, throttle = 1) {
  const effectiveRate = extractor.prototypeRateKgPerSecond * Math.max(0, Math.min(1, throttle));
  return createSolidMaterialBodyFromOccurrence(occurrence, effectiveRate).solidState;
}
