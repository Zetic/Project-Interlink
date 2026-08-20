import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  crushSolidMaterialState,
  splitMagneticSolidState,
  splitScreenedSolidState,
} from '../src/core/processes/processPhysics.js';
import {
  createSolidMaterialState,
  summarizeSolidMaterialBySizeBin,
  totalSolidQuantity,
} from '../src/core/materials/solidMaterialState.js';

const MASS_TOL = 1e-9;

function assertAlmostEqual(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) <= MASS_TOL, `${label}: expected ${expected}, got ${actual}`);
}

function coarseFeed(quantity = 10) {
  return createSolidMaterialState([
    {
      speciesId: 'magnetite',
      sizeBinId: '120mm-plus',
      liberationClassId: 'locked',
      quantity,
    },
  ]);
}

test('canonical Crusher settings produce a nominal distribution with deterministic oversize', () => {
  const product = crushSolidMaterialState(coarseFeed(), 25);
  const sizes = summarizeSolidMaterialBySizeBin(product);

  assertAlmostEqual(sizes['25-60mm'], 1, 'oversize mass');
  assertAlmostEqual(sizes['15-25mm'], 5.5, 'nominal-bin mass');
  assertAlmostEqual(sizes['5-15mm'], 2.5, 'one-bin-finer mass');
  assertAlmostEqual(sizes['1-5mm'], 1, 'two-bins-finer mass');
  assertAlmostEqual(totalSolidQuantity(product), 10, 'crusher conservation');
});

test('Screen makes a 25 mm Crusher product safe for the 25 mm Magnetic Separator', () => {
  const crushed = crushSolidMaterialState(coarseFeed(), 25);

  assert.throws(
    () => splitMagneticSolidState(crushed, 1, 25),
    /10\.0% oversized material/,
  );

  const { undersize, oversize } = splitScreenedSolidState(crushed, 25);
  assertAlmostEqual(totalSolidQuantity(undersize), 9, 'screen undersize mass');
  assertAlmostEqual(totalSolidQuantity(oversize), 1, 'screen oversize mass');
  assert.doesNotThrow(() => splitMagneticSolidState(undersize, 1, 25));
});

test('recrushing Screen oversize progressively reduces the remaining oversize population', () => {
  const firstPass = crushSolidMaterialState(coarseFeed(), 25);
  const firstScreen = splitScreenedSolidState(firstPass, 25);
  const secondPass = crushSolidMaterialState(firstScreen.oversize, 25);
  const secondScreen = splitScreenedSolidState(secondPass, 25);

  assertAlmostEqual(totalSolidQuantity(firstScreen.oversize), 1, 'first-pass oversize');
  assertAlmostEqual(totalSolidQuantity(secondScreen.oversize), 0.1, 'second-pass oversize');
  assertAlmostEqual(
    totalSolidQuantity(secondScreen.undersize) + totalSolidQuantity(secondScreen.oversize),
    totalSolidQuantity(firstScreen.oversize),
    'recrush conservation',
  );
});
