import {
  blueprintAddApparatus,
  blueprintAddFeatureSource,
  blueprintConnect,
  blueprintDisconnect,
  createBlueprint,
  createBlueprintLayout,
  layoutMoveNode,
} from '../../simulation/simulationEngine.js';

export const CANONICAL_IRON_BENCHMARK_OCCURRENCE = Object.freeze({
  id: 'debug-canonical-iron-occurrence-v1',
  resourceId: 'iron-ore',
  name: 'Canonical Iron Ore v1',
  sourceType: 'feature',
  sourceId: 'debug-canonical-iron-feature-v1',
  composition: Object.freeze({ hematite: 60, magnetite: 20, goethite: 10, quartz: 10 }),
});

let fixtureOrdinal = 1;

function connectOrThrow(blueprint, sourceNodeId, sourcePortId, targetNodeId, targetPortId, options = {}) {
  const connection = blueprintConnect(blueprint, sourceNodeId, sourcePortId, targetNodeId, targetPortId, options);
  if (!connection) {
    throw new Error(`Debug fixture could not connect ${sourceNodeId}:${sourcePortId} → ${targetNodeId}:${targetPortId}`);
  }
  return connection;
}

function addRoastingLine(blueprint, {
  prefix,
  sourceNode,
  occurrenceId,
  feederRateKgPerSecond = 4,
  extractorRateKgPerSecond = 5,
  feedHopperCapacityKg = 5000,
  productHopperCapacityKg = 5000,
} = {}) {
  const extractor = blueprintAddApparatus(blueprint, 'extractor', {
    id: `${prefix}-extractor`,
    enabled: true,
    prototypeRateKgPerSecond: extractorRateKgPerSecond,
  });
  const feedHopper = blueprintAddApparatus(blueprint, 'hopper', {
    id: `${prefix}-feed-hopper`,
    capacityKg: feedHopperCapacityKg,
  });
  const feeder = blueprintAddApparatus(blueprint, 'feeder', {
    id: `${prefix}-feeder`,
    enabled: true,
    flowRateKgPerSecond: feederRateKgPerSecond,
  });
  const furnace = blueprintAddApparatus(blueprint, 'roastingFurnace', {
    id: `${prefix}-furnace`,
    enabled: true,
    temperatureSetpointK: 900,
  });
  const productHopper = blueprintAddApparatus(blueprint, 'hopper', {
    id: `${prefix}-product-hopper`,
    capacityKg: productHopperCapacityKg,
  });
  const vent = blueprintAddApparatus(blueprint, 'exhaustVent', {
    id: `${prefix}-vent`,
  });

  const connections = [
    connectOrThrow(
      blueprint,
      sourceNode.id,
      sourceNode.resourceAccessPortId,
      extractor.id,
      extractor.sourceInputPortId,
      { occurrenceId },
    ),
    connectOrThrow(blueprint, extractor.id, extractor.outputPortId, feedHopper.id, feedHopper.inputPortId),
    connectOrThrow(blueprint, feedHopper.id, feedHopper.outputPortId, feeder.id, feeder.inputPortId),
    connectOrThrow(blueprint, feeder.id, feeder.outputPortId, furnace.id, furnace.inputPortId),
    connectOrThrow(blueprint, furnace.id, furnace.solidProductPortId, productHopper.id, productHopper.inputPortId),
    connectOrThrow(blueprint, furnace.id, furnace.gasExhaustPortId, vent.id, vent.gasInputPortId),
  ];

  return {
    id: prefix,
    nodeIds: [extractor.id, feedHopper.id, feeder.id, furnace.id, productHopper.id, vent.id],
    connectionIds: connections.map(connection => connection.id),
    extractor,
    feedHopper,
    feeder,
    furnace,
    productHopper,
    vent,
  };
}

export function createRoastingBenchmarkFixture({ count = 1, feederRateKgPerSecond = 4 } = {}) {
  if (!Number.isInteger(count) || count < 1 || count > 1000) {
    throw new Error('Benchmark factory count must be an integer from 1 to 1000');
  }
  const blueprint = createBlueprint();
  const blueprintLayout = createBlueprintLayout();
  const occurrence = {
    ...CANONICAL_IRON_BENCHMARK_OCCURRENCE,
    composition: { ...CANONICAL_IRON_BENCHMARK_OCCURRENCE.composition },
  };
  const world = { resourceOccurrences: { [occurrence.id]: occurrence } };
  const sourceNode = blueprintAddFeatureSource(blueprint, {
    id: 'debug-canonical-iron-feature-node-v1',
    featureId: occurrence.sourceId,
    displayName: occurrence.name,
    resourceOccurrenceIds: [occurrence.id],
  });
  layoutMoveNode(blueprintLayout, sourceNode.id, 0, 0);

  const manifests = [];
  for (let index = 0; index < count; index += 1) {
    const prefix = `debug-benchmark-roast-${index + 1}`;
    const manifest = addRoastingLine(blueprint, {
      prefix,
      sourceNode,
      occurrenceId: occurrence.id,
      feederRateKgPerSecond,
    });
    manifests.push(manifest);
  }
  return { blueprint, blueprintLayout, world, sourceNode, occurrence, manifests };
}

