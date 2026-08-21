import {
  GOETHITE_DEHYDROXYLATION_REACTION_ID,
  getReactionDefinition,
} from '../../../content/reactions/reactionDefinitions.js';
import {
  createGasMaterialBody,
  createGasMaterialState,
} from '../../materials/gas/gasMaterialState.js';
import {
  addSolidFractionDirect,
  cloneSolidMaterialState,
  createSolidMaterialBody,
  iterateSolidFractions,
  registerSolidTextureProfile,
  solidTextureProfile,
} from '../../materials/solids/solidMaterialState.js';
import { deriveReactionTextureProfile } from '../../materials/solids/mineralTextures.js';
import { requireMaterialSpecies } from '../../materials/species/materialSpecies.js';
import {
  materialBodyHeatCapacityJPerK,
  materialBodyTemperatureK,
} from '../../materials/thermal/thermalMaterial.js';
import {
  THERMAL_REFERENCE_TEMPERATURE_K,
  sensibleEnthalpyJAtTemperature,
  temperatureKFromSensibleEnthalpy,
} from '../../materials/thermal/thermalState.js';
import { representativeParticleSizeMm } from '../../materials/solids/particleSizeBins.js';

const GAS_CONSTANT_J_PER_MOL_K = 8.314462618;
const REACTION_SOLVE_ITERATIONS = 8;
const REACTION_SOLVE_TOLERANCE_K = 1e-6;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function reactionSpeciesMassKg(reaction, speciesId) {
  return requireMaterialSpecies(speciesId).chemistry.molarMassKgPerMol
    * [...reaction.reactants, ...reaction.products]
      .find(item => item.speciesId === speciesId).stoichiometricMoles;
}

function reactionRatePerSecond(temperatureK, sizeBinId, kinetics) {
  const baseRate = kinetics.preExponentialFactorPerSecond
    * Math.exp(-kinetics.activationEnergyJPerMol / (GAS_CONSTANT_J_PER_MOL_K * temperatureK));
  const particleSizeM = representativeParticleSizeMm(sizeBinId) / 1000;
  const sizeFactor = clamp(
    (kinetics.referenceParticleSizeM / particleSizeM) ** kinetics.particleSizeExponent,
    kinetics.minimumParticleSizeFactor,
    kinetics.maximumParticleSizeFactor,
  );
  return baseRate * sizeFactor;
}

function fractionKey(fraction) {
  return fraction.textureProfileId
    ? `${fraction.speciesId}|${fraction.sizeBinId}|${fraction.liberationClassId}|${fraction.textureProfileId}`
    : `${fraction.speciesId}|${fraction.sizeBinId}|${fraction.liberationClassId}`;
}

function reactionProductsAtTemperature(feedBody, temperatureK, residenceTimeSeconds, conversionScale) {
  const reaction = getReactionDefinition(GOETHITE_DEHYDROXYLATION_REACTION_ID);
  const goethiteMassPerExtentKg = reactionSpeciesMassKg(reaction, 'goethite');
  const hematiteMassPerExtentKg = reactionSpeciesMassKg(reaction, 'hematite');
  const waterMassPerExtentKg = reactionSpeciesMassKg(reaction, 'waterVapor');
  const solidState = cloneSolidMaterialState(feedBody.solidState);
  const gasSpeciesMassKg = {};
  let reactionExtentMol = 0;

  for (const fraction of iterateSolidFractions(feedBody.solidState)) {
    if (fraction.speciesId !== 'goethite') continue;
    const conversion = clamp(
      (1 - Math.exp(-reactionRatePerSecond(temperatureK, fraction.sizeBinId, reaction.kinetics) * residenceTimeSeconds))
        * conversionScale,
      0,
      1,
    );
    const consumedKg = fraction.quantity * conversion;
    if (consumedKg <= 0) continue;
    const extentMol = consumedKg / goethiteMassPerExtentKg;
    const sourceKey = fractionKey(fraction);
    solidState.fractions[sourceKey] = Math.max(0, (solidState.fractions[sourceKey] ?? 0) - consumedKg);
    if (solidState.fractions[sourceKey] <= 1e-9) delete solidState.fractions[sourceKey];

    let productTextureProfileId = fraction.textureProfileId;
    if (fraction.textureProfileId) {
      const sourceProfile = solidTextureProfile(feedBody.solidState, fraction.textureProfileId);
      const derivedProfile = deriveReactionTextureProfile(
        sourceProfile,
        reaction.id,
        'goethite',
        'hematite',
      );
      registerSolidTextureProfile(solidState, derivedProfile);
      productTextureProfileId = derivedProfile.id;
    }
    addSolidFractionDirect(solidState, {
      speciesId: 'hematite',
      sizeBinId: fraction.sizeBinId,
      liberationClassId: fraction.liberationClassId,
      textureProfileId: productTextureProfileId,
      quantity: extentMol * hematiteMassPerExtentKg,
    });
    gasSpeciesMassKg.waterVapor = (gasSpeciesMassKg.waterVapor ?? 0) + extentMol * waterMassPerExtentKg;
    reactionExtentMol += extentMol;
  }

  return {
    solidProductBody: createSolidMaterialBody(solidState),
    gasProductBody: createGasMaterialBody(createGasMaterialState(gasSpeciesMassKg)),
    reactionExtentMol,
  };
}

