import { liberationClassIndex, listLiberationClasses } from '../../materials/solids/liberationClasses.js';
import {
  getParticleSizeBin,
  listParticleSizeBins,
  particleSizeBinIdForMm,
  particleSizeBinIndex,
} from '../../materials/solids/particleSizeBins.js';
import { liberationPotentialAtParticleSize } from '../../materials/solids/mineralTextures.js';
import { bondSpecificEnergyKWhPerT } from '../../materials/solids/comminutionProperties.js';
import {
  SOLID_MATERIAL_TOLERANCE,
  addSolidFractionDirect,
  createSolidMaterialState,
  forEachSolidFraction,
  solidTextureProfile,
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
    liberationEfficiency: 0.02,
    workIndexProperty: 'bondCrushingWorkIndexKWhPerT',
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
    liberationEfficiency: 0.10,
    workIndexProperty: 'bondCrushingWorkIndexKWhPerT',
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
    liberationEfficiency: 0.95,
    workIndexProperty: 'bondBallMillWorkIndexKWhPerT',
  }),
});

const LEGACY_REFERENCE_COMMINUTION = Object.freeze({
  bondCrushingWorkIndexKWhPerT: 10,
  bondBallMillWorkIndexKWhPerT: 15,
  bondAbrasionIndex: 0.3,
});

function genericTextureForSpecies(speciesId) {
  return {
    id: `legacy-reference-${speciesId}`,
    speciesTextures: {
      [speciesId]: {
        grainSizeUm: { d10: 50, d50: 125, d90: 300 },
        occurrenceModes: { free: 0.15, boundary: 0.35, intergrown: 0.35, included: 0.15 },
      },
    },
    comminutionProperties: LEGACY_REFERENCE_COMMINUTION,
  };
}

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

function textureForFraction(feedSolidState, fraction) {
  return fraction.textureProfileId
    ? solidTextureProfile(feedSolidState, fraction.textureProfileId)
    : genericTextureForSpecies(fraction.speciesId);
}

/**
 * Liberation is derived from current particle size relative to measured mineral
 * grain-size distributions and occurrence modes. Equipment geometry affects how
 * efficiently size reduction creates intergranular liberation, but no occurrence
 * stores a synthetic liberation-size or curve-width parameter.
 */
function liberationAdvancement(
  equipmentProfile,
  textureProfile,
  speciesId,
  inputSizeBinId,
  outputSizeBinId,
) {
  const inputIndex = particleSizeBinIndex(inputSizeBinId);
  const outputIndex = particleSizeBinIndex(outputSizeBinId);
  const sizeReductionBins = Math.max(0, inputIndex - outputIndex);
  if (sizeReductionBins <= 0) return { improvedShare: 0, maxLift: 0 };

  const outputBin = getParticleSizeBin(outputSizeBinId);
  const liberationPotential = liberationPotentialAtParticleSize(
    textureProfile,
    speciesId,
    outputBin.representativeMm,
  );
  const reductionFactor = clamp(0.45 + 0.11 * sizeReductionBins, 0, 1);
  const improvedShare = clamp(
    liberationPotential * reductionFactor * equipmentProfile.liberationEfficiency,
    0,
    equipmentProfile.liberationEfficiency,
  );

  if (equipmentProfile.liberationEfficiency <= 0.10) {
    return { improvedShare, maxLift: 1 };
  }
  return {
    improvedShare,
    maxLift: liberationPotential >= 0.75 ? 3 : liberationPotential >= 0.30 ? 2 : 1,
  };
}

function addFraction(outputState, fraction, sizeBinId, liberationClassId, quantity) {
  if (quantity <= 0) return;
  addSolidFractionDirect(outputState, {
    speciesId: fraction.speciesId,
    sizeBinId,
    liberationClassId,
    textureProfileId: fraction.textureProfileId,
    quantity,
  });
}

