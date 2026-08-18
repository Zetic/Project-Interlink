import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createMaterialStream,
  setMaterialStreamState,
  totalMassFlowKgPerSecond,
  validateComponentMassFlowRates,
} from '../src/simulation/materialStream.js';
import {
  createHopper,
  hopperStoredMassKg,
  hopperReceiveInflow,
  hopperWithdraw,
} from '../src/simulation/hopperNode.js';
import {
  applyContinuousCrushing,
  applyContinuousMagneticSeparation,
} from '../src/simulation/continuousProcessing.js';
import {
  createBlueprint,
  blueprintAddExtractor,
  blueprintAddHopper,
  blueprintAddCrusher,
  blueprintAddMagSep,
  blueprintConnect,
  blueprintDisconnect,
  checkBlueprintConnection,
  getStreamForConnection,
  simulationTick,
  simulationAdvance,
  setNodeEnabled,
  createBlueprintLayout,
  layoutMoveNode,
  SIMULATION_STEP_S,
  _resetOrdinals,
} from '../src/simulation/simulationEngine.js';
import { createWorld } from '../src/core/world/worldState.js';

const MASS_TOL = 1e-6;
let cachedIronOreSeed = null;

function findIronOreOccurrence(world) {
  return Object.values(world.resourceOccurrences).find(
    occurrence => occurrence.resourceId === 'iron-ore' && occurrence.composition && typeof occurrence.composition === 'object'
  ) ?? null;
}

function buildTestWorld() {
  if (cachedIronOreSeed) {
    const world = createWorld(cachedIronOreSeed);
    return { world, occ: findIronOreOccurrence(world) };
  }

  for (let i = 0; i < 200; i++) {
    const seed = `sim-chain-${i}`;
    const world = createWorld(seed);
    const occ = findIronOreOccurrence(world);
    if (occ) {
      cachedIronOreSeed = seed;
      return { world, occ };
    }
  }
  throw new Error('Could not find iron-ore occurrence with composition in test seed range');
}

function sumHopperComponents(...hoppers) {
  const totals = {};
  for (const hopper of hoppers) {
    for (const [componentId, kg] of Object.entries(hopper.storedComponentsKg)) {
      totals[componentId] = (totals[componentId] ?? 0) + kg;
    }
  }
  return totals;
}

function buildFullChain(world, occ, capacities = {}) {
  _resetOrdinals();
  const blueprint = createBlueprint();
  const extractor = blueprintAddExtractor(blueprint, occ.id, 5);
  const hopperA = blueprintAddHopper(blueprint, capacities.feed ?? 1000);
  const crusher = blueprintAddCrusher(blueprint, { throughputKgPerSecond: 4, targetParticleSizeMm: 15 });
  const hopperB = blueprintAddHopper(blueprint, capacities.crushed ?? 1000);
  const magSep = blueprintAddMagSep(blueprint, { fieldStrength: 0.6, throughputKgPerSecond: 4 });
  const concentrateHopper = blueprintAddHopper(blueprint, capacities.concentrate ?? 1000);
  const tailingsHopper = blueprintAddHopper(blueprint, capacities.tailings ?? 1000);

  blueprintConnect(blueprint, extractor.id, extractor.outputPortId, hopperA.id, hopperA.inputPortId);
  blueprintConnect(blueprint, hopperA.id, hopperA.outputPortId, crusher.id, crusher.inputPortId);
  blueprintConnect(blueprint, crusher.id, crusher.outputPortId, hopperB.id, hopperB.inputPortId);
  blueprintConnect(blueprint, hopperB.id, hopperB.outputPortId, magSep.id, magSep.inputPortId);
  blueprintConnect(blueprint, magSep.id, magSep.concentratePortId, concentrateHopper.id, concentrateHopper.inputPortId);
  blueprintConnect(blueprint, magSep.id, magSep.tailingsPortId, tailingsHopper.id, tailingsHopper.inputPortId);
  for (const node of [extractor, crusher, magSep]) setNodeEnabled(blueprint, node.id, true);

  return { blueprint, extractor, hopperA, crusher, hopperB, magSep, concentrateHopper, tailingsHopper };
}

test('stream: total flow is derived from constituent rates', () => {
  const stream = createMaterialStream({
    id: 's1', sourceNodeId: 'n1', sourcePortId: 'out', targetNodeId: 'n2', targetPortId: 'in',
    componentMassFlowKgPerSecond: { hematite: 2, magnetite: 1 }, particleSizeMm: 80,
  });
  assert.equal(totalMassFlowKgPerSecond(stream.componentMassFlowKgPerSecond), 3);
  assert.equal(Object.hasOwn(stream, 'totalMassFlowKgPerSecond'), false);
});

