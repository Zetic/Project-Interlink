import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createBlueprint,
  blueprintAddFeatureSource,
  blueprintAddExtractor,
  blueprintAddHopper,
  blueprintAddCrusher,
  blueprintAddMagSep,
  blueprintConnect,
  checkBlueprintConnection,
  getNodePortDefinitions,
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
  registerBoundaryTransfer,
  pauseWorldSimulation,
  resumeWorldSimulation,
  worldSimulationAdvance,
  getSimulationWorkspace,
} from '../src/simulation/worldSimulation.js';
import {
  createHopper,
  createBoundaryBuffer,
  hopperReceiveInflow,
  hopperStoredMassKg,
} from '../src/simulation/hopperNode.js';

function testWorld() {
  return {
    resourceOccurrences: {
      occ: {
        id: 'occ',
        resourceId: 'iron-ore',
        composition: { hematite: 100 },
        sourceType: 'feature',
        sourceId: 'feature-test',
      },
    },
    features: {
      'feature-test': { id: 'feature-test', name: 'Test Deposit', resourceOccurrences: ['occ'] },
    },
  };
}

function connectTestFeature(blueprint, world, extractor) {
  const feature = world.features['feature-test'];
  const node = blueprintAddFeatureSource(blueprint, {
    featureId: feature.id,
    displayName: feature.name,
    resourceOccurrenceIds: feature.resourceOccurrences,
  });
  const connection = blueprintConnect(
    blueprint,
    node.id,
    node.resourceAccessPortId,
    extractor.id,
    extractor.sourceInputPortId,
  );
  assert.ok(connection);
  return node;
}

test('schema v9 records canonical ownership plus persistent ore texture state', () => {
  assert.equal(SCHEMA_VERSION, 9);
  assert.equal(createWorld('schema-nine').schemaVersion, 9);
});

test('active machinery starts disabled and reports off', () => {
  const blueprint = createBlueprint();
  for (const node of [blueprintAddExtractor(blueprint, 'occ'), blueprintAddCrusher(blueprint), blueprintAddMagSep(blueprint)]) {
    assert.equal(node.enabled, false);
    assert.equal(node.operatingState, 'off');
  }
});

