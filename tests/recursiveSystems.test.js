import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createBlueprint,
  blueprintAddExtractor,
  blueprintAddHopper,
  blueprintAddCrusher,
  blueprintConnect,
  setNodeEnabled,
  simulationTick,
} from '../src/simulation/simulationEngine.js';
import { createWorld } from '../src/core/world/worldState.js';
import {
  createCompositeNode,
  createSystemPort,
  resolveBoundaryPort,
} from '../src/simulation/systemNode.js';
import { transferBoundaryMaterial } from '../src/simulation/boundaryTransfer.js';
import {
  createWorldSimulation,
  registerSimulationSession,
  pauseWorldSimulation,
  resumeWorldSimulation,
  worldSimulationAdvance,
} from '../src/simulation/worldSimulation.js';
import { hopperReceiveInflow, hopperStoredMassKg } from '../src/simulation/hopperNode.js';

function testWorld() {
  return {
    resourceOccurrences: {
      occ: {
        id: 'occ',
        resourceId: 'iron-ore',
        composition: { hematite: 100 },
      },
    },
  };
}

test('active machinery starts disabled and reports off', () => {
  const blueprint = createBlueprint();
  const extractor = blueprintAddExtractor(blueprint, 'occ');
  const crusher = blueprintAddCrusher(blueprint);
  assert.equal(extractor.enabled, false);
  assert.equal(extractor.operatingState, 'off');
  assert.equal(crusher.enabled, false);
  assert.equal(crusher.operatingState, 'off');
});

test('disabled extractor consumes and produces nothing; enabling permits operation', () => {
  const world = testWorld();
  const blueprint = createBlueprint();
  const extractor = blueprintAddExtractor(blueprint, 'occ', 5);
  const output = blueprintAddHopper(blueprint);
  blueprintConnect(blueprint, extractor.id, extractor.outputPortId, output.id, output.inputPortId);

  simulationTick(blueprint, world);
  assert.equal(hopperStoredMassKg(output), 0);
  assert.equal(extractor.operatingState, 'off');

  setNodeEnabled(blueprint, extractor.id, true);
  simulationTick(blueprint, world);
  assert.ok(hopperStoredMassKg(output) > 0);
  assert.equal(extractor.operatingState, 'running');
});

test('enabled crusher is idle without feed, blocked without output, and resumes after constraints clear', () => {
  const world = testWorld();
  const blueprint = createBlueprint();
  const input = blueprintAddHopper(blueprint);
  const crusher = blueprintAddCrusher(blueprint);
  const output = blueprintAddHopper(blueprint, 2);
  blueprintConnect(blueprint, input.id, input.outputPortId, crusher.id, crusher.inputPortId);
  setNodeEnabled(blueprint, crusher.id, true);

  simulationTick(blueprint, world);
  assert.equal(crusher.operatingState, 'idle');

  hopperReceiveInflow(input, { hematite: 1 }, 80, 1);
  simulationTick(blueprint, world);
  assert.equal(crusher.operatingState, 'blocked');

  blueprintConnect(blueprint, crusher.id, crusher.outputPortId, output.id, output.inputPortId);
  simulationTick(blueprint, world);
  assert.equal(crusher.operatingState, 'running');
  assert.ok(hopperStoredMassKg(output) > 0);
});

test('boundary transfer withdraws child-owned matter without duplication', () => {
  const sourceWorkspace = { nodes: { source: blueprintAddHopper({ nodes: {}, connections: {}, streams: {}, simulationStats: {} }, 10) } };
  const targetWorkspace = { nodes: { target: blueprintAddHopper({ nodes: {}, connections: {}, streams: {}, simulationStats: {} }, 10) } };
  hopperReceiveInflow(sourceWorkspace.nodes.source, { hematite: 3, magnetite: 1 }, 15, 1);

  const source = createCompositeNode({
    id: 'site-a',
    nodeType: 'site',
    ports: [createSystemPort({
      id: 'ore-output',
      direction: 'output',
      childNodeId: 'source',
      childPortId: 'output',
    })],
  });
  const target = createCompositeNode({
    id: 'site-b',
    nodeType: 'site',
    ports: [createSystemPort({
      id: 'ore-input',
      direction: 'input',
      childNodeId: 'target',
      childPortId: 'input',
    })],
  });

  const resolved = resolveBoundaryPort(source, 'ore-output', sourceWorkspace);
  assert.equal(resolved.node, sourceWorkspace.nodes.source);
  const before = hopperStoredMassKg(sourceWorkspace.nodes.source);
  const result = transferBoundaryMaterial({
    sourceComposite: source,
    sourcePortId: 'ore-output',
    sourceWorkspace,
    targetComposite: target,
    targetPortId: 'ore-input',
    targetWorkspace,
    dt: 0.1,
  });
  assert.ok(result.movedKg > 0);
  assert.ok(Math.abs(
    hopperStoredMassKg(sourceWorkspace.nodes.source)
      + hopperStoredMassKg(targetWorkspace.nodes.target)
      - before
  ) < 1e-8);
});

test('world simulation pause freezes physical state without changing enabled command state', () => {
  const world = testWorld();
  const blueprint = createBlueprint();
  const extractor = blueprintAddExtractor(blueprint, 'occ', 5);
  const output = blueprintAddHopper(blueprint);
  blueprintConnect(blueprint, extractor.id, extractor.outputPortId, output.id, output.inputPortId);
  setNodeEnabled(blueprint, extractor.id, true);
  createWorldSimulation(world);
  registerSimulationSession(world, 'site-a', blueprint);

  pauseWorldSimulation(world);
  const pausedMass = hopperStoredMassKg(output);
  worldSimulationAdvance(world, 1);
  assert.equal(hopperStoredMassKg(output), pausedMass);
  assert.equal(extractor.enabled, true);

  resumeWorldSimulation(world);
  worldSimulationAdvance(world, 0.1);
  assert.ok(hopperStoredMassKg(output) > pausedMass);
});

test('generated regions and sites expose recursive system-node contracts', () => {
  const world = createWorld('recursive-contracts');
  const planetNode = world.systemNodes[world.planetId];
  assert.equal(planetNode.kind, 'composite');
  assert.ok(planetNode.childWorkspaceId);
  const regionId = world.planets[world.planetId].regions[0];
  const region = world.regions[regionId];
  const regionNode = world.systemNodes[regionId];
  assert.equal(regionNode.kind, 'composite');
  assert.deepEqual(region.siteIds, regionNode.inspectableState.siteIds);
  if (region.siteIds.length > 0) {
    const site = world.sites[region.siteIds[0]];
    assert.equal(site.regionId, regionId);
    assert.equal(world.systemNodes[site.id].kind, 'composite');
    assert.equal(site.boundaryPorts[0].kind, 'material');
  }
});