test('stream: inactive connections use the same contract with zero flow', () => {
  const stream = createMaterialStream({
    id: 's0', sourceNodeId: 'n1', sourcePortId: 'out', targetNodeId: 'n2', targetPortId: 'in',
    componentMassFlowKgPerSecond: {}, particleSizeMm: null,
  });
  assert.equal(totalMassFlowKgPerSecond(stream.componentMassFlowKgPerSecond), 0);
  setMaterialStreamState(stream, { hematite: 1 }, 15);
  assert.equal(totalMassFlowKgPerSecond(stream.componentMassFlowKgPerSecond), 1);
  setMaterialStreamState(stream, {}, null);
  assert.equal(stream.particleSizeMm, null);
});

test('stream: component rates must be finite and non-negative', () => {
  assert.throws(() => validateComponentMassFlowRates({ hematite: -1 }), /non-negative/);
  assert.throws(() => validateComponentMassFlowRates({ hematite: Infinity }), /finite/);
  assert.throws(() => validateComponentMassFlowRates({ hematite: NaN }), /finite/);
});

test('hopper: inflow and outflow conserve stored constituent mass', () => {
  const hopper = createHopper({ id: 'h1', capacityKg: 100 });
  hopperReceiveInflow(hopper, { hematite: 3, magnetite: 2 }, 80, 1);
  const before = hopperStoredMassKg(hopper);
  const withdrawal = hopperWithdraw(hopper, { hematite: 1, magnetite: 1 }, 1);
  const after = hopperStoredMassKg(hopper);
  assert.ok(Math.abs(before - after - withdrawal.actualTotalKg) < MASS_TOL);
});

test('hopper: capacity clamps inflow without exceeding physical capacity', () => {
  const hopper = createHopper({
    id: 'h2', capacityKg: 10, initialComponentsKg: { hematite: 9.99 }, initialParticleSizeMm: 80,
  });
  const accepted = hopperReceiveInflow(hopper, { hematite: 100 }, 80, 1);
  assert.ok(accepted <= 0.010001);
  assert.ok(hopperStoredMassKg(hopper) <= 10 + MASS_TOL);
});

test('hopper: mixed inflows aggregate rather than retaining transfer objects', () => {
  const hopper = createHopper({ id: 'h3', capacityKg: 100 });
  hopperReceiveInflow(hopper, { hematite: 2 }, 80, 1);
  hopperReceiveInflow(hopper, { hematite: 3, magnetite: 1 }, 80, 1);
  assert.deepEqual(hopper.storedComponentsKg, { hematite: 5, magnetite: 1 });
  assert.equal(Array.isArray(hopper.storedComponentsKg), false);
});

test('hopper: empty storage cannot provide unavailable material', () => {
  const hopper = createHopper({ id: 'h4', capacityKg: 100 });
  const withdrawal = hopperWithdraw(hopper, { hematite: 5 }, 1);
  assert.equal(withdrawal.actualTotalKg, 0);
  assert.equal(hopperStoredMassKg(hopper), 0);
});

test('crusher: preserves constituent flow while changing particle size', () => {
  const feed = { componentMassFlowKgPerSecond: { hematite: 3, magnetite: 1 }, particleSizeMm: 80 };
  const result = applyContinuousCrushing(feed, 15, 10);
  assert.deepEqual(result.productRates.componentMassFlowKgPerSecond, result.actualFeedRates.componentMassFlowKgPerSecond);
  assert.equal(result.productRates.particleSizeMm, 15);
});

test('crusher: throughput limit throttles feed', () => {
  const feed = { componentMassFlowKgPerSecond: { hematite: 8, magnetite: 2 }, particleSizeMm: 80 };
  const result = applyContinuousCrushing(feed, 15, 4);
  assert.ok(Math.abs(totalMassFlowKgPerSecond(result.actualFeedRates.componentMassFlowKgPerSecond) - 4) < MASS_TOL);
});

test('magnetic separator: conserves every constituent across both outputs', () => {
  const feed = {
    componentMassFlowKgPerSecond: { hematite: 4, magnetite: 2, goethite: 1, quartzAndGangue: 1 },
    particleSizeMm: 15,
  };
  const result = applyContinuousMagneticSeparation(feed, 0.6);
  for (const [componentId, inputRate] of Object.entries(feed.componentMassFlowKgPerSecond)) {
    const outputRate = (result.concentrateRates.componentMassFlowKgPerSecond[componentId] ?? 0)
      + (result.tailingsRates.componentMassFlowKgPerSecond[componentId] ?? 0);
    assert.ok(Math.abs(inputRate - outputRate) < MASS_TOL, componentId);
  }
});

