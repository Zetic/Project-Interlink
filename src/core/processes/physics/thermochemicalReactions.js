import {
  GOETHITE_DEHYDROXYLATION_REACTION_ID,
  getReactionDefinition,
} from '../../../content/reactions/reactionDefinitions.js';
import {
  createGasMaterialBody,
  createGasMaterialState,
  GAS_MATERIAL_TOLERANCE,
} from '../../materials/gas/gasMaterialState.js';
import {
  addSolidFractionDirect,
  cloneSolidMaterialState,
  createSolidMaterialBody,
  iterateSolidFractions,
  registerSolidTextureProfile,
  SOLID_MATERIAL_TOLERANCE,
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
} from '../../materials/thermal/thermalState.js';
import { representativeParticleSizeMm } from '../../materials/solids/particleSizeBins.js';

const GAS_CONSTANT_J_PER_MOL_K = 8.314462618;
const REACTION_SOLVE_ITERATIONS = 64;
const REACTION_SOLVE_TOLERANCE_K = 1e-7;
const MINIMUM_ABSOLUTE_TEMPERATURE_K = 1;

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

function reactionProductsAtTemperature(feedBody, temperatureK, residenceTimeSeconds) {
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
      1 - Math.exp(
        -reactionRatePerSecond(temperatureK, fraction.sizeBinId, reaction.kinetics)
          * residenceTimeSeconds,
      ),
      0,
      1,
    );
    let consumedKg = fraction.quantity * conversion;
    if (consumedKg <= 0) continue;

    // Material states intentionally prune populations at nanogram scale. Never
    // subtract a reactant amount whose stoichiometric products would then be
    // pruned, because that turns numerical canonicalization into real mass loss.
    // At the opposite end, consume the tiny residual reactant completely so a
    // pruned remainder is represented by its products instead of disappearing.
    const remainingKg = fraction.quantity - consumedKg;
    if (remainingKg > 0 && remainingKg <= SOLID_MATERIAL_TOLERANCE) {
      consumedKg = fraction.quantity;
    }
    let extentMol = consumedKg / goethiteMassPerExtentKg;
    let hematiteProductKg = extentMol * hematiteMassPerExtentKg;
    let waterProductKg = extentMol * waterMassPerExtentKg;
    if (
      hematiteProductKg <= SOLID_MATERIAL_TOLERANCE
      || waterProductKg <= GAS_MATERIAL_TOLERANCE
    ) {
      continue;
    }

    const sourceKey = fractionKey(fraction);
    solidState.fractions[sourceKey] = Math.max(0, (solidState.fractions[sourceKey] ?? 0) - consumedKg);
    if (solidState.fractions[sourceKey] <= SOLID_MATERIAL_TOLERANCE) delete solidState.fractions[sourceKey];

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
      quantity: hematiteProductKg,
    });
    gasSpeciesMassKg.waterVapor = (gasSpeciesMassKg.waterVapor ?? 0) + waterProductKg;
    reactionExtentMol += extentMol;
  }

  return {
    solidProductBody: createSolidMaterialBody(solidState),
    gasProductBody: createGasMaterialBody(createGasMaterialState(gasSpeciesMassKg)),
    reactionExtentMol,
  };
}

