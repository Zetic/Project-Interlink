import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCompositeNode,
  createSystemPort,
  assertSystemConnectionCompatible as assertSystemConnectionFromNode,
} from '../src/core/systems/systemNode.js';
import { assertSystemConnectionCompatible } from '../src/core/systems/connections.js';
import { validateSystemNode } from '../src/core/systems/systemValidation.js';
import {
  CRUSHING_PROCESS_ID,
  getProcessDefinition,
} from '../src/core/processes/definitions/index.js';
import { crushSolidMaterialState } from '../src/core/processes/physics/crushing.js';
import { splitMagneticSolidState } from '../src/core/processes/physics/magneticSeparation.js';
import { conservationPolicyFor } from '../src/core/processes/conservation/conservation.js';
import {
  APPARATUS_RUNTIME_REGISTRY,
  apparatusRuntimeFor,
} from '../src/simulation/apparatus/registry.js';
import {
  _resetOrdinals,
  blueprintAddApparatus,
  blueprintAddCrusher,
  blueprintAddExtractor,
  blueprintAddFeatureSource,
  blueprintAddHopper,
  blueprintAddMagSep,
  blueprintConnect,
  checkBlueprintConnection,
  createBlueprint,
  getNodePortDefinitions,
} from '../src/simulation/simulationEngine.js';
import { createBoundaryBuffer } from '../src/simulation/hopperNode.js';
import { getResourceDefinition } from '../src/content/resources/resourceDefinitions.js';
import { APPARATUS_DEFINITIONS } from '../src/content/apparatus/definitions.js';
import { RESOURCE_COMPOSITION_NOTES } from '../src/content/resources/resourceDescriptors.js';
import { RESOURCE_COMPOSITION_TEMPLATES } from '../src/content/resources/resourceCompositions.js';
import { FEATURE_AFFINITY_TAGS, FEATURE_TYPE_WEIGHT_RULES } from '../src/content/features/featureGeneration.js';
import { NODE_DEFINITIONS } from '../src/workspace/catalog/nodeCatalog.js';
import { SCHEMA_VERSION, GENERATOR_VERSION } from '../src/core/world/versions.js';
import { validateHierarchy } from '../src/core/world/validation/hierarchyValidation.js';
import { validateOccurrences } from '../src/core/world/validation/occurrenceValidation.js';
import { validateProcessHistory } from '../src/core/world/validation/processHistoryValidation.js';

test('neutral system ports use capabilities rather than node-pair knowledge', () => {
  const source = createCompositeNode({
    id: 'future-source',
    nodeType: 'screen',
    ports: [{
      id: 'product',
      direction: 'output',
      kind: 'material',
      provides: ['solid-particulate'],
    }],
  });
  const target = createCompositeNode({
    id: 'future-target',
    nodeType: 'future-container',
    ports: [{
      id: 'feed',
      direction: 'input',
      kind: 'material',
      accepts: ['solid-particulate'],
    }],
  });

  assert.deepEqual(validateSystemNode(source), []);
  assert.equal(assertSystemConnectionFromNode, assertSystemConnectionCompatible);
  assert.equal(
    assertSystemConnectionCompatible(source, 'product', target, 'feed').source.id,
    'product',
  );
});

test('hierarchy validation does not absorb occurrence-domain errors', () => {
  const errors = validateHierarchy({
    schemaVersion: SCHEMA_VERSION,
    generatorVersion: GENERATOR_VERSION,
    planetId: 'planet',
    planets: { planet: { id: 'planet', regions: ['region'] } },
    regions: { region: { id: 'region', siteIds: ['site'] } },
    sites: { site: { id: 'site', name: 'Site', featureIds: [] } },
    features: {
      feature: {
        id: 'feature',
        siteId: 'site',
        regionId: 'region',
        resourceOccurrences: [],
      },
    },
    resourceOccurrences: {
      occurrence: {
        sourceType: 'feature',
        sourceId: 'feature',
      },
    },
    materialBatches: {},
    processResults: {},
  });

  assert.ok(errors.some(error => error.startsWith("Feature 'feature'")));
  assert.ok(!errors.some(error => error.startsWith("ResourceOccurrence '")));
});

test('process definitions, pure kernels, and conservation policies have separate boundaries', () => {
  const definition = getProcessDefinition(CRUSHING_PROCESS_ID);
  assert.equal(definition.conservationPolicy, 'species');
  assert.equal(typeof crushSolidMaterialState, 'function');
  assert.equal(typeof splitMagneticSolidState, 'function');
  assert.equal(conservationPolicyFor(definition).name, 'validateSpeciesConservation');
});

