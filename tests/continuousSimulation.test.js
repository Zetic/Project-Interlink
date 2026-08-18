/**
 * Tests for the continuous simulation layer:
 * - MaterialStream
 * - HopperNode
 * - ContinuousProcessing (Crusher + Magnetic Separator)
 * - SimulationEngine (end-to-end chain + backpressure)
 * - Blueprint layout isolation (UI drag does not mutate physical state)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMaterialStream, totalMassFlowKgPerSecond, validateComponentMassFlowRates } from '../src/simulation/materialStream.js';
import { createHopper, hopperStoredMassKg, hopperFreeCapacityKg, hopperReceiveInflow, hopperWithdraw } from '../src/simulation/hopperNode.js';
import { applyContinuousCrushing, applyContinuousMagneticSeparation } from '../src/simulation/continuousProcessing.js';
import {
  createBlueprint,
  blueprintAddExtractor,
  blueprintAddHopper,
  blueprintAddCrusher,
  blueprintAddMagSep,
  blueprintConnect,
  blueprintDisconnect,
  simulationTick,
  simulationAdvance,
  createBlueprintLayout,
  layoutMoveNode,
  SIMULATION_STEP_S,
  _resetOrdinals,
} from '../src/simulation/simulationEngine.js';
import { createWorld } from '../src/core/world/worldState.js';

const MASS_TOL = 1e-6;

// Reset ID ordinals before each test file run for reproducibility
_resetOrdinals();

// ─── MATERIAL STREAM ──────────────────────────────────────────────────────────

test('stream: createMaterialStream returns valid stream', () => {
  const stream = createMaterialStream({
    id: 's1',
    sourceNodeId: 'n1', sourcePortId: 'output',
    targetNodeId: 'n2', targetPortId: 'input',
    componentMassFlowKgPerSecond: { hematite: 2, magnetite: 1 },
    particleSizeMm: 80,
  });
  assert.equal(stream.id, 's1');
  assert.equal(stream.particleSizeMm, 80);
  assert.equal(stream.componentMassFlowKgPerSecond.hematite, 2);
});

test('stream: totalMassFlowKgPerSecond sums constituents', () => {
  const total = totalMassFlowKgPerSecond({ hematite: 2, magnetite: 1, quartzAndGangue: 0.5 });
  assert.ok(Math.abs(total - 3.5) < MASS_TOL);
});

test('stream: all component flow rates must be non-negative', () => {
  assert.throws(() => {
    createMaterialStream({
      id: 's2', sourceNodeId: 'n1', sourcePortId: 'output',
      targetNodeId: 'n2', targetPortId: 'input',
      componentMassFlowKgPerSecond: { hematite: -1 },
      particleSizeMm: 10,
    });
  }, /non-negative/);
});

test('stream: all component flow rates must be finite', () => {
  assert.throws(() => validateComponentMassFlowRates({ hematite: Infinity }), /finite/);
  assert.throws(() => validateComponentMassFlowRates({ hematite: NaN }), /finite/);
});

test('stream: zero rates are valid', () => {
  const stream = createMaterialStream({
    id: 's3', sourceNodeId: 'n1', sourcePortId: 'output',
    targetNodeId: 'n2', targetPortId: 'input',
    componentMassFlowKgPerSecond: { hematite: 0, magnetite: 0 },
    particleSizeMm: 5,
  });
  assert.equal(totalMassFlowKgPerSecond(stream.componentMassFlowKgPerSecond), 0);
});

// ─── HOPPER NODE ──────────────────────────────────────────────────────────────

test('hopper: inflow increases stored constituents', () => {
  const hopper = createHopper({ id: 'h1', capacityKg: 500 });
  hopperReceiveInflow(hopper, { hematite: 2, magnetite: 1 }, 80, 1);
  assert.ok(Math.abs(hopper.storedComponentsKg.hematite - 2) < MASS_TOL);
  assert.ok(Math.abs(hopper.storedComponentsKg.magnetite - 1) < MASS_TOL);
  assert.ok(Math.abs(hopperStoredMassKg(hopper) - 3) < MASS_TOL);
});

test('hopper: outflow decreases stored constituents', () => {
  const hopper = createHopper({ id: 'h2', capacityKg: 500, initialComponentsKg: { hematite: 10, magnetite: 5 }, initialParticleSizeMm: 80 });
  const { actualTotalKg } = hopperWithdraw(hopper, { hematite: 2, magnetite: 1 }, 1);
  assert.ok(actualTotalKg > 0);
  assert.ok(hopper.storedComponentsKg.hematite < 10);
});

test('hopper: full container limits inflow', () => {
  const hopper = createHopper({ id: 'h3', capacityKg: 10, initialComponentsKg: { hematite: 9.99 }, initialParticleSizeMm: 80 });
  hopperReceiveInflow(hopper, { hematite: 100 }, 80, 1); // request 100 kg, only ~0.01 free
  assert.ok(hopperStoredMassKg(hopper) <= 10 + 1e-6, `Stored ${hopperStoredMassKg(hopper)} should not exceed capacity 10`);
});

test('hopper: empty container returns zero from withdraw', () => {
  const hopper = createHopper({ id: 'h4', capacityKg: 500 });
  const { actualTotalKg } = hopperWithdraw(hopper, { hematite: 5 }, 1);
  assert.equal(actualTotalKg, 0);
});

test('hopper: constituent mass is conserved over inflow/outflow', () => {
  const hopper = createHopper({ id: 'h5', capacityKg: 500 });
  hopperReceiveInflow(hopper, { hematite: 3, magnetite: 2 }, 80, 1);
  const before = hopperStoredMassKg(hopper);
  const { actualTotalKg } = hopperWithdraw(hopper, { hematite: 1, magnetite: 1 }, 1);
  const after = hopperStoredMassKg(hopper);
  assert.ok(Math.abs(before - after - actualTotalKg) < MASS_TOL);
});

test('hopper: mixed compatible inflows aggregate without retaining per-transfer objects', () => {
  const hopper = createHopper({ id: 'h6', capacityKg: 500 });
  hopperReceiveInflow(hopper, { hematite: 2 }, 80, 1);
  hopperReceiveInflow(hopper, { hematite: 3, magnetite: 1 }, 80, 1);
  // Result is a single aggregated object, not an array of transfers
  assert.equal(typeof hopper.storedComponentsKg, 'object');
  assert.ok(Math.abs(hopper.storedComponentsKg.hematite - 5) < MASS_TOL);
  assert.ok(Math.abs(hopper.storedComponentsKg.magnetite - 1) < MASS_TOL);
});

test('hopper: stored mass cannot go negative', () => {
  const hopper = createHopper({ id: 'h7', capacityKg: 500, initialComponentsKg: { hematite: 1 }, initialParticleSizeMm: 80 });
  hopperWithdraw(hopper, { hematite: 100 }, 1); // request more than available
  assert.ok(hopper.storedComponentsKg.hematite >= 0);
});

// ─── CONTINUOUS CRUSHING ──────────────────────────────────────────────────────

test('crusher: preserves constituent flow rates while changing particle size', () => {
  const feed = { componentMassFlowKgPerSecond: { hematite: 3, magnetite: 1 }, particleSizeMm: 80 };
  const { productRates } = applyContinuousCrushing(feed, 15, 10);
  assert.equal(productRates.particleSizeMm, 15);
  // Throughput >= feed, so no throttling → rates preserved
  assert.ok(Math.abs(productRates.componentMassFlowKgPerSecond.hematite - 3) < MASS_TOL);
  assert.ok(Math.abs(productRates.componentMassFlowKgPerSecond.magnetite - 1) < MASS_TOL);
});

test('crusher: throughput limit throttles feed', () => {
  const feed = { componentMassFlowKgPerSecond: { hematite: 8, magnetite: 2 }, particleSizeMm: 80 };
  const { actualFeedRates } = applyContinuousCrushing(feed, 15, 4); // capacity = 4 kg/s, feed = 10 kg/s
  const actualTotal = Object.values(actualFeedRates.componentMassFlowKgPerSecond).reduce((s, r) => s + r, 0);
  assert.ok(Math.abs(actualTotal - 4) < MASS_TOL, `Expected throttled feed = 4 kg/s, got ${actualTotal}`);
});

test('crusher: rejects targetParticleSizeMm >= feed size', () => {
  const feed = { componentMassFlowKgPerSecond: { hematite: 1 }, particleSizeMm: 15 };
  assert.throws(() => applyContinuousCrushing(feed, 15, 10), /targetParticleSizeMm/);
  assert.throws(() => applyContinuousCrushing(feed, 20, 10), /targetParticleSizeMm/);
});

// ─── CONTINUOUS MAGNETIC SEPARATION ───────────────────────────────────────────

test('magSep: conserves constituent flow across concentrate and tailings', () => {
  const feed = {
    componentMassFlowKgPerSecond: { hematite: 4, magnetite: 2, goethite: 1, quartzAndGangue: 1 },
    particleSizeMm: 15,
  };
  const { concentrateRates, tailingsRates } = applyContinuousMagneticSeparation(feed, 0.6);
  for (const cid of Object.keys(feed.componentMassFlowKgPerSecond)) {
    const inRate = feed.componentMassFlowKgPerSecond[cid];
    const concRate = concentrateRates.componentMassFlowKgPerSecond[cid] ?? 0;
    const tailRate = tailingsRates.componentMassFlowKgPerSecond[cid] ?? 0;
    assert.ok(Math.abs(inRate - (concRate + tailRate)) < MASS_TOL,
      `Conservation violated for ${cid}: in=${inRate} conc=${concRate} tail=${tailRate}`);
  }
});

test('magSep: rejects feed particle size above max', () => {
  const feed = { componentMassFlowKgPerSecond: { hematite: 1, magnetite: 1, goethite: 0.5, quartzAndGangue: 0.5 }, particleSizeMm: 30 };
  assert.throws(() => applyContinuousMagneticSeparation(feed, 0.6, 25), /particle size/);
});

test('magSep: particle size propagates to outputs', () => {
  const feed = {
    componentMassFlowKgPerSecond: { hematite: 2, magnetite: 1, goethite: 0.5, quartzAndGangue: 0.5 },
    particleSizeMm: 12,
  };
  const { concentrateRates, tailingsRates } = applyContinuousMagneticSeparation(feed, 0.6);
  assert.equal(concentrateRates.particleSizeMm, 12);
  assert.equal(tailingsRates.particleSizeMm, 12);
});

// ─── END-TO-END CHAIN ─────────────────────────────────────────────────────────

function findIronOreOccurrence(world) {
  return Object.values(world.resourceOccurrences).find(
    occ => occ.resourceId === 'iron-ore' && occ.composition && typeof occ.composition === 'object'
  ) ?? null;
}

function buildTestWorld() {
  for (let i = 0; i < 200; i++) {
    const world = createWorld(`sim-chain-${i}`);
    const occ = findIronOreOccurrence(world);
    if (occ) return { world, occ };
  }
  throw new Error('Could not find iron-ore occurrence with composition in test seed range');
}

test('chain: extractor → hopper → crusher → hopper → magSep → output hoppers advances deterministically', () => {
  _resetOrdinals();
  const { world, occ } = buildTestWorld();

  const bp = createBlueprint();
  const extractor = blueprintAddExtractor(bp, occ.id, 5);           // 5 kg/s
  const hopperA   = blueprintAddHopper(bp, 1000);                    // feed hopper
  const crusher   = blueprintAddCrusher(bp, { throughputKgPerSecond: 4, targetParticleSizeMm: 15 });
  const hopperB   = blueprintAddHopper(bp, 1000);                    // crushed hopper
  const magSep    = blueprintAddMagSep(bp, { fieldStrength: 0.6 });
  const concHopper = blueprintAddHopper(bp, 1000);
  const tailHopper = blueprintAddHopper(bp, 1000);

  blueprintConnect(bp, extractor.id, extractor.outputPortId, hopperA.id, hopperA.inputPortId);
  blueprintConnect(bp, hopperA.id, hopperA.outputPortId, crusher.id, crusher.inputPortId);
  blueprintConnect(bp, crusher.id, crusher.outputPortId, hopperB.id, hopperB.inputPortId);
  blueprintConnect(bp, hopperB.id, hopperB.outputPortId, magSep.id, magSep.inputPortId);
  blueprintConnect(bp, magSep.id, magSep.concentratePortId, concHopper.id, concHopper.inputPortId);
  blueprintConnect(bp, magSep.id, magSep.tailingsPortId, tailHopper.id, tailHopper.inputPortId);

  // Run 10 seconds worth of simulation
  simulationAdvance(bp, world, 10, SIMULATION_STEP_S);

  // After 10 s: extractor pushes 5 kg/s, crusher takes 4 kg/s
  // hopperA should have some accumulation (bottleneck), hopperB should have received crushed material
  const massA = hopperStoredMassKg(hopperA);
  const massB = hopperStoredMassKg(hopperB);
  const massCon = hopperStoredMassKg(concHopper);
  const massTail = hopperStoredMassKg(tailHopper);

  // Material should have moved through the chain
  assert.ok(massCon + massTail > 0, 'Some material should have reached output hoppers');

  // Conservation: total material in system is at most what extractor produced
  const extractorProduced = 5 * 10; // kg
  const totalInSystem = massA + massB + massCon + massTail;
  assert.ok(totalInSystem <= extractorProduced + MASS_TOL * 100,
    `Total in system (${totalInSystem}) should not exceed extractor produced (${extractorProduced})`);
  assert.ok(totalInSystem > 0, 'System should have material');
});

test('chain: bottleneck causes accumulation in buffer hopper', () => {
  _resetOrdinals();
  const { world, occ } = buildTestWorld();

  const bp = createBlueprint();
  const extractor = blueprintAddExtractor(bp, occ.id, 5); // 5 kg/s extractor
  const hopper    = blueprintAddHopper(bp, 1000);          // large buffer
  // No downstream consumer — everything accumulates

  blueprintConnect(bp, extractor.id, extractor.outputPortId, hopper.id, hopper.inputPortId);

  simulationAdvance(bp, world, 10, SIMULATION_STEP_S);
  // Should have accumulated ~50 kg (5 kg/s × 10 s)
  const stored = hopperStoredMassKg(hopper);
  assert.ok(stored > 40, `Expected ~50 kg accumulated, got ${stored}`);
});

test('chain: full hopper blocks extractor inflow', () => {
  _resetOrdinals();
  const { world, occ } = buildTestWorld();

  const bp = createBlueprint();
  const extractor = blueprintAddExtractor(bp, occ.id, 5);
  const hopper    = blueprintAddHopper(bp, 10); // tiny capacity

  blueprintConnect(bp, extractor.id, extractor.outputPortId, hopper.id, hopper.inputPortId);

  simulationAdvance(bp, world, 20, SIMULATION_STEP_S);
  // Hopper should not exceed capacity
  assert.ok(hopperStoredMassKg(hopper) <= 10 + MASS_TOL,
    `Hopper should not exceed capacity 10 kg, got ${hopperStoredMassKg(hopper)}`);
});

test('chain: empty input hopper prevents downstream processing', () => {
  _resetOrdinals();
  const { world, occ } = buildTestWorld();

  const bp = createBlueprint();
  // Hopper with no feed, connected to crusher
  const hopper  = blueprintAddHopper(bp, 1000);
  const crusher = blueprintAddCrusher(bp, { throughputKgPerSecond: 4, targetParticleSizeMm: 15 });
  const outHopper = blueprintAddHopper(bp, 1000);

  blueprintConnect(bp, hopper.id, hopper.outputPortId, crusher.id, crusher.inputPortId);
  blueprintConnect(bp, crusher.id, crusher.outputPortId, outHopper.id, outHopper.inputPortId);

  simulationAdvance(bp, world, 5, SIMULATION_STEP_S);

  // Nothing should have passed through with empty input
  assert.equal(hopperStoredMassKg(outHopper), 0);
});

// ─── UI / STATE SEPARATION ────────────────────────────────────────────────────

test('layout: node layout/drag does not mutate physical material quantities', () => {
  _resetOrdinals();
  const { world, occ } = buildTestWorld();

  const bp = createBlueprint();
  const hopper = blueprintAddHopper(bp, 1000);
  const layout = createBlueprintLayout();

  // Simulate receiving some material
  hopperReceiveInflow(hopper, { hematite: 50 }, 80, 1);
  const massBefore = hopperStoredMassKg(hopper);

  // Move the node around
  layoutMoveNode(layout, hopper.id, 100, 200);
  layoutMoveNode(layout, hopper.id, 300, 400);

  const massAfter = hopperStoredMassKg(hopper);
  assert.ok(Math.abs(massBefore - massAfter) < MASS_TOL, 'Layout drag must not change physical material quantity');
  assert.equal(layout.nodePositions[hopper.id].x, 300);
});

test('layout: blueprint.nodes is separate from layout.nodePositions', () => {
  _resetOrdinals();
  const bp = createBlueprint();
  const hopper = blueprintAddHopper(bp, 500);
  const layout = createBlueprintLayout();

  layoutMoveNode(layout, hopper.id, 50, 75);

  // Physical node should have no x/y position
  assert.equal(bp.nodes[hopper.id].x, undefined);
  assert.equal(bp.nodes[hopper.id].y, undefined);
  // Layout has position
  assert.equal(layout.nodePositions[hopper.id].x, 50);
});

// ─── EXISTING TESTS SMOKE CHECK ───────────────────────────────────────────────

test('existing world generation remains stable', () => {
  const world = createWorld('stability-check');
  assert.ok(world.planetId);
  assert.ok(Object.keys(world.regions).length > 0);
});