test('magnetic separator: retains particle-size applicability rule', () => {
  assert.throws(() => applyContinuousMagneticSeparation({
    componentMassFlowKgPerSecond: { hematite: 1 }, particleSizeMm: 30,
  }, 0.6, 25), /particle size/);
});

test('connections: solver rejects visually connectable but unsupported node transitions', () => {
  _resetOrdinals();
  const { world, occ } = buildTestWorld();
  const blueprint = createBlueprint();
  const extractor = blueprintAddExtractor(blueprint, occ.id);
  const crusher = blueprintAddCrusher(blueprint);
  const check = checkBlueprintConnection(blueprint, extractor.id, extractor.outputPortId, crusher.id, crusher.inputPortId);
  assert.equal(check.ok, false);
  assert.match(check.reason, /not supported/);
  assert.equal(blueprintConnect(blueprint, extractor.id, extractor.outputPortId, crusher.id, crusher.inputPortId), null);
  assert.ok(world);
});

test('connections: one material output cannot fan out and duplicate matter', () => {
  _resetOrdinals();
  const { occ } = buildTestWorld();
  const blueprint = createBlueprint();
  const extractor = blueprintAddExtractor(blueprint, occ.id);
  const hopperA = blueprintAddHopper(blueprint);
  const hopperB = blueprintAddHopper(blueprint);
  assert.ok(blueprintConnect(blueprint, extractor.id, extractor.outputPortId, hopperA.id, hopperA.inputPortId));
  assert.equal(blueprintConnect(blueprint, extractor.id, extractor.outputPortId, hopperB.id, hopperB.inputPortId), null);
  assert.equal(Object.keys(blueprint.connections).length, 1);
});

test('connections: one target input accepts only one material stream', () => {
  _resetOrdinals();
  const { occ } = buildTestWorld();
  const blueprint = createBlueprint();
  const extractorA = blueprintAddExtractor(blueprint, occ.id);
  const extractorB = blueprintAddExtractor(blueprint, occ.id);
  const hopper = blueprintAddHopper(blueprint);
  assert.ok(blueprintConnect(blueprint, extractorA.id, extractorA.outputPortId, hopper.id, hopper.inputPortId));
  assert.equal(blueprintConnect(blueprint, extractorB.id, extractorB.outputPortId, hopper.id, hopper.inputPortId), null);
});

test('crusher: disconnected product output does not consume input matter', () => {
  _resetOrdinals();
  const { world } = buildTestWorld();
  const blueprint = createBlueprint();
  const feed = blueprintAddHopper(blueprint, 100);
  const crusher = blueprintAddCrusher(blueprint, { throughputKgPerSecond: 4, targetParticleSizeMm: 15 });
  hopperReceiveInflow(feed, { hematite: 1, magnetite: 1 }, 80, 1);
  blueprintConnect(blueprint, feed.id, feed.outputPortId, crusher.id, crusher.inputPortId);
  setNodeEnabled(blueprint, crusher.id, true);
  const before = hopperStoredMassKg(feed);
  simulationTick(blueprint, world, 0.1);
  assert.ok(Math.abs(hopperStoredMassKg(feed) - before) < MASS_TOL);
});

test('crusher: partially full output backpressures feed instead of deleting product', () => {
  _resetOrdinals();
  const { world } = buildTestWorld();
  const blueprint = createBlueprint();
  const feed = blueprintAddHopper(blueprint, 100);
  const crusher = blueprintAddCrusher(blueprint, { throughputKgPerSecond: 4, targetParticleSizeMm: 15 });
  const output = blueprintAddHopper(blueprint, 10);
  hopperReceiveInflow(feed, { hematite: 5, magnetite: 5 }, 80, 1);
  hopperReceiveInflow(output, { hematite: 9.95 }, 15, 1);
  blueprintConnect(blueprint, feed.id, feed.outputPortId, crusher.id, crusher.inputPortId);
  blueprintConnect(blueprint, crusher.id, crusher.outputPortId, output.id, output.inputPortId);
  setNodeEnabled(blueprint, crusher.id, true);

  const beforeFeed = hopperStoredMassKg(feed);
  const beforeOutput = hopperStoredMassKg(output);
  simulationTick(blueprint, world, 0.1);
  const feedDecrease = beforeFeed - hopperStoredMassKg(feed);
  const outputIncrease = hopperStoredMassKg(output) - beforeOutput;
  assert.ok(Math.abs(feedDecrease - outputIncrease) < MASS_TOL);
  assert.ok(outputIncrease <= 0.050001);
});