function liberationAllocations(
  feedSolidState,
  fraction,
  outputSizeBinId,
  massKg,
  equipmentProfile,
) {
  const liberationClasses = listLiberationClasses();
  const inputIndex = liberationClassIndex(fraction.liberationClassId);
  const lastIndex = liberationClasses.length - 1;
  const textureProfile = textureForFraction(feedSolidState, fraction);
  const advancement = liberationAdvancement(
    equipmentProfile,
    textureProfile,
    fraction.speciesId,
    fraction.sizeBinId,
    outputSizeBinId,
  );
  const maxLift = Math.min(advancement.maxLift, lastIndex - inputIndex);

  if (maxLift <= 0 || advancement.improvedShare <= 0 || inputIndex >= lastIndex) {
    return [{
      sizeBinId: outputSizeBinId,
      liberationClassId: fraction.liberationClassId,
      quantity: massKg,
    }];
  }

  const improvedMass = massKg * advancement.improvedShare;
  const allocations = [{
    sizeBinId: outputSizeBinId,
    liberationClassId: liberationClasses[inputIndex].id,
    quantity: massKg - improvedMass,
  }];

  if (maxLift === 1) {
    allocations.push({
      sizeBinId: outputSizeBinId,
      liberationClassId: liberationClasses[inputIndex + 1].id,
      quantity: improvedMass,
    });
    return allocations;
  }
  if (maxLift === 2) {
    allocations.push(
      {
        sizeBinId: outputSizeBinId,
        liberationClassId: liberationClasses[inputIndex + 1].id,
        quantity: improvedMass * 0.65,
      },
      {
        sizeBinId: outputSizeBinId,
        liberationClassId: liberationClasses[inputIndex + 2].id,
        quantity: improvedMass * 0.35,
      },
    );
    return allocations;
  }

  allocations.push(
    {
      sizeBinId: outputSizeBinId,
      liberationClassId: liberationClasses[inputIndex + 1].id,
      quantity: improvedMass * 0.45,
    },
    {
      sizeBinId: outputSizeBinId,
      liberationClassId: liberationClasses[inputIndex + 2].id,
      quantity: improvedMass * 0.35,
    },
    {
      sizeBinId: outputSizeBinId,
      liberationClassId: liberationClasses[inputIndex + 3].id,
      quantity: improvedMass * 0.20,
    },
  );
  return allocations;
}

function mergeAllocation(merged, allocation) {
  if (allocation.quantity <= 0) return;
  const key = `${allocation.sizeBinId}|${allocation.liberationClassId}`;
  const existing = merged.get(key);
  if (existing) existing.quantity += allocation.quantity;
  else merged.set(key, { ...allocation });
}

function addConservedFractionChildren(
  outputState,
  feedSolidState,
  fraction,
  sizeShares,
  equipmentProfile,
) {
  const merged = new Map();
  for (const outputShare of sizeShares) {
    const allocations = liberationAllocations(
      feedSolidState,
      fraction,
      outputShare.sizeBinId,
      fraction.quantity * outputShare.share,
      equipmentProfile,
    );
    for (const allocation of allocations) mergeAllocation(merged, allocation);
  }

  const entries = [...merged.values()];
  if (entries.length === 0) {
    throw new Error(`${equipmentProfile.label} produced no output allocation for a non-empty fraction`);
  }

  let largest = entries[0];
  for (const entry of entries) {
    if (entry.quantity > largest.quantity) largest = entry;
  }

  let subToleranceResidual = 0;
  for (const entry of entries) {
    if (entry === largest) continue;
    if (entry.quantity <= SOLID_MATERIAL_TOLERANCE) {
      subToleranceResidual += entry.quantity;
      entry.quantity = 0;
    }
  }
  largest.quantity += subToleranceResidual;

  let allocatedTotal = 0;
  for (const entry of entries) {
    if (entry.quantity <= 0) continue;
    addFraction(
      outputState,
      fraction,
      entry.sizeBinId,
      entry.liberationClassId,
      entry.quantity,
    );
    allocatedTotal += entry.quantity;
  }

  if (Math.abs(fraction.quantity - allocatedTotal) > Number.EPSILON * Math.max(1, fraction.quantity) * 32) {
    throw new Error(`${equipmentProfile.label} could not conserve an input fraction during comminution allocation`);
  }
}

