from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def p(rel): return ROOT / rel
def read(rel): return p(rel).read_text()
def write(rel, text):
    p(rel).parent.mkdir(parents=True, exist_ok=True)
    p(rel).write_text(text.rstrip() + '\n')

# The packed gas object is setup-only now. Test its serialized setup columns rather
# than restoring a JavaScript runtime convenience method that duplicates Rust.
roasting = read('tests/packedRoastingCompiler.test.js')
old = "  assert.ok(Math.abs(compiled.packedGasInventory.totalMassKg() - 0.05) < 1e-12);"
new = "  assert.ok(Math.abs(Array.from(compiled.packedGasInventory.gasState.toColumns().quantities).reduce((sum, value) => sum + value, 0) - 0.05) < 1e-12);"
if old not in roasting:
    raise RuntimeError('packed roasting gas-total assertion anchor missing')
write('tests/packedRoastingCompiler.test.js', roasting.replace(old, new, 1))

# Recursive-system coverage is retained for browser-side topology, ownership,
# boundary resolution, and transfer registration. Physical movement/clock tests
# belonged to the deleted JavaScript execution backend and are covered in Rust.
write('tests/recursiveSystems.test.js', """
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createBlueprint,
  blueprintAddExtractor,
  blueprintAddCrusher,
  blueprintAddMagSep,
  getNodePortDefinitions,
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
import {
  createWorldSimulation,
  registerBoundaryTransfer,
  getSimulationWorkspace,
} from '../src/simulation/worldSimulation.js';
import { createHopper, createBoundaryBuffer } from '../src/simulation/hopperNode.js';

test('schema v10 records thermal material-body and staged-furnace state', () => {
  assert.equal(SCHEMA_VERSION, 10);
  assert.equal(createWorld('schema-ten').schemaVersion, 10);
});

test('active machinery starts disabled and reports off before Rust runtime setup', () => {
  const blueprint = createBlueprint();
  for (const node of [blueprintAddExtractor(blueprint, 'occ'), blueprintAddCrusher(blueprint), blueprintAddMagSep(blueprint)]) {
    assert.equal(node.enabled, false);
    assert.equal(node.operatingState, 'off');
  }
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

test('nested Region to Site boundary resolves to the primitive physical owner', () => {
  const hopper = createHopper({ id: 'site-output', capacityKg: 10 });
  const site = createCompositeNode({ id: 'site-a', nodeType: 'site', childWorkspaceId: 'site-ws', ports: [
    createSystemPort({ id: 'material-output', direction: 'output', childNodeId: 'site-output', childPortId: 'output' }),
  ] });
  const region = createCompositeNode({ id: 'region-a', nodeType: 'region', childWorkspaceId: 'region-ws', ports: [
    createSystemPort({ id: 'material-output', direction: 'output', childNodeId: 'site-a', childPortId: 'material-output' }),
  ] });
  const workspaces = {
    'region-ws': { nodes: { 'site-a': site } },
    'site-ws': { nodes: { 'site-output': hopper } },
  };
  assert.equal(resolveBoundaryChain(region, 'material-output', workspaces).node, hopper);
});

test('generated Regions expose material boundaries, physical buffers, and child-facing adapters', () => {
  const world = createWorld('recursive-runtime');
  createWorldSimulation(world);
  const regionId = world.planets[world.planetId].regions[0];
  const regionNode = world.systemNodes[regionId];
  assert.deepEqual(regionNode.ports.map(port => [port.id, port.direction]), [
    ['material-input', 'input'],
    ['material-output', 'output'],
  ]);
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

test('world transfer registry rejects source fan-out before Rust compilation', () => {
  const world = createWorld('transfer-contracts');
  createWorldSimulation(world);
  const regions = world.planets[world.planetId].regions.slice(0, 3);
  if (regions.length < 2) return;
  const first = registerBoundaryTransfer(world, {
    sourceCompositeId: regions[0],
    sourcePortId: 'material-output',
    targetCompositeId: regions[1],
    targetPortId: 'material-input',
  });
  assert.ok(first.id);
  if (regions.length >= 3) {
    assert.throws(() => registerBoundaryTransfer(world, {
      sourceCompositeId: regions[0],
      sourcePortId: 'material-output',
      targetCompositeId: regions[2],
      targetPortId: 'material-input',
    }), /already connected/);
  }
});
""")

