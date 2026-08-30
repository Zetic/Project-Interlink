
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBlueprint, blueprintAddFeatureSource, blueprintAddExtractor, blueprintAddMagSep,
  blueprintConnect, setApparatusParameter,
} from '../src/simulation/simulationEngine.js';
import { createBoundaryBuffer } from '../src/simulation/hopperNode.js';
import { createMaterialStream } from '../src/simulation/materialStream.js';
import { hopperInspection, streamInspection, connectionInspection, featureInspection, machineInspection } from '../src/workspace/inspector/inspectionViewModel.js';

test('hopper and boundary inspection exposes canonical initial composition and particle size', () => {
  const hopper = createBoundaryBuffer({ id: 'site-export', capacityKg: 10, role: 'export', initialComponentsKg: { hematite: 3, quartz: 1 }, initialParticleSizeMm: 12 });
  const details = hopperInspection(hopper);
  assert.equal(details.storedMassKg, 4);
  assert.equal(details.freeCapacityKg, 6);
});

test('stream inspection remains a presentation model independent of physics execution', () => {
  const details = streamInspection(createMaterialStream({ id: 's', sourceNodeId: 'a', sourcePortId: 'out', targetNodeId: 'b', targetPortId: 'in', componentMassFlowKgPerSecond: { hematite: 2 }, particleSizeMm: 8 }));
  assert.equal(details.totalFlowKgPerSecond, 2);
});

test('resource-access inspection is a relationship and never invents material flow', () => {
  const blueprint = createBlueprint();
  const source = blueprintAddFeatureSource(blueprint, { featureId: 'feature', resourceOccurrenceIds: ['iron'] });
  const extractor = blueprintAddExtractor(blueprint, 'iron');
  const access = blueprintConnect(blueprint, source.id, source.resourceAccessPortId, extractor.id, extractor.sourceInputPortId);
  const details = connectionInspection(blueprint, access);
  assert.equal(details.kind, 'relationship');
  assert.equal(details.totalFlowKgPerSecond, 0);
});

test('Feature inspection exposes structured occurrence metadata', () => {
  const world = { features: { feature: { id: 'feature', name: 'Formation', type: 'Mineral Deposit', resourceOccurrences: ['iron'] } }, resourceOccurrences: { iron: { id: 'iron', resourceId: 'iron-ore', name: 'Iron Ore', composition: { hematite: 60, quartz: 40 } } } };
  const blueprint = createBlueprint();
  const node = blueprintAddFeatureSource(blueprint, { featureId: 'feature', resourceOccurrenceIds: ['iron'] });
  assert.equal(featureInspection(world, blueprint, node).resources[0].name, 'Iron Ore');
});

test('machine inspection projects committed apparatus configuration without executing physics', () => {
  const blueprint = createBlueprint();
  const separator = blueprintAddMagSep(blueprint);
  setApparatusParameter(blueprint, separator.id, 'fieldStrength', 0.8);
  const details = machineInspection(blueprint, separator);
  assert.equal(details.fieldStrength, 0.8);
});
