import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addSolidFractionDirect,
  createSolidMaterialState,
  totalSolidQuantity,
} from '../src/core/materials/solids/solidMaterialState.js';
import {
  compileSolidMaterialStateForRuntime,
  createPackedMaterialIdTables,
} from '../src/simulation/packedRuntimeCompiler.js';

test('canonical string material state compiles to runtime-local numeric columns without changing mass', () => {
  const canonical = createSolidMaterialState();
  addSolidFractionDirect(canonical, {
    speciesId: 'hematite',
    sizeBinId: '1-5mm',
    liberationClassId: 'partial',
    quantity: 12.5,
  });
  addSolidFractionDirect(canonical, {
    speciesId: 'magnetite',
    sizeBinId: '1-5mm',
    liberationClassId: 'partial',
    quantity: 7.5,
  });

  const tables = createPackedMaterialIdTables();
  const { packed, idTables } = compileSolidMaterialStateForRuntime(canonical, tables);
  const columns = packed.toColumns();

  assert.equal(packed.length, 2);
  assert.equal(packed.totalQuantity(), totalSolidQuantity(canonical));
  assert.deepEqual([...columns.speciesIds], [0, 1]);
  assert.deepEqual([...columns.sizeBinIds], [0, 0]);
  assert.deepEqual([...columns.liberationClassIds], [0, 0]);
  assert.deepEqual([...columns.textureProfileIds], [0, 0]);
  assert.equal(idTables.species.valueFor(0), 'hematite');
  assert.equal(idTables.species.valueFor(1), 'magnetite');
  assert.equal(idTables.sizeBin.valueFor(0), '1-5mm');
  assert.equal(idTables.liberationClass.valueFor(0), 'partial');
});

test('runtime IDs are deterministic for a shared compiler table but remain execution-local', () => {
  const tables = createPackedMaterialIdTables();
  assert.equal(tables.species.idFor('hematite'), 0);
  assert.equal(tables.species.idFor('magnetite'), 1);
  assert.equal(tables.species.idFor('hematite'), 0);

  const independent = createPackedMaterialIdTables();
  assert.equal(independent.species.idFor('magnetite'), 0);
  assert.equal(independent.species.idFor('hematite'), 1);
});