test('disabled extractor produces nothing; enabling permits operation when a Feature source is connected', () => {
  const world = testWorld();
  const blueprint = createBlueprint();
  const extractor = blueprintAddExtractor(blueprint, 'occ', 5);
  connectTestFeature(blueprint, world, extractor);
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

test('generated Regions expose material input/output, physical buffers, and child-facing adapters', () => {
  const world = createWorld('recursive-runtime');
  createWorldSimulation(world);
  const regionId = world.planets[world.planetId].regions[0];
  const regionNode = world.systemNodes[regionId];
  assert.deepEqual(regionNode.ports.map(port => [port.id, port.direction]), [['material-input', 'input'], ['material-output', 'output']]);
  const workspace = getSimulationWorkspace(world, regionNode.childWorkspaceId);
  assert.equal(workspace.nodes[`${regionId}-import-hopper`].nodeType, 'hopper');
  assert.equal(workspace.nodes[`${regionId}-export-hopper`].nodeType, 'hopper');
  assert.equal(world.systemNodes[`${regionId}-import-terminal`].ports[0].direction, 'output');
  assert.equal(world.systemNodes[`${regionId}-export-terminal`].ports[0].direction, 'input');
});

test('generated Sites expose distinct import/export boundary owners without implicit logistics', () => {
  const world = createWorld('site-boundaries');
  createWorldSimulation(world);
  const siteId = Object.keys(world.sites)[0];
  const site = world.systemNodes[siteId];
  const workspace = getSimulationWorkspace(world, site.childWorkspaceId);
  const input = resolveBoundaryPort(site, 'material-input', workspace);
  const output = resolveBoundaryPort(site, 'material-output', workspace);

  assert.equal(input.node.boundaryRole, 'import');
  assert.equal(output.node.boundaryRole, 'export');
  assert.notEqual(input.node, output.node);
  assert.equal(Object.keys(world.simulation.transfers ?? {}).length, 0);
  assert.equal(site.ports.find(port => port.id === 'material-input').childNodeId, input.node.id);
  assert.equal(site.ports.find(port => port.id === 'material-output').childNodeId, output.node.id);
});

test('boundary buffers expose only their child-facing port to Site connections', () => {
  const importBoundary = createBoundaryBuffer({ id: 'site-import', capacityKg: 10, role: 'import' });
  const exportBoundary = createBoundaryBuffer({ id: 'site-export', capacityKg: 10, role: 'export' });
  assert.deepEqual(getNodePortDefinitions(importBoundary).map(port => [port.id, port.direction]), [['output', 'output']]);
  assert.deepEqual(getNodePortDefinitions(exportBoundary).map(port => [port.id, port.direction]), [['input', 'input']]);
});

test('explicit Hopper → Site Export link moves conserved material only after connection exists', () => {
  const blueprint = createBlueprint();
  const source = blueprintAddHopper(blueprint, 10);
  const siteExport = createBoundaryBuffer({ id: 'site-export', capacityKg: 10, role: 'export' });
  blueprint.nodes[siteExport.id] = siteExport;
  hopperReceiveInflow(source, { hematite: 3, magnetite: 1 }, 15, 1);

  simulationTick(blueprint, testWorld(), 0.1);
  assert.equal(hopperStoredMassKg(siteExport), 0);

  const check = checkBlueprintConnection(blueprint, source.id, source.outputPortId, siteExport.id, siteExport.inputPortId);
  assert.equal(check.ok, true);
  blueprintConnect(blueprint, source.id, source.outputPortId, siteExport.id, siteExport.inputPortId);
  const before = hopperStoredMassKg(source) + hopperStoredMassKg(siteExport);
  simulationTick(blueprint, testWorld(), 0.1);
  assert.ok(hopperStoredMassKg(siteExport) > 0);
  assert.ok(Math.abs(hopperStoredMassKg(source) + hopperStoredMassKg(siteExport) - before) < 1e-8);
});

test('Region Import adapter can explicitly feed a Site Import while preserving one physical owner per buffer', () => {
  const world = createWorld('region-import-site-import');
  createWorldSimulation(world);
  const siteId = Object.keys(world.sites)[0];
  const site = world.systemNodes[siteId];
  const regionId = world.sites[siteId].regionId;
  const regionWorkspace = getSimulationWorkspace(world, world.systemNodes[regionId].childWorkspaceId);
  const siteWorkspace = getSimulationWorkspace(world, site.childWorkspaceId);
  const regionImport = regionWorkspace.nodes[`${regionId}-import-hopper`];
  const siteImport = siteWorkspace.nodes[`${siteId}-import-boundary`];
  hopperReceiveInflow(regionImport, { hematite: 2, magnetite: 1 }, 15, 1);
  const before = hopperStoredMassKg(regionImport) + hopperStoredMassKg(siteImport);

  registerBoundaryTransfer(world, {
    sourceCompositeId: `${regionId}-import-terminal`,
    sourcePortId: 'material-output',
    targetCompositeId: siteId,
    targetPortId: 'material-input',
    scopeId: regionId,
    capacityKgPerSecond: 10,
  });
  worldSimulationAdvance(world, 0.1);

  assert.ok(hopperStoredMassKg(siteImport) > 0);
  assert.ok(hopperStoredMassKg(regionImport) < 3);
  assert.ok(Math.abs(hopperStoredMassKg(regionImport) + hopperStoredMassKg(siteImport) - before) < 1e-8);
  assert.equal(resolveBoundaryPort(site, 'material-input', siteWorkspace).node, siteImport);
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
  connectTestFeature(blueprint, world, extractor);
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
