import test from 'node:test';
import assert from 'node:assert/strict';

import { createZeroStream, totalMaterialStreamMassFlowKgPerSecond } from '../src/simulation/materialStream.js';
import { hopperStoredMassKg } from '../src/simulation/hopperNode.js';
import { getNodeOperatingState } from '../src/simulation/simulationEngine.js';
import {
  applyRustWorkerRuntimeSnapshot,
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

test('Worker-authoritative inspectors do not present stale JavaScript fractions as current physical truth', () => {
  const fixture = projectionFixture();
  applyRustWorkerRuntimeSnapshot(fixture.world, fixture.runtime, {
    running: true,
    elapsedSeconds: 1,
    sites: [],
    hoppers: [{ id: 'hopper-a', storedMassKg: 10, sensibleEnthalpyJ: 500 }],
    occurrences: [],
    machines: [{
      id: 'machine-a',
      operatingState: 'running',
      lastError: null,
      inputMassFlowKgPerSecond: [2],
      outputMassFlowKgPerSecond: [],
    }],
    exhaustVents: [{ id: 'vent-a', ventedGasMassKg: 2 }],
    passiveLinks: [],
    boundaryTransfers: [],
  });

  const hopperDetails = hopperInspection(fixture.hopper);
  assert.equal(hopperDetails.storedMassKg, 10);
  assert.equal(hopperDetails.detailsUnavailable, true);
  assert.deepEqual(hopperDetails.composition, []);
  assert.deepEqual(hopperDetails.particleSizeDistribution, []);
  assert.match(hopperDetails.thermalError, /retained in the Rust\/WASM Worker/);

  const streamDetails = streamInspection(fixture.machineStream);
  assert.equal(streamDetails.totalFlowKgPerSecond, 2);
  assert.equal(streamDetails.detailsUnavailable, true);
  assert.deepEqual(streamDetails.composition, []);
  assert.match(streamDetails.thermalError, /retained in the Rust\/WASM Worker/);

  const ventDetails = exhaustVentInspection(fixture.blueprint, fixture.vent);
  assert.equal(ventDetails.totalEmittedMassKg, 2);
  assert.equal(ventDetails.detailsUnavailable, true);
  assert.deepEqual(ventDetails.composition, []);
  assert.match(ventDetails.thermalError, /retained in the Rust\/WASM Worker/);
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

test('clearing Worker presentation restores scalar helpers to canonical browser state', () => {
  const fixture = projectionFixture();
  applyRustWorkerRuntimeSnapshot(fixture.world, fixture.runtime, {
    running: true,
    elapsedSeconds: 1,
    sites: [],
    hoppers: [{ id: 'hopper-a', storedMassKg: 9, sensibleEnthalpyJ: 0 }],
    occurrences: [],
    machines: [{ id: 'machine-a', operatingState: 'running', inputMassFlowKgPerSecond: [2], outputMassFlowKgPerSecond: [] }],
    exhaustVents: [],
    passiveLinks: [],
    boundaryTransfers: [],
  });

  clearRustWorkerRuntimePresentation(fixture.world);
  assert.equal(rustWorkerPresentationIsAuthoritative(fixture.world), false);
  assert.equal(fixture.hopper.runtimePresentation, null);
  assert.equal(fixture.machineStream._runtimePresentationMassFlowKgPerSecond, null);
  assert.equal(totalMaterialStreamMassFlowKgPerSecond(fixture.machineStream), 0);
});
