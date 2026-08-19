/** Extractor node — converts Feature resource access into an actual material stream. */

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
  const composition = occurrence?.composition;
  const PROTOTYPE_FEED_PARTICLE_SIZE_MM = 80;
  const componentMassFlowKgPerSecond = {};

  if (composition && typeof composition === 'object' && !Array.isArray(composition)) {
    const total = Object.values(composition).reduce((sum, pct) => sum + pct, 0);
    if (total > 0) {
      for (const [componentId, pct] of Object.entries(composition)) {
        componentMassFlowKgPerSecond[componentId] = effectiveRate * (pct / total);
      }
    } else {
      componentMassFlowKgPerSecond[occurrence.resourceId ?? 'raw-material'] = effectiveRate;
    }
  } else {
    // Coarse resource identity is retained when chemistry for this feedstock is not modeled yet.
    componentMassFlowKgPerSecond[occurrence?.resourceId ?? 'raw-material'] = effectiveRate;
  }

  return { componentMassFlowKgPerSecond, particleSizeMm: PROTOTYPE_FEED_PARTICLE_SIZE_MM };
}
