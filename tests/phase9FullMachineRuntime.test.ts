import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { apparatusDefinitionById } from '../dist/apparatus/definitions.js';
import {
  connectPorts,
  createEmptyGraphState,
  placeMechanicalNode,
  setMechanicalNodeEnabled,
  setMechanicalNodeParameter,
} from '../dist/graph/graphCommands.js';
import { portForEndpoint } from '../dist/graph/graphQueries.js';
import { compileFlatRuntimePlan } from '../dist/runtime/compileRuntimePlan.js';
import {
  SOLID_TARGET_FURNACE,
  SOLID_TARGET_HOPPER,
  compileFlatWorkerSetup,
  flatWorkerParameterKey,
  flatWorkerStructureKey,
} from '../dist/runtime/fullWorkerSetup.js';
import { generateWorld } from '../dist/world/generateWorld.js';

function connect(graph, planet, from, to) {
  return connectPorts(
    graph,
    from,
    portForEndpoint(planet, graph, from),
    to,
    portForEndpoint(planet, graph, to),
  );
}

function fullProductionLine(seed = 'phase9-full-runtime') {
  const planet = generateWorld(seed).planet;
  const resource = planet.resourceNodes[0];
  let graph = createEmptyGraphState();
  let placementOrdinal = 0;
  const nodes = {};

  const add = (key, definitionId) => {
    const placed = placeMechanicalNode(
      graph,
      apparatusDefinitionById(definitionId),
      { x: resource.position.x + placementOrdinal++ * 0.001, y: resource.position.y },
    );
    graph = placed.graph;
    nodes[key] = placed.node;
    return placed.node;
  };

  add('extractor', 'extractor');
  add('h0', 'hopper');
  add('jaw', 'jaw-crusher');
  add('h1', 'hopper');
  add('cone', 'cone-crusher');
  add('h2', 'hopper');
  add('mill', 'ball-mill');
  add('h3', 'hopper');
  add('screen', 'screen');
  add('h4', 'hopper');
  add('h5', 'hopper');
  add('mag', 'magnetic-separator');
  add('h6', 'hopper');
  add('h7', 'hopper');
  add('splitter', 'splitter');
  add('h8', 'hopper');
  add('h9', 'hopper');
  add('merger', 'material-merger');
  add('h10', 'hopper');
  add('feeder', 'feeder');
  add('furnace', 'electric-roasting-furnace');
  add('h11', 'hopper');
  add('vent', 'exhaust-vent');

  for (const node of Object.values(nodes)) {
    if (node.nodeType !== 'hopper' && node.nodeType !== 'exhaustVent') {
      graph = setMechanicalNodeEnabled(graph, node.id, true);
    }
  }

  const edge = (fromKey, fromPortId, toKey, toPortId) => {
    graph = connect(
      graph,
      planet,
      { nodeId: nodes[fromKey].id, portId: fromPortId },
      { nodeId: nodes[toKey].id, portId: toPortId },
    );
  };

  graph = connect(
    graph,
    planet,
    { nodeId: resource.id, portId: resource.resourceAccessPortId },
    { nodeId: nodes.extractor.id, portId: 'resource-source' },
  );
  edge('extractor', 'output', 'h0', 'input');
  edge('h0', 'output', 'jaw', 'feed');
  edge('jaw', 'product', 'h1', 'input');
  edge('h1', 'output', 'cone', 'feed');
  edge('cone', 'product', 'h2', 'input');
  edge('h2', 'output', 'mill', 'feed');
  edge('mill', 'product', 'h3', 'input');
  edge('h3', 'output', 'screen', 'feed');
  edge('screen', 'undersize', 'h4', 'input');
  edge('screen', 'oversize', 'h5', 'input');
  edge('h4', 'output', 'mag', 'feed');
  edge('mag', 'concentrate', 'h6', 'input');
  edge('mag', 'tailings', 'h7', 'input');
  edge('h6', 'output', 'splitter', 'feed');
  edge('splitter', 'output-a', 'h8', 'input');
  edge('splitter', 'output-b', 'h9', 'input');
  edge('h8', 'output', 'merger', 'input-a');
  edge('h9', 'output', 'merger', 'input-b');
  edge('merger', 'product', 'h10', 'input');
  edge('h10', 'output', 'feeder', 'feed');
  edge('feeder', 'product', 'furnace', 'feed');
  edge('furnace', 'solid-product', 'h11', 'input');
  edge('furnace', 'gas-exhaust', 'vent', 'gas-in');

  return { planet, resource, graph, nodes };
}

function runtimeIds(plan) {
  return Object.fromEntries(plan.machines.map(machine => [machine.nodeId, machine.runtimeId]));
}