test('crusher: nearly empty input cannot create a full-tick output', () => {
  _resetOrdinals();
  const { world } = buildTestWorld();
  const blueprint = createBlueprint();
  const feed = blueprintAddHopper(blueprint, 100);
  const crusher = blueprintAddCrusher(blueprint, { throughputKgPerSecond: 4, targetParticleSizeMm: 15 });
  const output = blueprintAddHopper(blueprint, 100);
  hopperReceiveInflow(feed, { hematite: 0.1 }, 80, 1);
  blueprintConnect(blueprint, feed.id, feed.outputPortId, crusher.id, crusher.inputPortId);
  blueprintConnect(blueprint, crusher.id, crusher.outputPortId, output.id, output.inputPortId);
  setNodeEnabled(blueprint, crusher.id, true);

  simulationTick(blueprint, world, 0.1);
  assert.ok(hopperStoredMassKg(feed) < MASS_TOL);
  assert.ok(Math.abs(hopperStoredMassKg(output) - 0.1) < MASS_TOL);
});

test('magnetic separator: full required output backpressures without consuming feed', () => {
  _resetOrdinals();
  const { world } = buildTestWorld();
  const blueprint = createBlueprint();
  const feed = blueprintAddHopper(blueprint, 100);
  const magSep = blueprintAddMagSep(blueprint, { fieldStrength: 0.6, throughputKgPerSecond: 4 });
  const concentrate = blueprintAddHopper(blueprint, 1);
  const tailings = blueprintAddHopper(blueprint, 100);
  hopperReceiveInflow(feed, { hematite: 5, magnetite: 2, goethite: 1, quartzAndGangue: 2 }, 15, 1);
  hopperReceiveInflow(concentrate, { hematite: 1 }, 15, 1);
  blueprintConnect(blueprint, feed.id, feed.outputPortId, magSep.id, magSep.inputPortId);
  blueprintConnect(blueprint, magSep.id, magSep.concentratePortId, concentrate.id, concentrate.inputPortId);
  blueprintConnect(blueprint, magSep.id, magSep.tailingsPortId, tailings.id, tailings.inputPortId);
  setNodeEnabled(blueprint, magSep.id, true);

  const beforeFeed = hopperStoredMassKg(feed);
  const beforeTailings = hopperStoredMassKg(tailings);
  simulationTick(blueprint, world, 0.1);
  assert.ok(Math.abs(hopperStoredMassKg(feed) - beforeFeed) < MASS_TOL);
  assert.ok(Math.abs(hopperStoredMassKg(tailings) - beforeTailings) < MASS_TOL);
});

test('magnetic separator: disconnected required output does not consume feed', () => {
  _resetOrdinals();
  const { world } = buildTestWorld();
  const blueprint = createBlueprint();
  const feed = blueprintAddHopper(blueprint, 100);
  const magSep = blueprintAddMagSep(blueprint);
  const concentrate = blueprintAddHopper(blueprint, 100);
  hopperReceiveInflow(feed, { hematite: 5, magnetite: 2, goethite: 1, quartzAndGangue: 2 }, 15, 1);
  blueprintConnect(blueprint, feed.id, feed.outputPortId, magSep.id, magSep.inputPortId);
  blueprintConnect(blueprint, magSep.id, magSep.concentratePortId, concentrate.id, concentrate.inputPortId);
  setNodeEnabled(blueprint, magSep.id, true);
  const before = hopperStoredMassKg(feed);
  simulationTick(blueprint, world, 0.1);
  assert.ok(Math.abs(hopperStoredMassKg(feed) - before) < MASS_TOL);
});

test('chain: automated extractor → crusher → separator conserves total sourced matter exactly', () => {
  const { world, occ } = buildTestWorld();
  const chain = buildFullChain(world, occ);
  simulationAdvance(chain.blueprint, world, 10, SIMULATION_STEP_S);

  const storedTotal = [chain.hopperA, chain.hopperB, chain.concentrateHopper, chain.tailingsHopper]
    .reduce((sum, hopper) => sum + hopperStoredMassKg(hopper), 0);
  assert.ok(Math.abs(storedTotal - chain.blueprint.simulationStats.extractedKg) < MASS_TOL * 100);
  assert.ok(Math.abs(chain.blueprint.simulationStats.extractedKg - 50) < 1e-5);
});

