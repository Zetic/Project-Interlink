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
import { materialBodyTemperatureK } from '../../materials/thermal/thermalMaterial.js';
import {
  THERMAL_REFERENCE_TEMPERATURE_K,
  heatCapacityJPerKForSpeciesMasses,
  sensibleEnthalpyJAtTemperature,
} from '../../materials/thermal/thermalState.js';
import { representativeParticleSizeMm } from '../../materials/solids/particleSizeBins.js';

const GAS_CONSTANT_J_PER_MOL_K = 8.314462618;
const REACTION_SOLVE_ITERATIONS = 32;
// The root solve only needs enough precision to make the kinetic temperature
// self-consistent. Once the extent is selected, the committed product
// temperature is recomputed from the exact energy balance for that extent.
const REACTION_SOLVE_TOLERANCE_K = 0.01;
const MINIMUM_ABSOLUTE_TEMPERATURE_K = 1;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function reactionSpeciesMassKg(reaction, speciesId) {
  const participant = [...reaction.reactants, ...reaction.products]
    .find(item => item.speciesId === speciesId);
  if (!participant) throw new Error(`Reaction '${reaction.id}' does not contain species '${speciesId}'`);
  return requireMaterialSpecies(speciesId).chemistry.molarMassKgPerMol
    * participant.stoichiometricMoles;
}

function fractionKey(fraction) {
  return fraction.textureProfileId
    ? `${fraction.speciesId}|${fraction.sizeBinId}|${fraction.liberationClassId}|${fraction.textureProfileId}`
    : `${fraction.speciesId}|${fraction.sizeBinId}|${fraction.liberationClassId}`;
}

function particleSizeFactor(sizeBinId, kinetics) {
  const particleSizeM = representativeParticleSizeMm(sizeBinId) / 1000;
  return clamp(
    (kinetics.referenceParticleSizeM / particleSizeM) ** kinetics.particleSizeExponent,
    kinetics.minimumParticleSizeFactor,
    kinetics.maximumParticleSizeFactor,
  );
}

/**
 * Compile one immutable scalar reaction model from the detailed material body.
 *
 * The previous solver rebuilt complete solid/gas MaterialBodies, texture
 * registries, and heat-capacity summaries for every bisection candidate. That
 * made cost scale as populations × solver iterations × zones × ticks. The
 * numerical solve only needs reactive masses, size-rate factors, heat capacity,
 * and stoichiometric deltas; detailed state is materialized once after solving.
 */
function compileReactionModel(feedBody, reaction) {
  const fractions = iterateSolidFractions(feedBody.solidState);
  const speciesMassesKg = {};
  const reactiveFractions = [];
  for (const fraction of fractions) {
    speciesMassesKg[fraction.speciesId] = (speciesMassesKg[fraction.speciesId] ?? 0) + fraction.quantity;
    if (fraction.speciesId === 'goethite') {
      reactiveFractions.push({
        fraction,
        sizeFactor: particleSizeFactor(fraction.sizeBinId, reaction.kinetics),
      });
    }
  }

  const goethiteMassPerExtentKg = reactionSpeciesMassKg(reaction, 'goethite');
  const hematiteMassPerExtentKg = reactionSpeciesMassKg(reaction, 'hematite');
  const waterMassPerExtentKg = reactionSpeciesMassKg(reaction, 'waterVapor');
  const inputHeatCapacityJPerK = heatCapacityJPerKForSpeciesMasses(speciesMassesKg);
  const reactantHeatCapacityPerExtentJPerK = heatCapacityJPerKForSpeciesMasses({
    goethite: goethiteMassPerExtentKg,
  });
  const solidProductHeatCapacityPerExtentJPerK = heatCapacityJPerKForSpeciesMasses({
    hematite: hematiteMassPerExtentKg,
  });
  const gasProductHeatCapacityPerExtentJPerK = heatCapacityJPerKForSpeciesMasses({
    waterVapor: waterMassPerExtentKg,
  });

  return {
    reactiveFractions,
    goethiteMassPerExtentKg,
    hematiteMassPerExtentKg,
    waterMassPerExtentKg,
    inputHeatCapacityJPerK,
    solidHeatCapacityDeltaPerExtentJPerK:
      solidProductHeatCapacityPerExtentJPerK - reactantHeatCapacityPerExtentJPerK,
    gasHeatCapacityPerExtentJPerK: gasProductHeatCapacityPerExtentJPerK,
  };
}

