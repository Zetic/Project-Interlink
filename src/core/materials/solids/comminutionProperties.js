function assertFinitePositive(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive number`);
  }
}

function assertFiniteNonNegative(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number`);
  }
}

/**
 * Occurrence-scoped engineering test properties used by comminution equipment.
 * These are physical/engineering measurements, not gameplay ratings:
 * - Bond Crushing Work Index (CWi), kWh/t
 * - Bond Ball Mill Work Index (BWi), kWh/t
 * - Bond Abrasion Index (Ai), dimensionless laboratory index
 */
export function validateComminutionProperties(properties) {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    throw new Error('comminution properties must be an object');
  }
  assertFinitePositive(
    properties.bondCrushingWorkIndexKWhPerT,
    'bondCrushingWorkIndexKWhPerT',
  );
  assertFinitePositive(
    properties.bondBallMillWorkIndexKWhPerT,
    'bondBallMillWorkIndexKWhPerT',
  );
  assertFiniteNonNegative(properties.bondAbrasionIndex, 'bondAbrasionIndex');
  return properties;
}

export function cloneComminutionProperties(properties) {
  validateComminutionProperties(properties);
  return {
    bondCrushingWorkIndexKWhPerT: properties.bondCrushingWorkIndexKWhPerT,
    bondBallMillWorkIndexKWhPerT: properties.bondBallMillWorkIndexKWhPerT,
    bondAbrasionIndex: properties.bondAbrasionIndex,
  };
}

export function comminutionPropertiesEqual(a, b) {
  if (!a || !b) return a === b;
  return a.bondCrushingWorkIndexKWhPerT === b.bondCrushingWorkIndexKWhPerT
    && a.bondBallMillWorkIndexKWhPerT === b.bondBallMillWorkIndexKWhPerT
    && a.bondAbrasionIndex === b.bondAbrasionIndex;
}

/**
 * Classical Bond specific-energy relationship. F80/P80 are micrometres and
 * workIndexKWhPerT is the appropriate measured Bond work index for the process.
 */
export function bondSpecificEnergyKWhPerT(workIndexKWhPerT, feedP80Um, productP80Um) {
  assertFinitePositive(workIndexKWhPerT, 'Bond work index');
  assertFinitePositive(feedP80Um, 'F80');
  assertFinitePositive(productP80Um, 'P80');
  if (productP80Um >= feedP80Um) return 0;
  return workIndexKWhPerT * 10 * (
    (1 / Math.sqrt(productP80Um)) - (1 / Math.sqrt(feedP80Um))
  );
}