test('chain: constituent totals match the composition of actually extracted matter', () => {
  const { world, occ } = buildTestWorld();
  const chain = buildFullChain(world, occ);
  simulationAdvance(chain.blueprint, world, 10, SIMULATION_STEP_S);
  const totals = sumHopperComponents(chain.hopperA, chain.hopperB, chain.concentrateHopper, chain.tailingsHopper);
  const compositionTotal = Object.values(occ.composition).reduce((sum, pct) => sum + pct, 0);

  for (const [componentId, pct] of Object.entries(occ.composition)) {
    const expected = chain.blueprint.simulationStats.extractedKg * pct / compositionTotal;
    assert.ok(Math.abs((totals[componentId] ?? 0) - expected) < 1e-5, componentId);
  }
});

test('chain: extractor respects full storage and stats track actual rather than theoretical extraction', () => {
  _resetOrdinals();
  const { world, occ } = buildTestWorld();
  const blueprint = createBlueprint();
  const extractor = blueprintAddExtractor(blueprint, occ.id, 5);
  const hopper = blueprintAddHopper(blueprint, 10);
  blueprintConnect(blueprint, extractor.id, extractor.outputPortId, hopper.id, hopper.inputPortId);
  setNodeEnabled(blueprint, extractor.id, true);
  simulationAdvance(blueprint, world, 20, SIMULATION_STEP_S);
  assert.ok(Math.abs(hopperStoredMassKg(hopper) - 10) < MASS_TOL);
  assert.ok(Math.abs(blueprint.simulationStats.extractedKg - 10) < MASS_TOL);
});

test('chain: bottleneck accumulates matter in the upstream physical buffer', () => {
  const { world, occ } = buildTestWorld();
  const chain = buildFullChain(world, occ);
  simulationAdvance(chain.blueprint, world, 10, SIMULATION_STEP_S);
  assert.ok(hopperStoredMassKg(chain.hopperA) > 9, '5 kg/s extraction feeding a 4 kg/s crusher should accumulate upstream');
});

test('chain: advancing streams does not allocate MaterialBatch objects per tick', () => {
  const { world, occ } = buildTestWorld();
  const chain = buildFullChain(world, occ);
  const before = Object.keys(world.materialBatches).length;
  simulationAdvance(chain.blueprint, world, 5, SIMULATION_STEP_S);
  assert.equal(Object.keys(world.materialBatches).length, before);
});

test('chain: same world state and timestep produce deterministic continuous simulation', () => {
  const first = buildTestWorld();
  const firstChain = buildFullChain(first.world, first.occ);
  simulationAdvance(firstChain.blueprint, first.world, 5, SIMULATION_STEP_S);
  const firstSnapshot = JSON.parse(JSON.stringify(firstChain.blueprint));

  const second = buildTestWorld();
  const secondChain = buildFullChain(second.world, second.occ);
  simulationAdvance(secondChain.blueprint, second.world, 5, SIMULATION_STEP_S);
  assert.deepEqual(secondChain.blueprint, firstSnapshot);
});

test('connections: disconnect removes its associated stream', () => {
  _resetOrdinals();
  const { occ } = buildTestWorld();
  const blueprint = createBlueprint();
  const extractor = blueprintAddExtractor(blueprint, occ.id);
  const hopper = blueprintAddHopper(blueprint);
  const connection = blueprintConnect(blueprint, extractor.id, extractor.outputPortId, hopper.id, hopper.inputPortId);
  assert.ok(getStreamForConnection(blueprint, connection.id));
  blueprintDisconnect(blueprint, connection.id);
  assert.equal(getStreamForConnection(blueprint, connection.id), null);
});

test('layout: moving a node does not mutate physical material state', () => {
  _resetOrdinals();
  const blueprint = createBlueprint();
  const hopper = blueprintAddHopper(blueprint, 500);
  const layout = createBlueprintLayout();
  hopperReceiveInflow(hopper, { hematite: 50 }, 80, 1);
  const physicalBefore = JSON.stringify(hopper);
  layoutMoveNode(layout, hopper.id, 100, 200);
  layoutMoveNode(layout, hopper.id, 300, 400);
  assert.equal(JSON.stringify(hopper), physicalBefore);
  assert.deepEqual(layout.nodePositions[hopper.id], { x: 300, y: 400 });
  assert.equal(blueprint.nodes[hopper.id].x, undefined);
});

test('existing world generation remains stable', () => {
  const world = createWorld('stability-check');
  assert.ok(world.planetId);
  assert.ok(Object.keys(world.regions).length > 0);
});
