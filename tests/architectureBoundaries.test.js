import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { APPARATUS_DEFINITIONS } from '../src/content/apparatus/definitions.js';
import {
  CRUSHING_PROCESS_ID,
  getProcessDefinition,
} from '../src/core/processes/definitions/index.js';
import { conservationPolicyFor } from '../src/core/processes/conservation/conservation.js';
import { crushSolidMaterialState } from '../src/core/processes/physics/crushing.js';
import { splitMagneticSolidState } from '../src/core/processes/physics/magneticSeparation.js';
import { validateHierarchy } from '../src/core/world/validation/hierarchyValidation.js';
import { validateOccurrences } from '../src/core/world/validation/occurrenceValidation.js';
import { validateProcessHistory } from '../src/core/world/validation/processHistoryValidation.js';
import { getResourceDefinition } from '../src/content/resources/resourceDefinitions.js';
import {
  RESOURCE_COMPOSITION_NOTES,
  RESOURCE_COMPOSITION_TEMPLATES,
} from '../src/content/resources/resourceCompositions.js';
import {
  FEATURE_AFFINITY_TAGS,
  FEATURE_TYPE_WEIGHT_RULES,
} from '../src/content/features/featureGeneration.js';
import { APPARATUS_RUNTIME_REGISTRY, apparatusRuntimeFor } from '../src/simulation/apparatus/registry.js';
import {
  _resetOrdinals,
  blueprintAddApparatus,
  blueprintConnect,
  checkBlueprintConnection,
  createBlueprint,
  getNodePortDefinitions,
} from '../src/simulation/simulationEngine.js';
import { NODE_DEFINITIONS } from '../src/workspace/catalog/nodeCatalog.js';

// Keep core systems free of explicit machine-pair topology knowledge.
test('neutral system ports use capabilities rather than node-pair knowledge', () => {
  const source = readFileSync(new URL('../src/core/systems/ports.js', import.meta.url), 'utf8');
  assert.match(source, /portCapabilityMatches/);
  assert.doesNotMatch(source, /extractor.*hopper|hopper.*crusher|crusher.*hopper|hopper.*magSep|magSep.*hopper/s);
});

test('hierarchy validation does not absorb occurrence-domain errors', () => {
  const errors = validateHierarchy({
    planetId: 'planet',
    planets: {
      planet: { regionIds: ['region'] },
    },
    regions: {
      region: { planetId: 'planet', siteIds: ['site'] },
    },
    sites: {
      site: { regionId: 'region', featureIds: ['feature'] },
    },
    features: {
      feature: {
        siteId: 'site',
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
      occurrence: { sourceType: 'feature', sourceId: 'wrong-feature' },
    },
    materialBatches: {
      'batch-1': {
        id: 'batch-1',
        status: 'available',
        materialBody: {
          physicalForm: 'solid-particulate',
          solidState: { fractions: {} },
        },
        provenance: {
          sourceOccurrenceIds: ['missing-occurrence'],
          sourceBatchIds: [],
        },
      },
    },
    processResults: {
      'process-run-1': {
        id: 'process-run-1',
        processId: 'missing-process',
        inputBindings: [],
        outputBatches: [],
      },
    },
  };

  const occurrenceErrors = validateOccurrences(malformed);
  const processErrors = validateProcessHistory(malformed);
  assert.ok(occurrenceErrors.some(error => error.includes("ResourceOccurrence 'occurrence'")));
  assert.ok(!occurrenceErrors.some(error => error.includes("Process result 'process-run-1'")));
  assert.ok(processErrors.some(error => error.includes("Process result 'process-run-1'")));
  assert.ok(!processErrors.some(error => error.includes("ResourceOccurrence 'occurrence'")));
});

test('physical typed ports preserve the existing apparatus and boundary topology', () => {
  _resetOrdinals();
  const blueprint = createBlueprint();
  const extractor = blueprintAddApparatus(blueprint, 'extractor');
  const hopperA = blueprintAddApparatus(blueprint, 'hopper');
  const crusher = blueprintAddApparatus(blueprint, 'crusher');
  const hopperB = blueprintAddApparatus(blueprint, 'hopper');
  const magSep = blueprintAddApparatus(blueprint, 'magSep');
  const concentrate = blueprintAddApparatus(blueprint, 'hopper');
  const tailings = blueprintAddApparatus(blueprint, 'hopper');

  assert.equal(checkBlueprintConnection(blueprint, extractor.id, 'output', hopperA.id, 'input').ok, true);
  assert.ok(blueprintConnect(blueprint, extractor.id, 'output', hopperA.id, 'input'));
  assert.equal(checkBlueprintConnection(blueprint, hopperA.id, 'output', crusher.id, 'feed').ok, true);
  assert.ok(blueprintConnect(blueprint, hopperA.id, 'output', crusher.id, 'feed'));
  assert.equal(checkBlueprintConnection(blueprint, crusher.id, 'product', hopperB.id, 'input').ok, true);
  assert.ok(blueprintConnect(blueprint, crusher.id, 'product', hopperB.id, 'input'));
  assert.equal(checkBlueprintConnection(blueprint, hopperB.id, 'output', magSep.id, 'feed').ok, true);
  assert.ok(blueprintConnect(blueprint, hopperB.id, 'output', magSep.id, 'feed'));
  assert.equal(checkBlueprintConnection(blueprint, magSep.id, 'concentrate', concentrate.id, 'input').ok, true);
  assert.equal(checkBlueprintConnection(blueprint, magSep.id, 'tailings', tailings.id, 'input').ok, true);
});
