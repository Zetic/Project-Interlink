import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GOETHITE_DEHYDROXYLATION_REACTION_ID, getReactionDefinition } from '../src/content/reactions/reactionDefinitions.js';
import { createSolidMaterialBody, createSolidMaterialState, addSolidFractionDirect, addSolidMaterialState, iterateSolidFractions, summarizeSolidMaterialBySpecies, totalSolidQuantity } from '../src/core/materials/solids/solidMaterialState.js';
import { createHopper, hopperReceiveInflow, hopperWithdraw } from '../src/simulation/hopperNode.js';
import {
  distributeSensibleEnthalpyAtEquilibrium,
  materialBodyHeatCapacityJPerK,
  materialBodyTemperatureK,
  setMaterialBodyTemperatureK,
} from '../src/core/materials/thermal/thermalMaterial.js';
import { THERMAL_REFERENCE_TEMPERATURE_K } from '../src/core/materials/thermal/thermalState.js';
import { applyGoethiteDehydroxylation } from '../src/core/processes/physics/thermochemicalReactions.js';
import { validateElementalConservation } from '../src/core/processes/conservation/elementalConservation.js';
import {
  blueprintAddApparatus,
  blueprintConnect,
  createBlueprint,
  simulationAdvance,
} from '../src/simulation/simulationEngine.js';
import { ventedGasMassKg } from '../src/simulation/apparatus/exhaustVent.js';
import { furnaceHeatLossEnergyJ } from '../src/simulation/apparatus/roastingFurnace.js';

const EPSILON = 1e-6;

function solidBody(speciesMassesKg, sizeBinId = '0.032-0.063mm') {
  const state = createSolidMaterialState();
  for (const [speciesId, quantity] of Object.entries(speciesMassesKg)) {
    addSolidFractionDirect(state, {
      speciesId,
      sizeBinId,
      liberationClassId: 'partial',
      quantity,
    });
  }
  return createSolidMaterialBody(state);
}

function connect(blueprint, sourceNodeId, sourcePortId, targetNodeId, targetPortId) {
  assert.ok(blueprintConnect(blueprint, sourceNodeId, sourcePortId, targetNodeId, targetPortId));
}

test('body-level sensible energy derives temperature and conserves energy through withdrawal and mixing', () => {
  const goethite = solidBody({ goethite: 10 });
  const quartz = solidBody({ quartz: 10 });
  goethite.thermalState.sensibleEnthalpyJ = 74000;
  quartz.thermalState.sensibleEnthalpyJ = 74000;
  assert.ok(materialBodyTemperatureK(goethite) > materialBodyTemperatureK(quartz));

  const hot = solidBody({ goethite: 10 });
  const cold = solidBody({ goethite: 10 });
  setMaterialBodyTemperatureK(hot, 900);
  setMaterialBodyTemperatureK(cold, THERMAL_REFERENCE_TEMPERATURE_K);
  const mixedState = createSolidMaterialState();
  addSolidMaterialState(mixedState, hot.solidState);
  addSolidMaterialState(mixedState, cold.solidState);
  const [mixed] = distributeSensibleEnthalpyAtEquilibrium(
    [hot, cold],
    [createSolidMaterialBody(mixedState)],
  );
  assert.ok(materialBodyTemperatureK(mixed) > THERMAL_REFERENCE_TEMPERATURE_K);
  assert.ok(materialBodyTemperatureK(mixed) < 900);
  assert.ok(Math.abs(
    mixed.thermalState.sensibleEnthalpyJ
      - hot.thermalState.sensibleEnthalpyJ
      - cold.thermalState.sensibleEnthalpyJ,
  ) < EPSILON);

  const hopper = createHopper({ id: 'hot', capacityKg: 20, initialMaterialBody: hot });
  const withdrawal = hopperWithdraw(hopper, 20, 0.1);
  assert.ok(Math.abs(withdrawal.actualTotalKg - 2) < EPSILON);
  assert.ok(Math.abs(withdrawal.actualSensibleEnthalpyJ - hot.thermalState.sensibleEnthalpyJ * 0.2) < EPSILON);
  assert.ok(Math.abs(
    hopper.materialBody.thermalState.sensibleEnthalpyJ + withdrawal.actualSensibleEnthalpyJ - hot.thermalState.sensibleEnthalpyJ,
  ) < EPSILON);

  const receivingHopper = createHopper({ id: 'cold', capacityKg: 20, initialMaterialBody: cold });
  hopperReceiveInflow(
    receivingHopper,
    withdrawal.actualSolidState,
    0.1,
    withdrawal.actualSpecificSensibleEnthalpyJPerKg,
  );
  assert.ok(materialBodyTemperatureK(receivingHopper.materialBody) > THERMAL_REFERENCE_TEMPERATURE_K);
  assert.ok(materialBodyTemperatureK(receivingHopper.materialBody) < 900);
});

