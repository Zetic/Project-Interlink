import { requireLiberationClass } from '../../materials/solids/liberationClasses.js';
import { magneticResponseForSpecies } from '../../materials/properties/magneticProperties.js';
import { getMaterialSpecies } from '../../materials/species/materialSpecies.js';
import {
  getParticleSizeBin,
  particleSizeBinIndex,
} from '../../materials/solids/particleSizeBins.js';
import {
  addSolidFractionDirect,
  createSolidMaterialState,
  forEachSolidFraction,
  totalSolidQuantity,
  validateSolidMaterialState,
} from '../../materials/solids/solidMaterialState.js';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Process carryover/entrainment belongs to the separator model, not intrinsic species data.
const MAGNETIC_SEPARATOR_BASE_CARRYOVER = 0.02;

function particleSizeSuitability(binId) {
  switch (binId) {
    case 'lt-1mm': return 0.4;
    case '1-5mm': return 0.65;
    case '5-15mm': return 0.9;
    case '15-25mm': return 1;
    default: return 0;
  }
}

export function magneticRecoveryForFraction(speciesId, sizeBinId, liberationClassId, fieldStrength) {
  if (typeof fieldStrength !== 'number' || !Number.isFinite(fieldStrength) || fieldStrength < 0 || fieldStrength > 1) {
    throw new Error('Magnetic Separator fieldStrength must be a number in [0, 1]');
  }
  const species = getMaterialSpecies(speciesId);
  const liberationClass = requireLiberationClass(liberationClassId);
  const sizeSuitability = particleSizeSuitability(sizeBinId);
  const magnetic = magneticResponseForSpecies(species);
  if (!magnetic) {
    throw new Error(`Magnetic Separator does not support species '${speciesId}' without magnetic response data`);
  }
  const fieldCurve = 0.15 + 0.85 * fieldStrength;
  const magneticRecovery =
    magnetic.normalizedSeparationCoefficient
    * liberationClass.recoveryFactor
    * sizeSuitability
    * fieldCurve;
  const entrainment = MAGNETIC_SEPARATOR_BASE_CARRYOVER * sizeSuitability * (0.25 + 0.75 * fieldStrength);
  return clamp(magneticRecovery + entrainment, 0, 1);
}

function oversizedFeedSummary(feedSolidState, maxFeedParticleSizeMm) {
  const total = totalSolidQuantity(feedSolidState);
  let oversized = 0;
  let largestBin = null;

  forEachSolidFraction(feedSolidState, (fraction) => {
    const bin = getParticleSizeBin(fraction.sizeBinId);
    if (!bin) throw new Error(`Unknown particle-size bin '${fraction.sizeBinId}'`);
    if (bin.maxMm <= maxFeedParticleSizeMm) return;
    oversized += fraction.quantity;
    if (!largestBin || particleSizeBinIndex(bin.id) > particleSizeBinIndex(largestBin.id)) {
      largestBin = bin;
    }
  });

  return {
    oversized,
    percentage: total > 0 ? oversized / total * 100 : 0,
    largestBin,
  };
}

export function splitMagneticSolidState(feedSolidState, fieldStrength, maxFeedParticleSizeMm = 25) {
  validateSolidMaterialState(feedSolidState);
  const oversized = oversizedFeedSummary(feedSolidState, maxFeedParticleSizeMm);
  if (oversized.oversized > 0) {
    throw new Error(
      `Magnetic Separator requires feed particle size <= ${maxFeedParticleSizeMm} mm; blocked because feed contains ${oversized.percentage.toFixed(1)}% oversized material (largest class ${oversized.largestBin?.name ?? 'unknown'})`
    );
  }

  const concentrate = createSolidMaterialState();
  const tailings = createSolidMaterialState();

  forEachSolidFraction(feedSolidState, (fraction) => {
    const recovery = magneticRecoveryForFraction(
      fraction.speciesId,
      fraction.sizeBinId,
      fraction.liberationClassId,
      fieldStrength,
    );
    addSolidFractionDirect(concentrate, { ...fraction, quantity: fraction.quantity * recovery });
    addSolidFractionDirect(tailings, { ...fraction, quantity: fraction.quantity - (fraction.quantity * recovery) });
  });

  return { concentrate, tailings };
}
