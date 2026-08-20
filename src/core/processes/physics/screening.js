import {
  addSolidFractionDirect,
  createSolidMaterialState,
  iterateSolidFractions,
  totalSolidQuantity,
  validateSolidMaterialState,
} from '../../materials/solids/solidMaterialState.js';
import { requireParticleSizeBin } from '../../materials/solids/particleSizeBins.js';

const SCREENING_TOLERANCE = 1e-9;

/**
 * Ideal sharp-cut screening. Existing fractions are routed without changing
 * species, particle-size class, liberation class, texture lineage, or quantity.
 *
 * Fractions whose size-bin upper bound is at or below the aperture are routed
 * to undersize; coarser fractions are routed to oversize.
 */
export function splitScreenedSolidState(solidState, apertureSizeMm) {
  validateSolidMaterialState(solidState);
  if (typeof apertureSizeMm !== 'number' || !Number.isFinite(apertureSizeMm) || apertureSizeMm <= 0) {
    throw new Error('Screen apertureSizeMm must be a finite positive number');
  }

  const stateOptions = { textureProfiles: solidState.textureProfiles ?? {} };
  const undersize = createSolidMaterialState([], stateOptions);
  const oversize = createSolidMaterialState([], stateOptions);

  for (const fraction of iterateSolidFractions(solidState)) {
    const bin = requireParticleSizeBin(fraction.sizeBinId);
    const target = bin.maxMm <= apertureSizeMm ? undersize : oversize;
    addSolidFractionDirect(target, fraction);
  }

  const inputQuantity = totalSolidQuantity(solidState);
  const outputQuantity = totalSolidQuantity(undersize) + totalSolidQuantity(oversize);
  if (Math.abs(inputQuantity - outputQuantity) > SCREENING_TOLERANCE * Math.max(1, inputQuantity)) {
    throw new Error('Screening violated material conservation');
  }

  return { undersize, oversize };
}
