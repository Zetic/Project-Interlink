import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prototypeOccurrenceForSite } from '../src/workspace/sitePrototype.js';

function worldWithOccurrences(occurrences) {
  return { resourceOccurrences: Object.fromEntries(occurrences.map(occurrence => [occurrence.id, occurrence])) };
}

test('temporary prototype eligibility is limited to composed iron-ore occurrences', () => {
  const iron = { id: 'iron', resourceId: 'iron-ore', composition: { hematite: 80 } };
  const copper = { id: 'copper', resourceId: 'copper-ore', composition: { chalcopyrite: 80 } };
  const world = worldWithOccurrences([iron, copper]);

  assert.equal(prototypeOccurrenceForSite(world, { resourceOccurrenceIds: ['iron'] })?.id, 'iron');
  assert.equal(prototypeOccurrenceForSite(world, { resourceOccurrenceIds: ['copper'] }), null);
  assert.equal(prototypeOccurrenceForSite(world, { resourceOccurrenceIds: [] }), null);
});
