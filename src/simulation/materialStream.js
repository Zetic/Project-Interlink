/**
 * MaterialStream — continuous material flow between two connected ports.
 * Constituent mass-flow rates are the physical source of truth. Total flow is
 * always derived; streams never allocate MaterialBatch objects per tick.
 */

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

export function totalMassFlowKgPerSecond(componentMassFlowKgPerSecond) {
  validateComponentMassFlowRates(componentMassFlowKgPerSecond);
  return Object.values(componentMassFlowKgPerSecond).reduce((sum, rate) => sum + rate, 0);
}

function validateParticleSizeForRates(rates, particleSizeMm) {
  const total = totalMassFlowKgPerSecond(rates);
  if (total <= STREAM_FLOW_TOLERANCE) {
    if (particleSizeMm == null) return;
    if (typeof particleSizeMm === 'number' && Number.isFinite(particleSizeMm) && particleSizeMm > 0) return;
    throw new Error('Zero-flow stream particleSizeMm must be null or a finite positive number');
  }

  if (typeof particleSizeMm !== 'number' || !Number.isFinite(particleSizeMm) || particleSizeMm <= 0) {
    throw new Error('Flowing stream particleSizeMm must be a finite positive number');
  }
}

export function createMaterialStream({
  id,
  sourceNodeId,
  sourcePortId,
  targetNodeId,
  targetPortId,
  componentMassFlowKgPerSecond = {},
  particleSizeMm = null,
  connectionId = null,
}) {
  if (!id || typeof id !== 'string') throw new Error('Stream id must be a non-empty string');
  if (!sourceNodeId || typeof sourceNodeId !== 'string') throw new Error('Stream sourceNodeId must be a non-empty string');
  if (!sourcePortId || typeof sourcePortId !== 'string') throw new Error('Stream sourcePortId must be a non-empty string');
  if (!targetNodeId || typeof targetNodeId !== 'string') throw new Error('Stream targetNodeId must be a non-empty string');
  if (!targetPortId || typeof targetPortId !== 'string') throw new Error('Stream targetPortId must be a non-empty string');

  validateComponentMassFlowRates(componentMassFlowKgPerSecond);
  validateParticleSizeForRates(componentMassFlowKgPerSecond, particleSizeMm);

  return {
    id,
    connectionId,
    sourceNodeId,
    sourcePortId,
    targetNodeId,
    targetPortId,
    componentMassFlowKgPerSecond: { ...componentMassFlowKgPerSecond },
    particleSizeMm,
  };
}

/** Mutate only the physical rate/state portion of an existing stream. */
export function setMaterialStreamState(stream, componentMassFlowKgPerSecond, particleSizeMm = null) {
  validateComponentMassFlowRates(componentMassFlowKgPerSecond);
  validateParticleSizeForRates(componentMassFlowKgPerSecond, particleSizeMm);
  stream.componentMassFlowKgPerSecond = { ...componentMassFlowKgPerSecond };
  stream.particleSizeMm = particleSizeMm;
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
    componentMassFlowKgPerSecond: {},
    particleSizeMm: null,
  });
}

export function scaleFlowRates(rates, factor) {
  validateComponentMassFlowRates(rates);
  if (typeof factor !== 'number' || !Number.isFinite(factor) || factor < 0 || factor > 1) {
    throw new Error('Flow scale factor must be a finite number in [0, 1]');
  }

  return Object.fromEntries(Object.entries(rates).map(([id, rate]) => [id, rate * factor]));
}
