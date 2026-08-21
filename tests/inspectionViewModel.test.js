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
  setApparatusParameter,
  setNodeEnabled,
  simulationTick,
} from '../src/simulation/simulationEngine.js';
import { hopperReceiveInflow, createBoundaryBuffer } from '../src/simulation/hopperNode.js';
import { createMaterialStream } from '../src/simulation/materialStream.js';
import {
  hopperInspection,
  streamInspection,
  connectionInspection,
  featureInspection,
  machineInspection,
} from '../src/workspace/inspectionViewModel.js';

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

test('Feature inspection exposes concise resource identity plus structured occurrence properties', () => {
  const world = {
    features: {
      feature: {
        id: 'feature',
        name: 'Redfire Formation',
        type: 'Mineral Deposit',
        resourceOccurrences: ['iron'],
      },
    },
    resourceOccurrences: {
      iron: {
        id: 'iron',
        resourceId: 'iron-ore',
        name: 'Iron Ore',
        availabilityClass: 'Abundant',
        descriptor: 'Hematite-rich',
        concentrationPercent: 63.5,
        composition: { hematite: 60, quartz: 40 },
        comminutionProperties: {
          bondCrushingWorkIndexKWhPerT: 11.2,
          bondBallMillWorkIndexKWhPerT: 16.4,
          bondAbrasionIndex: 0.37,
        },
        mineralTexture: {
          id: 'texture-iron',
          speciesTextures: {
            hematite: {
              grainSizeUm: { d10: 45, d50: 120, d90: 310 },
              occurrenceModes: { free: 0.15, boundary: 0.35, intergrown: 0.35, included: 0.15 },
            },
            quartz: {
              grainSizeUm: { d10: 55, d50: 145, d90: 360 },
              occurrenceModes: { free: 0.15, boundary: 0.35, intergrown: 0.35, included: 0.15 },
            },
          },
        },
      },
    },
  };
  const blueprint = createBlueprint();
  const featureNode = blueprintAddFeatureSource(blueprint, {
    featureId: 'feature',
    displayName: 'Redfire Formation',
    resourceOccurrenceIds: ['iron'],
  });
  const extractor = blueprintAddExtractor(blueprint, 'iron');
  const access = blueprintConnect(
    blueprint,
    featureNode.id,
    featureNode.resourceAccessPortId,
    extractor.id,
    extractor.sourceInputPortId,
  );
  assert.ok(access);

  const details = featureInspection(world, blueprint, featureNode);
  assert.equal(details.name, 'Redfire Formation');
  assert.equal(details.featureType, 'Mineral Deposit');
  assert.deepEqual(details.resources.map(item => [item.name, item.availabilityClass]), [['Iron Ore', 'Abundant']]);
  assert.deepEqual(details.connectedExtractors, [{ id: extractor.id, occurrenceId: 'iron' }]);
  const resource = details.resources[0];
  assert.equal(resource.descriptor, 'Hematite-rich');
  assert.equal(resource.concentrationPercent, 63.5);
  assert.deepEqual(resource.composition, { hematite: 60, quartz: 40 });
  assert.deepEqual(
    resource.occurrenceProperties.slice(0, 3).map(property => [property.label, property.value, property.unit]),
    [
      ['Bond Crushing Work Index', 11.2, 'kWh/t'],
      ['Bond Ball Mill Work Index', 16.4, 'kWh/t'],
      ['Bond Abrasion Index', 0.37, ''],
    ],
  );
  assert.ok(resource.occurrenceProperties.find(property => property.id === 'mineral-density')?.value > 0);
  assert.deepEqual(resource.mineralTextures[0].grainSizeUm, { d10: 45, d50: 120, d90: 310 });
  assert.deepEqual(resource.mineralTextures[0].occurrenceModes, {
    free: 0.15,
    boundary: 0.35,
    intergrown: 0.35,
    included: 0.15,
  });
});

test('resource-access inspection is a relationship and does not invent material flow', () => {
  const blueprint = createBlueprint();
  const featureNode = blueprintAddFeatureSource(blueprint, {
    featureId: 'feature',
    resourceOccurrenceIds: ['iron'],
  });
  const extractor = blueprintAddExtractor(blueprint, 'iron');
  const access = blueprintConnect(
    blueprint,
    featureNode.id,
    featureNode.resourceAccessPortId,
    extractor.id,
    extractor.sourceInputPortId,
  );
  const details = connectionInspection(blueprint, access);
  assert.equal(details.kind, 'relationship');
  assert.equal(details.connectionKind, 'resource-access');
  assert.equal(details.totalFlowKgPerSecond, 0);
  assert.deepEqual(details.componentMassFlowKgPerSecond, {});
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
  assert.equal(details.operatingState, 'running');
  assert.equal(details.actualFeedKgPerSecond, 4);
  assert.equal(details.actualProductKgPerSecond, 4);
  assert.equal(details.targetParticleSizeMm, 10);
  assert.deepEqual(
    details.parameters.map(parameter => [parameter.id, parameter.value]),
    [['targetParticleSizeMm', 10]],
  );
  assert.deepEqual(
    details.capabilities.map(capability => [capability.id, capability.value]),
    [['throughputKgPerSecond', 4]],
  );
});

test('machine inspection projects committed apparatus settings rather than UI state', () => {
  const blueprint = createBlueprint();
  const separator = blueprintAddMagSep(blueprint);
  setApparatusParameter(blueprint, separator.id, 'fieldStrength', 0.8);
  const details = machineInspection(blueprint, separator);
  assert.equal(details.fieldStrength, 0.8);
  assert.deepEqual(
    details.parameters.map(parameter => [parameter.id, parameter.value]),
    [['fieldStrength', 0.8]],
  );
});

test('magnetic separator inspection reports total product as concentrate plus tailings', () => {
  const blueprint = createBlueprint();
  const input = blueprintAddHopper(blueprint);
  const separator = blueprintAddMagSep(blueprint, { throughputKgPerSecond: 4, fieldStrength: 0.6 });
  const concentrate = blueprintAddHopper(blueprint);
  const tailings = blueprintAddHopper(blueprint);
  blueprintConnect(blueprint, input.id, input.outputPortId, separator.id, separator.inputPortId);
  blueprintConnect(blueprint, separator.id, separator.concentratePortId, concentrate.id, concentrate.inputPortId);
  blueprintConnect(blueprint, separator.id, separator.tailingsPortId, tailings.id, tailings.inputPortId);
  hopperReceiveInflow(input, { hematite: 2, magnetite: 1, quartzAndGangue: 1 }, 15, 1);
  setNodeEnabled(blueprint, separator.id, true);
  simulationTick(blueprint, { resourceOccurrences: {} }, 0.1);

  const details = machineInspection(blueprint, separator);
  assert.equal(details.operatingState, 'running');
  assert.ok(details.concentrate.totalFlowKgPerSecond > 0);
  assert.ok(details.tailings.totalFlowKgPerSecond > 0);
  assert.ok(Math.abs(details.actualProductKgPerSecond - (details.concentrate.totalFlowKgPerSecond + details.tailings.totalFlowKgPerSecond)) < 1e-12);
  assert.ok(Math.abs(details.actualProductKgPerSecond - details.actualFeedKgPerSecond) < 1e-12);
});
