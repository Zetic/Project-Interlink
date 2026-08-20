import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  blueprintAddExtractor,
  blueprintAddFeatureSource,
  blueprintAddHopper,
  blueprintConnect,
  blueprintDisconnect,
  checkBlueprintConnection,
  createBlueprint,
  setNodeEnabled,
  simulationTick,
  _resetOrdinals,
} from '../src/simulation/simulationEngine.js';
import { hopperStoredMassKg } from '../src/simulation/hopperNode.js';
import { nodeDefinitionById } from '../src/workspace/nodeCatalog.js';

function featureOccurrence({ id, resourceId, featureId, composition = null }) {
  return {
    id,
    resourceId,
    name: resourceId,
    sourceType: 'feature',
    sourceId: featureId,
    composition,
  };
}

function addFeatureSource(blueprint, occurrence) {
  return blueprintAddFeatureSource(blueprint, {
    featureId: occurrence.sourceId,
    displayName: occurrence.sourceId,
    resourceOccurrenceIds: [occurrence.id],
  });
}

test('NODE catalog places Extractors unbound and the resource-access edge selects the source occurrence', () => {
  _resetOrdinals();
  const blueprint = createBlueprint();
  const basalt = featureOccurrence({ id: 'occ-basalt', resourceId: 'basalt', featureId: 'feature-basalt' });
  const source = addFeatureSource(blueprint, basalt);
  const extractor = nodeDefinitionById('extractor').create(blueprint, {
    occurrenceId: 'some-other-occurrence',
    occurrenceIds: ['some-other-occurrence'],
  });

  assert.equal(extractor.requestedOccurrenceId, null);
  assert.equal(extractor.occurrenceId, null);

  const access = blueprintConnect(
    blueprint,
    source.id,
    source.resourceAccessPortId,
    extractor.id,
    extractor.sourceInputPortId,
  );

  assert.ok(access);
  assert.equal(access.kind, 'resource-access');
  assert.equal(access.occurrenceId, basalt.id);
  assert.equal(extractor.occurrenceId, basalt.id, 'presentation binding should mirror the authoritative edge');
});

test('an unbound Extractor can be disconnected and reused on a different solid resource source', () => {
  _resetOrdinals();
  const blueprint = createBlueprint();
  const basalt = featureOccurrence({ id: 'occ-basalt', resourceId: 'basalt', featureId: 'feature-basalt' });
  const iron = featureOccurrence({ id: 'occ-iron', resourceId: 'iron-ore', featureId: 'feature-iron' });
  const basaltSource = addFeatureSource(blueprint, basalt);
  const ironSource = addFeatureSource(blueprint, iron);
  const extractor = blueprintAddExtractor(blueprint);

  const first = blueprintConnect(
    blueprint,
    basaltSource.id,
    basaltSource.resourceAccessPortId,
    extractor.id,
    extractor.sourceInputPortId,
  );
  assert.equal(first.occurrenceId, basalt.id);

  blueprintDisconnect(blueprint, first.id);
  assert.equal(extractor.occurrenceId, null);

  const second = blueprintConnect(
    blueprint,
    ironSource.id,
    ironSource.resourceAccessPortId,
    extractor.id,
    extractor.sourceInputPortId,
  );
  assert.ok(second);
  assert.equal(second.occurrenceId, iron.id);
  assert.equal(extractor.occurrenceId, iron.id);
});

test('Feature sources with multiple occurrences require the resource-access edge to select one explicitly', () => {
  _resetOrdinals();
  const blueprint = createBlueprint();
  const source = blueprintAddFeatureSource(blueprint, {
    featureId: 'feature-mixed',
    resourceOccurrenceIds: ['occ-a', 'occ-b'],
  });
  const extractor = blueprintAddExtractor(blueprint);

  const ambiguous = checkBlueprintConnection(
    blueprint,
    source.id,
    source.resourceAccessPortId,
    extractor.id,
    extractor.sourceInputPortId,
  );
  assert.equal(ambiguous.ok, false);
  assert.match(ambiguous.reason, /multiple ResourceOccurrences/);

  const selected = blueprintConnect(
    blueprint,
    source.id,
    source.resourceAccessPortId,
    extractor.id,
    extractor.sourceInputPortId,
    { occurrenceId: 'occ-b' },
  );
  assert.ok(selected);
  assert.equal(selected.occurrenceId, 'occ-b');
});

test('Extractor pulls a connected non-ore solid resource without any iron-specific binding', () => {
  _resetOrdinals();
  const blueprint = createBlueprint();
  const basalt = featureOccurrence({ id: 'occ-basalt', resourceId: 'basalt', featureId: 'feature-basalt' });
  const world = { resourceOccurrences: { [basalt.id]: basalt } };
  const source = addFeatureSource(blueprint, basalt);
  const extractor = blueprintAddExtractor(blueprint);
  const hopper = blueprintAddHopper(blueprint, 100);

  assert.ok(blueprintConnect(
    blueprint,
    source.id,
    source.resourceAccessPortId,
    extractor.id,
    extractor.sourceInputPortId,
  ));
  assert.ok(blueprintConnect(
    blueprint,
    extractor.id,
    extractor.outputPortId,
    hopper.id,
    hopper.inputPortId,
  ));
  setNodeEnabled(blueprint, extractor.id, true);

  simulationTick(blueprint, world, 0.1);

  assert.equal(extractor.operatingState, 'running');
  assert.equal(extractor.lastError, null);
  assert.ok(Math.abs(hopperStoredMassKg(hopper) - 0.5) < 1e-9);
  assert.ok(Math.abs((hopper.storedComponentsKg.basalt ?? 0) - 0.5) < 1e-9);
});

test('Extractor stays blocked when the connected resource physical form is not eligible', () => {
  _resetOrdinals();
  const blueprint = createBlueprint();
  const water = featureOccurrence({ id: 'occ-water', resourceId: 'saline-water', featureId: 'feature-water' });
  const world = { resourceOccurrences: { [water.id]: water } };
  const source = addFeatureSource(blueprint, water);
  const extractor = blueprintAddExtractor(blueprint);
  const hopper = blueprintAddHopper(blueprint, 100);

  assert.ok(blueprintConnect(
    blueprint,
    source.id,
    source.resourceAccessPortId,
    extractor.id,
    extractor.sourceInputPortId,
  ));
  assert.ok(blueprintConnect(
    blueprint,
    extractor.id,
    extractor.outputPortId,
    hopper.id,
    hopper.inputPortId,
  ));
  setNodeEnabled(blueprint, extractor.id, true);

  simulationTick(blueprint, world, 0.1);

  assert.equal(extractor.operatingState, 'blocked');
  assert.match(extractor.lastError, /does not support resource physical form 'liquid'/);
  assert.equal(hopperStoredMassKg(hopper), 0);
  assert.equal(blueprint.simulationStats.extractedKg, 0);
});
