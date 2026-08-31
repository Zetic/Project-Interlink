import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld as createWorld } from '../src/generator/generateWorld.js';
import { buildSiteSession } from '../src/workspace/siteSession.js';

function findWorldWithIronSite() {
  for (let i = 0; i < 200; i++) {
    const world = createWorld(`site-session-iron-${i}`);
    const occurrence = Object.values(world.resourceOccurrences).find(item =>
      item.resourceId === 'iron-ore' && item.composition
    );
    if (!occurrence) continue;
    const feature = world.features[occurrence.sourceId];
    const site = world.sites[feature.siteId];
    if (site) return { world, occurrence, feature, site };
  }
  throw new Error('Could not find an iron Site in test seed range');
}

test('iron Site session contains Features and boundaries without an automatic apparatus chain', () => {
  const { world, occurrence, feature, site } = findWorldWithIronSite();
  const session = buildSiteSession(world, site.id);
  const featureNode = [...session.featureNodes.values()].find(node => node.featureId === feature.id);
  assert.ok(featureNode);
  assert.equal(occurrence.sourceId, feature.id);
  assert.equal(Object.values(session.blueprint.nodes).filter(node => node.boundaryRole).length, 2);
  assert.equal(Object.values(session.blueprint.nodes).some(node =>
    ['extractor', 'crusher', 'magSep'].includes(node.nodeType)
  ), false);
  assert.deepEqual(Object.values(session.blueprint.connections), []);
});

test('non-iron Sites contain Features and boundaries but no temporary iron process chain', () => {
  const { world } = findWorldWithIronSite();
  const site = Object.values(world.sites).find(candidate => {
    const occurrences = candidate.featureIds.flatMap(featureId => world.features[featureId].resourceOccurrences);
    return !occurrences.some(id => world.resourceOccurrences[id]?.resourceId === 'iron-ore');
  });
  assert.ok(site, 'Expected a non-iron Site');

  const session = buildSiteSession(world, site.id);
  const nodeTypes = Object.values(session.blueprint.nodes).map(node => node.nodeType);
  assert.ok(nodeTypes.includes('feature'));
  assert.equal(nodeTypes.includes('extractor'), false);
  assert.equal(nodeTypes.includes('crusher'), false);
  assert.equal(nodeTypes.includes('magSep'), false);

  const boundaries = Object.values(session.blueprint.nodes).filter(node => node.boundaryRole);
  assert.equal(boundaries.length, 2);
  assert.equal(session.featureNodes.size, site.featureIds.length);
});

test('every Site session exposes each Feature as a resource-source node', () => {
  const world = createWorld('all-site-feature-nodes');
  for (const site of Object.values(world.sites)) {
    const session = buildSiteSession(world, site.id);
    assert.equal(session.featureNodes.size, site.featureIds.length);
    for (const featureId of site.featureIds) {
      const node = [...session.featureNodes.values()].find(item => item.featureId === featureId);
      assert.ok(node, `Site '${site.id}' should contain Feature node '${featureId}'`);
      assert.equal(node.resourceAccessPortId, 'resource-access');
      assert.deepEqual(node.resourceOccurrenceIds, world.features[featureId].resourceOccurrences);
    }
  }
});
