import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSolidMaterialBody,
  createSolidMaterialState,
  addSolidFractionDirect,
  summarizeSolidMaterialBySpecies,
} from '../src/core/materials/solids/solidMaterialState.js';
import { createThermalState } from '../src/core/materials/thermal/thermalState.js';
import {
  createHopper,
  hopperReceiveMaterialBody,
  hopperStoredMassKg,
  hopperWithdraw,
} from '../src/simulation/hopperNode.js';
import {
  compileHopperForRuntime,
  createPackedMaterialIdTables,
} from '../src/simulation/packedRuntimeCompiler.js';
import { PackedSolidRuntimeState } from '../src/simulation/packedRuntimeState.js';
import {
  PackedHopperRuntimeState,
  PackedSolidRuntimeBody,
  transferPackedHoppers,
} from '../src/simulation/packedStorageRuntime.js';

function packedState(fractions) {
  const state = new PackedSolidRuntimeState();
  for (const fraction of fractions) state.pushFraction(fraction);
  return state;
}

function canonicalState(hematiteKg, quartzKg) {
  const state = createSolidMaterialState();
  if (hematiteKg > 0) {
    addSolidFractionDirect(state, {
      speciesId: 'hematite',
      sizeBinId: '1-5mm',
      liberationClassId: 'partial',
      quantity: hematiteKg,
    });
  }
  if (quartzKg > 0) {
    addSolidFractionDirect(state, {
      speciesId: 'quartz',
      sizeBinId: '1-5mm',
      liberationClassId: 'partial',
      quantity: quartzKg,
    });
  }
  return state;
}

function canonicalBody(hematiteKg, quartzKg, sensibleEnthalpyJ) {
  return createSolidMaterialBody(
    canonicalState(hematiteKg, quartzKg),
    createThermalState({ sensibleEnthalpyJ }),
  );
}

function packedSpeciesSummary(packedState, idTables) {
  const summary = {};
  const columns = packedState.toColumns();
  for (let index = 0; index < columns.quantities.length; index++) {
    const speciesId = idTables.species.valueFor(columns.speciesIds[index]);
    summary[speciesId] = (summary[speciesId] ?? 0) + columns.quantities[index];
  }
  return summary;
}

function assertClose(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance} of ${expected}`);
}

test('packed Hopper clips continuous inflow at capacity while preserving energy', () => {
  const initial = new PackedSolidRuntimeBody(
    packedState([{ speciesId: 1, sizeBinId: 2, liberationClassId: 1, quantity: 20 }]),
    2000,
  );
  const hopper = new PackedHopperRuntimeState(25, initial);
  const flow = packedState([
    { speciesId: 1, sizeBinId: 2, liberationClassId: 1, quantity: 4 },
    { speciesId: 2, sizeBinId: 2, liberationClassId: 1, quantity: 6 },
  ]);

  const accepted = hopper.receiveFlow(flow, 1, 300);
  assertClose(accepted, 5);
  assertClose(hopper.storedMassKg(), 25);
  assertClose(hopper.body.sensibleEnthalpyJ, 3500);
});

test('packed Hopper transfer is atomic, capacity-limited, and conservative', () => {
  const source = new PackedHopperRuntimeState(100, new PackedSolidRuntimeBody(
    packedState([
      { speciesId: 1, sizeBinId: 2, liberationClassId: 1, quantity: 30 },
      { speciesId: 2, sizeBinId: 2, liberationClassId: 1, quantity: 20 },
    ]),
    5000,
  ));
  const target = new PackedHopperRuntimeState(40, new PackedSolidRuntimeBody(
    packedState([{ speciesId: 1, sizeBinId: 2, liberationClassId: 1, quantity: 5 }]),
    1000,
  ));

  const massBefore = source.storedMassKg() + target.storedMassKg();
  const energyBefore = source.body.sensibleEnthalpyJ + target.body.sensibleEnthalpyJ;
  const moved = transferPackedHoppers(source, target, 20, 1);

  assertClose(moved, 20);
  assertClose(source.storedMassKg(), 30);
  assertClose(target.storedMassKg(), 25);
  assertClose(source.body.sensibleEnthalpyJ, 3000);
  assertClose(target.body.sensibleEnthalpyJ, 3000);
  assertClose(source.storedMassKg() + target.storedMassKg(), massBefore);
  assertClose(source.body.sensibleEnthalpyJ + target.body.sensibleEnthalpyJ, energyBefore);

  const withdrawal = target.withdrawRate(10, 0.5);
  assertClose(withdrawal.actualMassKg, 5);
  assertClose(withdrawal.body.sensibleEnthalpyJ, 600);
  assertClose(target.storedMassKg(), 20);
  assertClose(target.body.sensibleEnthalpyJ, 2400);
});

test('canonical Hopper and packed runtime produce the same conservative transfer result', () => {
  const canonicalSource = createHopper({
    id: 'source',
    capacityKg: 100,
    initialMaterialBody: canonicalBody(30, 20, 5000),
  });
  const canonicalTarget = createHopper({
    id: 'target',
    capacityKg: 40,
    initialMaterialBody: canonicalBody(5, 0, 1000),
  });

  const idTables = createPackedMaterialIdTables();
  const { packedHopper: packedSource } = compileHopperForRuntime(canonicalSource, idTables);
  const { packedHopper: packedTarget } = compileHopperForRuntime(canonicalTarget, idTables);

  const canonicalWithdrawal = hopperWithdraw(canonicalSource, 20, 1);
  const transferBody = createSolidMaterialBody(
    canonicalWithdrawal.actualSolidState,
    createThermalState({ sensibleEnthalpyJ: canonicalWithdrawal.actualSensibleEnthalpyJ }),
  );
  const canonicalAccepted = hopperReceiveMaterialBody(canonicalTarget, transferBody);
  const packedAccepted = transferPackedHoppers(packedSource, packedTarget, 20, 1);

  assertClose(packedAccepted, canonicalAccepted);
  assertClose(packedSource.storedMassKg(), hopperStoredMassKg(canonicalSource));
  assertClose(packedTarget.storedMassKg(), hopperStoredMassKg(canonicalTarget));
  assertClose(packedSource.body.sensibleEnthalpyJ, canonicalSource.materialBody.thermalState.sensibleEnthalpyJ);
  assertClose(packedTarget.body.sensibleEnthalpyJ, canonicalTarget.materialBody.thermalState.sensibleEnthalpyJ);

  const canonicalSourceSpecies = summarizeSolidMaterialBySpecies(canonicalSource.materialBody.solidState);
  const canonicalTargetSpecies = summarizeSolidMaterialBySpecies(canonicalTarget.materialBody.solidState);
  const packedSourceSpecies = packedSpeciesSummary(packedSource.body.solidState, idTables);
  const packedTargetSpecies = packedSpeciesSummary(packedTarget.body.solidState, idTables);

  for (const speciesId of ['hematite', 'quartz']) {
    assertClose(packedSourceSpecies[speciesId] ?? 0, canonicalSourceSpecies[speciesId] ?? 0);
    assertClose(packedTargetSpecies[speciesId] ?? 0, canonicalTargetSpecies[speciesId] ?? 0);
  }
});