function reactionExtentForConsumedMass(model, fractionQuantityKg, requestedConsumedKg) {
  let consumedKg = requestedConsumedKg;
  if (consumedKg <= 0) return null;

  // Material states intentionally prune populations at nanogram scale. Never
  // subtract reactant whose products would be pruned. Conversely, if only a
  // sub-tolerance reactant residue would remain, consume it completely so the
  // residue is represented by products rather than disappearing.
  const remainingKg = fractionQuantityKg - consumedKg;
  if (remainingKg > 0 && remainingKg <= SOLID_MATERIAL_TOLERANCE) {
    consumedKg = fractionQuantityKg;
  }

  const extentMol = consumedKg / model.goethiteMassPerExtentKg;
  const hematiteProductKg = extentMol * model.hematiteMassPerExtentKg;
  const waterProductKg = extentMol * model.waterMassPerExtentKg;
  if (
    hematiteProductKg <= SOLID_MATERIAL_TOLERANCE
    || waterProductKg <= GAS_MATERIAL_TOLERANCE
  ) {
    return null;
  }

  return { consumedKg, extentMol, hematiteProductKg, waterProductKg };
}

function evaluateReactionExtent(model, reaction, kineticTemperatureK, residenceTimeSeconds, collectDetails = false) {
  if (model.reactiveFractions.length === 0 || residenceTimeSeconds <= 0) {
    return { reactionExtentMol: 0, details: collectDetails ? [] : null };
  }

  const arrheniusBaseRatePerSecond = reaction.kinetics.preExponentialFactorPerSecond
    * Math.exp(
      -reaction.kinetics.activationEnergyJPerMol
        / (GAS_CONSTANT_J_PER_MOL_K * kineticTemperatureK),
    );
  let reactionExtentMol = 0;
  const details = collectDetails ? [] : null;

  for (const entry of model.reactiveFractions) {
    const conversion = clamp(
      1 - Math.exp(
        -arrheniusBaseRatePerSecond * entry.sizeFactor * residenceTimeSeconds,
      ),
      0,
      1,
    );
    const resolved = reactionExtentForConsumedMass(
      model,
      entry.fraction.quantity,
      entry.fraction.quantity * conversion,
    );
    if (!resolved) continue;
    reactionExtentMol += resolved.extentMol;
    if (details) details.push({ ...entry.fraction, ...resolved });
  }

  return { reactionExtentMol, details };
}

function scalarEvaluation(
  model,
  reaction,
  initialTemperatureK,
  initialSensibleEnthalpyJ,
  residenceTimeSeconds,
  candidateFinalTemperatureK,
) {
  // Mean-temperature kinetics is the same bounded approximation used by the
  // prior implementation, but candidate evaluation remains scalar-only.
  const kineticTemperatureK = Math.max(
    MINIMUM_ABSOLUTE_TEMPERATURE_K,
    (initialTemperatureK + candidateFinalTemperatureK) / 2,
  );
  const { reactionExtentMol } = evaluateReactionExtent(
    model,
    reaction,
    kineticTemperatureK,
    residenceTimeSeconds,
  );
  const totalHeatCapacityJPerK = model.inputHeatCapacityJPerK
    + reactionExtentMol * (
      model.solidHeatCapacityDeltaPerExtentJPerK
      + model.gasHeatCapacityPerExtentJPerK
    );
  const reactionEnergyDemandJ = reactionExtentMol
    * reaction.thermochemistry.reactionEnthalpyJPerMolExtent;
  const energyBalancedTemperatureK = totalHeatCapacityJPerK <= 0
    ? THERMAL_REFERENCE_TEMPERATURE_K
    : THERMAL_REFERENCE_TEMPERATURE_K
      + (initialSensibleEnthalpyJ - reactionEnergyDemandJ) / totalHeatCapacityJPerK;

  return {
    kineticTemperatureK,
    reactionExtentMol,
    reactionEnergyDemandJ,
    totalHeatCapacityJPerK,
    energyBalancedTemperatureK,
    residualK: candidateFinalTemperatureK - energyBalancedTemperatureK,
  };
}

function solvedState(model, evaluation, solverEvaluationCount) {
  const finalTemperatureK = evaluation.energyBalancedTemperatureK;
  if (finalTemperatureK <= 0 || !Number.isFinite(finalTemperatureK)) {
    throw new Error('Thermochemical reaction solved to an invalid absolute temperature');
  }
  return {
    model,
    finalTemperatureK,
    solverEvaluationCount,
    ...evaluation,
  };
}

