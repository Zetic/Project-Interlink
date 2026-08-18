export const MAGNETIC_RESPONSE_BY_COMPONENT = Object.freeze({
  magnetite: Object.freeze({ baseRecovery: 0.2, variableRecovery: 0.75 }),
  hematite: Object.freeze({ baseRecovery: 0.08, variableRecovery: 0.32 }),
  goethite: Object.freeze({ baseRecovery: 0.05, variableRecovery: 0.18 }),
  quartzAndGangue: Object.freeze({ baseRecovery: 0.01, variableRecovery: 0.04 }),
});

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function magneticRecoveryForComponent(componentId, fieldStrength) {
  if (typeof fieldStrength !== 'number' || !Number.isFinite(fieldStrength) || fieldStrength < 0 || fieldStrength > 1) {
    throw new Error('Magnetic Separator fieldStrength must be a number in [0, 1]');
  }

  const response = MAGNETIC_RESPONSE_BY_COMPONENT[componentId];
  if (!response) {
    throw new Error(`Magnetic Separator does not support component '${componentId}'`);
  }

  return clamp(response.baseRecovery + response.variableRecovery * fieldStrength, 0, 1);
}

/**
 * Split arbitrary non-negative constituent quantities using the shared magnetic
 * recovery model. The quantities may be masses (kg) or mass-flow rates (kg/s).
 * roundValue is used by discrete batch execution to preserve its established
 * six-decimal storage precision; continuous execution leaves rates unrounded.
 */
export function splitMagneticComponents(components, fieldStrength, roundValue = value => value) {
  if (!components || typeof components !== 'object' || Array.isArray(components)) {
    throw new Error('Magnetic Separator components must be an object');
  }

  const concentrate = {};
  const tailings = {};

  for (const [componentId, inputQuantity] of Object.entries(components)) {
    if (typeof inputQuantity !== 'number' || !Number.isFinite(inputQuantity) || inputQuantity < 0) {
      throw new Error(`Magnetic Separator component '${componentId}' must be finite and non-negative`);
    }

    const recovery = magneticRecoveryForComponent(componentId, fieldStrength);
    const concentrateQuantity = roundValue(inputQuantity * recovery);
    const tailingsQuantity = roundValue(inputQuantity - concentrateQuantity);

    concentrate[componentId] = concentrateQuantity;
    tailings[componentId] = tailingsQuantity;
  }

  return { concentrate, tailings };
}

export function assertCrushingTarget(feedParticleSizeMm, targetParticleSizeMm) {
  if (typeof feedParticleSizeMm !== 'number' || !Number.isFinite(feedParticleSizeMm) || feedParticleSizeMm <= 0) {
    throw new Error('Crusher feed particle size must be a finite positive number');
  }
  if (typeof targetParticleSizeMm !== 'number' || !Number.isFinite(targetParticleSizeMm) || targetParticleSizeMm <= 0) {
    throw new Error('Crusher targetParticleSizeMm must be a finite positive number');
  }
  if (targetParticleSizeMm >= feedParticleSizeMm) {
    throw new Error(
      `Crusher requires targetParticleSizeMm below current feed size (${feedParticleSizeMm} mm); got ${targetParticleSizeMm} mm`
    );
  }
}
