import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  siteResourceOccurrenceIds,
  featureForOccurrence,
  prototypeNodeTypesForSite,
  prototypeOccurrenceForSite,
  prototypeFeatureForSite,
} from '../src/workspace/sitePrototype.js';

function fixture() {
  const iron = { id: 'iron', resourceId: 'iron-ore', composition: { hematite: 80 }, sourceType: 'feature', sourceId: 'f-iron' };
  const copper = { id: 'copper', resourceId: 'copper-ore', composition: { chalcopyrite: 80 }, sourceType: 'feature', sourceId: 'f-copper' };
  return {
    world: {
      resourceOccurrences: { iron, copper },
      features: {
        'f-iron': { id: 'f-iron', resourceOccurrences: ['iron'] },
        'f-copper': { id: 'f-copper', resourceOccurrences: ['copper'] },
        'f-empty': { id: 'f-empty', resourceOccurrences: [] },
      },
    },
    ironSite: { featureIds: ['f-iron'] },
    copperSite: { featureIds: ['f-copper'] },
    emptySite: { featureIds: ['f-empty'] },
  };
}

test('Site resource IDs are derived through Feature ownership', () => {
  const { world, ironSite } = fixture();
  assert.deepEqual(siteResourceOccurrenceIds(world, ironSite), ['iron']);
  assert.equal(featureForOccurrence(world, ironSite, 'iron')?.id, 'f-iron');
  assert.equal(featureForOccurrence(world, ironSite, 'copper'), null);
});

test('temporary prototype eligibility is limited to composed iron-ore Feature occurrences', () => {
  const { world, ironSite, copperSite, emptySite } = fixture();
  assert.equal(prototypeOccurrenceForSite(world, ironSite)?.id, 'iron');
  assert.equal(prototypeFeatureForSite(world, ironSite)?.id, 'f-iron');
  assert.equal(prototypeOccurrenceForSite(world, copperSite), null);
  assert.equal(prototypeOccurrenceForSite(world, emptySite), null);
});

test('temporary prototype node set is absent for non-iron Sites and includes Feature access for iron Sites', () => {
  const { world, ironSite, copperSite, emptySite } = fixture();
  assert.deepEqual(prototypeNodeTypesForSite(world, emptySite), []);
  assert.deepEqual(prototypeNodeTypesForSite(world, copperSite), []);
  assert.deepEqual(prototypeNodeTypesForSite(world, ironSite), [
    'feature', 'extractor', 'hopper', 'crusher', 'hopper', 'magSep', 'hopper', 'hopper',
  ]);
});
