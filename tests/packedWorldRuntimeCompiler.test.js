import test from 'node:test';
import assert from 'node:assert/strict';

import { createFeeder } from '../src/simulation/apparatus/feeder.js';
import { createHopper, createBoundaryBuffer } from '../src/simulation/hopperNode.js';
import {
  compilePackedWorldRuntime,
  PACKED_NO_RUNTIME_ID,
  PACKED_SOLID_TARGET_HOPPER,
  populateWasmPackedWorldRuntime,
} from '../src/simulation/packedWorldRuntimeCompiler.js';

function materialConnection(id, sourceNodeId, sourcePortId, targetNodeId, targetPortId) {
  return { id, kind: 'material', sourceNodeId, sourcePortId, targetNodeId, targetPortId };
}

function simpleWorld() {
  const source = createHopper({ id: 'source', capacityKg: 10 });
  const feeder = createFeeder({
    id: 'feeder',
    flowRateKgPerSecond: 2,
    throughputKgPerSecond: 8,
    enabled: true,
  });
  const target = createHopper({ id: 'target', capacityKg: 10 });
  const blueprint = {
    id: 'site-a-workspace',
    nodes: { source, feeder, target },
    connections: {
      'source-feeder': materialConnection('source-feeder', 'source', 'output', 'feeder', 'feed'),
      'feeder-target': materialConnection('feeder-target', 'feeder', 'product', 'target', 'input'),
    },
    streams: {},
    simulationStats: { elapsedSeconds: 1.2, extractedKg: 3.4 },
  };
  return {
    sites: { 'site-a': { id: 'site-a' } },
    regions: {},
    systemNodes: {},
    resourceOccurrences: {},
    simulation: {
      running: true,
      elapsedSeconds: 4.2,
      sessions: { 'site-a': blueprint },
      workspaces: {},
      transfers: {},
      nextTransferOrdinal: 1,
    },
  };
}

test('world compiler assigns execution-local IDs and preserves Site/node insertion order', () => {
  const compiled = compilePackedWorldRuntime(simpleWorld());
  assert.equal(compiled.sites.length, 1);
  assert.equal(compiled.sites[0].canonicalSiteId, 'site-a');
  assert.equal(compiled.sites[0].elapsedSeconds, 1.2);
  assert.equal(compiled.elapsedSeconds, 4.2);

  assert.equal(compiled.hoppers.length, 2);
  const feeder = compiled.machines.find(machine => machine.kind === 'feeder');
  assert.ok(feeder);
  assert.equal(feeder.ordinal, 1, 'feeder keeps canonical Object.values node insertion order');
  assert.equal(feeder.outputTarget.kind, PACKED_SOLID_TARGET_HOPPER);
  assert.equal(
    compiled.runtimeIds.nodeIds.valueFor(feeder.inputHopperId),
    'source',
  );
  assert.equal(
    compiled.runtimeIds.nodeIds.valueFor(feeder.outputTarget.id),
    'target',
  );
  assert.equal(compiled.idTables.species.values.includes('waterVapor'), true,
    'thermochemical metadata shares the global runtime species namespace');
});

test('equal-phase apparatus retain canonical insertion order through numeric ordinals', () => {
  const world = simpleWorld();
  const blueprint = world.simulation.sessions['site-a'];
  blueprint.nodes = {
    source: blueprint.nodes.source,
    'jaw-z': {
      id: 'jaw-z', nodeType: 'jawCrusher', inputPortId: 'feed', outputPortId: 'product',
      jawProductSizeMm: 120, throughputKgPerSecond: 8, ratedPowerKw: 8, enabled: true,
    },
    'jaw-a': {
      id: 'jaw-a', nodeType: 'jawCrusher', inputPortId: 'feed', outputPortId: 'product',
      jawProductSizeMm: 120, throughputKgPerSecond: 8, ratedPowerKw: 8, enabled: true,
    },
    target: blueprint.nodes.target,
  };
  blueprint.connections = {};
  const compiled = compilePackedWorldRuntime(world);
  const jaws = compiled.machines.filter(machine => machine.kind === 'comminution');
  assert.deepEqual(jaws.map(machine => compiled.runtimeIds.nodeIds.valueFor(machine.nodeId)), ['jaw-z', 'jaw-a']);
  assert.deepEqual(jaws.map(machine => machine.ordinal), [1, 2]);
});