test('thermal property coverage is explicit instead of using a silent fallback', () => {
  const unsupported = solidBody({ chalcopyrite: 1 });
  assert.throws(
    () => materialBodyHeatCapacityJPerK(unsupported),
    /Thermal property coverage missing for:\n- chalcopyrite/,
  );
});

test('furnace heat loss increases with charge temperature', () => {
  assert.ok(furnaceHeatLossEnergyJ(900, 25, 1) > furnaceHeatLossEnergyJ(500, 25, 1));
});

test('goethite dehydroxylation is gradual, stoichiometric, elemental, and endothermic', () => {
  const feed = solidBody({ goethite: 10 });
  setMaterialBodyTemperatureK(feed, 900);
  const result = applyGoethiteDehydroxylation(feed, 10);
  const solid = summarizeSolidMaterialBySpecies(result.solidProductBody.solidState);
  const gas = result.gasProductBody.gasState.speciesMassKg;
  const consumedGoethiteKg = 10 - (solid.goethite ?? 0);
  const reaction = getReactionDefinition(GOETHITE_DEHYDROXYLATION_REACTION_ID);
  const extentMol = consumedGoethiteKg / (2 * 0.088851);

  assert.ok(consumedGoethiteKg > 0);
  assert.ok(consumedGoethiteKg < 10);
  assert.ok(Math.abs((solid.hematite ?? 0) - extentMol * 0.159687) < EPSILON);
  assert.ok(Math.abs((gas.waterVapor ?? 0) - extentMol * 0.018015) < EPSILON);
  assert.ok(Math.abs(
    totalSolidQuantity(result.solidProductBody.solidState) + (gas.waterVapor ?? 0) - 10,
  ) < EPSILON);
  assert.ok(Math.abs(
    result.solidProductBody.thermalState.sensibleEnthalpyJ
      + result.gasProductBody.thermalState.sensibleEnthalpyJ
      - feed.thermalState.sensibleEnthalpyJ
      + result.reactionEnergyDemandJ,
  ) < EPSILON);
  assert.ok(Math.abs(
    result.reactionEnergyDemandJ - extentMol * reaction.thermochemistry.reactionEnthalpyJPerMolExtent,
  ) < EPSILON);
  assert.doesNotThrow(() => validateElementalConservation(
    [feed],
    [result.solidProductBody, result.gasProductBody],
    'test-goethite-dehydroxylation',
  ));
});