export function comminuteSolidMaterialState(feedSolidState, targetParticleSizeMm, equipmentId) {
  validateSolidMaterialState(feedSolidState);
  if (typeof targetParticleSizeMm !== 'number' || !Number.isFinite(targetParticleSizeMm) || targetParticleSizeMm <= 0) {
    throw new Error('Comminution target particle size must be a finite positive number');
  }

  const equipmentProfile = requireEquipmentProfile(equipmentId);
  const oversized = oversizedFeedSummary(feedSolidState, equipmentProfile.maxFeedParticleSizeMm);
  if (oversized.oversized > 0) {
    throw new Error(
      `${equipmentProfile.label} requires feed particle size <= ${equipmentProfile.maxFeedParticleSizeMm} mm; blocked because feed contains ${oversized.percentage.toFixed(1)}% oversized material (largest class ${oversized.largestBin?.name ?? 'unknown'})`
    );
  }

  const targetSizeBinId = particleSizeBinIdForMm(targetParticleSizeMm);
  const product = createSolidMaterialState([], {
    textureProfiles: feedSolidState.textureProfiles ?? {},
  });
  let sawFeed = false;

  forEachSolidFraction(feedSolidState, fraction => {
    sawFeed = true;
    addConservedFractionChildren(
      product,
      feedSolidState,
      fraction,
      outputSizeShares(fraction.sizeBinId, targetSizeBinId, equipmentProfile),
      equipmentProfile,
    );
  });

  if (!sawFeed) throw new Error(`${equipmentProfile.label} requires non-empty feed`);
  const inputTotal = totalSolidQuantity(feedSolidState);
  const outputTotal = totalSolidQuantity(product);
  if (Math.abs(inputTotal - outputTotal) > 1e-9 * Math.max(1, inputTotal)) {
    throw new Error(`${equipmentProfile.label} violated solid-matter conservation`);
  }
  return product;
}

export function particleSizePercentileUm(state, percentile = 0.8) {
  validateSolidMaterialState(state);
  if (typeof percentile !== 'number' || !Number.isFinite(percentile) || percentile <= 0 || percentile > 1) {
    throw new Error('particle-size percentile must be in (0, 1]');
  }
  const byBin = new Map();
  let total = 0;
  forEachSolidFraction(state, fraction => {
    byBin.set(fraction.sizeBinId, (byBin.get(fraction.sizeBinId) ?? 0) + fraction.quantity);
    total += fraction.quantity;
  });
  if (total <= 0) return null;
  const target = total * percentile;
  let cumulative = 0;
  for (const bin of listParticleSizeBins()) {
    cumulative += byBin.get(bin.id) ?? 0;
    if (cumulative >= target) return bin.representativeMm * 1000;
  }
  const coarsest = listParticleSizeBins()[listParticleSizeBins().length - 1];
  return coarsest.representativeMm * 1000;
}

export function weightedComminutionProperties(feedSolidState) {
  validateSolidMaterialState(feedSolidState);
  let total = 0;
  let cwi = 0;
  let bwi = 0;
  let ai = 0;
  forEachSolidFraction(feedSolidState, fraction => {
    const profile = textureForFraction(feedSolidState, fraction);
    const properties = profile?.comminutionProperties ?? LEGACY_REFERENCE_COMMINUTION;
    total += fraction.quantity;
    cwi += fraction.quantity * properties.bondCrushingWorkIndexKWhPerT;
    bwi += fraction.quantity * properties.bondBallMillWorkIndexKWhPerT;
    ai += fraction.quantity * properties.bondAbrasionIndex;
  });
  if (total <= 0) return { ...LEGACY_REFERENCE_COMMINUTION };
  return {
    bondCrushingWorkIndexKWhPerT: cwi / total,
    bondBallMillWorkIndexKWhPerT: bwi / total,
    bondAbrasionIndex: ai / total,
  };
}

export function comminutionSpecificEnergyKWhPerT(feedSolidState, targetParticleSizeMm, equipmentId) {
  const equipmentProfile = requireEquipmentProfile(equipmentId);
  const product = comminuteSolidMaterialState(feedSolidState, targetParticleSizeMm, equipmentId);
  const feedP80Um = particleSizePercentileUm(feedSolidState, 0.8);
  const productP80Um = particleSizePercentileUm(product, 0.8);
  if (!feedP80Um || !productP80Um || productP80Um >= feedP80Um) return 0;
  const properties = weightedComminutionProperties(feedSolidState);
  return bondSpecificEnergyKWhPerT(
    properties[equipmentProfile.workIndexProperty],
    feedP80Um,
    productP80Um,
  );
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