test('apparatus identity and runtime behavior are registry-backed', () => {
  assert.equal(APPARATUS_DEFINITIONS.crusher.catalog.label, 'Crusher');
  assert.equal(APPARATUS_DEFINITIONS.screen.catalog.label, 'Screen');
  assert.equal(typeof APPARATUS_RUNTIME_REGISTRY.crusher.create, 'function');
  assert.equal(typeof APPARATUS_RUNTIME_REGISTRY.screen.simulate, 'function');
  assert.equal(typeof APPARATUS_RUNTIME_REGISTRY.magSep.simulate, 'function');
  assert.equal(apparatusRuntimeFor('crusher'), APPARATUS_RUNTIME_REGISTRY.crusher);
  assert.equal(apparatusRuntimeFor('screen'), APPARATUS_RUNTIME_REGISTRY.screen);
  assert.deepEqual(
    NODE_DEFINITIONS.map(definition => definition.id),
    ['extractor', 'crusher', 'screen', 'magnetic-separator', 'hopper'],
  );

  _resetOrdinals();
  const blueprint = createBlueprint();
  const crusher = blueprintAddApparatus(blueprint, 'crusher');
  const screen = blueprintAddApparatus(blueprint, 'screen');
  assert.equal(crusher.throughputKgPerSecond, APPARATUS_DEFINITIONS.crusher.defaults.throughputKgPerSecond);
  assert.equal(screen.apertureSizeMm, APPARATUS_DEFINITIONS.screen.defaults.apertureSizeMm);
  assert.equal(
    getNodePortDefinitions(crusher).find(port => port.id === 'feed').accepts[0],
    'stored-solid-particulate',
  );
  assert.deepEqual(getNodePortDefinitions(screen).map(port => port.id), ['feed', 'undersize', 'oversize']);
});

test('resource and apparatus definitions are available from content registries', () => {
  assert.equal(getResourceDefinition('iron-ore').occurrenceFamily, 'ore-body');
  assert.equal(APPARATUS_DEFINITIONS.extractor.nodeType, 'extractor');
});

test('resource and Feature generation consume declarative content registries', () => {
  assert.equal(typeof RESOURCE_COMPOSITION_NOTES.basalt, 'string');
  assert.ok(RESOURCE_COMPOSITION_TEMPLATES['iron-ore'].hematite);
  assert.ok(FEATURE_TYPE_WEIGHT_RULES.some(rule => rule.add['Mineral Deposit']));
  assert.deepEqual(FEATURE_AFFINITY_TAGS.Aquifer, ['wet', 'liquid']);
});

test('validators independently own occurrence and process-history errors', () => {
  const malformed = {
    features: {
      feature: { resourceOccurrences: ['occurrence'] },
    },
    resourceOccurrences: {
      occurrence: { sourceType: 'site', sourceId: 'site' },
    },
    materialBatches: {},
    processResults: {
      run: { processId: 'unknown', inputBindings: [], outputBatches: [] },
    },
  };

  assert.ok(validateOccurrences(malformed).some(error => error.includes("ResourceOccurrence 'occurrence'")));
  assert.ok(!validateHierarchy(malformed).some(error => error.includes("ResourceOccurrence 'occurrence'")));
  assert.ok(validateProcessHistory(malformed).some(error => error.includes("unknown process 'unknown'")));
});

test('physical typed ports preserve the existing apparatus and boundary topology', () => {
  _resetOrdinals();
  const blueprint = createBlueprint();
  const feature = blueprintAddFeatureSource(blueprint, {
    featureId: 'feature-1',
    resourceOccurrenceIds: ['occurrence-1'],
  });
  const extractorA = blueprintAddExtractor(blueprint, 'occurrence-1');
  const extractorB = blueprintAddExtractor(blueprint, 'occurrence-1');
  const hopperA = blueprintAddHopper(blueprint);
  const hopperB = blueprintAddHopper(blueprint);
  const crusher = blueprintAddCrusher(blueprint);
  const hopperC = blueprintAddHopper(blueprint);
  const separator = blueprintAddMagSep(blueprint);
  const concentrate = blueprintAddHopper(blueprint);
  const tailings = blueprintAddHopper(blueprint);

  assert.equal(blueprintConnect(blueprint, feature.id, 'resource-access', extractorA.id, 'resource-source')?.kind, 'resource-access');
  assert.equal(blueprintConnect(blueprint, feature.id, 'resource-access', extractorB.id, 'resource-source')?.kind, 'resource-access');
  assert.equal(blueprintConnect(blueprint, extractorA.id, 'output', hopperA.id, 'input')?.kind, 'material');
  assert.equal(blueprintConnect(blueprint, extractorB.id, 'output', hopperB.id, 'input')?.kind, 'material');
  assert.equal(blueprintConnect(blueprint, hopperA.id, 'output', crusher.id, 'feed')?.kind, 'material');
  assert.equal(blueprintConnect(blueprint, crusher.id, 'product', hopperC.id, 'input')?.kind, 'material');
  assert.equal(blueprintConnect(blueprint, hopperC.id, 'output', separator.id, 'feed')?.kind, 'material');
  assert.equal(blueprintConnect(blueprint, separator.id, 'concentrate', concentrate.id, 'input')?.kind, 'material');
  assert.equal(blueprintConnect(blueprint, separator.id, 'tailings', tailings.id, 'input')?.kind, 'material');

  const boundaryBlueprint = createBlueprint();
  const importBuffer = createBoundaryBuffer({ id: 'import', capacityKg: 100, role: 'import' });
  const exportBuffer = createBoundaryBuffer({ id: 'export', capacityKg: 100, role: 'export' });
  const boundaryCrusher = blueprintAddCrusher(boundaryBlueprint);
  boundaryBlueprint.nodes.import = importBuffer;
  boundaryBlueprint.nodes.export = exportBuffer;
  assert.equal(
    checkBlueprintConnection(boundaryBlueprint, importBuffer.id, 'output', boundaryCrusher.id, 'feed').ok,
    true,
  );
  assert.equal(
    checkBlueprintConnection(boundaryBlueprint, boundaryCrusher.id, 'product', exportBuffer.id, 'input').ok,
    true,
  );
  assert.equal(
    checkBlueprintConnection(boundaryBlueprint, importBuffer.id, 'output', exportBuffer.id, 'input').ok,
    true,
  );
});