# Protocol tests are transport-contract tests now. They no longer spin up a
# synchronous JavaScript simulation runtime just to inspect command semantics.
write('tests/runtimeProtocol.test.js', """
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REALTIME_RUNTIME_PROTOCOL_VERSION,
  RUNTIME_COMMAND_TYPES,
  RUNTIME_EVENT_TYPES,
  createRuntimeCommand,
  createRuntimeEvent,
  validateRuntimeCommand,
} from '../src/simulation/runtimeProtocol.js';

test('runtime command protocol preserves authoritative fixed-step command semantics', () => {
  const pause = createRuntimeCommand(RUNTIME_COMMAND_TYPES.PAUSE);
  const resume = createRuntimeCommand(RUNTIME_COMMAND_TYPES.RESUME);
  const step = createRuntimeCommand(RUNTIME_COMMAND_TYPES.STEP_FIXED, { dt: 0.1 });
  assert.equal(pause.protocolVersion, REALTIME_RUNTIME_PROTOCOL_VERSION);
  assert.equal(pause.type, RUNTIME_COMMAND_TYPES.PAUSE);
  assert.equal(resume.type, RUNTIME_COMMAND_TYPES.RESUME);
  assert.equal(step.payload.dt, 0.1);

  const event = createRuntimeEvent(RUNTIME_EVENT_TYPES.STEPPED, { advanced: true, elapsedSeconds: 0.1 });
  assert.equal(event.protocolVersion, REALTIME_RUNTIME_PROTOCOL_VERSION);
  assert.equal(event.type, RUNTIME_EVENT_TYPES.STEPPED);
  assert.equal(event.payload.advanced, true);
});

test('runtime protocol rejects version drift and non-authoritative timesteps', () => {
  assert.throws(
    () => createRuntimeCommand(RUNTIME_COMMAND_TYPES.STEP_FIXED, { dt: 0.2 }),
    /authoritative 0.1 s timestep/,
  );
  assert.throws(
    () => validateRuntimeCommand({
      protocolVersion: REALTIME_RUNTIME_PROTOCOL_VERSION - 1,
      type: RUNTIME_COMMAND_TYPES.PAUSE,
      payload: {},
    }),
    /protocolVersion/,
  );
});

test('batched fixed-step protocol validates bounded integer work requests', () => {
  assert.equal(createRuntimeCommand(RUNTIME_COMMAND_TYPES.ADVANCE_FIXED, { steps: 10 }).payload.steps, 10);
  assert.throws(() => createRuntimeCommand(RUNTIME_COMMAND_TYPES.ADVANCE_FIXED, { steps: -1 }), /between 0 and 10000/);
  assert.throws(() => createRuntimeCommand(RUNTIME_COMMAND_TYPES.ADVANCE_FIXED, { steps: 1.5 }), /between 0 and 10000/);
  assert.throws(() => createRuntimeCommand(RUNTIME_COMMAND_TYPES.ADVANCE_FIXED, { steps: 10001 }), /between 0 and 10000/);
});

test('init and reconfigure commands require compiled setup payloads', () => {
  assert.throws(() => createRuntimeCommand(RUNTIME_COMMAND_TYPES.INIT), /compiled runtime setup object/);
  const init = createRuntimeCommand(RUNTIME_COMMAND_TYPES.INIT, { setup: { sites: [] } });
  assert.deepEqual(init.payload.setup, { sites: [] });
  assert.throws(
    () => createRuntimeCommand(RUNTIME_COMMAND_TYPES.RECONFIGURE, { setup: {}, resetNodeIds: [''] }),
    /canonical node IDs/,
  );
});
""")

print('PR61 final cleanup test migration applied')
