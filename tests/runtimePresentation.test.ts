import test from 'node:test';
import assert from 'node:assert/strict';

import { createZeroStream, totalMaterialStreamMassFlowKgPerSecond } from '../src/simulation/materialStream.js';
import { hopperStoredMassKg } from '../src/simulation/hopperNode.js';
import { blueprintPresentationRevision, getNodeOperatingState } from '../src/simulation/simulationEngine.js';
import {
  applyRustWorkerRuntimeSnapshot,
  applyRustWorkerRuntimeDetail,
  clearRustWorkerRuntimePresentation,
  rustWorkerPresentationIsAuthoritative,
} from '../src/simulation/runtimePresentation.js';
import {
  exhaustVentInspection,
  hopperInspection,
  streamInspection,
} from '../src/workspace/inspector/inspectionViewModel.js';
import { nodeOwnedMatterKg } from '../src/workspace/graph/nodeRemoval.js';

function materialConnection(id, sourceNodeId, sourcePortId, targetNodeId, targetPortId) {
  return { id, kind: 'material', sourceNodeId, sourcePortId, targetNodeId, targetPortId };
}

function projectionFixture() {
  const hopper = { id: 'hopper-a', nodeType: 'hopper', capacityKg: 100, materialBody: null };
  const machine = { id: 'machine-a', nodeType: 'feeder', enabled: true };
  const passiveSource = { id: 'passive-source', nodeType: 'hopper', capacityKg: 100, materialBody: null };
  const passiveTarget = { id: 'passive-target', nodeType: 'hopper', capacityKg: 100, materialBody: null };
  const vent = { id: 'vent-a', nodeType: 'exhaustVent', gasInputPortId: 'gas-in' };
  const machineStream = createZeroStream({
    id: 'stream-machine',
    connectionId: 'conn-machine',
    sourceNodeId: 'hopper-a',
    sourcePortId: 'output',
    targetNodeId: 'machine-a',
    targetPortId: 'feed',
  });
  const passiveStream = createZeroStream({
    id: 'stream-passive',
    connectionId: 'conn-passive',
    sourceNodeId: 'passive-source',
    sourcePortId: 'output',
    targetNodeId: 'passive-target',
    targetPortId: 'input',
  });
  const blueprint = {
    id: 'site-a-workspace',
    nodes: {
      'hopper-a': hopper,
      'machine-a': machine,
      'passive-source': passiveSource,
      'passive-target': passiveTarget,
      'vent-a': vent,
    },
    connections: {
      'conn-machine': materialConnection('conn-machine', 'hopper-a', 'output', 'machine-a', 'feed'),
      'conn-passive': materialConnection('conn-passive', 'passive-source', 'output', 'passive-target', 'input'),
    },
    streams: {
      'stream-machine': machineStream,
      'stream-passive': passiveStream,
    },
    simulationStats: { elapsedSeconds: 0, extractedKg: 0 },
  };
  const world = {
    resourceOccurrences: { 'occ-a': { id: 'occ-a' } },
    simulation: {
      running: false,
      elapsedSeconds: 0,
      sessions: { 'site-a': blueprint },
      workspaces: {},
      transfers: {
        'transfer-a': { id: 'transfer-a', lastMovedKg: 0, lastRateKgPerSecond: 0 },
      },
    },
  };
  const runtime = {
    setup: {
      machines: [{ canonicalNodeId: 'machine-a', inputPortIds: ['feed'], outputPortIds: [] }],
      passiveLinks: [{ siteId: 0, canonicalConnectionId: 'conn-passive' }],
      runtimeIds: { sites: ['site-a'] },
    },
  };
  return { world, runtime, blueprint, hopper, machine, vent, machineStream, passiveStream };
}

