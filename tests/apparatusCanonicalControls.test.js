import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CRUSHING_PROCESS_ID,
  getProcessDefinition,
  validateProcessParameters,
} from '../src/core/processes/processDefinitions.js';
import {
  addSolidFractionDirect,
  createSolidMaterialState,
} from '../src/core/materials/solidMaterialState.js';
import { splitMagneticSolidState } from '../src/core/processes/processPhysics.js';

test('Crusher configuration exposes and enforces canonical particle-size cuts', () => {
  const definition = getProcessDefinition(CRUSHING_PROCESS_ID);
  const parameter = definition.parameters.find(item => item.id === 'targetParticleSizeMm');
  const canonicalCuts = [1, 5, 15, 25, 60, 120];

  assert.deepEqual(parameter.choices.map(choice => choice.value), canonicalCuts);
  for (const targetParticleSizeMm of canonicalCuts) {
    assert.equal(
      validateProcessParameters(definition, { targetParticleSizeMm }).targetParticleSizeMm,
      targetParticleSizeMm,
    );
  }

  assert.throws(
    () => validateProcessParameters(definition, { targetParticleSizeMm: 100 }),
    /must use a canonical value: 1, 5, 15, 25, 60, 120/,
  );
});

test('Magnetic Separator oversized-feed error reports the blocking share and largest size class', () => {
  const feed = createSolidMaterialState();
  addSolidFractionDirect(feed, {
    speciesId: 'quartz',
    sizeBinId: '60-120mm',
    liberationClassId: 'partial',
    quantity: 90,
  });
  addSolidFractionDirect(feed, {
    speciesId: 'magnetite',
    sizeBinId: '15-25mm',
    liberationClassId: 'liberated',
    quantity: 10,
  });

  assert.throws(
    () => splitMagneticSolidState(feed, 0.6, 25),
    /requires feed particle size <= 25 mm; blocked because feed contains 90\.0% oversized material \(largest class 60–120 mm\)/,
  );
});
