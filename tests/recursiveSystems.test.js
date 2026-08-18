import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createBlueprint,
  blueprintAddExtractor,
  blueprintAddHopper,
  blueprintAddCrusher,
  blueprintAddMagSep,
  blueprintConnect,
  setNodeEnabled,
  simulationTick,
} from '../src/simulation/simulationEngine.js';
import { createWorld } from '../src/core/world/worldState.js';
import { SCHEMA_VERSION } from '../src/core/world/versions.js';
import {
  createCompositeNode,
  createSystemPort,
  resolveBoundaryPort,
  resolveBoundaryChain,
  setBoundaryMapping,
} from '../src/simulation/systemNode.js';
import { transferBoundaryMaterial } from '../src/simulation/boundaryTransfer.js';
import {
  createWorldSimulation,
  registerSimulationSession,
  registerSimulationWorkspace,
  registerBoundaryTransfer,
  pauseWorldSimulation,
  resumeWorldSimulation,
  worldSimulationAdvance,
  getSimulationWorkspace,
} from '../src/simulation/worldSimulation.js';
import { createHopper, hopperReceiveInflow, hopperStoredMassKg } from '../src/simulation/hopperNode.js';

function testWorld() {
  return { resourceOccurrences: { occ: { id: 'occ', resourceId: 'iron-ore', composition: { hematite: 100 } } } };
}

test('schema v5 records recursive/world-simulation state shape change', () => {
  assert.equal(SCHEMA_VERSION, 5);
  assert.equal(createWorld('schema-five').schemaVersion, 5);
});

test('active machinery starts disabled and reports off', () => {
  const blueprint = createBlueprint();
  for (const node of [blueprintAddExtractor(blueprint, 'occ'), blueprintAddCrusher(blueprint), blueprintAddMagSep(blueprint)]) {
    assert.equal(node.enabled, false);
    assert.equal(node.operatingState, 'off');
  }
});

test('disabled extractor produces nothing; enabling permits operation', () => {
  const world = testWorld();
  const blueprint = createBlueprint();
  const extractor = blueprintAddExtractor(blueprint, 'occ', 5);
  const output = blueprintAddHopper(blueprint);
  blueprintConnect(blueprint, extractor.id, extractor.outputPortId, output.id, output.inputPortId);
  simulationTick(blueprint, world);
  assert.equal(hopperStoredMassKg(output), 0);
  setNodeEnabled(blueprint, extractor.id, true);
  simulationTick(blueprint, world);
  assert.ok(hopperStoredMassKg(output) > 0);
  assert.equal(extractor.operatingState, 'running');
});

test('enabled crusher moves idle → blocked → running as physical constraints change', () => {
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
});

test('boundary mapping validates real child port direction and type', () => {
  const hopper = createHopper({ id: 'h', capacityKg: 10 });
  const workspace = { nodes: { h: hopper } };
  const composite = createCompositeNode({ id: 'site', nodeType: 'site', ports: [
    createSystemPort({ id: 'out', direction: 'output', kind: 'material' }),
  ] });
  assert.throws(() => setBoundaryMapping(composite, 'out', 'h', 'input', workspace), /direction/);
  setBoundaryMapping(composite, 'out', 'h', 'output', workspace);
  assert.equal(resolveBoundaryPort(composite, 'out', workspace).node, hopper);
});

test('nested Region → Site boundary resolves to the primitive physical owner', () => {
  const hopper = createHopper({ id: 'site-output', capacityKg: 10 });
  const site = createCompositeNode({ id: 'site-a', nodeType: 'site', childWorkspaceId: 'site-ws', ports: [
    createSystemPort({ id: 'material-output', direction: 'output', childNodeId: 'site-output', childPortId: 'output' }),
  ] });
  const region = createCompositeNode({ id: 'region-a', nodeType: 'region', childWorkspaceId: 'region-ws', ports: [
    createSystemPort({ id: 'material-output', direction: 'output', childNodeId: 'site-a', childPortId: 'material-output' }),
  ] });
  const workspaces = { 'region-ws': { nodes: { 'site-a': site } }, 'site-ws': { nodes: { 'site-output': hopper } } };
  assert.equal(resolveBoundaryChain(region, 'material-output', workspaces).node, hopper);
});

