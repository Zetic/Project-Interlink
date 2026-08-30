
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blueprintAddExtractor, blueprintAddFeatureSource, blueprintConnect, blueprintDisconnect,
  checkBlueprintConnection, createBlueprint, _resetOrdinals,
} from '../src/simulation/simulationEngine.js';
import { nodeDefinitionById } from '../src/workspace/nodeCatalog.js';

function occurrence(id, featureId) { return { id, sourceId: featureId }; }
function addSource(blueprint, item) {
  return blueprintAddFeatureSource(blueprint, { featureId: item.sourceId, resourceOccurrenceIds: [item.id] });
}

test('NODE catalog places Extractors unbound and the resource-access edge selects the source occurrence', () => {
  _resetOrdinals();
  const blueprint = createBlueprint();
  const basalt = occurrence('occ-basalt', 'feature-basalt');
  const source = addSource(blueprint, basalt);
  const extractor = nodeDefinitionById('extractor').create(blueprint, { occurrenceId: 'ignored' });
  assert.equal(extractor.requestedOccurrenceId, null);
  const access = blueprintConnect(blueprint, source.id, source.resourceAccessPortId, extractor.id, extractor.sourceInputPortId);
  assert.equal(access.occurrenceId, basalt.id);
  assert.equal(extractor.occurrenceId, basalt.id);
});

test('an Extractor can be disconnected and reused on a different resource source', () => {
  const blueprint = createBlueprint();
  const a = addSource(blueprint, occurrence('occ-a', 'feature-a'));
  const b = addSource(blueprint, occurrence('occ-b', 'feature-b'));
  const extractor = blueprintAddExtractor(blueprint);
  const first = blueprintConnect(blueprint, a.id, a.resourceAccessPortId, extractor.id, extractor.sourceInputPortId);
  blueprintDisconnect(blueprint, first.id);
  assert.equal(extractor.occurrenceId, null);
  const second = blueprintConnect(blueprint, b.id, b.resourceAccessPortId, extractor.id, extractor.sourceInputPortId);
  assert.equal(second.occurrenceId, 'occ-b');
});

test('Feature sources with multiple occurrences require explicit edge selection', () => {
  const blueprint = createBlueprint();
  const source = blueprintAddFeatureSource(blueprint, { featureId: 'feature-mixed', resourceOccurrenceIds: ['occ-a', 'occ-b'] });
  const extractor = blueprintAddExtractor(blueprint);
  const ambiguous = checkBlueprintConnection(blueprint, source.id, source.resourceAccessPortId, extractor.id, extractor.sourceInputPortId);
  assert.equal(ambiguous.ok, false);
  const selected = blueprintConnect(blueprint, source.id, source.resourceAccessPortId, extractor.id, extractor.sourceInputPortId, { occurrenceId: 'occ-b' });
  assert.equal(selected.occurrenceId, 'occ-b');
});