test('Phase 9 compiles one flat production graph across every active machine family', () => {
  const { planet, resource, graph, nodes } = fullProductionLine();
  const plan = compileFlatRuntimePlan(planet, graph);
  const setup = compileFlatWorkerSetup(plan);
  const ids = runtimeIds(plan);

  assert.equal(setup.extractors.length, 1);
  assert.equal(setup.hoppers.length, 12);
  assert.equal(setup.comminution.length, 3);
  assert.equal(setup.screens.length, 1);
  assert.equal(setup.splitters.length, 1);
  assert.equal(setup.mergers.length, 1);
  assert.equal(setup.feeders.length, 1);
  assert.equal(setup.magneticSeparators.length, 1);
  assert.equal(setup.roastingFurnaces.length, 1);
  assert.equal(setup.exhaustVents.length, 1);
  assert.equal(setup.streams.length, 23);
  assert.ok(setup.streams.every(stream => stream.runtimeSupported));

  const source = plan.resourceSources.find(candidate => candidate.sourceNodeId === resource.id);
  assert.ok(source);
  assert.equal(setup.extractors[0].occurrenceId, source.runtimeId);
  assert.equal(setup.extractors[0].outputHopperId, ids[nodes.h0.id]);

  const jaw = setup.comminution.find(machine => machine.canonicalNodeId === nodes.jaw.id);
  const cone = setup.comminution.find(machine => machine.canonicalNodeId === nodes.cone.id);
  const mill = setup.comminution.find(machine => machine.canonicalNodeId === nodes.mill.id);
  assert.deepEqual(
    [jaw.targetParticleSizeMm, jaw.throughputKgPerSecond, jaw.ratedPowerKw],
    [120, 8, 8],
  );
  assert.deepEqual(
    [cone.targetParticleSizeMm, cone.throughputKgPerSecond, cone.ratedPowerKw],
    [25, 5, 10],
  );
  assert.deepEqual(
    [mill.targetParticleSizeMm, mill.throughputKgPerSecond, mill.ratedPowerKw],
    [0.25, 2, 75],
  );
  assert.equal(jaw.inputHopperId, ids[nodes.h0.id]);
  assert.equal(jaw.outputHopperId, ids[nodes.h1.id]);
  assert.equal(cone.inputHopperId, ids[nodes.h1.id]);
  assert.equal(cone.outputHopperId, ids[nodes.h2.id]);
  assert.equal(mill.inputHopperId, ids[nodes.h2.id]);
  assert.equal(mill.outputHopperId, ids[nodes.h3.id]);

  const screen = setup.screens[0];
  assert.deepEqual([screen.apertureSizeMm, screen.throughputKgPerSecond], [25, 4]);
  assert.equal(screen.inputHopperId, ids[nodes.h3.id]);
  assert.equal(screen.undersizeHopperId, ids[nodes.h4.id]);
  assert.equal(screen.oversizeHopperId, ids[nodes.h5.id]);

  const magnetic = setup.magneticSeparators[0];
  assert.deepEqual(
    [magnetic.fieldStrength, magnetic.maxFeedParticleSizeMm, magnetic.throughputKgPerSecond],
    [0.6, 25, 4],
  );
  assert.equal(magnetic.inputHopperId, ids[nodes.h4.id]);
  assert.equal(magnetic.concentrateHopperId, ids[nodes.h6.id]);
  assert.equal(magnetic.tailingsHopperId, ids[nodes.h7.id]);

  const splitter = setup.splitters[0];
  assert.deepEqual([splitter.splitFractionToA, splitter.throughputKgPerSecond], [0.5, 10]);
  assert.equal(splitter.inputHopperId, ids[nodes.h6.id]);
  assert.equal(splitter.outputAHopperId, ids[nodes.h8.id]);
  assert.equal(splitter.outputBHopperId, ids[nodes.h9.id]);

  const merger = setup.mergers[0];
  assert.equal(merger.throughputKgPerSecond, 10);
  assert.equal(merger.inputAHopperId, ids[nodes.h8.id]);
  assert.equal(merger.inputBHopperId, ids[nodes.h9.id]);
  assert.equal(merger.outputHopperId, ids[nodes.h10.id]);

  const feeder = setup.feeders[0];
  assert.deepEqual([feeder.flowRateKgPerSecond, feeder.throughputKgPerSecond], [4, 10]);
  assert.equal(feeder.inputHopperId, ids[nodes.h10.id]);
  assert.equal(feeder.outputTargetKind, SOLID_TARGET_FURNACE);
  assert.equal(feeder.outputTargetId, ids[nodes.furnace.id]);

  const furnace = setup.roastingFurnaces[0];
  assert.deepEqual(
    [
      furnace.temperatureSetpointK,
      furnace.ratedHeaterPowerKw,
      furnace.maximumOperatingTemperatureK,
      furnace.maximumSolidThroughputKgPerSecond,
      furnace.effectiveChamberHoldUpKg,
      furnace.heatLossCoefficientWPerK,
      furnace.internalZoneCount,
    ],
    [900, 60, 1200, 4, 20, 25, 4],
  );
  assert.equal(furnace.productTargetKind, SOLID_TARGET_HOPPER);
  assert.equal(furnace.productTargetId, ids[nodes.h11.id]);
  assert.equal(furnace.gasVentId, ids[nodes.vent.id]);
  assert.equal(setup.exhaustVents[0].canonicalNodeId, nodes.vent.id);
});