export function findRoastableWorldSource(blueprint, world, preferredFeatureNodeId = null) {
  const candidates = Object.values(blueprint?.nodes ?? {}).filter(node => node.nodeType === 'feature');
  if (preferredFeatureNodeId) {
    const preferred = candidates.find(node => node.id === preferredFeatureNodeId);
    if (preferred) candidates.unshift(candidates.splice(candidates.indexOf(preferred), 1)[0]);
  }
  for (const sourceNode of candidates) {
    for (const occurrenceId of sourceNode.resourceOccurrenceIds ?? []) {
      const occurrence = world?.resourceOccurrences?.[occurrenceId];
      if (
        occurrence?.resourceId === 'iron-ore'
        && Number(occurrence?.composition?.goethite ?? 0) > 0
      ) {
        return { sourceNode, occurrence };
      }
    }
  }
  return null;
}

function fixtureOrigin(blueprintLayout) {
  const positions = Object.values(blueprintLayout?.nodePositions ?? {});
  const maxX = positions.length ? Math.max(...positions.map(position => position.x)) : 0;
  const minY = positions.length ? Math.min(...positions.map(position => position.y)) : 0;
  return { x: maxX + 260, y: minY };
}

function layoutRoastingLine(blueprintLayout, manifest, baseX, baseY) {
  const [extractorId, feedHopperId, feederId, furnaceId, productHopperId, ventId] = manifest.nodeIds;
  layoutMoveNode(blueprintLayout, extractorId, baseX, baseY);
  layoutMoveNode(blueprintLayout, feedHopperId, baseX + 210, baseY);
  layoutMoveNode(blueprintLayout, feederId, baseX + 420, baseY);
  layoutMoveNode(blueprintLayout, furnaceId, baseX + 630, baseY);
  layoutMoveNode(blueprintLayout, productHopperId, baseX + 870, baseY);
  layoutMoveNode(blueprintLayout, ventId, baseX + 630, baseY + 150);
}

export function placeRoastingTestFactories({
  blueprint,
  blueprintLayout,
  world,
  count = 1,
  preferredFeatureNodeId = null,
  feederRateKgPerSecond = 4,
} = {}) {
  if (!blueprint || !blueprintLayout || !world) throw new Error('Visible debug fixtures require an active Site blueprint');
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    throw new Error('Visible debug factory count must be an integer from 1 to 100');
  }
  const source = findRoastableWorldSource(blueprint, world, preferredFeatureNodeId);
  if (!source) throw new Error('This Site has no iron-ore Feature containing goethite for the roasting test fixture');

  const fixtureId = `debug-roasting-fixture-${fixtureOrdinal++}`;
  const origin = fixtureOrigin(blueprintLayout);
  const manifests = [];
  const rowsPerBlock = 10;
  const blockWidth = 1180;
  const rowHeight = 290;

  for (let index = 0; index < count; index += 1) {
    const block = Math.floor(index / rowsPerBlock);
    const row = index % rowsPerBlock;
    const prefix = `${fixtureId}-line-${index + 1}`;
    const manifest = addRoastingLine(blueprint, {
      prefix,
      sourceNode: source.sourceNode,
      occurrenceId: source.occurrence.id,
      feederRateKgPerSecond,
    });
    layoutRoastingLine(
      blueprintLayout,
      manifest,
      origin.x + block * blockWidth,
      origin.y + row * rowHeight,
    );
    manifests.push(manifest);
  }

  return {
    id: fixtureId,
    sourceNodeId: source.sourceNode.id,
    occurrenceId: source.occurrence.id,
    manifests,
  };
}

export function removeRoastingTestFixture(blueprint, blueprintLayout, fixture) {
  if (!fixture) return;
  for (const manifest of [...fixture.manifests].reverse()) {
    for (const connectionId of [...manifest.connectionIds].reverse()) {
      if (blueprint.connections[connectionId]) blueprintDisconnect(blueprint, connectionId);
    }
    for (const nodeId of manifest.nodeIds) {
      delete blueprint.nodes[nodeId];
      delete blueprintLayout.nodePositions[nodeId];
    }
  }
}