test('roasted goethite retains a deterministic reaction-derived texture lineage', () => {
  const sourceTexture = {
    id: 'source-goethite',
    speciesTextures: {
      goethite: {
        grainSizeUm: { d10: 10, d50: 25, d90: 60 },
        occurrenceModes: { free: 0.2, boundary: 0.2, intergrown: 0.4, included: 0.2 },
      },
    },
    comminutionProperties: {
      bondCrushingWorkIndexKWhPerT: 12,
      bondBallMillWorkIndexKWhPerT: 14,
      bondAbrasionIndex: 0.2,
    },
  };
  const state = createSolidMaterialState([], { textureProfiles: { [sourceTexture.id]: sourceTexture } });
  addSolidFractionDirect(state, {
    speciesId: 'goethite',
    sizeBinId: '0.032-0.063mm',
    liberationClassId: 'partial',
    textureProfileId: sourceTexture.id,
    quantity: 10,
  });
  const feed = createSolidMaterialBody(state);
  setMaterialBodyTemperatureK(feed, 900);
  const result = applyGoethiteDehydroxylation(feed, 10);
  const hematiteFraction = iterateSolidFractions(result.solidProductBody.solidState)
    .find(fraction => fraction.speciesId === 'hematite');
  assert.ok(hematiteFraction?.textureProfileId);
  assert.notEqual(hematiteFraction.textureProfileId, sourceTexture.id);
  assert.deepEqual(
    result.solidProductBody.solidState.textureProfiles[hematiteFraction.textureProfileId].speciesTextures.hematite,
    sourceTexture.speciesTextures.goethite,
  );
});

test('roasting kinetics increase with temperature, residence time, and finer particle size', () => {
  const conversion = (temperatureK, residenceTimeSeconds, sizeBinId) => {
    const feed = solidBody({ goethite: 10 }, sizeBinId);
    setMaterialBodyTemperatureK(feed, temperatureK);
    return 10 - (summarizeSolidMaterialBySpecies(
      applyGoethiteDehydroxylation(feed, residenceTimeSeconds).solidProductBody.solidState,
    ).goethite ?? 0);
  };

  assert.ok(conversion(900, 3, '0.032-0.063mm') > conversion(600, 3, '0.032-0.063mm'));
  assert.ok(conversion(900, 10, '0.032-0.063mm') > conversion(900, 1, '0.032-0.063mm'));
  assert.ok(conversion(900, 3, '0.004-0.008mm') > conversion(900, 3, '1-5mm'));
});

function runFurnacePlant(maximumSolidThroughputKgPerSecond) {
  const blueprint = createBlueprint();
  const feed = createHopper({ id: 'feed', capacityKg: 200, initialMaterialBody: solidBody({ goethite: 100 }) });
  blueprint.nodes[feed.id] = feed;
  const furnace = blueprintAddApparatus(blueprint, 'roastingFurnace', {
    id: 'furnace',
    enabled: true,
    temperatureSetpointK: 900,
    maximumSolidThroughputKgPerSecond,
    effectiveChamberHoldUpKg: 0.1,
  });
  const product = blueprintAddApparatus(blueprint, 'hopper', { id: 'product', capacityKg: 200 });
  const vent = blueprintAddApparatus(blueprint, 'exhaustVent', { id: 'vent' });
  connect(blueprint, feed.id, 'output', furnace.id, 'feed');
  connect(blueprint, furnace.id, 'solid-product', product.id, 'input');
  connect(blueprint, furnace.id, 'gas-exhaust', vent.id, 'gas-in');
  simulationAdvance(blueprint, {}, 35, 0.1);
  return { furnace, product, vent, blueprint };
}

test('continuous furnace power limitation couples throughput, conversion, and explicit exhaust routing', () => {
  const lowFeed = runFurnacePlant(0.02);
  const highFeed = runFurnacePlant(4);
  assert.ok(lowFeed.furnace.actualChargeTemperatureK > 850);
  assert.ok(highFeed.furnace.actualChargeTemperatureK < lowFeed.furnace.actualChargeTemperatureK);

  const lowProduct = summarizeSolidMaterialBySpecies(lowFeed.product.materialBody.solidState);
  const highProduct = summarizeSolidMaterialBySpecies(highFeed.product.materialBody.solidState);
  assert.ok((lowProduct.hematite ?? 0) > (highProduct.hematite ?? 0));
  assert.ok(ventedGasMassKg(lowFeed.vent) > ventedGasMassKg(highFeed.vent));
  assert.ok(ventedGasMassKg(lowFeed.vent) > 0);
  assert.equal(
    Object.values(lowFeed.blueprint.streams).find(stream => stream.sourceNodeId === lowFeed.furnace.id && stream.sourcePortId === 'gas-exhaust').physicalForm,
    'gas',
  );
});
