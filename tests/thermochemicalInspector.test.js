import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  addSolidFractionDirect,
  createSolidMaterialBody,
  createSolidMaterialState,
} from '../src/core/materials/solids/solidMaterialState.js';
import {
  createGasMaterialState,
} from '../src/core/materials/gas/gasMaterialState.js';
import { setMaterialBodyTemperatureK } from '../src/core/materials/thermal/thermalMaterial.js';
import { createHopper } from '../src/simulation/hopperNode.js';
import {
  createMaterialStream,
} from '../src/simulation/materialStream.js';
import {
  blueprintAddApparatus,
  blueprintConnect,
  createBlueprint,
  simulationAdvance,
} from '../src/simulation/simulationEngine.js';
import {
  exhaustVentInspection,
  hopperInspection,
  machineInspection,
  streamInspection,
} from '../src/workspace/inspectionViewModel.js';

function goethiteBody(massKg, temperatureK = 298.15) {
  const state = createSolidMaterialState();
  addSolidFractionDirect(state, {
    speciesId: 'goethite',
    sizeBinId: '0.032-0.063mm',
    liberationClassId: 'partial',
    quantity: massKg,
  });
  const body = createSolidMaterialBody(state);
  setMaterialBodyTemperatureK(body, temperatureK);
  return body;
}

function connect(blueprint, sourceNodeId, sourcePortId, targetNodeId, targetPortId) {
  assert.ok(blueprintConnect(blueprint, sourceNodeId, sourcePortId, targetNodeId, targetPortId));
}

test('hopper Inspector exposes derived thermal state and explicit property gaps', () => {
  const hot = createHopper({ id: 'hot', capacityKg: 20, initialMaterialBody: goethiteBody(10, 700) });
  const hotDetails = hopperInspection(hot);
  assert.ok(Math.abs(hotDetails.temperatureK - 700) < 1e-6);
  assert.ok(hotDetails.sensibleEnthalpyJ > 0);
  assert.equal(hotDetails.thermalError, null);

  const unsupportedState = createSolidMaterialState();
  addSolidFractionDirect(unsupportedState, {
    speciesId: 'chalcopyrite',
    sizeBinId: '0.032-0.063mm',
    liberationClassId: 'partial',
    quantity: 1,
  });
  const unsupported = createHopper({
    id: 'unsupported',
    capacityKg: 10,
    initialMaterialBody: createSolidMaterialBody(unsupportedState),
  });
  const unsupportedDetails = hopperInspection(unsupported);
  assert.equal(unsupportedDetails.temperatureK, null);
  assert.match(unsupportedDetails.thermalError, /Thermal property coverage missing/);
});

test('gas stream Inspector reports gas composition and omits solid-only PSD/liberation', () => {
  const stream = createMaterialStream({
    id: 'gas-stream',
    sourceNodeId: 'furnace',
    sourcePortId: 'gas-exhaust',
    targetNodeId: 'vent',
    targetPortId: 'gas-in',
    physicalForm: 'gas',
    gasState: createGasMaterialState({ waterVapor: 0.2 }),
    specificSensibleEnthalpyJPerKg: 100000,
  });
  const details = streamInspection(stream);
  assert.equal(details.physicalForm, 'gas');
  assert.equal(details.totalFlowKgPerSecond, 0.2);
  assert.deepEqual(details.componentMassFlowKgPerSecond, { waterVapor: 0.2 });
  assert.deepEqual(details.particleSizeDistribution, []);
  assert.deepEqual(details.liberationDistribution, []);
  assert.ok(details.temperatureK > 298.15);
});

test('furnace and Exhaust Vent Inspector projections expose operating thermochemical diagnostics', () => {
  const blueprint = createBlueprint();
  const feed = createHopper({ id: 'feed', capacityKg: 50, initialMaterialBody: goethiteBody(20) });
  blueprint.nodes[feed.id] = feed;
  const feeder = blueprintAddApparatus(blueprint, 'feeder', {
    id: 'feeder', enabled: true, flowRateKgPerSecond: 1,
  });
  const furnace = blueprintAddApparatus(blueprint, 'roastingFurnace', {
    id: 'furnace', enabled: true, effectiveChamberHoldUpKg: 2, temperatureSetpointK: 900,
  });
  const product = blueprintAddApparatus(blueprint, 'hopper', { id: 'product', capacityKg: 50 });
  const vent = blueprintAddApparatus(blueprint, 'exhaustVent', { id: 'vent' });
  connect(blueprint, feed.id, 'output', feeder.id, 'feed');
  connect(blueprint, feeder.id, 'product', furnace.id, 'feed');
  connect(blueprint, furnace.id, 'solid-product', product.id, 'input');
  connect(blueprint, furnace.id, 'gas-exhaust', vent.id, 'gas-in');

  simulationAdvance(blueprint, {}, 4, 0.1);

  const furnaceDetails = machineInspection(blueprint, furnace).thermochemical;
  assert.ok(furnaceDetails.chargeMassKg > 0);
  assert.ok(furnaceDetails.chargeTemperatureK > 298.15);
  assert.equal(furnaceDetails.temperatureSetpointK, 900);
  assert.ok(furnaceDetails.actualHeaterPowerKw >= 0);
  assert.ok(furnaceDetails.meanResidenceTimeSeconds > 0);
  assert.equal(furnaceDetails.zones.length, 4);
  assert.ok(furnaceDetails.zones.every(zone => zone.capacityKg === 0.5));

  const ventDetails = exhaustVentInspection(blueprint, vent);
  assert.ok(ventDetails.totalEmittedMassKg > 0);
  assert.ok(ventDetails.composition.some(row => row.id === 'waterVapor'));
  assert.equal(ventDetails.input.physicalForm, 'gas');
});
