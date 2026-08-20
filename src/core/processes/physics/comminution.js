import { liberationClassIndex, listLiberationClasses } from '../../materials/solids/liberationClasses.js';
import {
  getParticleSizeBin,
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

export const COMMINUTION_EQUIPMENT = Object.freeze({
  JAW_CRUSHER: 'jaw-crusher',
  CONE_CRUSHER: 'cone-crusher',
  BALL_MILL: 'ball-mill',
});

const EQUIPMENT_PROFILES = Object.freeze({
  [COMMINUTION_EQUIPMENT.JAW_CRUSHER]: Object.freeze({
    label: 'Jaw Crusher',
    maxFeedParticleSizeMm: 1000,
    productShares: Object.freeze([
      Object.freeze({ offset: 1, share: 0.15 }),
      Object.freeze({ offset: 0, share: 0.55 }),
      Object.freeze({ offset: -1, share: 0.20 }),
      Object.freeze({ offset: -2, share: 0.10 }),
    ]),
    liberationMode: 'coarse-crushing',
  }),
  [COMMINUTION_EQUIPMENT.CONE_CRUSHER]: Object.freeze({
    label: 'Cone Crusher',
    maxFeedParticleSizeMm: 250,
    productShares: Object.freeze([
      Object.freeze({ offset: 1, share: 0.10 }),
      Object.freeze({ offset: 0, share: 0.55 }),
      Object.freeze({ offset: -1, share: 0.25 }),
      Object.freeze({ offset: -2, share: 0.10 }),
    ]),
    liberationMode: 'fine-crushing',
  }),
  [COMMINUTION_EQUIPMENT.BALL_MILL]: Object.freeze({
    label: 'Ball Mill',
    maxFeedParticleSizeMm: 25,
    productShares: Object.freeze([
      Object.freeze({ offset: 1, share: 0.05 }),
      Object.freeze({ offset: 0, share: 0.45 }),
      Object.freeze({ offset: -1, share: 0.30 }),
      Object.freeze({ offset: -2, share: 0.15 }),
      Object.freeze({ offset: -3, share: 0.05 }),
    ]),
    liberationMode: 'grinding',
  }),
});

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function requireEquipmentProfile(equipmentId) {
  const profile = EQUIPMENT_PROFILES[equipmentId];
  if (!profile) throw new Error(`Unknown comminution equipment '${equipmentId}'`);
  return profile;
}

function mergeShares(entries) {
  const merged = new Map();
  for (const entry of entries) {
    merged.set(entry.sizeBinId, (merged.get(entry.sizeBinId) ?? 0) + entry.share);
  }
  return [...merged.entries()].map(([sizeBinId, share]) => ({ sizeBinId, share }));
}

function outputSizeShares(inputSizeBinId, targetSizeBinId, profile) {
  const inputIndex = particleSizeBinIndex(inputSizeBinId);
  const targetIndex = particleSizeBinIndex(targetSizeBinId);
  if (inputIndex <= targetIndex) return [{ sizeBinId: inputSizeBinId, share: 1 }];

  const ordered = listParticleSizeBins();
  return mergeShares(profile.productShares.map(entry => ({
    sizeBinId: ordered[clamp(targetIndex + entry.offset, 0, ordered.length - 1)].id,
    share: entry.share,
  })));
}

function oversizedFeedSummary(feedSolidState, maxFeedParticleSizeMm) {
  const total = totalSolidQuantity(feedSolidState);
  let oversized = 0;
  let largestBin = null;

  forEachSolidFraction(feedSolidState, fraction => {
    const bin = getParticleSizeBin(fraction.sizeBinId);
    if (!bin) throw new Error(`Unknown particle-size bin '${fraction.sizeBinId}'`);
    if (bin.maxMm <= maxFeedParticleSizeMm) return;
    oversized += fraction.quantity;
    if (!largestBin || particleSizeBinIndex(bin.id) > particleSizeBinIndex(largestBin.id)) largestBin = bin;
  });

  return {
    oversized,
    percentage: total > 0 ? oversized / total * 100 : 0,
    largestBin,
  };
}

function grindingLiberationShare(outputSizeBinId, sizeReductionBins) {
  const maxMm = getParticleSizeBin(outputSizeBinId)?.maxMm ?? Infinity;
  let base = 0.10;
  if (maxMm <= 0.032) base = 0.95;
  else if (maxMm <= 0.063) base = 0.90;
  else if (maxMm <= 0.125) base = 0.82;
  else if (maxMm <= 0.25) base = 0.72;
  else if (maxMm <= 0.5) base = 0.58;
  else if (maxMm <= 1) base = 0.42;
  else if (maxMm <= 5) base = 0.25;
  return clamp(base * (0.60 + 0.08 * Math.min(sizeReductionBins, 4)), 0, 0.95);
}

function liberationAdvancement(profile, inputSizeBinId, outputSizeBinId) {
  const inputIndex = particleSizeBinIndex(inputSizeBinId);
  const outputIndex = particleSizeBinIndex(outputSizeBinId);
  const sizeReductionBins = Math.max(0, inputIndex - outputIndex);
  if (sizeReductionBins <= 0) return { improvedShare: 0, maxLift: 0 };

  if (profile.liberationMode === 'coarse-crushing') {
    return {
      improvedShare: Math.min(0.04, 0.01 + 0.01 * sizeReductionBins),
      maxLift: 1,
    };
  }
  if (profile.liberationMode === 'fine-crushing') {
    return {
      improvedShare: Math.min(0.12, 0.03 + 0.025 * sizeReductionBins),
      maxLift: 1,
    };
  }

  const maxMm = getParticleSizeBin(outputSizeBinId)?.maxMm ?? Infinity;
  return {
    improvedShare: grindingLiberationShare(outputSizeBinId, sizeReductionBins),
    maxLift: maxMm <= 0.063 ? 3 : maxMm <= 1 ? 2 : 1,
  };
}

function addFraction(outputState, speciesId, sizeBinId, liberationClassId, quantity) {
  if (quantity <= 0) return;
  addSolidFractionDirect(outputState, { speciesId, sizeBinId, liberationClassId, quantity });
}

function distributeLiberationMass(
  outputState,
  speciesId,
  inputLiberationClassId,
  inputSizeBinId,
  outputSizeBinId,
  massKg,
  profile,
) {
  const liberationClasses = listLiberationClasses();
  const inputIndex = liberationClassIndex(inputLiberationClassId);
  const lastIndex = liberationClasses.length - 1;
  const advancement = liberationAdvancement(profile, inputSizeBinId, outputSizeBinId);
  const maxLift = Math.min(advancement.maxLift, lastIndex - inputIndex);

  if (maxLift <= 0 || advancement.improvedShare <= 0 || inputIndex >= lastIndex) {
    addFraction(outputState, speciesId, outputSizeBinId, inputLiberationClassId, massKg);
    return;
  }

  const improvedMass = massKg * advancement.improvedShare;
  addFraction(
    outputState,
    speciesId,
    outputSizeBinId,
    liberationClasses[inputIndex].id,
    massKg - improvedMass,
  );

  if (maxLift === 1) {
    addFraction(outputState, speciesId, outputSizeBinId, liberationClasses[inputIndex + 1].id, improvedMass);
    return;
  }
  if (maxLift === 2) {
    addFraction(outputState, speciesId, outputSizeBinId, liberationClasses[inputIndex + 1].id, improvedMass * 0.65);
    addFraction(outputState, speciesId, outputSizeBinId, liberationClasses[inputIndex + 2].id, improvedMass * 0.35);
    return;
  }

  addFraction(outputState, speciesId, outputSizeBinId, liberationClasses[inputIndex + 1].id, improvedMass * 0.45);
  addFraction(outputState, speciesId, outputSizeBinId, liberationClasses[inputIndex + 2].id, improvedMass * 0.35);
  addFraction(outputState, speciesId, outputSizeBinId, liberationClasses[inputIndex + 3].id, improvedMass * 0.20);
}

export function comminuteSolidMaterialState(feedSolidState, targetParticleSizeMm, equipmentId) {
  validateSolidMaterialState(feedSolidState);
  if (typeof targetParticleSizeMm !== 'number' || !Number.isFinite(targetParticleSizeMm) || targetParticleSizeMm <= 0) {
    throw new Error('Comminution target particle size must be a finite positive number');
  }

  const profile = requireEquipmentProfile(equipmentId);
  const oversized = oversizedFeedSummary(feedSolidState, profile.maxFeedParticleSizeMm);
  if (oversized.oversized > 0) {
    throw new Error(
      `${profile.label} requires feed particle size <= ${profile.maxFeedParticleSizeMm} mm; blocked because feed contains ${oversized.percentage.toFixed(1)}% oversized material (largest class ${oversized.largestBin?.name ?? 'unknown'})`
    );
  }

  const targetSizeBinId = particleSizeBinIdForMm(targetParticleSizeMm);
  const product = createSolidMaterialState();
  let sawFeed = false;

  forEachSolidFraction(feedSolidState, fraction => {
    sawFeed = true;
    for (const outputShare of outputSizeShares(fraction.sizeBinId, targetSizeBinId, profile)) {
      distributeLiberationMass(
        product,
        fraction.speciesId,
        fraction.liberationClassId,
        fraction.sizeBinId,
        outputShare.sizeBinId,
        fraction.quantity * outputShare.share,
        profile,
      );
    }
  });

  if (!sawFeed) throw new Error(`${profile.label} requires non-empty feed`);
  const inputTotal = totalSolidQuantity(feedSolidState);
  const outputTotal = totalSolidQuantity(product);
  if (Math.abs(inputTotal - outputTotal) > 1e-9 * Math.max(1, inputTotal)) {
    throw new Error(`${profile.label} violated solid-matter conservation`);
  }
  return product;
}

export function jawCrushSolidMaterialState(feedSolidState, targetParticleSizeMm) {
  return comminuteSolidMaterialState(feedSolidState, targetParticleSizeMm, COMMINUTION_EQUIPMENT.JAW_CRUSHER);
}

export function coneCrushSolidMaterialState(feedSolidState, targetParticleSizeMm) {
  return comminuteSolidMaterialState(feedSolidState, targetParticleSizeMm, COMMINUTION_EQUIPMENT.CONE_CRUSHER);
}

export function millSolidMaterialState(feedSolidState, targetParticleSizeMm) {
  return comminuteSolidMaterialState(feedSolidState, targetParticleSizeMm, COMMINUTION_EQUIPMENT.BALL_MILL);
}

export function comminutionEquipmentProfile(equipmentId) {
  return requireEquipmentProfile(equipmentId);
}
