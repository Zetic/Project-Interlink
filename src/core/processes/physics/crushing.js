import { liberationClassIndex, listLiberationClasses } from '../../materials/solids/liberationClasses.js';
import {
  listParticleSizeBins,
  particleSizeBinIdForMm,
  particleSizeBinIndex,
} from '../../materials/solids/particleSizeBins.js';
import {
  addSolidFractionDirect,
  createSolidMaterialState,
  forEachSolidFraction,
  totalSolidQuantity,
  validateSolidMaterialState,
} from '../../materials/solids/solidMaterialState.js';

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

function computedCrushingSizeShares(inputSizeBinId, targetSizeBinId, targetParticleSizeMm) {
  const inputIndex = particleSizeBinIndex(inputSizeBinId);
  const targetIndex = particleSizeBinIndex(targetSizeBinId);
  if (inputIndex <= targetIndex) return [{ sizeBinId: inputSizeBinId, share: 1 }];

  const orderedSizeBinIds = listOrderedSizeBinIds();

  // Preserve historical behavior for persisted legacy 10/12 mm settings. New
  // player-facing canonical settings model a nominal crusher product rather
  // than a perfect maximum-size cutoff.
  if ([10, 12].includes(targetParticleSizeMm)) {
    const entries = [{ sizeBinId: targetSizeBinId, share: 0.65 }];
    const finerIndex = Math.max(0, targetIndex - 1);
    entries.push({ sizeBinId: orderedSizeBinIds[finerIndex], share: 0.25 });
    const finestIndex = Math.max(0, targetIndex - 2);
    entries.push({ sizeBinId: orderedSizeBinIds[finestIndex], share: 0.1 });
    return mergeShares(entries);
  }

  // Crushers produce a particle-size distribution, not a perfect classifier.
  // A nominal setting therefore leaves a deterministic oversize population
  // for a downstream Screen to classify/recycle. Finer shares merge naturally
  // at the lower end of the available size-bin vocabulary.
  const coarserIndex = Math.min(orderedSizeBinIds.length - 1, targetIndex + 1);
  const finerIndex = Math.max(0, targetIndex - 1);
  const finestIndex = Math.max(0, targetIndex - 2);
  return mergeShares([
    { sizeBinId: orderedSizeBinIds[coarserIndex], share: 0.10 },
    { sizeBinId: targetSizeBinId, share: 0.55 },
    { sizeBinId: orderedSizeBinIds[finerIndex], share: 0.25 },
    { sizeBinId: orderedSizeBinIds[finestIndex], share: 0.10 },
  ]);
}

function listOrderedSizeBinIds() {
  return listParticleSizeBins().map(bin => bin.id);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function distributeLiberationMass(
  outputState,
  speciesId,
  inputLiberationClassId,
  inputSizeBinId,
  outputSizeBinId,
  massKg,
) {
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
    const sizeShares = computedCrushingSizeShares(
      fraction.sizeBinId,
      targetSizeBinId,
      targetParticleSizeMm,
    );
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
