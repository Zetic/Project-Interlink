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
import { APPARATUS_RUNTIME_REGISTRY } from '../src/simulation/apparatus/registry.js';
import { getResourceDefinition } from '../src/content/resources/resourceDefinitions.js';
import { APPARATUS_DEFINITIONS } from '../src/content/apparatus/definitions.js';
import { SCHEMA_VERSION, GENERATOR_VERSION } from '../src/core/world/versions.js';
import { validateHierarchy } from '../src/core/world/validation/hierarchyValidation.js';

test('neutral system ports use capabilities rather than node-pair knowledge', () => {
  const source = createCompositeNode({
    id: 'future-source',
    nodeType: 'screen',
    ports: [{
      id: 'product',
      direction: 'output',
      kind: 'material',
      provides: ['processed-material'],
    }],
  });
  const target = createCompositeNode({
    id: 'future-target',
    nodeType: 'future-container',
    ports: [{
      id: 'feed',
      direction: 'input',
      kind: 'material',
      accepts: ['processed-material'],
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
  assert.equal(typeof APPARATUS_RUNTIME_REGISTRY.crusher.create, 'function');
  assert.equal(typeof APPARATUS_RUNTIME_REGISTRY.magSep.simulate, 'function');
});

test('resource and apparatus definitions are available from content registries', () => {
  assert.equal(getResourceDefinition('iron-ore').occurrenceFamily, 'ore-body');
  assert.equal(APPARATUS_DEFINITIONS.extractor.nodeType, 'extractor');
});
