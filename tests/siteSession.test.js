import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/core/world/worldState.js';
import { buildSiteSession } from '../src/workspace/siteSession.js';
import { getStreamForConnection } from '../src/simulation/simulationEngine.js';

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

test('iron Site session connects Feature resource access to the temporary Extractor', () => {
  const { world, occurrence, feature, site } = findWorldWithIronSite();
  const session = buildSiteSession(world, site.id);
  const featureNode = [...session.featureNodes.values()].find(node => node.featureId === feature.id);
  const extractor = session.blueprint.nodes[session.prototypeExtractorId];
  assert.ok(featureNode);
  assert.ok(extractor);
  assert.equal(session.prototypeOccurrenceId, occurrence.id);
  assert.equal(session.prototypeFeatureId, feature.id);

  const access = Object.values(session.blueprint.connections).find(connection =>
    connection.kind === 'resource-access'
    && connection.sourceNodeId === featureNode.id
    && connection.targetNodeId === extractor.id
  );
  assert.ok(access, 'Feature must have an explicit resource-access edge to the Extractor');
  assert.equal(getStreamForConnection(session.blueprint, access.id), null, 'resource access must not create a MaterialStream');

  const materialOutput = Object.values(session.blueprint.connections).find(connection =>
    connection.kind === 'material'
    && connection.sourceNodeId === extractor.id
    && connection.sourcePortId === extractor.outputPortId
  );
  assert.ok(materialOutput, 'Extractor should create matter only through its material output connection');
  assert.ok(getStreamForConnection(session.blueprint, materialOutput.id));
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
  assert.equal(session.prototypeOccurrenceId, null);
  assert.equal(session.prototypeExtractorId, null);

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
