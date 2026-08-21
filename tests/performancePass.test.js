import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  _resetOrdinals,
  blueprintAddHopper,
  blueprintConnect,
  blueprintDisconnect,
  createBlueprint,
  getStreamForConnection,
  SIMULATION_STEP_S,
} from '../src/simulation/simulationEngine.js';
import {
  findOutboundConnection,
  updateConnectionStream,
} from '../src/simulation/apparatus/blueprintHelpers.js';
import {
  createSolidMaterialStateFromSpeciesQuantities,
  multiplySolidMaterialState,
} from '../src/core/materials/solids/solidMaterialState.js';
import { applyContinuousFeeding } from '../src/simulation/continuousProcessing.js';
import {
  scaleSolidStateForRuntime,
  solidStateMassForRuntime,
} from '../src/simulation/apparatus/materialTransferHelpers.js';
import { totalMaterialStreamMassFlowKgPerSecond } from '../src/simulation/materialStream.js';
import { createWorkspaceState } from '../src/workspace/workspaceState.js';

test('positive topology caches invalidate safely across disconnect and reconnect', () => {
  _resetOrdinals();
  const blueprint = createBlueprint();
  const source = blueprintAddHopper(blueprint, 100);
  const targetA = blueprintAddHopper(blueprint, 100);
  const targetB = blueprintAddHopper(blueprint, 100);

  const first = blueprintConnect(
    blueprint,
    source.id,
    source.outputPortId,
    targetA.id,
    targetA.inputPortId,
  );
  assert.ok(first);
  assert.equal(findOutboundConnection(blueprint, source.id, source.outputPortId), first);
  // Exercise the cached path.
  assert.equal(findOutboundConnection(blueprint, source.id, source.outputPortId), first);

  blueprintDisconnect(blueprint, first.id);
  const second = blueprintConnect(
    blueprint,
    source.id,
    source.outputPortId,
    targetB.id,
    targetB.inputPortId,
  );
  assert.ok(second);
  assert.notEqual(second.id, first.id);
  assert.equal(findOutboundConnection(blueprint, source.id, source.outputPortId), second);

  const flow = createSolidMaterialStateFromSpeciesQuantities({ hematite: 2 }, 1);
  updateConnectionStream(blueprint, second, flow, 0);
  const stream = getStreamForConnection(blueprint, second.id);
  assert.ok(stream);
  assert.ok(Math.abs(totalMaterialStreamMassFlowKgPerSecond(stream) - 2) < 1e-9);
});

test('legacy continuous-flow projections preserve historical rounding but are lazy', () => {
  const feed = createSolidMaterialStateFromSpeciesQuantities({ hematite: 2, quartz: 1 }, 1);
  const result = applyContinuousFeeding(feed, 2, 10);

  const descriptor = Object.getOwnPropertyDescriptor(result, 'productRates');
  assert.equal(typeof descriptor?.get, 'function', 'compatibility projection should not be built eagerly');

  assert.deepEqual(result.productRates.componentMassFlowKgPerSecond, {
    hematite: 1.333333333333,
    quartz: 0.666666666667,
  });
  assert.equal(result.productRates.particleSizeMm, null);
});

test('runtime sparse scaling preserves the canonical solid-state numerical result', () => {
  const state = createSolidMaterialStateFromSpeciesQuantities({ hematite: 3, quartz: 2 }, 1);
  const canonical = multiplySolidMaterialState(state, 0.37);
  const runtime = scaleSolidStateForRuntime(state, 0.37);

  assert.deepEqual(runtime.fractions, canonical.fractions);
  assert.deepEqual(Object.keys(runtime.textureProfiles), Object.keys(canonical.textureProfiles));
  assert.ok(Math.abs(solidStateMassForRuntime(runtime) - 1.85) < 1e-12);
});

test('workspace simulation debt never queues more than one authoritative physics step', () => {
  const state = createWorkspaceState();
  state.simAccumulatedS = 10;
  assert.equal(state.simAccumulatedS, SIMULATION_STEP_S);

  state.simAccumulatedS -= SIMULATION_STEP_S;
  assert.equal(state.simAccumulatedS, 0);

  state.simAccumulatedS = 0.04;
  state.simAccumulatedS += 0.03;
  assert.ok(Math.abs(state.simAccumulatedS - 0.07) < 1e-12);
});