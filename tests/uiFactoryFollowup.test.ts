import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  placeDebugProcessingFactories,
  removeDebugProcessingFactories,
  DEBUG_FACTORY_FEEDER_RATE_KG_PER_SECOND,
} from '../dist/debug/factoryFixture.js';
import { createEmptyGraphState } from '../dist/graph/graphCommands.js';
import { compileFlatRuntimePlan } from '../dist/runtime/compileRuntimePlan.js';
import { compileFlatWorkerSetup } from '../dist/runtime/fullWorkerSetup.js';
import { generateWorld } from '../dist/world/generateWorld.js';

test('debug Create Factory builds the stable processing line from the selected resource', () => {
  const world = generateWorld('debug-factory-followup');
  const resource = world.planet.resourceNodes[0];
  assert.ok(resource);

  const placed = placeDebugProcessingFactories(createEmptyGraphState(), resource, 1);
  assert.equal(placed.manifests.length, 1);
  assert.equal(placed.graph.nodes.length, 18);
  assert.equal(placed.graph.connections.length, 18);

  const types = placed.graph.nodes.map(node => node.nodeType);
  for (const expected of ['extractor', 'jawCrusher', 'coneCrusher', 'screen', 'ballMill', 'splitter', 'feeder', 'roastingFurnace', 'exhaustVent']) {
    assert.ok(types.includes(expected), `expected debug factory to include ${expected}`);
  }

  const extractor = placed.graph.nodes.find(node => node.nodeType === 'extractor');
  const feeder = placed.graph.nodes.find(node => node.nodeType === 'feeder');
  const furnace = placed.graph.nodes.find(node => node.nodeType === 'roastingFurnace');
  assert.equal(extractor?.enabled, true);
  assert.equal(feeder?.enabled, true);
  assert.equal(furnace?.enabled, true);
  assert.equal(feeder?.parameters.flowRateKgPerSecond, DEBUG_FACTORY_FEEDER_RATE_KG_PER_SECOND);

  assert.ok(placed.graph.connections.some(connection =>
    connection.kind === 'resource-access'
    && connection.from.nodeId === resource.id
    && connection.to.nodeId === extractor?.id));

  const plan = compileFlatRuntimePlan(world.planet, placed.graph);
  const setup = compileFlatWorkerSetup(plan);
  assert.equal(setup.extractors.length, 1);
  assert.equal(setup.hoppers.length, 9);
  assert.equal(setup.comminution.length, 3);
  assert.equal(setup.screens.length, 1);
  assert.equal(setup.splitters.length, 1);
  assert.equal(setup.feeders.length, 1);
  assert.equal(setup.roastingFurnaces.length, 1);
  assert.equal(setup.exhaustVents.length, 1);
  // The graph has 18 connections, but resource-access is a source relationship,
  // not a physical material stream. The Worker setup therefore has 17 streams.
  assert.equal(setup.streams.length, 17);
  assert.ok(setup.streams.every(stream => stream.runtimeSupported));
  assert.equal(setup.feeders[0].flowRateKgPerSecond, DEBUG_FACTORY_FEEDER_RATE_KG_PER_SECOND);

  const removed = removeDebugProcessingFactories(placed.graph, placed.manifests);
  assert.equal(removed.nodes.length, 0);
  assert.equal(removed.connections.length, 0);
});

test('node cards expose settings, live furnace/feeder data, and readable resource runtime text', () => {
  const mechanical = fs.readFileSync('src/map/rendering/mechanicalRenderer.ts', 'utf8');
  const debugPanel = fs.readFileSync('src/ui/debugPanel.ts', 'utf8');
  const css = fs.readFileSync('map.css', 'utf8');

  assert.match(mechanical, /formatParameterValue/);
  assert.match(mechanical, /flowRateKgPerSecond/);
  assert.match(mechanical, /temperatureSetpointK/);
  assert.match(mechanical, /runtime\?\.temperatureK/);
  assert.match(mechanical, /runtime\?\.actualRateKgPerSecond/);
  assert.match(mechanical, /setFittedText/);
  assert.match(mechanical, /data-runtime-node-secondary/);
  assert.match(mechanical, /value\.toFixed\(2\).*kg\/s/);
  assert.match(mechanical, /value - 273\.15.*°C/);

  assert.match(css, /\.ws-map-resource-runtime \{ fill: #c0d4e8; \}/);
  assert.match(css, /#ws-map-inspector-body \.ws-ins-row \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(css, /font-variant-numeric: tabular-nums/);
  assert.match(css, /\[data-runtime-detail\] \.ws-ins-row \{[\s\S]*font-size: 11px/);

  assert.match(debugPanel, /state\.selection\.type !== 'resource'/);
  assert.match(debugPanel, /placeDebugProcessingFactories/);
  assert.doesNotMatch(debugPanel, /outside the Phase 6 extraction runtime slice/);
});