/**
 * Pure, bounded thermochemical kernel. Furnace machinery supplies heat and
 * residence time; reaction content supplies kinetics and stoichiometry.
 */
export function applyGoethiteDehydroxylation(feedBody, residenceTimeSeconds) {
  if (!Number.isFinite(residenceTimeSeconds) || residenceTimeSeconds < 0) {
    throw new Error('Reaction residenceTimeSeconds must be finite and non-negative');
  }
  const reaction = getReactionDefinition(GOETHITE_DEHYDROXYLATION_REACTION_ID);
  let temperatureK = materialBodyTemperatureK(feedBody);
  let products = reactionProductsAtTemperature(feedBody, temperatureK, residenceTimeSeconds, 1);

  for (let iteration = 0; iteration < REACTION_SOLVE_ITERATIONS; iteration += 1) {
    const totalHeatCapacityJPerK = materialBodyHeatCapacityJPerK(products.solidProductBody)
      + materialBodyHeatCapacityJPerK(products.gasProductBody);
    const lowestPermittedSensibleEnthalpyJ = totalHeatCapacityJPerK * (1 - THERMAL_REFERENCE_TEMPERATURE_K);
    const energyLimitedExtentMol = Math.max(
      0,
      (feedBody.thermalState.sensibleEnthalpyJ - lowestPermittedSensibleEnthalpyJ)
        / reaction.thermochemistry.reactionEnthalpyJPerMolExtent,
    );
    const conversionScale = products.reactionExtentMol <= 0
      ? 1
      : Math.min(1, energyLimitedExtentMol / products.reactionExtentMol);
    products = reactionProductsAtTemperature(feedBody, temperatureK, residenceTimeSeconds, conversionScale);
    const combinedCapacityJPerK = materialBodyHeatCapacityJPerK(products.solidProductBody)
      + materialBodyHeatCapacityJPerK(products.gasProductBody);
    const sensibleEnthalpyAfterReactionJ = feedBody.thermalState.sensibleEnthalpyJ
      - products.reactionExtentMol * reaction.thermochemistry.reactionEnthalpyJPerMolExtent;
    const nextTemperatureK = temperatureKFromSensibleEnthalpy(
      sensibleEnthalpyAfterReactionJ,
      combinedCapacityJPerK,
    );
    if (Math.abs(nextTemperatureK - temperatureK) <= REACTION_SOLVE_TOLERANCE_K) {
      temperatureK = nextTemperatureK;
      break;
    }
    temperatureK = nextTemperatureK;
  }

  // Re-evaluate once at the converged temperature so reported products and
  // energy correspond to the same deterministic state.
  products = reactionProductsAtTemperature(feedBody, temperatureK, residenceTimeSeconds, 1);
  const finalCapacityJPerK = materialBodyHeatCapacityJPerK(products.solidProductBody)
    + materialBodyHeatCapacityJPerK(products.gasProductBody);
  const lowestFinalEnthalpyJ = finalCapacityJPerK * (1 - THERMAL_REFERENCE_TEMPERATURE_K);
  const finalEnergyLimitedExtentMol = Math.max(
    0,
    (feedBody.thermalState.sensibleEnthalpyJ - lowestFinalEnthalpyJ)
      / reaction.thermochemistry.reactionEnthalpyJPerMolExtent,
  );
  if (products.reactionExtentMol > finalEnergyLimitedExtentMol) {
    products = reactionProductsAtTemperature(
      feedBody,
      temperatureK,
      residenceTimeSeconds,
      finalEnergyLimitedExtentMol / products.reactionExtentMol,
    );
  }
  const solidCapacityJPerK = materialBodyHeatCapacityJPerK(products.solidProductBody);
  const gasCapacityJPerK = materialBodyHeatCapacityJPerK(products.gasProductBody);
  const totalSensibleEnthalpyJ = feedBody.thermalState.sensibleEnthalpyJ
    - products.reactionExtentMol * reaction.thermochemistry.reactionEnthalpyJPerMolExtent;
  const finalTemperatureK = temperatureKFromSensibleEnthalpy(
    totalSensibleEnthalpyJ,
    solidCapacityJPerK + gasCapacityJPerK,
  );
  products.solidProductBody.thermalState.sensibleEnthalpyJ = sensibleEnthalpyJAtTemperature(
    finalTemperatureK,
    solidCapacityJPerK,
  );
  products.gasProductBody.thermalState.sensibleEnthalpyJ = sensibleEnthalpyJAtTemperature(
    finalTemperatureK,
    gasCapacityJPerK,
  );
  return {
    ...products,
    temperatureK: finalTemperatureK,
    reactionEnergyDemandJ: products.reactionExtentMol * reaction.thermochemistry.reactionEnthalpyJPerMolExtent,
  };
}
