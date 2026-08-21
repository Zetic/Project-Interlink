import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  addSolidFractionDirect,
  createSolidMaterialBody,
  createSolidMaterialState,
} from '../src/core/materials/solids/solidMaterialState.js';
import {
  materialBodyMassKg,
  setMaterialBodyTemperatureK,
} from '../src/core/materials/thermal/thermalMaterial.js';
import { applyGoethiteDehydroxylation } from '../src/core/processes/physics/thermochemicalReactions.js';
import { validateElementalConservation } from '../src/core/processes/conservation/elementalConservation.js';

function lowTemperatureGoethiteBody() {
  const state = createSolidMaterialState();
  for (const [sizeBinId, quantity] of [
    ['0.032-0.063mm', 4],
    ['0.063-0.125mm', 3],
    ['0.125-0.250mm', 3],
  ]) {
    addSolidFractionDirect(state, {
      speciesId: 'goethite',
      sizeBinId,
      liberationClassId: 'partial',
      quantity,
    });
  }
  const body = createSolidMaterialBody(state);
  setMaterialBodyTemperatureK(body, 347.15);
  return body;
}

test('sub-tolerance low-temperature reaction products never create apparent mass loss', () => {
  const feed = lowTemperatureGoethiteBody();
  const result = applyGoethiteDehydroxylation(feed, 0.1);

  assert.doesNotThrow(() => validateElementalConservation(
    [feed],
    [result.solidProductBody, result.gasProductBody],
    'thermochemical-roasting',
  ));

  const inputMassKg = materialBodyMassKg(feed);
  const outputMassKg = materialBodyMassKg(result.solidProductBody)
    + materialBodyMassKg(result.gasProductBody);
  assert.ok(Math.abs(inputMassKg - outputMassKg) <= 1e-9);
});