test('Phase 9 process controls stay parameter-only edits for live Rust reconfiguration', () => {
  const { planet, graph, nodes } = fullProductionLine('phase9-live-reconfigure');
  const initial = compileFlatWorkerSetup(compileFlatRuntimePlan(planet, graph));

  let changed = setMechanicalNodeParameter(graph, nodes.jaw.id, 'jawProductSizeMm', 250);
  changed = setMechanicalNodeParameter(changed, nodes.screen.id, 'apertureSizeMm', 60);
  changed = setMechanicalNodeParameter(changed, nodes.splitter.id, 'splitFractionToA', 0.65);
  changed = setMechanicalNodeParameter(changed, nodes.feeder.id, 'flowRateKgPerSecond', 3.5);
  changed = setMechanicalNodeParameter(changed, nodes.mag.id, 'fieldStrength', 0.9);
  changed = setMechanicalNodeParameter(changed, nodes.furnace.id, 'temperatureSetpointK', 1000);

  const edited = compileFlatWorkerSetup(compileFlatRuntimePlan(planet, changed));
  assert.equal(flatWorkerStructureKey(edited), flatWorkerStructureKey(initial));
  assert.notEqual(flatWorkerParameterKey(edited), flatWorkerParameterKey(initial));
  assert.equal(edited.comminution.find(machine => machine.canonicalNodeId === nodes.jaw.id).targetParticleSizeMm, 250);
  assert.equal(edited.screens[0].apertureSizeMm, 60);
  assert.equal(edited.splitters[0].splitFractionToA, 0.65);
  assert.equal(edited.feeders[0].flowRateKgPerSecond, 3.5);
  assert.equal(edited.magneticSeparators[0].fieldStrength, 0.9);
  assert.equal(edited.roastingFurnaces[0].temperatureSetpointK, 1000);
});

test('material capability contracts require storage between process units and metering into the furnace', () => {
  let graph = createEmptyGraphState();
  const place = definitionId => {
    const placed = placeMechanicalNode(graph, apparatusDefinitionById(definitionId), { x: graph.nodes.length, y: 0 });
    graph = placed.graph;
    return placed.node;
  };
  const jaw = place('jaw-crusher');
  const hopper = place('hopper');
  const feeder = place('feeder');
  const furnace = place('electric-roasting-furnace');
  const vent = place('exhaust-vent');
  const endpoint = (node, portId) => ({ nodeId: node.id, portId });
  const port = (node, portId) => node.ports.find(candidate => candidate.id === portId);

  assert.throws(
    () => connectPorts(graph, endpoint(jaw, 'product'), port(jaw, 'product'), endpoint(furnace, 'feed'), port(furnace, 'feed')),
    /Material port capabilities are incompatible/,
  );
  assert.throws(
    () => connectPorts(graph, endpoint(hopper, 'output'), port(hopper, 'output'), endpoint(furnace, 'feed'), port(furnace, 'feed')),
    /Material port capabilities are incompatible/,
  );

  graph = connectPorts(graph, endpoint(jaw, 'product'), port(jaw, 'product'), endpoint(hopper, 'input'), port(hopper, 'input'));
  graph = connectPorts(graph, endpoint(feeder, 'product'), port(feeder, 'product'), endpoint(furnace, 'feed'), port(furnace, 'feed'));
  graph = connectPorts(graph, endpoint(furnace, 'gas-exhaust'), port(furnace, 'gas-exhaust'), endpoint(vent, 'gas-in'), port(vent, 'gas-in'));
  assert.equal(graph.connections.length, 3);
});

test('full Worker initialization, reconfiguration, and rich detail paths cover the active catalog', () => {
  const worker = fs.readFileSync('src/runtime/fullRuntimeWorker.ts', 'utf8');
  const controller = fs.readFileSync('src/runtime/runtimeController.ts', 'utf8');

  for (const method of [
    'target.add_extractor(',
    'target.add_comminution(',
    'target.add_screen(',
    'target.add_splitter(',
    'target.add_merger(',
    'target.add_feeder(',
    'target.add_magnetic_separator(',
    'target.add_roasting_furnace(',
    'target.add_exhaust_vent_state(',
  ]) assert.ok(worker.includes(method), method);

  for (const method of [
    'candidate.upsert_extractor_live(',
    'candidate.upsert_comminution_live(',
    'candidate.upsert_screen_live(',
    'candidate.upsert_splitter_live(',
    'candidate.upsert_merger_live(',
    'candidate.upsert_feeder_live(',
    'candidate.upsert_magnetic_separator_live(',
    'candidate.upsert_roasting_furnace_live(',
    'candidate.replace_hopper_state_live(',
    'candidate.replace_exhaust_vent_state_live(',
  ]) assert.ok(worker.includes(method), method);

  assert.ok(worker.includes('furnaceDetail('));
  assert.ok(worker.includes('ventDetail('));
  assert.match(controller, /new Worker\(new URL\('\.\/fullRuntimeWorker\.js'/);
  assert.doesNotMatch(controller, /new Worker\(new URL\('\.\/flatRuntimeWorker\.js'/);
});
