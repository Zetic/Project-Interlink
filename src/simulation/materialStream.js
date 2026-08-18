/**
 * MaterialStream — represents a continuous solid-material flow between two nodes.
 *
 * A stream is a rate + material-state object. It does NOT allocate MaterialBatch
 * objects per tick. Constituent mass-flow rates (kg/s) are the physical source of
 * truth; total flow is derived.
 *
 * Schema:
 * {
 *   id: string,
 *   sourceNodeId: string,
 *   sourcePortId: string,
 *   targetNodeId: string,
 *   targetPortId: string,
 *   componentMassFlowKgPerSecond: { [componentId]: number },
 *   particleSizeMm: number,
 * }
 *
 * All flow rates must be finite and non-negative.
 * particleSizeMm must be finite and positive.
 */

const STREAM_FLOW_TOLERANCE = 1e-12;

/**
 * Create a new MaterialStream.
 *
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.sourceNodeId
 * @param {string} params.sourcePortId
 * @param {string} params.targetNodeId
 * @param {string} params.targetPortId
 * @param {{ [componentId: string]: number }} params.componentMassFlowKgPerSecond
 * @param {number} params.particleSizeMm
 * @returns {object} stream
 */
export function createMaterialStream({
  id,
  sourceNodeId,
  sourcePortId,
  targetNodeId,
  targetPortId,
  componentMassFlowKgPerSecond,
  particleSizeMm,
}) {
  if (!id || typeof id !== 'string') throw new Error('Stream id must be a non-empty string');
  if (!sourceNodeId || typeof sourceNodeId !== 'string') throw new Error('Stream sourceNodeId must be a non-empty string');
  if (!sourcePortId || typeof sourcePortId !== 'string') throw new Error('Stream sourcePortId must be a non-empty string');
  if (!targetNodeId || typeof targetNodeId !== 'string') throw new Error('Stream targetNodeId must be a non-empty string');
  if (!targetPortId || typeof targetPortId !== 'string') throw new Error('Stream targetPortId must be a non-empty string');

  validateComponentMassFlowRates(componentMassFlowKgPerSecond);

  if (typeof particleSizeMm !== 'number' || !Number.isFinite(particleSizeMm) || particleSizeMm <= 0) {
    throw new Error('Stream particleSizeMm must be a finite positive number');
  }

  return {
    id,
    sourceNodeId,
    sourcePortId,
    targetNodeId,
    targetPortId,
    componentMassFlowKgPerSecond: { ...componentMassFlowKgPerSecond },
    particleSizeMm,
  };
}

/**
 * Validate that all component flow rates are finite and non-negative.
 *
 * @param {{ [componentId: string]: number }} rates
 */
export function validateComponentMassFlowRates(rates) {
  if (!rates || typeof rates !== 'object' || Array.isArray(rates)) {
    throw new Error('componentMassFlowKgPerSecond must be an object');
  }
  const entries = Object.entries(rates);
  if (entries.length === 0) {
    throw new Error('componentMassFlowKgPerSecond must contain at least one component');
  }
  for (const [id, rate] of entries) {
    if (typeof rate !== 'number' || !Number.isFinite(rate)) {
      throw new Error(`Stream component '${id}' flow rate must be a finite number`);
    }
    if (rate < 0) {
      throw new Error(`Stream component '${id}' flow rate must be non-negative`);
    }
  }
}

/**
 * Derive total mass flow rate (kg/s) from constituent rates.
 *
 * @param {{ [componentId: string]: number }} componentMassFlowKgPerSecond
 * @returns {number}
 */
export function totalMassFlowKgPerSecond(componentMassFlowKgPerSecond) {
  return Object.values(componentMassFlowKgPerSecond).reduce((sum, r) => sum + r, 0);
}

/**
 * Create an inert zero-flow stream (all rates zero).
 * Useful as a placeholder before a connection is fully established.
 *
 * @param {object} params - same shape as createMaterialStream minus flow rates/size
 * @param {string[]} componentIds
 * @param {number} particleSizeMm
 * @returns {object} stream
 */
export function createZeroStream({ id, sourceNodeId, sourcePortId, targetNodeId, targetPortId }, componentIds, particleSizeMm) {
  const rates = {};
  for (const cid of componentIds) rates[cid] = 0;
  return createMaterialStream({
    id, sourceNodeId, sourcePortId, targetNodeId, targetPortId,
    componentMassFlowKgPerSecond: rates,
    particleSizeMm,
  });
}

/**
 * Scale all component flow rates by a scalar factor (0..1 for throttling).
 * Returns a new rates object.
 *
 * @param {{ [componentId: string]: number }} rates
 * @param {number} factor
 * @returns {{ [componentId: string]: number }}
 */
export function scaleFlowRates(rates, factor) {
  const scaled = {};
  for (const [id, rate] of Object.entries(rates)) {
    scaled[id] = rate * factor;
  }
  return scaled;
}

export { STREAM_FLOW_TOLERANCE };