function solveReactionAtFinalTemperature(feedBody, residenceTimeSeconds, reaction) {
  const initialTemperatureK = materialBodyTemperatureK(feedBody);
  const initialSensibleEnthalpyJ = feedBody.thermalState?.sensibleEnthalpyJ ?? 0;

  const evaluate = finalTemperatureK => {
    // The reaction rate is evaluated at the mean of the incoming and candidate
    // final temperatures. This is a bounded implicit approximation to the
    // continuously cooling material over one simulation step.
    const kineticTemperatureK = Math.max(
      MINIMUM_ABSOLUTE_TEMPERATURE_K,
      (initialTemperatureK + finalTemperatureK) / 2,
    );
    const products = reactionProductsAtTemperature(
      feedBody,
      kineticTemperatureK,
      residenceTimeSeconds,
    );
    const totalHeatCapacityJPerK = materialBodyHeatCapacityJPerK(products.solidProductBody)
      + materialBodyHeatCapacityJPerK(products.gasProductBody);
    const reactionEnergyDemandJ = products.reactionExtentMol
      * reaction.thermochemistry.reactionEnthalpyJPerMolExtent;
    const energyBalancedTemperatureK = totalHeatCapacityJPerK <= 0
      ? THERMAL_REFERENCE_TEMPERATURE_K
      : THERMAL_REFERENCE_TEMPERATURE_K
        + (initialSensibleEnthalpyJ - reactionEnergyDemandJ) / totalHeatCapacityJPerK;
    return {
      products,
      reactionEnergyDemandJ,
      energyBalancedTemperatureK,
      residualK: finalTemperatureK - energyBalancedTemperatureK,
    };
  };

  // Endothermic conversion cannot finish hotter than the incoming material in
  // this isolated reaction kernel. Bisection avoids the hot/cold oscillation of
  // the former fixed-point iteration and always terminates deterministically.
  let lowK = MINIMUM_ABSOLUTE_TEMPERATURE_K;
  let highK = Math.max(MINIMUM_ABSOLUTE_TEMPERATURE_K, initialTemperatureK);
  let highEvaluation = evaluate(highK);
  if (highEvaluation.residualK <= REACTION_SOLVE_TOLERANCE_K) {
    return { finalTemperatureK: highK, ...highEvaluation };
  }

  let lowEvaluation = evaluate(lowK);
  if (lowEvaluation.residualK > 0) {
    throw new Error('Thermochemical reaction has no positive-temperature energy solution');
  }

  let evaluation = highEvaluation;
  for (let iteration = 0; iteration < REACTION_SOLVE_ITERATIONS; iteration += 1) {
    const midpointK = (lowK + highK) / 2;
    evaluation = evaluate(midpointK);
    if (Math.abs(evaluation.residualK) <= REACTION_SOLVE_TOLERANCE_K) {
      lowK = midpointK;
      highK = midpointK;
      break;
    }
    if (evaluation.residualK > 0) {
      highK = midpointK;
      highEvaluation = evaluation;
    } else {
      lowK = midpointK;
      lowEvaluation = evaluation;
    }
  }

  const finalTemperatureK = (lowK + highK) / 2;
  evaluation = evaluate(finalTemperatureK);
  if (finalTemperatureK <= 0 || !Number.isFinite(finalTemperatureK)) {
    throw new Error('Thermochemical reaction solved to an invalid absolute temperature');
  }
  return { finalTemperatureK, ...evaluation };
}

/**
 * Pure, bounded thermochemical kernel. Furnace machinery supplies heat and
 * elapsed reaction time; reaction content supplies kinetics and stoichiometry.
 */
export function applyGoethiteDehydroxylation(feedBody, residenceTimeSeconds) {
  if (!Number.isFinite(residenceTimeSeconds) || residenceTimeSeconds < 0) {
    throw new Error('Reaction residenceTimeSeconds must be finite and non-negative');
  }
  const reaction = getReactionDefinition(GOETHITE_DEHYDROXYLATION_REACTION_ID);
  const solved = solveReactionAtFinalTemperature(feedBody, residenceTimeSeconds, reaction);
  const products = solved.products;
  const solidCapacityJPerK = materialBodyHeatCapacityJPerK(products.solidProductBody);
  const gasCapacityJPerK = materialBodyHeatCapacityJPerK(products.gasProductBody);

  products.solidProductBody.thermalState.sensibleEnthalpyJ = sensibleEnthalpyJAtTemperature(
    solved.finalTemperatureK,
    solidCapacityJPerK,
  );
  products.gasProductBody.thermalState.sensibleEnthalpyJ = sensibleEnthalpyJAtTemperature(
    solved.finalTemperatureK,
    gasCapacityJPerK,
  );

  return {
    ...products,
    temperatureK: solved.finalTemperatureK,
    reactionEnergyDemandJ: solved.reactionEnergyDemandJ,
  };
}