test('compact Rust Worker snapshots drive scalar presentation without serializing mirrored runtime state', () => {
  const fixture = projectionFixture();
  const snapshot = {
    running: true,
    elapsedSeconds: 12.5,
    sites: [{ id: 'site-a', elapsedSeconds: 4.2, extractedKg: 7.5 }],
    hoppers: [{ id: 'hopper-a', storedMassKg: 18.25, sensibleEnthalpyJ: 3200 }],
    occurrences: [{ id: 'occ-a', extractedMassKg: 7.5, remainingMassKg: 92.5 }],
    machines: [{
      id: 'machine-a',
      operatingState: 'running',
      lastError: null,
      inputMassFlowKgPerSecond: [2.75],
      outputMassFlowKgPerSecond: [],
    }],
    exhaustVents: [{ id: 'vent-a', ventedGasMassKg: 1.5 }],
    passiveLinks: [{ id: 'conn-passive', lastMovedKg: 0.125, lastRateKgPerSecond: 1.25 }],
    boundaryTransfers: [{ id: 'transfer-a', lastMovedKg: 0.3, lastRateKgPerSecond: 3 }],
  };

  applyRustWorkerRuntimeSnapshot(fixture.world, fixture.runtime, snapshot);

  assert.equal(rustWorkerPresentationIsAuthoritative(fixture.world), true);
  assert.equal(fixture.world.simulation.elapsedSeconds, 12.5);
  assert.equal(fixture.blueprint.simulationStats.elapsedSeconds, 4.2);
  assert.equal(fixture.blueprint.simulationStats.extractedKg, 7.5);
  assert.equal(hopperStoredMassKg(fixture.hopper), 18.25);
  assert.equal(getNodeOperatingState(fixture.machine), 'running');
  assert.equal(totalMaterialStreamMassFlowKgPerSecond(fixture.machineStream), 2.75);
  assert.equal(totalMaterialStreamMassFlowKgPerSecond(fixture.passiveStream), 1.25);
  assert.equal(fixture.world.simulation.transfers['transfer-a'].lastRateKgPerSecond, 3);
  assert.equal(fixture.world.resourceOccurrences['occ-a'].runtimePresentation.remainingMassKg, 92.5);

  assert.equal(Object.prototype.propertyIsEnumerable.call(fixture.hopper, 'runtimePresentation'), false);
  assert.equal(Object.prototype.propertyIsEnumerable.call(fixture.machineStream, '_runtimePresentationMassFlowKgPerSecond'), false);
  assert.equal(JSON.stringify(fixture.hopper).includes('runtimePresentation'), false);
  assert.equal(JSON.stringify(fixture.machineStream).includes('_runtimePresentationMassFlowKgPerSecond'), false);
});

test('passive-link projection is scoped by Site when blueprint-local connection IDs collide', () => {
  const fixture = projectionFixture();
  const siteBSource = { id: 'site-b-source', nodeType: 'hopper', capacityKg: 100, materialBody: null };
  const siteBTarget = { id: 'site-b-target', nodeType: 'hopper', capacityKg: 100, materialBody: null };
  const siteBStream = createZeroStream({
    id: 'site-b-stream-passive',
    connectionId: 'conn-passive',
    sourceNodeId: 'site-b-source',
    sourcePortId: 'output',
    targetNodeId: 'site-b-target',
    targetPortId: 'input',
  });
  fixture.world.simulation.sessions['site-b'] = {
    id: 'site-b-workspace',
    nodes: {
      'site-b-source': siteBSource,
      'site-b-target': siteBTarget,
    },
    connections: {
      'conn-passive': materialConnection('conn-passive', 'site-b-source', 'output', 'site-b-target', 'input'),
    },
    streams: { 'site-b-stream-passive': siteBStream },
    simulationStats: { elapsedSeconds: 0, extractedKg: 0 },
  };
  fixture.runtime.setup.runtimeIds.sites.push('site-b');
  fixture.runtime.setup.passiveLinks.push({ siteId: 1, canonicalConnectionId: 'conn-passive' });

  applyRustWorkerRuntimeSnapshot(fixture.world, fixture.runtime, {
    running: true,
    elapsedSeconds: 1,
    sites: [],
    hoppers: [],
    occurrences: [],
    machines: [],
    exhaustVents: [],
    passiveLinks: [
      { id: 'conn-passive', lastMovedKg: 0.1, lastRateKgPerSecond: 1 },
      { id: 'conn-passive', lastMovedKg: 0.2, lastRateKgPerSecond: 2 },
    ],
    boundaryTransfers: [],
  });

  assert.equal(totalMaterialStreamMassFlowKgPerSecond(fixture.passiveStream), 1);
  assert.equal(totalMaterialStreamMassFlowKgPerSecond(siteBStream), 2);
});