test('Site-local boundary Hopper links compile after apparatus as passive storage transfers', () => {
  const world = simpleWorld();
  const blueprint = world.simulation.sessions['site-a'];
  const importBuffer = createBoundaryBuffer({ id: 'site-import', capacityKg: 10, role: 'import' });
  const exportBuffer = createBoundaryBuffer({ id: 'site-export', capacityKg: 10, role: 'export' });
  blueprint.nodes = {
    'site-import': importBuffer,
    'site-export': exportBuffer,
  };
  blueprint.connections = {
    boundary: materialConnection('boundary', 'site-import', 'output', 'site-export', 'input'),
  };
  const compiled = compilePackedWorldRuntime(world);
  assert.equal(compiled.passiveLinks.length, 1);
  const link = compiled.passiveLinks[0];
  assert.equal(compiled.runtimeIds.nodeIds.valueFor(link.sourceHopperId), 'site-import');
  assert.equal(compiled.runtimeIds.nodeIds.valueFor(link.targetHopperId), 'site-export');
  assert.equal(link.rateKgPerSecond, 10);
});

test('unsupported occurrence bindings compile as blocked extractor sources rather than dangling IDs', () => {
  const world = simpleWorld();
  const blueprint = world.simulation.sessions['site-a'];
  blueprint.nodes = {
    feature: { id: 'feature', nodeType: 'feature', ports: [] },
    extractor: {
      id: 'extractor',
      nodeType: 'extractor',
      sourceInputPortId: 'resource-source',
      outputPortId: 'output',
      prototypeRateKgPerSecond: 5,
      enabled: true,
    },
    target: blueprint.nodes.target,
  };
  blueprint.connections = {
    source: {
      id: 'source',
      kind: 'resource-access',
      sourceNodeId: 'feature',
      sourcePortId: 'resource-source',
      targetNodeId: 'extractor',
      targetPortId: 'resource-source',
      occurrenceId: 'unsupported-occurrence',
    },
    product: materialConnection('product', 'extractor', 'output', 'target', 'input'),
  };
  const compiled = compilePackedWorldRuntime(world);
  const extractor = compiled.machines.find(machine => machine.kind === 'extractor');
  assert.ok(extractor);
  assert.equal(extractor.occurrenceId, PACKED_NO_RUNTIME_ID);
  assert.equal(compiled.runtimeIds.occurrenceIds.valueFor(0), null,
    'unsupported occurrence does not allocate a runtime identity');
});

test('WASM population is setup-only and seals one coarse world runtime', () => {
  const compiled = compilePackedWorldRuntime(simpleWorld());
  const calls = [];
  const fake = new Proxy({}, {
    get(_target, property) {
      if (property === 'calls') return calls;
      return (...args) => { calls.push([property, ...args]); };
    },
  });

  const result = populateWasmPackedWorldRuntime(fake, compiled);
  assert.equal(result.runtime, fake);
  assert.ok(calls.some(([name]) => name === 'add_site'));
  assert.ok(calls.some(([name]) => name === 'add_hopper_state'));
  assert.ok(calls.some(([name]) => name === 'add_feeder'));
  assert.ok(calls.some(([name]) => name === 'commit_goethite_reaction'));
  assert.equal(calls.at(-1)[0], 'seal');
  assert.equal(result.deferredStateImport.worldElapsedSeconds, 4.2);
});


test('staged comminution compiler uses each apparatus canonical product-size field', () => {
  const world = simpleWorld();
  const blueprint = world.simulation.sessions['site-a'];
  blueprint.nodes = {
    source: blueprint.nodes.source,
    jaw: {
      id: 'jaw', nodeType: 'jawCrusher', inputPortId: 'feed', outputPortId: 'product',
      jawProductSizeMm: 120, throughputKgPerSecond: 8, ratedPowerKw: 8, enabled: false,
    },
    cone: {
      id: 'cone', nodeType: 'coneCrusher', inputPortId: 'feed', outputPortId: 'product',
      coneProductSizeMm: 25, throughputKgPerSecond: 5, ratedPowerKw: 10, enabled: false,
    },
    mill: {
      id: 'mill', nodeType: 'ballMill', inputPortId: 'feed', outputPortId: 'product',
      millProductSizeMm: 0.25, throughputKgPerSecond: 2, ratedPowerKw: 75, enabled: false,
    },
    target: blueprint.nodes.target,
  };
  blueprint.connections = {};

  const compiled = compilePackedWorldRuntime(world);
  const byCanonicalId = new Map(
    compiled.machines
      .filter(machine => machine.kind === 'comminution')
      .map(machine => [compiled.runtimeIds.nodeIds.valueFor(machine.nodeId), machine]),
  );

  assert.equal(byCanonicalId.get('jaw').targetParticleSizeMm, 120);
  assert.equal(byCanonicalId.get('cone').targetParticleSizeMm, 25);
  assert.equal(byCanonicalId.get('mill').targetParticleSizeMm, 0.25);
  assert.notEqual(byCanonicalId.get('jaw').targetSizeId, PACKED_NO_RUNTIME_ID);
  assert.notEqual(byCanonicalId.get('cone').targetSizeId, PACKED_NO_RUNTIME_ID);
  assert.notEqual(byCanonicalId.get('mill').targetSizeId, PACKED_NO_RUNTIME_ID);
});
