import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GOETHITE_DEHYDROXYLATION_REACTION_ID,
  getReactionDefinition,
} from '../src/content/reactions/reactionDefinitions.js';
import {
  addSolidFractionDirect,
  addSolidMaterialState,
  cloneSolidMaterialBody,
  createSolidMaterialBody,
  createSolidMaterialState,
  iterateSolidFractions,
  summarizeSolidMaterialBySpecies,
  totalSolidQuantity,
} from '../src/core/materials/solids/solidMaterialState.js';
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
  checkBlueprintConnection,
  createBlueprint,
  simulationAdvance,
  simulationTick,
} from '../src/simulation/simulationEngine.js';
import { ventedGasMassKg } from '../src/simulation/apparatus/exhaustVent.js';
import {
  furnaceHeatLossEnergyJ,
  roastingFurnaceChargeMassKg,
  roastingFurnaceZoneCapacityKg,
} from '../src/simulation/apparatus/roastingFurnace.js';

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
  const connection = blueprintConnect(blueprint, sourceNodeId, sourcePortId, targetNodeId, targetPortId);
  assert.ok(connection);
  return connection;
}

function hematiteShareOfReactiveSolids(hopper) {
  const composition = summarizeSolidMaterialBySpecies(hopper.materialBody.solidState);
  const hematite = composition.hematite ?? 0;
  const goethite = composition.goethite ?? 0;
  return hematite + goethite <= 0 ? 0 : hematite / (hematite + goethite);
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

test('legacy solid bodies without thermal state normalize at the named reference temperature', () => {
  const legacy = solidBody({ goethite: 1 });
  delete legacy.thermalState;
  assert.equal(materialBodyTemperatureK(legacy), THERMAL_REFERENCE_TEMPERATURE_K);
  const normalized = cloneSolidMaterialBody(legacy);
  assert.deepEqual(normalized.thermalState, { sensibleEnthalpyJ: 0 });
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

test('goethite solve is gradual, thermally self-consistent, stoichiometric, elemental, and endothermic', () => {
  const feed = solidBody({ goethite: 10 });
  setMaterialBodyTemperatureK(feed, 900);
  const result = applyGoethiteDehydroxylation(feed, 10);
  const solid = summarizeSolidMaterialBySpecies(result.solidProductBody.solidState);
  const gas = result.gasProductBody.gasState.speciesMassKg;
  const consumedGoethiteKg = 10 - (solid.goethite ?? 0);
  const reaction = getReactionDefinition(GOETHITE_DEHYDROXYLATION_REACTION_ID);
  const extentMol = consumedGoethiteKg / (2 * 0.088851);

  assert.ok(consumedGoethiteKg > 0);
  assert.ok(consumedGoethiteKg < 8, 'energy coupling must prevent the old near-total-conversion / cryogenic oscillation state');
  assert.ok(result.temperatureK > 400);
  assert.ok(result.temperatureK < 900);
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

test('feeder preserves hot material temperature rather than losing dt-scaled thermal energy', () => {
  const blueprint = createBlueprint();
  const hotBody = solidBody({ goethite: 10 });
  setMaterialBodyTemperatureK(hotBody, 700);
  const feed = createHopper({ id: 'feed', capacityKg: 20, initialMaterialBody: hotBody });
  blueprint.nodes[feed.id] = feed;
  const feeder = blueprintAddApparatus(blueprint, 'feeder', {
    id: 'feeder', enabled: true, flowRateKgPerSecond: 1,
  });
  const output = blueprintAddApparatus(blueprint, 'hopper', { id: 'output', capacityKg: 20 });
  connect(blueprint, feed.id, 'output', feeder.id, 'feed');
  connect(blueprint, feeder.id, 'product', output.id, 'input');
  simulationTick(blueprint, {}, 0.1);
  assert.ok(Math.abs(materialBodyTemperatureK(output.materialBody) - 700) < 1e-6);
});

test('roasting furnace requires metered feed, supports furnace chaining, and keeps zone count a fixed equipment capability', () => {
  const blueprint = createBlueprint();
  const hopper = blueprintAddApparatus(blueprint, 'hopper', { id: 'hopper', capacityKg: 100 });
  const feeder = blueprintAddApparatus(blueprint, 'feeder', { id: 'feeder', enabled: true, flowRateKgPerSecond: 1 });
  const furnaceA = blueprintAddApparatus(blueprint, 'roastingFurnace', { id: 'furnace-a', enabled: true });
  const furnaceB = blueprintAddApparatus(blueprint, 'roastingFurnace', { id: 'furnace-b', enabled: true });
  const product = blueprintAddApparatus(blueprint, 'hopper', { id: 'product', capacityKg: 100 });

  assert.equal(checkBlueprintConnection(blueprint, hopper.id, 'output', furnaceA.id, 'feed').ok, false);
  assert.equal(checkBlueprintConnection(blueprint, feeder.id, 'product', furnaceA.id, 'feed').ok, true);
  assert.equal(checkBlueprintConnection(blueprint, furnaceA.id, 'solid-product', furnaceB.id, 'feed').ok, true);
  assert.equal(checkBlueprintConnection(blueprint, furnaceB.id, 'solid-product', product.id, 'input').ok, true);
  assert.equal(furnaceA.internalZoneCount, 4);
  assert.equal(roastingFurnaceZoneCapacityKg(furnaceA), 5);
});

function buildFurnacePlant({ flowRateKgPerSecond, holdUpKg = 2, maximumThroughputKgPerSecond = 4 } = {}) {
  const blueprint = createBlueprint();
  const feed = createHopper({ id: 'feed', capacityKg: 200, initialMaterialBody: solidBody({ goethite: 100 }) });
  blueprint.nodes[feed.id] = feed;
  const feeder = blueprintAddApparatus(blueprint, 'feeder', {
    id: 'feeder', enabled: true, flowRateKgPerSecond,
  });
  const furnace = blueprintAddApparatus(blueprint, 'roastingFurnace', {
    id: 'furnace',
    enabled: true,
    temperatureSetpointK: 900,
    maximumSolidThroughputKgPerSecond: maximumThroughputKgPerSecond,
    effectiveChamberHoldUpKg: holdUpKg,
  });
  const product = blueprintAddApparatus(blueprint, 'hopper', { id: 'product', capacityKg: 200 });
  const vent = blueprintAddApparatus(blueprint, 'exhaustVent', { id: 'vent' });
  connect(blueprint, feed.id, 'output', feeder.id, 'feed');
  connect(blueprint, feeder.id, 'product', furnace.id, 'feed');
  connect(blueprint, furnace.id, 'solid-product', product.id, 'input');
  connect(blueprint, furnace.id, 'gas-exhaust', vent.id, 'gas-in');
  return { blueprint, feed, feeder, furnace, product, vent };
}

test('four staged furnace zones create physical startup residence before product discharge', () => {
  const plant = buildFurnacePlant({ flowRateKgPerSecond: 1, holdUpKg: 2 });
  simulationAdvance(plant.blueprint, {}, 1.5, 0.1);
  assert.equal(totalSolidQuantity(plant.product.materialBody.solidState), 0);
  assert.ok(roastingFurnaceChargeMassKg(plant.furnace) > 1);

  simulationAdvance(plant.blueprint, {}, 1.0, 0.1);
  assert.ok(totalSolidQuantity(plant.product.materialBody.solidState) > 0);
  assert.ok(plant.furnace.zones.every(zone => totalSolidQuantity(zone.solidState) <= 0.5 + EPSILON));
});

test('feeder setpoint controls emergent residence time and conversion while furnace transport limit backpressures excess feed', () => {
  const slow = buildFurnacePlant({ flowRateKgPerSecond: 0.5, holdUpKg: 2 });
  const fast = buildFurnacePlant({ flowRateKgPerSecond: 2, holdUpKg: 2 });
  const capped = buildFurnacePlant({ flowRateKgPerSecond: 8, holdUpKg: 2, maximumThroughputKgPerSecond: 1 });

  simulationAdvance(slow.blueprint, {}, 12, 0.1);
  simulationAdvance(fast.blueprint, {}, 12, 0.1);
  simulationAdvance(capped.blueprint, {}, 2, 0.1);

  assert.ok(hematiteShareOfReactiveSolids(slow.product) > hematiteShareOfReactiveSolids(fast.product));
  assert.ok(slow.furnace.actualChargeTemperatureK >= fast.furnace.actualChargeTemperatureK - 1e-6);
  assert.ok(capped.furnace.lastFeedRateKgPerSecond <= 1 + EPSILON);
  assert.ok(ventedGasMassKg(slow.vent) > 0);
  assert.equal(
    Object.values(slow.blueprint.streams).find(stream => stream.sourceNodeId === slow.furnace.id && stream.sourcePortId === 'gas-exhaust').physicalForm,
    'gas',
  );
});

test('two furnaces can be chained without an intermediate Hopper or Feeder', () => {
  const blueprint = createBlueprint();
  const feed = createHopper({ id: 'feed', capacityKg: 50, initialMaterialBody: solidBody({ goethite: 20 }) });
  blueprint.nodes[feed.id] = feed;
  const feeder = blueprintAddApparatus(blueprint, 'feeder', {
    id: 'feeder', enabled: true, flowRateKgPerSecond: 1,
  });
  const first = blueprintAddApparatus(blueprint, 'roastingFurnace', {
    id: 'first', enabled: true, effectiveChamberHoldUpKg: 0.4, maximumSolidThroughputKgPerSecond: 1,
  });
  const second = blueprintAddApparatus(blueprint, 'roastingFurnace', {
    id: 'second', enabled: true, effectiveChamberHoldUpKg: 0.4, maximumSolidThroughputKgPerSecond: 1,
  });
  const product = blueprintAddApparatus(blueprint, 'hopper', { id: 'product', capacityKg: 50 });
  const ventA = blueprintAddApparatus(blueprint, 'exhaustVent', { id: 'vent-a' });
  const ventB = blueprintAddApparatus(blueprint, 'exhaustVent', { id: 'vent-b' });

  connect(blueprint, feed.id, 'output', feeder.id, 'feed');
  connect(blueprint, feeder.id, 'product', first.id, 'feed');
  connect(blueprint, first.id, 'solid-product', second.id, 'feed');
  connect(blueprint, first.id, 'gas-exhaust', ventA.id, 'gas-in');
  connect(blueprint, second.id, 'solid-product', product.id, 'input');
  connect(blueprint, second.id, 'gas-exhaust', ventB.id, 'gas-in');

  simulationAdvance(blueprint, {}, 4, 0.1);
  assert.ok(totalSolidQuantity(product.materialBody.solidState) > 0);
  assert.ok(ventedGasMassKg(ventA) + ventedGasMassKg(ventB) > 0);
});