test('Rust snapshot authority invalidates presentation caches and agrees across duplicate browser node instances', () => {
  const fixture = projectionFixture();
  const duplicateHopper = { id: 'hopper-a', nodeType: 'hopper', capacityKg: 100, materialBody: null };
  fixture.world.simulation.workspaces['duplicate-workspace'] = {
    nodes: { 'hopper-a': duplicateHopper }, connections: {}, streams: {},
  };
  const before = blueprintPresentationRevision(fixture.blueprint);
  applyRustWorkerRuntimeSnapshot(fixture.world, fixture.runtime, {
    running: true,
    elapsedSeconds: 1,
    sites: [],
    hoppers: [{ id: 'hopper-a', storedMassKg: 70, sensibleEnthalpyJ: 500 }],
    occurrences: [], machines: [], exhaustVents: [], passiveLinks: [], boundaryTransfers: [],
  });
  assert.equal(hopperStoredMassKg(fixture.hopper), 70);
  assert.equal(hopperStoredMassKg(duplicateHopper), 70);
  assert.equal(hopperInspection(fixture.hopper).storedMassKg, 70);
  assert.equal(fixture.hopper.runtimePresentation, duplicateHopper.runtimePresentation);
  assert.ok(blueprintPresentationRevision(fixture.blueprint) > before);
  assert.equal(fixture.hopper.runtimePresentation.revision, 1);
});

test('selected Hopper detail restores Rust composition, particle size, liberation, and temperature', () => {
  const fixture = projectionFixture();
  applyRustWorkerRuntimeSnapshot(fixture.world, fixture.runtime, {
    running: true,
    elapsedSeconds: 1,
    sites: [],
    hoppers: [{ id: 'hopper-a', storedMassKg: 10, sensibleEnthalpyJ: 500 }],
    occurrences: [], machines: [], exhaustVents: [], passiveLinks: [], boundaryTransfers: [],
  });
  const loading = hopperInspection(fixture.hopper);
  assert.equal(loading.detailsUnavailable, true);
  assert.match(loading.thermalError, /Loading current material detail/);

  applyRustWorkerRuntimeDetail(fixture.world, {
    kind: 'hopper', id: 'hopper-a', status: 'ready', elapsedSeconds: 1,
    storedMassKg: 10, sensibleEnthalpyJ: 500, temperatureK: 350, thermalError: null,
    compositionKg: { iron: 7, silica: 3 },
    particleSizeDistributionKg: { coarse: 6, fine: 4 },
    liberationDistributionKg: { locked: 8, liberated: 2 },
  });
  const details = hopperInspection(fixture.hopper);
  assert.equal(details.detailsUnavailable, false);
  assert.equal(details.temperatureK, 350);
  assert.deepEqual(details.composition.map(row => [row.id, row.quantity]), [['iron', 7], ['silica', 3]]);
  assert.deepEqual(details.particleSizeDistribution.map(row => [row.id, row.quantity]), [['coarse', 6], ['fine', 4]]);
  assert.deepEqual(details.liberationDistribution.map(row => [row.id, row.quantity]), [['locked', 8], ['liberated', 2]]);
});

test('clearing a world removes transient Worker scalar/detail projections', () => {
  const fixture = projectionFixture();
  applyRustWorkerRuntimeSnapshot(fixture.world, fixture.runtime, {
    running: true, elapsedSeconds: 1, sites: [],
    hoppers: [{ id: 'hopper-a', storedMassKg: 10, sensibleEnthalpyJ: 0 }],
    occurrences: [], machines: [], exhaustVents: [], passiveLinks: [], boundaryTransfers: [],
  });
  applyRustWorkerRuntimeDetail(fixture.world, { kind: 'hopper', id: 'hopper-a', status: 'ready' });
  clearRustWorkerRuntimePresentation(fixture.world);
  assert.equal(fixture.hopper.runtimePresentation, undefined);
  assert.equal(fixture.hopper.runtimeDetail, undefined);
  assert.equal(rustWorkerPresentationIsAuthoritative(fixture.world), false);
});

test('Rust-retained furnace inventory blocks player deletion even when the canonical JS furnace is empty', () => {
  const furnace = {
    id: 'furnace-a',
    nodeType: 'roastingFurnace',
    runtimePresentation: {
      authority: 'rust-wasm-worker',
      retainedMassKg: 4.5,
    },
  };
  assert.equal(nodeOwnedMatterKg(furnace), 4.5);
});