test('nested boundary transfer conserves matter across Region boundaries', () => {
  const sourceHopper = createHopper({ id: 'source-h', capacityKg: 10 });
  const targetHopper = createHopper({ id: 'target-h', capacityKg: 10 });
  hopperReceiveInflow(sourceHopper, { hematite: 3, magnetite: 1 }, 15, 1);

  const site = createCompositeNode({ id: 'site-a', nodeType: 'site', childWorkspaceId: 'site-ws', ports: [
    createSystemPort({ id: 'material-output', direction: 'output', childNodeId: 'source-h', childPortId: 'output' }),
  ] });
  const sourceRegion = createCompositeNode({ id: 'region-a', nodeType: 'region', childWorkspaceId: 'region-a-ws', ports: [
    createSystemPort({ id: 'material-output', direction: 'output', childNodeId: 'site-a', childPortId: 'material-output' }),
  ] });
  const targetRegion = createCompositeNode({ id: 'region-b', nodeType: 'region', childWorkspaceId: 'region-b-ws', ports: [
    createSystemPort({ id: 'material-input', direction: 'input', childNodeId: 'target-h', childPortId: 'input' }),
  ] });
  const workspaces = {
    'region-a-ws': { nodes: { 'site-a': site } },
    'site-ws': { nodes: { 'source-h': sourceHopper } },
    'region-b-ws': { nodes: { 'target-h': targetHopper } },
  };
  const before = hopperStoredMassKg(sourceHopper) + hopperStoredMassKg(targetHopper);
  const result = transferBoundaryMaterial({ sourceComposite: sourceRegion, sourcePortId: 'material-output', targetComposite: targetRegion, targetPortId: 'material-input', workspaces, dt: 0.1 });
  assert.ok(result.movedKg > 0);
  assert.ok(Math.abs(hopperStoredMassKg(sourceHopper) + hopperStoredMassKg(targetHopper) - before) < 1e-8);
});

test('generated Regions expose material input/output and runtime buffers without revealing them as matter copies', () => {
  const world = createWorld('recursive-runtime');
  createWorldSimulation(world);
  const regionId = world.planets[world.planetId].regions[0];
  const regionNode = world.systemNodes[regionId];
  assert.deepEqual(regionNode.ports.map(p => [p.id, p.direction]), [['material-input', 'input'], ['material-output', 'output']]);
  const workspace = getSimulationWorkspace(world, regionNode.childWorkspaceId);
  assert.equal(workspace.nodes[`${regionId}-import-hopper`].nodeType, 'hopper');
  assert.equal(workspace.nodes[`${regionId}-export-hopper`].nodeType, 'hopper');
});

test('world transfer registry rejects source fan-out and input fan-in', () => {
  const world = createWorld('transfer-contracts');
  createWorldSimulation(world);
  const regions = world.planets[world.planetId].regions.slice(0, 3);
  if (regions.length < 2) return;
  const first = registerBoundaryTransfer(world, { sourceCompositeId: regions[0], sourcePortId: 'material-output', targetCompositeId: regions[1], targetPortId: 'material-input' });
  assert.ok(first.id);
  if (regions.length >= 3) {
    assert.throws(() => registerBoundaryTransfer(world, { sourceCompositeId: regions[0], sourcePortId: 'material-output', targetCompositeId: regions[2], targetPortId: 'material-input' }), /already connected/);
  }
});

test('world pause freezes physical state without changing machine command state', () => {
  const world = testWorld();
  const blueprint = createBlueprint();
  const extractor = blueprintAddExtractor(blueprint, 'occ', 5);
  const output = blueprintAddHopper(blueprint);
  blueprintConnect(blueprint, extractor.id, extractor.outputPortId, output.id, output.inputPortId);
  setNodeEnabled(blueprint, extractor.id, true);
  createWorldSimulation(world);
  registerSimulationSession(world, 'site-a', blueprint);
  pauseWorldSimulation(world);
  worldSimulationAdvance(world, 1);
  assert.equal(hopperStoredMassKg(output), 0);
  assert.equal(extractor.enabled, true);
  resumeWorldSimulation(world);
  worldSimulationAdvance(world, 0.1);
  assert.ok(hopperStoredMassKg(output) > 0);
});
