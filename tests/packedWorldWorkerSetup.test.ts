import test from 'node:test';
import assert from 'node:assert/strict';

import { createFeeder } from '../src/simulation/apparatus/feeder.js';
import { createHopper } from '../src/simulation/hopperNode.js';
import { compilePackedWorldWorkerSetup } from '../src/simulation/packedWorldWorkerSetup.js';

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
    simulationStats: { elapsedSeconds: 1.25, extractedKg: 3.5 },
  };
  return {
    sites: { 'site-a': { id: 'site-a' } },
    regions: {},
    systemNodes: {},
    resourceOccurrences: {},
    simulation: {
      running: true,
      elapsedSeconds: 4.5,
      sessions: { 'site-a': blueprint },
      workspaces: {},
      transfers: {},
      nextTransferOrdinal: 1,
    },
  };
}

test('Worker setup is structured-clone-safe and preserves runtime identity lookups', () => {
  const setup = compilePackedWorldWorkerSetup(simpleWorld());
  const cloned = structuredClone(setup);

  assert.equal(cloned.elapsedSeconds, 4.5);
  assert.equal(cloned.sites[0].elapsedSeconds, 1.25);
  assert.equal(cloned.sites[0].extractedKg, 3.5);
  assert.equal(cloned.runtimeIds.nodes.includes('source'), true);
  assert.equal(cloned.runtimeIds.nodes.includes('feeder'), true);
  assert.equal(cloned.runtimeIds.nodes.includes('target'), true);
  assert.equal(cloned.hoppers.length, 2);
  assert.ok(cloned.hoppers[0].body.speciesIds instanceof Uint16Array);
  assert.ok(cloned.hoppers[0].body.quantities instanceof Float64Array);
});

test('Worker setup contains physical setup state but no compiler classes or live world references', () => {
  const world = simpleWorld();
  const setup = compilePackedWorldWorkerSetup(world);

  assert.notEqual(setup, world);
  assert.equal('world' in setup, false);
  assert.equal('idTables' in setup, false);
  assert.equal('runtimeIds' in setup, true);
  assert.equal(Array.isArray(setup.runtimeIds.nodes), true);
  assert.equal(setup.machines[0].kind, 'feeder');
  assert.equal(typeof setup.machines[0].nodeId, 'number');
});
