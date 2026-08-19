import { requireLiberationClass, liberationClassIndex, listLiberationClasses } from '../materials/liberationClasses.js';
import { requireMaterialSpecies } from '../materials/materialSpecies.js';
import {
  getParticleSizeBin,
  particleSizeBinIdForMm,
  particleSizeBinIndex,
  representativeParticleSizeMm,
} from '../materials/particleSizeBins.js';
import {
  addSolidFraction,
  createSolidMaterialState,
  iterateSolidFractions,
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

function coarsestActiveBinIndex(solidState) {
  let coarsestIndex = -1;
  for (const fraction of iterateSolidFractions(solidState)) {
    coarsestIndex = Math.max(coarsestIndex, particleSizeBinIndex(fraction.sizeBinId));
  }
  return coarsestIndex;
}

function computedCrushingSizeShares(inputSizeBinId, targetParticleSizeMm) {
  const inputIndex = particleSizeBinIndex(inputSizeBinId);
  const targetIndex = particleSizeBinIndex(particleSizeBinIdForMm(targetParticleSizeMm));
  if (inputIndex <= targetIndex) return [{ sizeBinId: inputSizeBinId, share: 1 }];
  const entries = [{ sizeBinId: particleSizeBinIdForMm(targetParticleSizeMm), share: 0.65 }];
  const finerIndex = Math.max(0, targetIndex - 1);
  entries.push({ sizeBinId: listOrderedSizeBinIds()[finerIndex], share: 0.25 });
  const finestIndex = Math.max(0, targetIndex - 2);
  entries.push({ sizeBinId: listOrderedSizeBinIds()[finestIndex], share: 0.1 });
  return mergeShares(entries);
}

function listOrderedSizeBinIds() {
  return ['lt-1mm', '1-5mm', '5-15mm', '15-25mm', '25-60mm', '60-120mm', '120mm-plus'];
}

function distributeLiberationMass(outputState, speciesId, inputLiberationClassId, inputSizeBinId, outputSizeBinId, massKg) {
  const liberationClasses = listLiberationClasses();
  const inputIndex = liberationClassIndex(inputLiberationClassId);
  const outputSizeIndex = particleSizeBinIndex(outputSizeBinId);
  const inputSizeIndex = particleSizeBinIndex(inputSizeBinId);
  const maxIndex = liberationClasses.length - 1;
  const sizeImprovement = Math.max(0, inputSizeIndex - outputSizeIndex);
  const maxLift = Math.min(maxIndex - inputIndex, sizeImprovement >= 2 ? 2 : sizeImprovement >= 1 ? 1 : 0);

  if (maxLift <= 0 || inputIndex >= maxIndex) {
    addSolidFraction(outputState, { speciesId, sizeBinId: outputSizeBinId, liberationClassId: inputLiberationClassId, quantity: massKg });
    return;
  }

  const improvedShare = clamp(0.2 + 0.2 * sizeImprovement, 0, maxLift >= 2 ? 0.8 : 0.65);
  const sameShare = 1 - improvedShare;
  if (sameShare > 0) {
    addSolidFraction(outputState, {
      speciesId,
      sizeBinId: outputSizeBinId,
      liberationClassId: liberationClasses[inputIndex].id,
      quantity: massKg * sameShare,
    });
  }
  if (maxLift === 1) {
    addSolidFraction(outputState, {
      speciesId,
      sizeBinId: outputSizeBinId,
      liberationClassId: liberationClasses[inputIndex + 1].id,
      quantity: massKg * improvedShare,
    });
    return;
  }
  addSolidFraction(outputState, {
    speciesId,
    sizeBinId: outputSizeBinId,
    liberationClassId: liberationClasses[inputIndex + 1].id,
    quantity: massKg * improvedShare * 0.65,
  });
  addSolidFraction(outputState, {
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
  const species = requireMaterialSpecies(speciesId);
  const liberationClass = requireLiberationClass(liberationClassId);
  const sizeSuitability = particleSizeSuitability(sizeBinId);
  const magnetic = species.physicalProperties?.magneticResponse;
  if (!magnetic) throw new Error(`Material species '${speciesId}' does not define magnetic response`);
  const fieldCurve = 0.15 + 0.85 * fieldStrength;
  const magneticRecovery = magnetic.susceptibility * liberationClass.recoveryFactor * sizeSuitability * fieldCurve;
  const entrainment = magnetic.entrainmentFactor * sizeSuitability * (0.25 + 0.75 * fieldStrength);
  return clamp(magneticRecovery + entrainment, 0, 1);
}

export function splitMagneticSolidState(feedSolidState, fieldStrength, maxFeedParticleSizeMm = 25) {
  validateSolidMaterialState(feedSolidState);
  const concentrate = createSolidMaterialState();
  const tailings = createSolidMaterialState();

  for (const fraction of iterateSolidFractions(feedSolidState)) {
    const bin = getParticleSizeBin(fraction.sizeBinId);
    if (!bin) throw new Error(`Unknown particle-size bin '${fraction.sizeBinId}'`);
    if (bin.maxMm > maxFeedParticleSizeMm) {
      throw new Error(
        `Magnetic Separator requires feed particle size <= ${maxFeedParticleSizeMm} mm (got ${representativeParticleSizeMm(fraction.sizeBinId)} mm representative)`
      );
    }
    const recovery = magneticRecoveryForFraction(
      fraction.speciesId,
      fraction.sizeBinId,
      fraction.liberationClassId,
      fieldStrength,
    );
    addSolidFraction(concentrate, { ...fraction, quantity: fraction.quantity * recovery });
    addSolidFraction(tailings, { ...fraction, quantity: fraction.quantity - (fraction.quantity * recovery) });
  }

  return { concentrate, tailings };
}

export function assertCrushingTarget(feedSolidState, targetParticleSizeMm) {
  validateSolidMaterialState(feedSolidState);
  if (typeof targetParticleSizeMm !== 'number' || !Number.isFinite(targetParticleSizeMm) || targetParticleSizeMm <= 0) {
    throw new Error('Crusher targetParticleSizeMm must be a finite positive number');
  }
  const coarsestIndex = coarsestActiveBinIndex(feedSolidState);
  const targetIndex = particleSizeBinIndex(particleSizeBinIdForMm(targetParticleSizeMm));
  if (coarsestIndex < 0) {
    throw new Error('Crusher requires non-empty feed');
  }
  if (targetIndex >= coarsestIndex) {
    throw new Error(
      `Crusher requires targetParticleSizeMm below current feed size (${representativeParticleSizeMm(listOrderedSizeBinIds()[coarsestIndex])} mm representative); got ${targetParticleSizeMm} mm`
    );
  }
}

export function crushSolidMaterialState(feedSolidState, targetParticleSizeMm) {
  validateSolidMaterialState(feedSolidState);
  assertCrushingTarget(feedSolidState, targetParticleSizeMm);
  const product = createSolidMaterialState();
  for (const fraction of iterateSolidFractions(feedSolidState)) {
    const sizeShares = computedCrushingSizeShares(fraction.sizeBinId, targetParticleSizeMm);
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
  }
  const inputTotal = totalSolidQuantity(feedSolidState);
  const outputTotal = totalSolidQuantity(product);
  if (Math.abs(inputTotal - outputTotal) > 1e-9 * Math.max(1, inputTotal)) {
    throw new Error('Crusher violated solid-matter conservation');
  }
  return product;
}