function solveReactionAtFinalTemperature(feedBody, residenceTimeSeconds, reaction) {
  const initialTemperatureK = materialBodyTemperatureK(feedBody);
  const initialSensibleEnthalpyJ = feedBody.thermalState?.sensibleEnthalpyJ ?? 0;
  const model = compileReactionModel(feedBody, reaction);
  let solverEvaluationCount = 0;

  const evaluate = candidateFinalTemperatureK => {
    solverEvaluationCount += 1;
    return scalarEvaluation(
      model,
      reaction,
      initialTemperatureK,
      initialSensibleEnthalpyJ,
      residenceTimeSeconds,
      candidateFinalTemperatureK,
    );
  };

  // Endothermic conversion cannot finish hotter than the incoming material in
  // this isolated reaction kernel. Deterministic bisection prevents oscillation
  // while keeping the numerical solve independent from detailed state copying.
  let lowK = MINIMUM_ABSOLUTE_TEMPERATURE_K;
  let highK = Math.max(MINIMUM_ABSOLUTE_TEMPERATURE_K, initialTemperatureK);
  const highEvaluation = evaluate(highK);
  if (Math.abs(highEvaluation.residualK) <= REACTION_SOLVE_TOLERANCE_K) {
    return solvedState(model, highEvaluation, solverEvaluationCount);
  }

  const lowEvaluation = evaluate(lowK);
  if (lowEvaluation.residualK > 0) {
    throw new Error('Thermochemical reaction has no positive-temperature energy solution');
  }

  let evaluation = highEvaluation;
  for (let iteration = 0; iteration < REACTION_SOLVE_ITERATIONS; iteration += 1) {
    const midpointK = (lowK + highK) / 2;
    evaluation = evaluate(midpointK);
    if (Math.abs(evaluation.residualK) <= REACTION_SOLVE_TOLERANCE_K) {
      return solvedState(model, evaluation, solverEvaluationCount);
    }
    if (evaluation.residualK > 0) highK = midpointK;
    else lowK = midpointK;
  }

  evaluation = evaluate((lowK + highK) / 2);
  return solvedState(model, evaluation, solverEvaluationCount);
}

function materializeReactionProducts(feedBody, model, reaction, kineticTemperatureK, residenceTimeSeconds) {
  const solidState = cloneSolidMaterialState(feedBody.solidState);
  const detailed = evaluateReactionExtent(
    model,
    reaction,
    kineticTemperatureK,
    residenceTimeSeconds,
    true,
  );
  let waterProductKg = 0;
  const derivedTextureIdBySourceId = new Map();

  for (const result of detailed.details) {
    const sourceKey = fractionKey(result);
    solidState.fractions[sourceKey] = Math.max(
      0,
      (solidState.fractions[sourceKey] ?? 0) - result.consumedKg,
    );
    if (solidState.fractions[sourceKey] <= SOLID_MATERIAL_TOLERANCE) {
      delete solidState.fractions[sourceKey];
    }

    let productTextureProfileId = result.textureProfileId;
    if (result.textureProfileId) {
      productTextureProfileId = derivedTextureIdBySourceId.get(result.textureProfileId);
      if (!productTextureProfileId) {
        const sourceProfile = solidTextureProfile(feedBody.solidState, result.textureProfileId);
        const derivedProfile = deriveReactionTextureProfile(
          sourceProfile,
          reaction.id,
          'goethite',
          'hematite',
        );
        registerSolidTextureProfile(solidState, derivedProfile);
        productTextureProfileId = derivedProfile.id;
        derivedTextureIdBySourceId.set(result.textureProfileId, productTextureProfileId);
      }
    }

    addSolidFractionDirect(solidState, {
      speciesId: 'hematite',
      sizeBinId: result.sizeBinId,
      liberationClassId: result.liberationClassId,
      textureProfileId: productTextureProfileId,
      quantity: result.hematiteProductKg,
    });
    waterProductKg += result.waterProductKg;
  }

  return {
    solidProductBody: createSolidMaterialBody(solidState),
    gasProductBody: createGasMaterialBody(createGasMaterialState(
      waterProductKg > GAS_MATERIAL_TOLERANCE ? { waterVapor: waterProductKg } : {},
    )),
    reactionExtentMol: detailed.reactionExtentMol,
  };
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
  const products = materializeReactionProducts(
    feedBody,
    solved.model,
    reaction,
    solved.kineticTemperatureK,
    residenceTimeSeconds,
  );

  // Materialization uses exactly the same per-fraction tolerance rules as the
  // scalar solve, so these extents should only differ by floating-point noise.
  const extentDelta = Math.abs(products.reactionExtentMol - solved.reactionExtentMol);
  if (extentDelta > 1e-10 * Math.max(1, Math.abs(solved.reactionExtentMol))) {
    throw new Error('Thermochemical scalar solve and materialization disagree on reaction extent');
  }

  const solidCapacityJPerK = solved.model.inputHeatCapacityJPerK
    + solved.reactionExtentMol * solved.model.solidHeatCapacityDeltaPerExtentJPerK;
  const gasCapacityJPerK = solved.reactionExtentMol
    * solved.model.gasHeatCapacityPerExtentJPerK;
  // The chosen extent came from the bounded root solve. Commit the exact
  // energy-balanced temperature for that extent so strict energy conservation
  // is not weakened merely to gain solver performance.
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
    solverEvaluationCount: solved.solverEvaluationCount,
  };
}
