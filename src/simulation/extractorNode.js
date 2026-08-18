/**
 * Extractor node — automatically sources material from a ResourceOccurrence
 * and produces a continuous material stream.
 *
 * PROTOTYPE LIMITATION: current ResourceOccurrence quantities are qualitative,
 * not precise geological reserve masses. This extractor uses a documented
 * prototype extraction rate and does NOT model accurate reserve depletion.
 * The relationship is: Extractor → actual ResourceOccurrence → stream output.
 *
 * Physical state:
 * {
 *   id: string,
 *   occurrenceId: string,         // references world.resourceOccurrences[id]
 *   // Prototype extraction rate — not geological truth
 *   prototypeRateKgPerSecond: number,
 *   enabled: boolean,            // machine command state
 *   operatingState: string,      // off | idle | running | blocked,
 *   outputPortId: 'output',
 *   nodeType: 'extractor',
 * }
 */

/** Default prototype extraction rate (kg/s). */
export const DEFAULT_EXTRACTOR_RATE_KG_PER_SECOND = 5;

/**
 * Create a new Extractor node.
 *
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.occurrenceId
 * @param {number} [params.prototypeRateKgPerSecond]
 * @returns {object} extractor
 */
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
    outputPortId: 'output',
    nodeType: 'extractor',
    systemType: 'extractor',
    kind: 'primitive',
  };
}

/**
 * Compute the output component flow rates (kg/s) for this extractor given
 * the linked occurrence and a throttle factor (0..1, e.g. from downstream backpressure).
 *
 * The occurrence must have a `composition` object (percentage by component) to
 * produce a structured stream. Iron-ore-like occurrences with `featureComposition`
 * data have this. If no composition is available, all flow is assigned to a
 * single generic 'ore' component.
 *
 * @param {object} extractor
 * @param {object} occurrence - world.resourceOccurrences[id]
 * @param {number} [throttle=1] - 0..1 scale factor
 * @returns {{ componentMassFlowKgPerSecond: { [componentId: string]: number }, particleSizeMm: number }}
 */
export function extractorOutputRates(extractor, occurrence, throttle = 1) {
  const effectiveRate = extractor.prototypeRateKgPerSecond * Math.max(0, Math.min(1, throttle));
  const composition = occurrence?.composition;

  /** Prototype initial particle size for un-crushed ore (mm). */
  const PROTOTYPE_FEED_PARTICLE_SIZE_MM = 80;

  const componentMassFlowKgPerSecond = {};

  if (composition && typeof composition === 'object' && !Array.isArray(composition)) {
    const total = Object.values(composition).reduce((sum, pct) => sum + pct, 0);
    if (total > 0) {
      for (const [cid, pct] of Object.entries(composition)) {
        componentMassFlowKgPerSecond[cid] = effectiveRate * (pct / total);
      }
    } else {
      componentMassFlowKgPerSecond[occurrence.resourceId ?? 'ore'] = effectiveRate;
    }
  } else {
    componentMassFlowKgPerSecond[occurrence?.resourceId ?? 'ore'] = effectiveRate;
  }

  return {
    componentMassFlowKgPerSecond,
    particleSizeMm: PROTOTYPE_FEED_PARTICLE_SIZE_MM,
  };
}
