import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  addSolidFractionDirect,
  createSolidMaterialBody,
  createSolidMaterialState,
  totalSolidQuantity,
} from '../src/core/materials/solids/solidMaterialState.js';
import {
  materialBodyMassKg,
  setMaterialBodyTemperatureK,
} from '../src/core/materials/thermal/thermalMaterial.js';
import { applyGoethiteDehydroxylation } from '../src/core/processes/physics/thermochemicalReactions.js';
import { validateElementalConservation } from '../src/core/processes/conservation/elementalConservation.js';
import {
  createHopper,
  hopperReceiveMaterialBody,
  hopperStoredMassKg,
} from '../src/simulation/hopperNode.js';

const SIZE_BINS = [
  '0.004-0.008mm',
  '0.008-0.016mm',
  '0.016-0.032mm',
  '0.032-0.063mm',
  '0.063-0.125mm',
];
const LIBERATION_CLASSES = ['locked', 'partial', 'mostly-liberated', 'liberated'];

function populationRichGoethiteBody(totalMassKg = 10) {
  const state = createSolidMaterialState();
  const populationCount = SIZE_BINS.length * LIBERATION_CLASSES.length;
  const massPerPopulationKg = totalMassKg / populationCount;
  for (const sizeBinId of SIZE_BINS) {
    for (const liberationClassId of LIBERATION_CLASSES) {
      addSolidFractionDirect(state, {
        speciesId: 'goethite',
        sizeBinId,
        liberationClassId,
        quantity: massPerPopulationKg,
      });
    }
  }
  const body = createSolidMaterialBody(state);
  setMaterialBodyTemperatureK(body, 900);
  return body;
}

test('thermochemical solve uses bounded scalar candidate evaluations for population-rich feed', () => {
  const feed = populationRichGoethiteBody();
  const result = applyGoethiteDehydroxylation(feed, 0.1);

  // 32 bounded bisection iterations plus endpoint/final evaluations. The former
  // implementation rebuilt complete material bodies on every one of these
  // candidates; the optimized solver keeps them scalar and materializes once.
  assert.ok(result.solverEvaluationCount > 0);
  assert.ok(result.solverEvaluationCount <= 35);
  assert.doesNotThrow(() => validateElementalConservation(
    [feed],
    [result.solidProductBody, result.gasProductBody],
    'thermochemical-performance-regression',
  ));
  assert.ok(Math.abs(
    materialBodyMassKg(feed)
      - materialBodyMassKg(result.solidProductBody)
      - materialBodyMassKg(result.gasProductBody),
  ) <= 1e-9);
});

test('accumulating repeated roasted product grows mass without growing population cardinality', () => {
  const feed = populationRichGoethiteBody();
  const reaction = applyGoethiteDehydroxylation(feed, 0.1);
  const productBody = reaction.solidProductBody;
  const productPopulationCount = Object.keys(productBody.solidState.fractions).length;
  const productMassKg = totalSolidQuantity(productBody.solidState);
  const productEnergyJ = productBody.thermalState.sensibleEnthalpyJ;
  const receives = 100;
  const hopper = createHopper({ id: 'performance-product', capacityKg: productMassKg * (receives + 1) });

  for (let index = 0; index < receives; index += 1) {
    const acceptedKg = hopperReceiveMaterialBody(hopper, productBody);
    assert.ok(Math.abs(acceptedKg - productMassKg) <= 1e-9);
  }

  assert.equal(Object.keys(hopper.materialBody.solidState.fractions).length, productPopulationCount);
  assert.ok(Math.abs(hopperStoredMassKg(hopper) - productMassKg * receives) <= 1e-6);
  assert.ok(Math.abs(
    hopper.materialBody.thermalState.sensibleEnthalpyJ - productEnergyJ * receives,
  ) <= 1e-4 * Math.max(1, Math.abs(productEnergyJ * receives)));
});
