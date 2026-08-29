import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { PackedSolidRuntimeState } from '../src/simulation/packedRuntimeState.js';

const fixture = JSON.parse(await readFile(
  new URL('./fixtures/rust_core_parity.json', import.meta.url),
  'utf8',
));

test('typed-array fallback matches the shared Rust material parity fixture', () => {
  const state = new PackedSolidRuntimeState(1);
  for (const fraction of fixture.fractions) state.pushFraction(fraction);

  assert.equal(state.length, fixture.expectedCanonicalCount);
  assert.equal(state.totalQuantity(), fixture.expectedTotal);

  state.scaleInPlace(fixture.scaleFactor);
  assert.equal(state.totalQuantity(), fixture.expectedScaledTotal);
  assert.equal(state.length, fixture.expectedCanonicalCount);
});

test('packed runtime rejects invalid numeric execution state', () => {
  const state = new PackedSolidRuntimeState();
  assert.throws(() => state.pushFraction({
    speciesId: -1,
    sizeBinId: 0,
    liberationClassId: 0,
    textureProfileId: 0,
    quantity: 1,
  }), /speciesId/);
  assert.throws(() => state.pushFraction({
    speciesId: 1,
    sizeBinId: 0,
    liberationClassId: 0,
    textureProfileId: 0,
    quantity: Number.NaN,
  }), /quantity/);
  assert.throws(() => state.scaleInPlace(-1), /scale factor/);
});

test('packed runtime grows without changing canonical descriptor order', () => {
  const state = new PackedSolidRuntimeState(1);
  for (let speciesId = 1; speciesId <= 20; speciesId++) {
    state.pushFraction({
      speciesId,
      sizeBinId: speciesId % 8,
      liberationClassId: speciesId % 4,
      textureProfileId: speciesId,
      quantity: speciesId,
    });
  }
  const columns = state.toColumns();
  assert.equal(state.length, 20);
  assert.deepEqual([...columns.speciesIds], Array.from({ length: 20 }, (_, i) => i + 1));
  assert.equal(state.totalQuantity(), 210);
});
