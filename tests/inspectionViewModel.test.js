import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createBlueprint,
  blueprintAddHopper,
  blueprintAddCrusher,
  blueprintConnect,
  setNodeEnabled,
  simulationTick,
} from '../src/simulation/simulationEngine.js';
import { hopperReceiveInflow } from '../src/simulation/hopperNode.js';
import { createBoundaryBuffer } from '../src/simulation/hopperNode.js';
import { createMaterialStream } from '../src/simulation/materialStream.js';
import { hopperInspection, streamInspection, machineInspection } from '../src/workspace/inspectionViewModel.js';

test('hopper and boundary inspection exposes composition and particle size', () => {
  const hopper = createBoundaryBuffer({
    id: 'site-export',
    capacityKg: 10,
    role: 'export',
    initialComponentsKg: { hematite: 3, quartzAndGangue: 1 },
    initialParticleSizeMm: 12,
  });
  const details = hopperInspection(hopper);
  assert.equal(details.kind, 'boundaryBuffer');
  assert.equal(details.storedMassKg, 4);
  assert.equal(details.freeCapacityKg, 6);
  assert.equal(details.particleSizeMm, 12);
  assert.deepEqual(details.components.map(row => row.componentId), ['hematite', 'quartzAndGangue']);
  assert.equal(details.components[0].percentage, 75);
});

test('stream inspection exposes endpoints, particle size, and constituent rates', () => {
  const details = streamInspection(createMaterialStream({
    id: 'stream-1',
    sourceNodeId: 'a',
    sourcePortId: 'out',
    targetNodeId: 'b',
    targetPortId: 'in',
    componentMassFlowKgPerSecond: { hematite: 2, magnetite: 1 },
    particleSizeMm: 8,
  }));
  assert.equal(details.totalFlowKgPerSecond, 3);
  assert.equal(details.particleSizeMm, 8);
  assert.deepEqual(details.componentMassFlowKgPerSecond, { hematite: 2, magnetite: 1 });
});

test('crusher inspection reports configured and actual feed/product flow', () => {
  const blueprint = createBlueprint();
  const input = blueprintAddHopper(blueprint);
  const crusher = blueprintAddCrusher(blueprint, { throughputKgPerSecond: 4, targetParticleSizeMm: 10 });
  const output = blueprintAddHopper(blueprint);
  blueprintConnect(blueprint, input.id, input.outputPortId, crusher.id, crusher.inputPortId);
  blueprintConnect(blueprint, crusher.id, crusher.outputPortId, output.id, output.inputPortId);
  hopperReceiveInflow(input, { hematite: 2 }, 20, 1);
  setNodeEnabled(blueprint, crusher.id, true);
  simulationTick(blueprint, { resourceOccurrences: {} }, 0.1);

  const details = machineInspection(blueprint, crusher);
  assert.equal(details.configuredThroughputKgPerSecond, 4);
  assert.equal(details.actualFeedKgPerSecond, 4);
  assert.equal(details.actualProductKgPerSecond, 4);
  assert.equal(details.targetParticleSizeMm, 10);
});
