import { requireLiberationClass, liberationClassIndex, listLiberationClasses } from '../materials/liberationClasses.js';
import { getMaterialSpecies } from '../materials/materialSpecies.js';
import {
  getParticleSizeBin,
  listParticleSizeBins,
  particleSizeBinIdForMm,
  particleSizeBinIndex,
} from '../materials/particleSizeBins.js';
import {
  addSolidFractionDirect,
  createSolidMaterialState,
  forEachSolidFraction,
  totalSolidQuantity,
  validateSolidMaterialState,
} from '../materials/solidMaterialState.js';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function mergeShares(entries) {
  const merged = new Map();
  for (const entry of entries) {
    merged.set(entry.sizeBinId, (merged.get(entry.sizeBinId) ?? 0) + entry.share);
  }
  return [...merged.entries()].map(([sizeBinId, share]) => ({ sizeBinId, share }));
}

function requireCrusherTargetSizeBinId(targetParticleSizeMm) {
  if (typeof targetParticleSizeMm !== 'number' || !Number.isFinite(targetParticleSizeMm) || targetParticleSizeMm <= 0) {
    throw new Error('Crusher targetParticleSizeMm must be a finite positive number');
  }
  return particleSizeBinIdForMm(targetParticleSizeMm);
}

function computedCrushingSizeShares(inputSizeBinId, targetSizeBinId) {
  const inputIndex = particleSizeBinIndex(inputSizeBinId);
  const targetIndex = particleSizeBinIndex(targetSizeBinId);
  if (inputIndex <= targetIndex) return [{ sizeBinId: inputSizeBinId, share: 1 }];
  const entries = [{ sizeBinId: targetSizeBinId, share: 0.65 }];
  const finerIndex = Math.max(0, targetIndex - 1);
  entries.push({ sizeBinId: listOrderedSizeBinIds()[finerIndex], share: 0.25 });
  const finestIndex = Math.max(0, targetIndex - 2);
  entries.push({ sizeBinId: listOrderedSizeBinIds()[finestIndex], share: 0.1 });
  return mergeShares(entries);
}

function listOrderedSizeBinIds() {
  return listParticleSizeBins().map(bin => bin.id);
}

// Process carryover/entrainment belongs to the separator model, not intrinsic species data.
const MAGNETIC_SEPARATOR_BASE_CARRYOVER = 0.02;

function distributeLiberationMass(outputState, speciesId, inputLiberationClassId, inputSizeBinId, outputSizeBinId, massKg) {
  const liberationClasses = listLiberationClasses();
  const inputIndex = liberationClassIndex(inputLiberationClassId);
  const outputSizeIndex = particleSizeBinIndex(outputSizeBinId);
  const inputSizeIndex = particleSizeBinIndex(inputSizeBinId);
  const maxIndex = liberationClasses.length - 1;
  const sizeImprovement = Math.max(0, inputSizeIndex - outputSizeIndex);
  const maxLift = Math.min(maxIndex - inputIndex, sizeImprovement >= 2 ? 2 : sizeImprovement >= 1 ? 1 : 0);

  if (maxLift <= 0 || inputIndex >= maxIndex) {
    addSolidFractionDirect(outputState, {
      speciesId,
      sizeBinId: outputSizeBinId,
      liberationClassId: inputLiberationClassId,
      quantity: massKg,
    });
    return;
  }

  const improvedShare = clamp(0.2 + 0.2 * sizeImprovement, 0, maxLift >= 2 ? 0.8 : 0.65);
  const sameShare = 1 - improvedShare;
  if (sameShare > 0) {
    addSolidFractionDirect(outputState, {
      speciesId,
      sizeBinId: outputSizeBinId,
      liberationClassId: liberationClasses[inputIndex].id,
      quantity: massKg * sameShare,
    });
  }
  if (maxLift === 1) {
    addSolidFractionDirect(outputState, {
      speciesId,
      sizeBinId: outputSizeBinId,
      liberationClassId: liberationClasses[inputIndex + 1].id,
      quantity: massKg * improvedShare,
    });
    return;
  }
  addSolidFractionDirect(outputState, {
    speciesId,
    sizeBinId: outputSizeBinId,
    liberationClassId: liberationClasses[inputIndex + 1].id,
    quantity: massKg * improvedShare * 0.65,
  });
  addSolidFractionDirect(outputState, {
    speciesId,
    sizeBinId: outputSizeBinId,
    liberationClassId: liberationClasses[inputIndex + 2].id,
    quantity: massKg * improvedShare * 0.35,
  });
}

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
  const magnetic = species?.physicalProperties?.magneticResponse;
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
      `Magnetic Separator blocked: feed contains ${oversized.percentage.toFixed(1)}% oversized material (> ${maxFeedParticleSizeMm} mm; largest class ${oversized.largestBin?.name ?? 'unknown'})`
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

export function hasCrushableSolidFractions(feedSolidState, targetParticleSizeMm) {
  validateSolidMaterialState(feedSolidState);
  const targetIndex = particleSizeBinIndex(requireCrusherTargetSizeBinId(targetParticleSizeMm));
  return Object.keys(feedSolidState.fractions).some((key) => {
    const [, sizeBinId] = key.split('|');
    return particleSizeBinIndex(sizeBinId) > targetIndex;
  });
}

export function crushSolidMaterialState(feedSolidState, targetParticleSizeMm) {
  validateSolidMaterialState(feedSolidState);
  const targetSizeBinId = requireCrusherTargetSizeBinId(targetParticleSizeMm);
  const product = createSolidMaterialState();
  let sawFeed = false;
  forEachSolidFraction(feedSolidState, (fraction) => {
    sawFeed = true;
    const sizeShares = computedCrushingSizeShares(fraction.sizeBinId, targetSizeBinId);
    for (const outputShare of sizeShares) {
      distributeLiberationMass(
        product,
        fraction.speciesId,
        fraction.liberationClassId,
        fraction.sizeBinId,
        outputShare.sizeBinId,
        fraction.quantity * outputShare.share,
      );
    }
  });
  if (!sawFeed) throw new Error('Crusher requires non-empty feed');
  const inputTotal = totalSolidQuantity(feedSolidState);
  const outputTotal = totalSolidQuantity(product);
  if (Math.abs(inputTotal - outputTotal) > 1e-9 * Math.max(1, inputTotal)) {
    throw new Error('Crusher violated solid-matter conservation');
  }
  return product;
}
